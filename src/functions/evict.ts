import type { ISdk } from "iii-sdk";
import type {
  Session,
  CompressedObservation,
  SessionSummary,
  Memory,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";
import { deleteAccessLog } from "./access-tracker.js";
import { logger } from "../logger.js";

interface EvictionConfig {
  staleSessionDays: number;
  lowImportanceMaxDays: number;
  lowImportanceThreshold: number;
  maxObservationsPerProject: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULTS: EvictionConfig = {
  staleSessionDays: 30,
  lowImportanceMaxDays: 90,
  lowImportanceThreshold: 3,
  maxObservationsPerProject: 10_000,
};

interface EvictionStats {
  staleSessions: number;
  lowImportanceObs: number;
  capEvictions: number;
  expiredMemories: number;
  nonLatestMemories: number;
  dryRun: boolean;
}

export function registerEvictFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::evict", 
    async (data: { dryRun?: boolean }): Promise<EvictionStats> => {
      const dryRun = data?.dryRun ?? false;

      const configOverride = await kv
        .get<Partial<EvictionConfig>>(KV.config, "eviction")
        .catch(() => null);
      const cfg = { ...DEFAULTS, ...configOverride };

      const now = Date.now();
      const stats: EvictionStats = {
        staleSessions: 0,
        lowImportanceObs: 0,
        capEvictions: 0,
        expiredMemories: 0,
        nonLatestMemories: 0,
        dryRun,
      };

      const sessions = await kv.list<Session>(KV.sessions).catch(() => []);
      const summaries = await kv
        .list<SessionSummary>(KV.summaries)
        .catch(() => []);
      const summaryIds = new Set(summaries.map((s) => s.sessionId));

      for (const session of sessions) {
        if (!session.startedAt) continue;
        const age = now - new Date(session.startedAt).getTime();
        const staleDays = cfg.staleSessionDays * MS_PER_DAY;
        if (age > staleDays && !summaryIds.has(session.id)) {
          if (dryRun) {
            stats.staleSessions++;
          } else {
            try {
              await kv.delete(KV.sessions, session.id);
              stats.staleSessions++;
            } catch (err) {
              logger.warn("Eviction delete failed", {
                resource: "session",
                id: session.id,
                error: err instanceof Error ? err.message : String(err),
              });
              continue;
            }
            await recordAudit(kv, "delete", "mem::evict", [session.id], {
              resource: "session",
              reason: "stale_session_without_summary",
              dryRun,
            });
          }
        }
      }

      const projectObs = new Map<string, CompressedObservation[]>();
      for (const session of sessions) {
        const obs = await kv
          .list<CompressedObservation>(KV.observations(session.id))
          .catch(() => []);
        const compressed = obs.filter((o) => o.title);

        for (const o of compressed) {
          if (!o.timestamp) continue;
          const age = now - new Date(o.timestamp).getTime();
          const maxAge = cfg.lowImportanceMaxDays * MS_PER_DAY;
          if (
            age > maxAge &&
            (o.importance ?? 5) < cfg.lowImportanceThreshold
          ) {
            if (dryRun) {
              stats.lowImportanceObs++;
            } else {
              try {
                await kv.delete(KV.observations(session.id), o.id);
                stats.lowImportanceObs++;
              } catch (err) {
                logger.warn("Eviction delete failed", {
                  resource: "observation",
                  id: o.id,
                  sessionId: session.id,
                  error: err instanceof Error ? err.message : String(err),
                });
                continue;
              }
              await recordAudit(kv, "delete", "mem::evict", [o.id], {
                resource: "observation",
                reason: "low_importance_old_observation",
                sessionId: session.id,
                dryRun,
              });
            }
          }
        }

        const project = session.project || "unknown";
        const existing = projectObs.get(project) || [];
        existing.push(...compressed);
        projectObs.set(project, existing);
      }

      for (const [, obs] of projectObs) {
        if (obs.length > cfg.maxObservationsPerProject) {
          const sorted = obs.sort(
            (a, b) => (a.importance ?? 5) - (b.importance ?? 5),
          );
          const toEvict = sorted.slice(
            0,
            obs.length - cfg.maxObservationsPerProject,
          );
          if (dryRun) {
            stats.capEvictions += toEvict.length;
          } else {
            for (const o of toEvict) {
              try {
                await kv.delete(KV.observations(o.sessionId), o.id);
                stats.capEvictions++;
              } catch (err) {
                logger.warn("Eviction delete failed", {
                  resource: "observation",
                  id: o.id,
                  sessionId: o.sessionId,
                  error: err instanceof Error ? err.message : String(err),
                });
                continue;
              }
              await recordAudit(kv, "delete", "mem::evict", [o.id], {
                resource: "observation",
                reason: "project_observation_cap",
                sessionId: o.sessionId,
                dryRun,
              });
            }
          }
        }
      }

      const memories = await kv.list<Memory>(KV.memories).catch(() => []);
      const evictedMemIds = new Set<string>();
      for (const mem of memories) {
        if (mem.forgetAfter) {
          const expiry = new Date(mem.forgetAfter).getTime();
          if (now > expiry) {
            if (dryRun) {
              stats.expiredMemories++;
              evictedMemIds.add(mem.id);
            } else {
              try {
                await kv.delete(KV.memories, mem.id);
                stats.expiredMemories++;
                evictedMemIds.add(mem.id);
              } catch (err) {
                logger.warn("Eviction delete failed", {
                  resource: "memory",
                  id: mem.id,
                  reason: "expired_memory",
                  error: err instanceof Error ? err.message : String(err),
                });
                continue;
              }
              await recordAudit(kv, "delete", "mem::evict", [mem.id], {
                resource: "memory",
                reason: "expired_memory",
                dryRun,
              });
              await deleteAccessLog(kv, mem.id);
            }
          }
        }

        if (
          !evictedMemIds.has(mem.id) &&
          mem.isLatest === false &&
          mem.createdAt
        ) {
          const age = now - new Date(mem.createdAt).getTime();
          if (age > cfg.lowImportanceMaxDays * MS_PER_DAY) {
            if (dryRun) {
              stats.nonLatestMemories++;
            } else {
              try {
                await kv.delete(KV.memories, mem.id);
                stats.nonLatestMemories++;
              } catch (err) {
                logger.warn("Eviction delete failed", {
                  resource: "memory",
                  id: mem.id,
                  reason: "old_non_latest_memory",
                  error: err instanceof Error ? err.message : String(err),
                });
                continue;
              }
              await recordAudit(kv, "delete", "mem::evict", [mem.id], {
                resource: "memory",
                reason: "old_non_latest_memory",
                dryRun,
              });
              await deleteAccessLog(kv, mem.id);
            }
          }
        }
      }

      logger.info("Eviction complete", { stats });
      return stats;
    },
  );
}
