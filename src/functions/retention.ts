import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  Memory,
  SemanticMemory,
  RetentionScore,
  DecayConfig,
} from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import type { AccessLog } from "./access-tracker.js";
import {
  emptyAccessLog,
  deleteAccessLog,
  normalizeAccessLog,
} from "./access-tracker.js";
import { recordAudit } from "./audit.js";

const DEFAULT_DECAY: DecayConfig = {
  lambda: 0.01,
  sigma: 0.3,
  tierThresholds: {
    hot: 0.7,
    warm: 0.4,
    cold: 0.15,
  },
};

function computeReinforcementBoost(
  accessTimestamps: number[],
  sigma: number,
): number {
  const now = Date.now();
  let boost = 0;
  for (const tAccess of accessTimestamps) {
    if (!Number.isFinite(tAccess)) continue;
    const daysSinceAccess = (now - tAccess) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess > 0) {
      boost += 1 / daysSinceAccess;
    }
  }
  return boost * sigma;
}

function computeRetention(
  salience: number,
  createdAt: string,
  accessTimestamps: number[],
  config: DecayConfig,
): number {
  const deltaT =
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const temporalDecay = Math.exp(-config.lambda * deltaT);
  const reinforcementBoost = computeReinforcementBoost(
    accessTimestamps,
    config.sigma,
  );
  return Math.min(1, salience * temporalDecay + reinforcementBoost);
}

function computeSalience(
  memory: Memory | SemanticMemory,
  accessCount: number,
): number {
  let baseSalience = 0.5;

  if ("type" in memory) {
    const typeWeights: Record<string, number> = {
      architecture: 0.9,
      bug: 0.7,
      pattern: 0.8,
      preference: 0.85,
      workflow: 0.6,
      fact: 0.5,
    };
    baseSalience = typeWeights[(memory as Memory).type] || 0.5;
  }

  if ("confidence" in memory) {
    baseSalience = Math.max(baseSalience, (memory as SemanticMemory).confidence);
  }

  const accessBonus = Math.min(0.2, accessCount * 0.02);
  return Math.min(1, baseSalience + accessBonus);
}

export function registerRetentionFunctions(
  sdk: ISdk,
  kv: StateKV,
): void {
  sdk.registerFunction(
    {
      id: "mem::retention-score",
      description:
        "Compute retention scores for all memories using time-frequency decay",
    },
    async (data: { config?: Partial<DecayConfig> }) => {
      const ctx = getContext();
      const config = { ...DEFAULT_DECAY, ...data.config };

      const [memories, semanticMems, allLogs] = await Promise.all([
        kv.list<Memory>(KV.memories),
        kv.list<SemanticMemory>(KV.semantic),
        kv.list<unknown>(KV.accessLog).catch(() => [] as unknown[]),
      ]);
      const logsById = new Map<string, AccessLog>();
      for (const raw of allLogs) {
        const log = normalizeAccessLog(raw);
        if (log.memoryId) logsById.set(log.memoryId, log);
      }

      const scores: RetentionScore[] = [];

      const computeDecay = (createdAt: string): number =>
        Math.exp(
          -config.lambda *
            ((Date.now() - new Date(createdAt).getTime()) /
              (1000 * 60 * 60 * 24)),
        );

      // Build all entries in memory first, then flush with Promise.all
      // so a full rescore is one batched KV write instead of N sequential
      // round-trips. Separate counts for the audit record at the end.
      const pendingWrites: Array<[string, RetentionScore]> = [];
      let episodicScored = 0;
      let semanticScored = 0;

      for (const mem of memories) {
        if (!mem.isLatest) continue;
        const log = logsById.get(mem.id) ?? emptyAccessLog(mem.id);
        const salience = computeSalience(mem, log.count);
        const temporalDecay = computeDecay(mem.createdAt);
        const reinforcementBoost = computeReinforcementBoost(
          log.recent,
          config.sigma,
        );
        const score = Math.min(
          1,
          salience * temporalDecay + reinforcementBoost,
        );

        const entry: RetentionScore = {
          memoryId: mem.id,
          source: "episodic",
          score,
          salience,
          temporalDecay,
          reinforcementBoost,
          lastAccessed: log.lastAt || mem.updatedAt,
          accessCount: log.count,
        };

        scores.push(entry);
        pendingWrites.push([mem.id, entry]);
        episodicScored++;
      }

      for (const sem of semanticMems) {
        const log = logsById.get(sem.id) ?? emptyAccessLog(sem.id);

        // Pre-0.8.3 fallback: use sem.lastAccessedAt only when mem:access is empty.
        let accessTimestamps: number[];
        let effectiveCount: number;
        if (log.recent.length > 0 || log.count > 0) {
          accessTimestamps = log.recent;
          effectiveCount = log.count;
        } else if (sem.lastAccessedAt) {
          const legacyTs = Date.parse(sem.lastAccessedAt);
          accessTimestamps = Number.isFinite(legacyTs) ? [legacyTs] : [];
          effectiveCount = sem.accessCount;
        } else {
          accessTimestamps = [];
          effectiveCount = sem.accessCount;
        }

        const salience = computeSalience(sem, effectiveCount);
        const temporalDecay = computeDecay(sem.createdAt);
        const reinforcementBoost = computeReinforcementBoost(
          accessTimestamps,
          config.sigma,
        );
        const score = Math.min(
          1,
          salience * temporalDecay + reinforcementBoost,
        );

        const entry: RetentionScore = {
          memoryId: sem.id,
          source: "semantic",
          score,
          salience,
          temporalDecay,
          reinforcementBoost,
          lastAccessed: log.lastAt || sem.lastAccessedAt,
          accessCount: effectiveCount,
        };

        scores.push(entry);
        pendingWrites.push([sem.id, entry]);
        semanticScored++;
      }

      // Flush all retention rows in parallel. N sequential writes was
      // making full rescores O(n) round-trips on stores with 1000+
      // memories; batching drops that to O(1) wall time on the KV
      // backends that can pipeline.
      await Promise.all(
        pendingWrites.map(([id, entry]) =>
          kv.set(KV.retentionScores, id, entry),
        ),
      );

      scores.sort((a, b) => b.score - a.score);

      const tiers = {
        hot: scores.filter((s) => s.score >= config.tierThresholds.hot)
          .length,
        warm: scores.filter(
          (s) =>
            s.score >= config.tierThresholds.warm &&
            s.score < config.tierThresholds.hot,
        ).length,
        cold: scores.filter(
          (s) =>
            s.score >= config.tierThresholds.cold &&
            s.score < config.tierThresholds.warm,
        ).length,
        evictable: scores.filter(
          (s) => s.score < config.tierThresholds.cold,
        ).length,
      };

      ctx.logger.info("Retention scores computed", {
        total: scores.length,
        ...tiers,
      });

      // Audit the rescore as a single batched event per sweep. We
      // intentionally pass an empty targetIds array — a mature store
      // can have 1000+ memory ids per rescore and flooding the audit
      // log with every memoryId on every cron tick is worse than
      // recording just the summary. The details payload has enough
      // context for observability (counts per source + per tier).
      if (scores.length > 0) {
        await recordAudit(kv, "retention_score", "mem::retention-score", [], {
          total: scores.length,
          episodic: episodicScored,
          semantic: semanticScored,
          tiers,
          config,
        });
      }

      return { success: true, total: scores.length, tiers, scores };
    },
  );

  sdk.registerFunction(
    {
      id: "mem::retention-evict",
      description:
        "Evict memories below retention threshold (tiered storage)",
    },
    async (data: {
      threshold?: number;
      dryRun?: boolean;
      maxEvict?: number;
    }) => {
      const ctx = getContext();
      const threshold = data.threshold ?? DEFAULT_DECAY.tierThresholds.cold;
      const maxEvict = data.maxEvict ?? 50;

      const allScores = await kv.list<RetentionScore>(KV.retentionScores);
      const candidates = allScores
        .filter((s) => s.score < threshold)
        .sort((a, b) => a.score - b.score)
        .slice(0, maxEvict);

      if (data.dryRun) {
        return {
          success: true,
          dryRun: true,
          wouldEvict: candidates.length,
          candidates: candidates.map((c) => ({
            id: c.memoryId,
            score: c.score,
          })),
        };
      }

      // Branch on source (#124). Pre-0.8.10 rows have no `source` field,
      // and that includes semantic retention rows that were written by
      // the old scorer — so we can't just default to episodic, that
      // would silently no-op the delete and leave the stranded semantic
      // memory alive (the exact bug #124 is about). When `source` is
      // missing, probe both namespaces to find where the memoryId
      // actually lives and route the delete there. After one re-score
      // (mem::retention-score) every row will have the correct tag.
      let evicted = 0;
      let evictedEpisodic = 0;
      let evictedSemantic = 0;
      const evictedIds: string[] = [];
      for (const candidate of candidates) {
        try {
          let scope: string;
          let resolvedSource: "episodic" | "semantic";
          if (candidate.source === "semantic") {
            scope = KV.semantic;
            resolvedSource = "semantic";
          } else if (candidate.source === "episodic") {
            scope = KV.memories;
            resolvedSource = "episodic";
          } else {
            const episodic = await kv.get(KV.memories, candidate.memoryId);
            if (episodic !== null) {
              scope = KV.memories;
              resolvedSource = "episodic";
            } else {
              scope = KV.semantic;
              resolvedSource = "semantic";
            }
          }
          await kv.delete(scope, candidate.memoryId);
          await kv.delete(KV.retentionScores, candidate.memoryId);
          await deleteAccessLog(kv, candidate.memoryId);
          evicted++;
          evictedIds.push(candidate.memoryId);
          if (resolvedSource === "semantic") evictedSemantic++;
          else evictedEpisodic++;
        } catch {
          continue;
        }
      }

      // Retention eviction is a structural delete path that removes
      // memories, retention scores, and access logs, so it needs to
      // emit an audit record per the repo's audit-coverage policy (see
      // mem::governance-delete for the reference pattern). Batched,
      // one record per invocation — per-candidate audits would flood
      // the audit log during normal eviction sweeps.
      if (evicted > 0) {
        await recordAudit(kv, "delete", "mem::retention-evict", evictedIds, {
          threshold,
          evicted,
          evictedEpisodic,
          evictedSemantic,
          reason: "retention score below threshold",
        });
      }

      ctx.logger.info("Retention-based eviction complete", {
        evicted,
        evictedEpisodic,
        evictedSemantic,
        threshold,
      });

      return { success: true, evicted, evictedEpisodic, evictedSemantic };
    },
  );
}
