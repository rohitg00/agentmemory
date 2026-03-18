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

const DEFAULT_DECAY: DecayConfig = {
  lambda: 0.01,
  sigma: 0.3,
  tierThresholds: {
    hot: 0.7,
    warm: 0.4,
    cold: 0.15,
  },
};

function computeRetention(
  salience: number,
  createdAt: string,
  accessTimestamps: number[],
  config: DecayConfig,
): number {
  const now = Date.now();
  const deltaT = (now - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);

  const temporalDecay = Math.exp(-config.lambda * deltaT);

  let reinforcementBoost = 0;
  for (const tAccess of accessTimestamps) {
    const daysSinceAccess =
      (now - tAccess) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess > 0) {
      reinforcementBoost += 1 / daysSinceAccess;
    }
  }
  reinforcementBoost *= config.sigma;

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

      const memories = await kv.list<Memory>(KV.memories);
      const semanticMems = await kv.list<SemanticMemory>(KV.semantic);

      const scores: RetentionScore[] = [];

      for (const mem of memories) {
        if (!mem.isLatest) continue;
        const salience = computeSalience(mem, 0);
        const score = computeRetention(
          salience,
          mem.createdAt,
          [],
          config,
        );

        const entry: RetentionScore = {
          memoryId: mem.id,
          score,
          salience,
          temporalDecay: Math.exp(
            -config.lambda *
              ((Date.now() - new Date(mem.createdAt).getTime()) /
                (1000 * 60 * 60 * 24)),
          ),
          reinforcementBoost: 0,
          lastAccessed: mem.updatedAt,
          accessCount: 0,
        };

        scores.push(entry);
        await kv.set(KV.retentionScores, mem.id, entry);
      }

      for (const sem of semanticMems) {
        const accessTimestamps = sem.lastAccessedAt
          ? [new Date(sem.lastAccessedAt).getTime()]
          : [];
        const salience = computeSalience(sem, sem.accessCount);
        const score = computeRetention(
          salience,
          sem.createdAt,
          accessTimestamps,
          config,
        );

        const entry: RetentionScore = {
          memoryId: sem.id,
          score,
          salience,
          temporalDecay: Math.exp(
            -config.lambda *
              ((Date.now() - new Date(sem.createdAt).getTime()) /
                (1000 * 60 * 60 * 24)),
          ),
          reinforcementBoost:
            score - salience * Math.exp(
              -config.lambda *
                ((Date.now() - new Date(sem.createdAt).getTime()) /
                  (1000 * 60 * 60 * 24)),
            ),
          lastAccessed: sem.lastAccessedAt,
          accessCount: sem.accessCount,
        };

        scores.push(entry);
        await kv.set(KV.retentionScores, sem.id, entry);
      }

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

      let evicted = 0;
      for (const candidate of candidates) {
        try {
          await kv.delete(KV.memories, candidate.memoryId);
          await kv.delete(KV.retentionScores, candidate.memoryId);
          evicted++;
        } catch {
          continue;
        }
      }

      ctx.logger.info("Retention-based eviction complete", {
        evicted,
        threshold,
      });

      return { success: true, evicted };
    },
  );
}
