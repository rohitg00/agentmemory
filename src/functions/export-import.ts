import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  Session,
  CompressedObservation,
  Memory,
  SessionSummary,
  ProjectProfile,
  ExportData,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

export function registerExportImportFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::export", description: "Export all memory data as JSON" },
    async () => {
      const ctx = getContext();

      const sessions = await kv.list<Session>(KV.sessions);
      const memories = await kv.list<Memory>(KV.memories);
      const summaries = await kv.list<SessionSummary>(KV.summaries);

      const observations: Record<string, CompressedObservation[]> = {};
      for (const session of sessions) {
        const obs = await kv
          .list<CompressedObservation>(KV.observations(session.id))
          .catch(() => []);
        if (obs.length > 0) {
          observations[session.id] = obs;
        }
      }

      const profiles: ProjectProfile[] = [];
      const uniqueProjects = [...new Set(sessions.map((s) => s.project))];
      for (const project of uniqueProjects) {
        const profile = await kv
          .get<ProjectProfile>(KV.profiles, project)
          .catch(() => null);
        if (profile) profiles.push(profile);
      }

      const exportData: ExportData = {
        version: "0.3.0",
        exportedAt: new Date().toISOString(),
        sessions,
        observations,
        memories,
        summaries,
        profiles: profiles.length > 0 ? profiles : undefined,
      };

      const totalObs = Object.values(observations).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );
      ctx.logger.info("Export complete", {
        sessions: sessions.length,
        observations: totalObs,
        memories: memories.length,
        summaries: summaries.length,
      });

      return exportData;
    },
  );

  sdk.registerFunction(
    {
      id: "mem::import",
      description: "Import memory data from JSON export",
    },
    async (data: {
      exportData: ExportData;
      strategy?: "merge" | "replace" | "skip";
    }) => {
      const ctx = getContext();
      const strategy = data.strategy || "merge";
      const importData = data.exportData;

      if (importData.version !== "0.3.0") {
        return {
          success: false,
          error: `Unsupported export version: ${importData.version}`,
        };
      }

      const MAX_SESSIONS = 10_000;
      const MAX_MEMORIES = 50_000;
      const MAX_SUMMARIES = 10_000;
      const MAX_OBS_PER_SESSION = 5_000;
      const MAX_TOTAL_OBSERVATIONS = 500_000;

      if (!Array.isArray(importData.sessions)) {
        return { success: false, error: "sessions must be an array" };
      }
      if (!Array.isArray(importData.memories)) {
        return { success: false, error: "memories must be an array" };
      }
      if (!Array.isArray(importData.summaries)) {
        return { success: false, error: "summaries must be an array" };
      }
      if (
        typeof importData.observations !== "object" ||
        importData.observations === null ||
        Array.isArray(importData.observations)
      ) {
        return { success: false, error: "observations must be an object" };
      }

      if (importData.sessions.length > MAX_SESSIONS) {
        return {
          success: false,
          error: `Too many sessions (max ${MAX_SESSIONS})`,
        };
      }
      if (importData.memories.length > MAX_MEMORIES) {
        return {
          success: false,
          error: `Too many memories (max ${MAX_MEMORIES})`,
        };
      }
      if (importData.summaries.length > MAX_SUMMARIES) {
        return {
          success: false,
          error: `Too many summaries (max ${MAX_SUMMARIES})`,
        };
      }
      let totalObservations = 0;
      for (const [, obs] of Object.entries(importData.observations)) {
        if (!Array.isArray(obs)) {
          return { success: false, error: "observation values must be arrays" };
        }
        if (obs.length > MAX_OBS_PER_SESSION) {
          return {
            success: false,
            error: `Too many observations per session (max ${MAX_OBS_PER_SESSION})`,
          };
        }
        totalObservations += obs.length;
      }
      if (totalObservations > MAX_TOTAL_OBSERVATIONS) {
        return {
          success: false,
          error: `Too many total observations (max ${MAX_TOTAL_OBSERVATIONS})`,
        };
      }

      const stats = {
        sessions: 0,
        observations: 0,
        memories: 0,
        summaries: 0,
        skipped: 0,
      };

      if (strategy === "replace") {
        const existing = await kv.list<Session>(KV.sessions);
        for (const session of existing) {
          await kv.delete(KV.sessions, session.id);
          const obs = await kv
            .list<CompressedObservation>(KV.observations(session.id))
            .catch(() => []);
          for (const o of obs) {
            await kv.delete(KV.observations(session.id), o.id);
          }
        }
        const existingMem = await kv.list<Memory>(KV.memories);
        for (const m of existingMem) {
          await kv.delete(KV.memories, m.id);
        }
        const existingSummaries = await kv.list<SessionSummary>(KV.summaries);
        for (const s of existingSummaries) {
          await kv.delete(KV.summaries, s.sessionId);
        }
      }

      for (const session of importData.sessions) {
        if (strategy === "skip") {
          const existing = await kv
            .get<Session>(KV.sessions, session.id)
            .catch(() => null);
          if (existing) {
            stats.skipped++;
            continue;
          }
        }
        await kv.set(KV.sessions, session.id, session);
        stats.sessions++;
      }

      for (const [sessionId, obs] of Object.entries(importData.observations)) {
        for (const o of obs) {
          if (strategy === "skip") {
            const existing = await kv
              .get<CompressedObservation>(KV.observations(sessionId), o.id)
              .catch(() => null);
            if (existing) {
              stats.skipped++;
              continue;
            }
          }
          await kv.set(KV.observations(sessionId), o.id, o);
          stats.observations++;
        }
      }

      for (const memory of importData.memories) {
        if (strategy === "skip") {
          const existing = await kv
            .get<Memory>(KV.memories, memory.id)
            .catch(() => null);
          if (existing) {
            stats.skipped++;
            continue;
          }
        }
        await kv.set(KV.memories, memory.id, memory);
        stats.memories++;
      }

      for (const summary of importData.summaries) {
        if (strategy === "skip") {
          const existing = await kv
            .get<SessionSummary>(KV.summaries, summary.sessionId)
            .catch(() => null);
          if (existing) {
            stats.skipped++;
            continue;
          }
        }
        await kv.set(KV.summaries, summary.sessionId, summary);
        stats.summaries++;
      }

      ctx.logger.info("Import complete", { strategy, ...stats });
      return { success: true, strategy, ...stats };
    },
  );
}
