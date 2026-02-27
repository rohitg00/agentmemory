import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  CompactSearchResult,
  CompressedObservation,
  HybridSearchResult,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";

export function registerSmartSearchFunction(
  sdk: ISdk,
  kv: StateKV,
  searchFn: (query: string, limit: number) => Promise<HybridSearchResult[]>,
): void {
  sdk.registerFunction(
    {
      id: "mem::smart-search",
      description:
        "Search with progressive disclosure: compact results first, expand specific IDs for full details",
    },
    async (data: { query?: string; expandIds?: string[]; limit?: number }) => {
      const ctx = getContext();

      if (data.expandIds && data.expandIds.length > 0) {
        const ids = data.expandIds.slice(0, 20);
        const expanded: Array<{
          obsId: string;
          sessionId: string;
          observation: CompressedObservation;
        }> = [];

        for (const obsId of ids) {
          const obs = await findObservation(kv, obsId);
          if (obs) {
            expanded.push({
              obsId,
              sessionId: obs.sessionId,
              observation: obs,
            });
          }
        }

        const truncated = data.expandIds.length > ids.length;
        ctx.logger.info("Smart search expanded", {
          requested: data.expandIds.length,
          returned: ids.length,
          found: expanded.length,
          truncated,
        });
        return { mode: "expanded", results: expanded, truncated };
      }

      if (!data.query || typeof data.query !== "string" || !data.query.trim()) {
        return { mode: "compact", results: [], error: "query is required" };
      }

      const limit = Math.max(1, Math.min(data.limit ?? 20, 100));
      const hybridResults = await searchFn(data.query, limit);

      const compact: CompactSearchResult[] = hybridResults.map((r) => ({
        obsId: r.observation.id,
        sessionId: r.sessionId,
        title: r.observation.title,
        type: r.observation.type,
        score: r.combinedScore,
        timestamp: r.observation.timestamp,
      }));

      ctx.logger.info("Smart search compact", {
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
): Promise<CompressedObservation | null> {
  const sessions = await kv.list<{ id: string }>(KV.sessions);
  for (const session of sessions) {
    const obs = await kv
      .get<CompressedObservation>(KV.observations(session.id), obsId)
      .catch(() => null);
    if (obs) return obs;
  }
  return null;
}
