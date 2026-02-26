import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  Session,
  CompressedObservation,
  SessionSummary,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

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
  dryRun: boolean;
}

export function registerEvictFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    {
      id: "mem::evict",
      description: "Evict stale memories based on age and importance",
    },
    async (data: { dryRun?: boolean }): Promise<EvictionStats> => {
      const ctx = getContext();
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
          stats.staleSessions++;
          if (!dryRun) {
            await kv.delete(KV.sessions, session.id).catch(() => {});
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
            stats.lowImportanceObs++;
            if (!dryRun) {
              await kv
                .delete(KV.observations(session.id), o.id)
                .catch(() => {});
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
          stats.capEvictions += toEvict.length;
          if (!dryRun) {
            for (const o of toEvict) {
              await kv
                .delete(KV.observations(o.sessionId), o.id)
                .catch(() => {});
            }
          }
        }
      }

      ctx.logger.info("Eviction complete", { stats });
      return stats;
    },
  );
}
