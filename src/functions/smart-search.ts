import type { ISdk } from "iii-sdk";
import type {
  CompactHighOrderResult,
  CompactLessonResult,
  CompactSearchResult,
  CompressedObservation,
  Crystal,
  HybridSearchResult,
  Insight,
  Lesson,
  ProceduralMemory,
  SemanticMemory,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { recordAccessBatch } from "./access-tracker.js";
import { getAgentId, isAgentScopeIsolated, isHighOrderSearchEnabled, getHighOrderConfidenceFloor } from "../config.js";
import { searchHighOrderTiers } from "./high-order-search.js";
import { logger } from "../logger.js";

// Compact mode trims each lesson's content for at-a-glance display. The
// full content is fetched via memory_lesson_recall when the caller needs it.
const LESSON_CONTENT_PREVIEW_CHARS = 240;

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
      project?: string;
      includeLessons?: boolean;
      includeHighOrder?: boolean;
      agentId?: string;
    }) => {

      // Compute the agent filter once, up front. Both the expandIds
      // branch and the hybrid-search branch consult it — otherwise
      // expandIds becomes a cross-agent leak (#554 follow-up).
      const isolated = isAgentScopeIsolated();
      const explicitAgentId =
        typeof data.agentId === "string" && data.agentId.trim().length > 0
          ? data.agentId.trim()
          : undefined;
      const wildcardAgent = explicitAgentId === "*";
      const filterAgentId = wildcardAgent
        ? undefined
        : explicitAgentId ?? (isolated ? getAgentId() : undefined);

      if (data.expandIds && data.expandIds.length > 0) {
        const raw = data.expandIds.slice(0, 20);
        const items = raw.map((entry) => {
          if (typeof entry === "string") return { obsId: entry, sessionId: undefined as string | undefined };
          if (entry && typeof entry === "object" && typeof (entry as any).obsId === "string") {
            return { obsId: (entry as any).obsId, sessionId: (entry as any).sessionId as string | undefined };
          }
          return null;
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        const highOrderItems: Array<{ tier: string; id: string; data: unknown }> = [];
        const obsItems: typeof items = [];

        for (const item of items) {
          if (item.obsId.startsWith("sem_")) {
            const entry = await kv.get<SemanticMemory>(KV.semantic, item.obsId).catch(() => null);
            if (entry) highOrderItems.push({ tier: "semantic", id: entry.id, data: entry });
          } else if (item.obsId.startsWith("proc_") || item.obsId.startsWith("skill_")) {
            const entry = await kv.get<ProceduralMemory>(KV.procedural, item.obsId).catch(() => null);
            if (entry) highOrderItems.push({ tier: "procedural", id: entry.id, data: entry });
          } else if (item.obsId.startsWith("crys_")) {
            const entry = await kv.get<Crystal>(KV.crystals, item.obsId).catch(() => null);
            if (entry) highOrderItems.push({ tier: "crystal", id: entry.id, data: entry });
          } else if (item.obsId.startsWith("ins_")) {
            const entry = await kv.get<Insight>(KV.insights, item.obsId).catch(() => null);
            if (entry && !entry.deleted) highOrderItems.push({ tier: "insight", id: entry.id, data: entry });
          } else {
            obsItems.push(item);
          }
        }

        const expanded: Array<{
          obsId: string;
          sessionId: string;
          observation: CompressedObservation;
        }> = [];

        const results = await Promise.all(
          obsItems.map(({ obsId, sessionId }) =>
            findObservation(kv, obsId, sessionId).then((obs) =>
              obs ? { obsId, sessionId: obs.sessionId, observation: obs } : null,
            ),
          ),
        );
        for (const r of results) {
          if (r) expanded.push(r);
        }

        const scoped = filterAgentId
          ? expanded.filter((e) => e.observation.agentId === filterAgentId)
          : expanded;

        void recordAccessBatch(
          kv,
          scoped.map((e) => e.observation.id),
        );

        const truncated = data.expandIds.length > raw.length;
        logger.info("Smart search expanded", {
          requested: data.expandIds.length,
          attempted: raw.length,
          returned: scoped.length + highOrderItems.length,
          filteredOutOfScope: expanded.length - scoped.length,
          highOrderExpanded: highOrderItems.length,
          truncated,
        });
        return { mode: "expanded", results: scoped, highOrder: highOrderItems, truncated };
      }

      if (!data.query || typeof data.query !== "string" || !data.query.trim()) {
        return { mode: "compact", results: [], error: "query is required" };
      }

      const limit = Math.max(1, Math.min(data.limit ?? 20, 100));
      const lessonLimit = Math.min(limit, 10);
      const includeLessons = data.includeLessons !== false;

      const includeHighOrder = data.includeHighOrder !== false
        && isHighOrderSearchEnabled()
        && !filterAgentId;

      const overFetchLimit = filterAgentId
        ? Math.min(limit * 3, 300)
        : limit;

      const [hybridResults, lessons, highOrderResponse] = await Promise.all([
        searchFn(data.query, overFetchLimit),
        includeLessons
          ? recallLessons(sdk, data.query, lessonLimit, data.project)
          : Promise.resolve([]),
        includeHighOrder
          ? searchHighOrderTiers(kv, data.query, {
              confidenceFloor: getHighOrderConfidenceFloor(),
              project: data.project,
              limit: Math.min(limit, 20),
            })
          : Promise.resolve({ results: [], needsBackfill: false }),
      ]);

      const highOrderResults = Array.isArray(highOrderResponse) ? highOrderResponse : highOrderResponse.results;
      const needsBackfill = Array.isArray(highOrderResponse) ? false : highOrderResponse.needsBackfill;

      if (needsBackfill) {
        // Trigger background backfill fire-and-forget
        sdk.trigger({ function_id: "mem::backfill-embeddings::high-order", payload: {} }).catch(() => {});
      }

      const filteredHybrid = filterAgentId
        ? hybridResults
            .filter((r) => r.observation.agentId === filterAgentId)
            .slice(0, limit)
        : hybridResults.slice(0, limit);

      const compact: CompactSearchResult[] = filteredHybrid.map((r) => ({
        obsId: r.observation.id,
        sessionId: r.sessionId,
        title: r.observation.title,
        type: r.observation.type,
        score: r.combinedScore,
        timestamp: r.observation.timestamp,
      }));

      void recordAccessBatch(
        kv,
        compact.map((r) => r.obsId),
      );

      logger.info("Smart search compact", {
        query: data.query,
        results: compact.length,
        lessons: lessons.length,
        highOrder: highOrderResults.length,
      });
      const response: {
        mode: "compact";
        results: CompactSearchResult[];
        lessons?: CompactLessonResult[];
        highOrder?: CompactHighOrderResult[];
      } = { mode: "compact", results: compact };
      if (includeLessons) response.lessons = lessons;
      if (includeHighOrder && highOrderResults.length > 0) {
        response.highOrder = highOrderResults;
      }
      return response;
    },
  );
}

async function recallLessons(
  sdk: ISdk,
  query: string,
  limit: number,
  project?: string,
): Promise<CompactLessonResult[]> {
  try {
    const result = (await sdk.trigger({
      function_id: "mem::lesson-recall",
      payload: { query, limit, project },
    })) as { success?: boolean; lessons?: Array<Lesson & { score?: number }> };
    if (!result?.success || !Array.isArray(result.lessons)) return [];
    return result.lessons.map((l) => ({
      lessonId: l.id,
      content:
        l.content.length > LESSON_CONTENT_PREVIEW_CHARS
          ? l.content.slice(0, LESSON_CONTENT_PREVIEW_CHARS) + "…"
          : l.content,
      confidence: l.confidence,
      score: l.score ?? l.confidence,
      createdAt: l.createdAt,
      project: l.project,
      tags: l.tags ?? [],
    }));
  } catch (err) {
    logger.warn("Smart search: mem::lesson-recall failed; returning empty lesson list", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
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
