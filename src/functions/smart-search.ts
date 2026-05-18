import type { ISdk } from "iii-sdk";
import type {
  CompactSearchResult,
  CompressedObservation,
  HybridSearchResult,
  Session,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { recordAccessBatch } from "./access-tracker.js";
import { logger } from "../logger.js";
import { compactSessionAttribution } from "./session-attribution.js";

export function registerSmartSearchFunction(
  sdk: ISdk,
  kv: StateKV,
  searchFn: (query: string, limit: number) => Promise<HybridSearchResult[]>,
): void {
  sdk.registerFunction("mem::smart-search", 
    async (data: {
      query?: string;
      expandIds?: Array<string | { obsId: string; sessionId: string }>;
      limit?: number;
    }) => {

      if (data.expandIds && data.expandIds.length > 0) {
        const raw = data.expandIds.slice(0, 20);
        const items = raw.map((entry) => {
          if (typeof entry === "string") return { obsId: entry, sessionId: undefined as string | undefined };
          if (entry && typeof entry === "object" && typeof (entry as any).obsId === "string") {
            return { obsId: (entry as any).obsId, sessionId: (entry as any).sessionId as string | undefined };
          }
          return null;
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        const expanded: Array<{
          obsId: string;
          sessionId: string;
          observation: CompressedObservation;
          session?: ReturnType<typeof compactSessionAttribution>;
        }> = [];

        const results = await Promise.all(
          items.map(({ obsId, sessionId }) =>
            findObservation(kv, obsId, sessionId).then(async (obs) => {
              if (!obs) return null;
              const session = await loadSession(kv, obs.sessionId);
              return {
                obsId,
                sessionId: obs.sessionId,
                observation: obs,
                session: compactSessionAttribution(obs.sessionId, session),
              };
            }),
          ),
        );
        for (const r of results) {
          if (r) expanded.push(r);
        }

        void recordAccessBatch(
          kv,
          expanded.map((e) => e.observation.id),
        );

        const truncated = data.expandIds.length > raw.length;
        logger.info("Smart search expanded", {
          requested: data.expandIds.length,
          attempted: raw.length,
          returned: expanded.length,
          truncated,
        });
        return { mode: "expanded", results: expanded, truncated };
      }

      if (!data.query || typeof data.query !== "string" || !data.query.trim()) {
        return { mode: "compact", results: [], error: "query is required" };
      }

      const limit = Math.max(1, Math.min(data.limit ?? 20, 100));
      const hybridResults = await searchFn(data.query, limit);

      const compact: CompactSearchResult[] = await Promise.all(
        hybridResults.map(async (r) => {
          const session = await loadSession(kv, r.sessionId);
          return {
            obsId: r.observation.id,
            sessionId: r.sessionId,
            session: compactSessionAttribution(r.sessionId, session),
            title: r.observation.title,
            type: r.observation.type,
            score: r.combinedScore,
            timestamp: r.observation.timestamp,
          };
        }),
      );

      void recordAccessBatch(
        kv,
        compact.map((r) => r.obsId),
      );

      logger.info("Smart search compact", {
        query: data.query,
        results: compact.length,
      });
      return { mode: "compact", results: compact };
    },
  );
}

async function findObservation(
  kv: StateKV,
  obsId: string,
  sessionIdHint?: string,
): Promise<CompressedObservation | null> {
  if (sessionIdHint) {
    const obs = await kv
      .get<CompressedObservation>(KV.observations(sessionIdHint), obsId)
      .catch(() => null);
    if (obs) return obs;
  }

  const sessions = await kv.list<{ id: string }>(KV.sessions);
  for (let i = 0; i < sessions.length; i += 5) {
    const batch = sessions.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((s) =>
        kv.get<CompressedObservation>(KV.observations(s.id), obsId).catch(() => null),
      ),
    );
    const found = results.find((r) => r !== null);
    if (found) return found;
  }
  return null;
}

async function loadSession(
  kv: StateKV,
  sessionId: string,
): Promise<Session | null> {
  return kv.get<Session>(KV.sessions, sessionId).catch(() => null);
}
