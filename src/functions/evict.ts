import type { IIIClient } from "iii-sdk";
import { markCaptureEventDeleted } from "../capture/event-record.js";
import type {
  Session,
  CompressedObservation,
  RawObservation,
  SessionSummary,
  Memory,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { removeSessionFromProjectIndex } from "../state/session-index.js";
import { unindexObservationSession } from "../state/obs-index.js";
import { isConsolidationEnabled } from "../config.js";
import { recordAudit } from "./audit.js";
import { deleteAccessLog } from "./access-tracker.js";
import { getSearchIndex, vectorIndexRemove, flushIndexSave } from "./search.js";
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

function isValidRecoveryResult(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  if (!("success" in result)) return true;
  return (result as { success?: unknown }).success !== false;
}

function isCompressedObservation(
  observation: CompressedObservation | RawObservation,
): observation is CompressedObservation {
  return (
    "title" in observation &&
    typeof observation.title === "string" &&
    observation.title.length > 0
  );
}

async function recoverStaleSession(
  sdk: IIIClient,
  sessionId: string,
): Promise<boolean> {
  try {
    const result = await sdk.trigger({
      function_id: "event::session::stopped",
      // Suppress the per-session consolidation fan-out: eviction runs a
      // single corpus-wide consolidation pass after all recoveries instead.
      payload: { sessionId, skipConsolidation: true },
    });
    if (!isValidRecoveryResult(result)) {
      logger.warn("Stale session recovery failed", {
        sessionId,
        result,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("Stale session recovery failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function runRecoveredSessionConsolidation(sdk: IIIClient): Promise<void> {
  // Same gate as the session-stop path: keyless installs must not fire
  // no-op LLM consolidation from an eviction sweep either.
  if (!isConsolidationEnabled()) return;
  try {
    await sdk.trigger({
      function_id: "mem::consolidate-pipeline",
      payload: { tier: "all", force: true },
    });
    // One crystallization pass for the batch (the per-session fan-out was
    // suppressed with skipConsolidation), keeping recovered sessions
    // consistent with normally-stopped ones without the N-fold amplification.
    await sdk.trigger({
      function_id: "mem::auto-crystallize",
      payload: { olderThanDays: 0 },
    });
  } catch (err) {
    logger.warn("Recovered session consolidation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function registerEvictFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction("mem::evict", 
    async (data: { dryRun?: boolean }): Promise<EvictionStats> => {
      const dryRun = data?.dryRun ?? false;
      const { decrementImageRef } = await import("./image-refs.js");
      let indexCleaned = false;
      const removeObservation = (
        sessionId: string,
        selected: CompressedObservation,
        eligible: (current: CompressedObservation) => boolean,
      ) => withKeyedLock(`obs:${sessionId}`, async () => {
        const current = await kv.get<CompressedObservation>(KV.observations(sessionId), selected.id);
        if (!current || !eligible(current)) return null;
        await markCaptureEventDeleted(kv, current);
        await kv.delete(KV.observations(sessionId), selected.id);
        getSearchIndex().remove(selected.id);
        vectorIndexRemove(selected.id);
        indexCleaned = true;
        return current;
      });

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

      let recoveredStaleSessions = 0;
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
            const observations = await kv
              .list<CompressedObservation | RawObservation>(
                KV.observations(session.id),
              )
              .catch((err) => {
                logger.warn("Stale session observation scan failed", {
                  sessionId: session.id,
                  error: err instanceof Error ? err.message : String(err),
                });
                return null;
              });
            if (!observations) continue;

            const sessionRevision = JSON.stringify(session);
            const observationsRevision = JSON.stringify(observations);
            let recovered = false;
            const hasCompressedObservations = observations.some(
              isCompressedObservation,
            );
            if (hasCompressedObservations) {
              recovered = await recoverStaleSession(sdk, session.id);
              if (!recovered) continue;
              recoveredStaleSessions++;
            } else if (observations.length > 0) {
              logger.warn("Stale session has no compressed observations", {
                sessionId: session.id,
              });
              continue;
            }

            try {
              const removed = await withKeyedLock(`obs:${session.id}`, async () => {
                const current = await kv.get<Session>(KV.sessions, session.id);
                if (!current || JSON.stringify(current) !== sessionRevision) return false;
                const currentObservations = await kv.list(KV.observations(session.id));
                if (JSON.stringify(currentObservations) !== observationsRevision) return false;
                await kv.delete(KV.sessions, session.id);
                await kv.delete(KV.summaryRepairs, session.id);
                return true;
              });
              if (!removed) continue;
              stats.staleSessions++;
            } catch (err) {
              logger.warn("Eviction delete failed", {
                resource: "session",
                id: session.id,
                error: err instanceof Error ? err.message : String(err),
              });
              continue;
            }
            for (const o of observations) {
              await unindexObservationSession(kv, o.id).catch(() => {});
            }
            await removeSessionFromProjectIndex(
              kv,
              session.project,
              session.id,
            ).catch(() => {});
            await recordAudit(kv, "delete", "mem::evict", [session.id], {
              resource: "session",
              reason: recovered
                ? "stale_session_recovered_then_evicted"
                : "stale_session_without_summary",
              dryRun,
            });
          }
        }
      }

      if (!dryRun && recoveredStaleSessions > 0) {
        await runRecoveredSessionConsolidation(sdk);
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
              let removed: CompressedObservation | null;
              try {
                removed = await removeObservation(session.id, o, (current) =>
                  Boolean(current.title) && now - new Date(current.timestamp).getTime() > maxAge &&
                  (current.importance ?? 5) < cfg.lowImportanceThreshold,
                );
                if (!removed) continue;
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
              await unindexObservationSession(kv, o.id).catch(() => {});
              if (removed.imageData) await decrementImageRef(kv, sdk, removed.imageData);
              if (removed.imageRef && removed.imageRef !== removed.imageData) await decrementImageRef(kv, sdk, removed.imageRef);
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
              let removed: CompressedObservation | null;
              try {
                removed = await removeObservation(o.sessionId, o, (current) =>
                  JSON.stringify(current) === JSON.stringify(o),
                );
                if (!removed) continue;
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
              await unindexObservationSession(kv, o.id).catch(() => {});
              if (removed.imageData) await decrementImageRef(kv, sdk, removed.imageData);
              if (removed.imageRef && removed.imageRef !== removed.imageData) await decrementImageRef(kv, sdk, removed.imageRef);
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
              if (mem.imageRef) {
                await decrementImageRef(kv, sdk, mem.imageRef);
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
              if (mem.imageRef) {
                await decrementImageRef(kv, sdk, mem.imageRef);
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

      if (indexCleaned) await flushIndexSave();
      logger.info("Eviction complete", { stats });
      return stats;
    },
  );
}
