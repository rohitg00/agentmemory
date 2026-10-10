import type { IIIClient } from "iii-sdk";
import type {
  CompactLessonResult,
  CompactSearchResult,
  CompressedObservation,
  HybridSearchResult,
  Lesson,
  Memory,
} from "../types.js";
import { getSearchResultLayer, isSearchLayer, matchesSearchLayer, type SearchLayer, type SearchResultLayer } from "../state/search-layer.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import {
  indexObservationSession,
  lookupObservationSession,
} from "../state/obs-index.js";
import { recordAccessBatch } from "./access-tracker.js";
import {
  getAgentId,
  isAgentScopeIsolated,
  getFollowupWindowSeconds,
} from "../config.js";
import { logger } from "../logger.js";
import { withoutObservationSource } from "./observation-source.js";
import { getCounters } from "../telemetry/setup.js";
import { memoryToObservation } from "../state/memory-utils.js";
import { getSearchIndex } from "./search.js";

export interface RecentSearch {
  sessionId: string;
  query: string;
  resultIds: string[];
  at: number;
}

// Module-scope counter mirror so `mem::diagnostic::followup-stats` can
// read the rate back without going through the OTEL collector. The
// OTEL counter is still the canonical export; this is an in-process
// convenience for `agentmemory status` + tests.
const followupStats = {
  followupWithinWindow: 0,
  agentInitiatedSearches: 0,
};

// Tracks the in-flight detection promises so tests (and shutdown
// flushes) can wait for all queued lock bodies to drain. The Set adds
// when a detection is queued and removes when it settles; size === 0
// means no pending detections.
const pendingFollowups = new Set<Promise<void>>();

export function getFollowupStats(): {
  followupWithinWindow: number;
  agentInitiatedSearches: number;
  rate: number;
} {
  const total = followupStats.agentInitiatedSearches;
  return {
    ...followupStats,
    rate: total > 0 ? followupStats.followupWithinWindow / total : 0,
  };
}

export async function flushPendingFollowups(): Promise<void> {
  // Snapshot the current pending set; new detections queued after the
  // snapshot run in a fresh batch.
  await Promise.all(Array.from(pendingFollowups));
}

export function resetFollowupStatsForTests(): void {
  followupStats.followupWithinWindow = 0;
  followupStats.agentInitiatedSearches = 0;
}

// Compact mode trims each lesson's content for at-a-glance display. The
// full content is fetched via memory_lesson_recall when the caller needs it.
const LESSON_CONTENT_PREVIEW_CHARS = 240;

export function registerSmartSearchFunction(
  sdk: IIIClient,
  kv: StateKV,
  searchFn: (query: string, limit: number, targetLayer?: SearchLayer) => Promise<HybridSearchResult[]>,
): void {
  sdk.registerFunction("mem::smart-search",
    async (data: {
      query?: string;
      expandIds?: Array<string | { obsId: string; sessionId: string }>;
      limit?: number;
      project?: string;
      includeLessons?: boolean;
      targetLayer?: SearchLayer;
      // optional per-call agent filter for runtimes routing many
      // roles through one server. "*" opts out of the env-default
      // scope and returns hits from every agent.
      agentId?: string;
      sessionId?: string;
      source?: string;
    }) => {

      if (data.targetLayer !== undefined && !isSearchLayer(data.targetLayer)) {
        throw new Error("mem::smart-search: targetLayer must be one of 'all', 'memory', or 'observation'");
      }
      const targetLayer = data.targetLayer ?? "all";
      const isolated = isAgentScopeIsolated();
      const explicitAgentId =
        typeof data.agentId === "string" && data.agentId.trim().length > 0
          ? data.agentId.trim()
          : undefined;
      const wildcardAgent = explicitAgentId === "*";
      const envAgentId = isolated ? getAgentId() : undefined;
      const filterAgentId = wildcardAgent
        ? undefined
        : explicitAgentId ?? envAgentId;
      const project =
        typeof data.project === "string" && data.project.trim()
          ? data.project.trim()
          : undefined;
      if (
        isolated &&
        !wildcardAgent &&
        !explicitAgentId &&
        !envAgentId
      ) {
        throw new Error(
          "mem::smart-search: AGENTMEMORY_AGENT_SCOPE=isolated is set but " +
            "no agent id is available (env AGENT_ID unset and no explicit " +
            "agentId in the call). Refusing to read cross-agent rows. " +
            'Pass agentId: "*" to opt in to a wildcard read.',
        );
      }

      const matchesProject = project ? makeProjectMatcher(kv, project) : undefined;

      if (data.expandIds && data.expandIds.length > 0) {
        const raw = data.expandIds.slice(0, 100);
        const items = raw.map((entry) => {
          if (typeof entry === "string") return { obsId: entry, sessionId: undefined as string | undefined };
          if (entry && typeof entry === "object" && typeof entry.obsId === "string") {
            return { obsId: entry.obsId, sessionId: typeof entry.sessionId === "string" ? entry.sessionId : undefined };
          }
          return null;
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        const expanded: Array<{
          obsId: string;
          sessionId: string;
          observation: CompressedObservation;
          layer: SearchResultLayer;
        }> = [];

        let attempted = 0;
        for (let offset = 0; offset < items.length && expanded.length < 20; offset += 10) {
          const batch = items.slice(offset, offset + 10);
          const results = await Promise.all(batch.map(({ obsId, sessionId }) => findObservation(kv, obsId, sessionId)));
          attempted += batch.length;
          for (const result of results) {
            if (!result) continue;
            const { observation, layer } = result;
            if (!matchesSearchLayer(observation.id, observation.sessionId, targetLayer, layer)) continue;
            if (filterAgentId && observation.agentId !== filterAgentId) continue;
            if (matchesProject && !await matchesProject(observation.id, observation.sessionId)) continue;
            expanded.push({
              obsId: observation.id,
              sessionId: observation.sessionId,
              observation: withoutObservationSource(observation),
              layer,
            });
          }
        }
        const scoped = expanded.slice(0, 20);

        void recordAccessBatch(
          kv,
          scoped.map((e) => e.observation.id),
        );

        const truncated = data.expandIds.length > raw.length || attempted < items.length || expanded.length > scoped.length;
        logger.info("Smart search expanded", {
          requested: data.expandIds.length,
          attempted,
          returned: scoped.length,
          truncated,
        });
        return { mode: "expanded", results: scoped, truncated };
      }

      if (!data.query || typeof data.query !== "string" || !data.query.trim()) {
        return { mode: "compact", results: [], error: "query is required" };
      }

      const limit = Math.max(1, Math.min(data.limit ?? 20, 100));
      // Lesson recall stays capped: lessons are denser than raw
      // observations so 10 covers most recall flows.
      const lessonLimit = Math.min(limit, 10);
      const includeLessons = targetLayer === "all" && data.includeLessons !== false;
      const overFetchLimit = filterAgentId || project
        ? Math.max(Math.min(limit * 10, 300), 100)
        : limit;

      const [hybridResults, lessons] = await Promise.all([
        searchFn(data.query, overFetchLimit, targetLayer),
        includeLessons
          ? recallLessons(sdk, data.query, lessonLimit, project)
          : Promise.resolve([]),
      ]);

      const layerResults = hybridResults.filter((result) => matchesSearchLayer(
        result.observation.id,
        result.sessionId,
        targetLayer,
        result.layer ?? getSearchIndex().layerOf(result.observation.id),
      ));
      const projectResults = matchesProject
        ? await filterProjectResults(layerResults, (result) => matchesProject(result.observation.id, result.sessionId))
        : layerResults;

      const filteredHybrid = filterAgentId
        ? projectResults
            .filter((r) => r.observation.agentId === filterAgentId)
            .slice(0, limit)
        : projectResults.slice(0, limit);

      const compact: CompactSearchResult[] = filteredHybrid.map((r) => ({
        obsId: r.observation.id,
        layer: r.layer ?? getSearchIndex().layerOf(r.observation.id) ?? getSearchResultLayer(r.observation.id, r.sessionId),
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

      if (
        data.sessionId &&
        typeof data.sessionId === "string" &&
        data.source !== "viewer" &&
        compact.length > 0
      ) {
        // Skip detection when retrieval returned nothing: an empty
        // result set is a retrieval failure, not a reader-failure
        // signal. Counting it as "disjoint from prior" would inflate
        // the rate every time search returns no hits.
        followupStats.agentInitiatedSearches++;
        // Off the critical response path. The withKeyedLock(sessionId)
        // call serializes detection per session, so two rapid
        // back-to-back searches from the same agent still see ordered
        // prior-row writes — the second call's lock body queues
        // behind the first's. Other sessions run in parallel.
        const sessionIdForFollowup = data.sessionId;
        const queryForFollowup = data.query;
        const compactForFollowup = compact;
        const detection = withKeyedLock(
          `recent-searches:${sessionIdForFollowup}`,
          () =>
            detectFollowup(
              kv,
              sessionIdForFollowup,
              queryForFollowup,
              compactForFollowup,
            ),
        )
          .catch((err) => {
            logger.warn("Smart search followup detection failed", {
              sessionId: sessionIdForFollowup,
              error: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(() => {
            pendingFollowups.delete(detection);
          });
        pendingFollowups.add(detection);
      }

      logger.info("Smart search compact", {
        query: data.query,
        results: compact.length,
        lessons: lessons.length,
      });
      const response: {
        mode: "compact";
        results: CompactSearchResult[];
        lessons?: CompactLessonResult[];
      } = { mode: "compact", results: compact };
      if (includeLessons) response.lessons = lessons;
      return response;
    },
  );
}

async function recallLessons(
  sdk: IIIClient,
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

async function detectFollowup(
  kv: StateKV,
  sessionId: string,
  query: string,
  compact: CompactSearchResult[],
): Promise<void> {
  const now = Date.now();
  const windowMs = Math.max(1, getFollowupWindowSeconds()) * 1000;
  const currentIds = compact.map((r) => r.obsId);
  const current: RecentSearch = { sessionId, query, resultIds: currentIds, at: now };

  const prior = await kv
    .get<RecentSearch>(KV.recentSearches, sessionId)
    .catch(() => null);

  await kv.set(KV.recentSearches, sessionId, current);

  if (!prior || typeof prior.at !== "number") return;
  if (now - prior.at > windowMs) return;
  // Same query inside the window is a retry, not a follow-up; skip so a
  // duplicate request from a flaky client doesn't inflate the metric.
  if (typeof prior.query === "string" && prior.query === query) return;

  const priorIds = Array.isArray(prior.resultIds) ? prior.resultIds : [];
  const priorSet = new Set(priorIds);
  const hasOverlap = currentIds.some((id) => priorSet.has(id));
  if (hasOverlap) return;

  getCounters().smartSearchFollowupWithinWindow.add(1);
  followupStats.followupWithinWindow++;
  logger.info("Smart search followup detected", {
    sessionId,
    windowSeconds: Math.round(windowMs / 1000),
    priorQuery: prior.query,
    nextQuery: query,
    priorResultCount: priorIds.length,
    nextResultCount: currentIds.length,
  });
}

async function findObservation(
  kv: StateKV,
  obsId: string,
  sessionIdHint?: string,
): Promise<{ observation: CompressedObservation; layer: SearchResultLayer } | null> {
  const memory = await kv.get<Memory>(KV.memories, obsId);
  if (memory) return { observation: memoryToObservation(memory), layer: "memory" };

  if (sessionIdHint) {
    const obs = await kv
      .get<CompressedObservation>(KV.observations(sessionIdHint), obsId)
      .catch(() => null);
    if (obs) return { observation: obs, layer: "observation" };
  }

  const indexedSessionId = await lookupObservationSession(kv, obsId);
  if (indexedSessionId) {
    const obs = await kv
      .get<CompressedObservation>(KV.observations(indexedSessionId), obsId)
      .catch(() => null);
    if (obs) return { observation: obs, layer: "observation" };
  }

  const sessions = await kv.list<{ id: string }>(KV.sessions);
  for (let i = 0; i < sessions.length; i += 5) {
    const batch = sessions.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((s) =>
        kv.get<CompressedObservation>(KV.observations(s.id), obsId).catch(() => null),
      ),
    );
    const foundIndex = results.findIndex((r) => r !== null);
    if (foundIndex !== -1) {
      const found = results[foundIndex] as CompressedObservation;
      await indexObservationSession(kv, obsId, batch[foundIndex].id).catch(
        () => {},
      );
      return { observation: found, layer: "observation" };
    }
  }
  return null;
}

function makeProjectMatcher(kv: StateKV, project: string): (obsId: string, sessionId: string) => Promise<boolean> {
  const memories = new Map<string, Promise<Memory | null>>();
  const sessions = new Map<string, Promise<{ project?: string } | null>>();
  return async (obsId, sessionId) => {
    let memoryRead = memories.get(obsId);
    if (!memoryRead) {
      memoryRead = kv.get<Memory>(KV.memories, obsId);
      memories.set(obsId, memoryRead);
    }
    const memory = await memoryRead;
    if (memory?.project !== undefined) return memory.project === project;
    let sessionRead = sessions.get(sessionId);
    if (!sessionRead) {
      sessionRead = kv.get<{ project?: string }>(KV.sessions, sessionId);
      sessions.set(sessionId, sessionRead);
    }
    return (await sessionRead)?.project === project;
  };
}

async function filterProjectResults<T>(items: T[], matches: (item: T) => Promise<boolean>): Promise<T[]> {
  const scoped: T[] = [];
  for (let offset = 0; offset < items.length; offset += 10) {
    const batch = items.slice(offset, offset + 10);
    const selected = await Promise.all(batch.map(matches));
    scoped.push(...batch.filter((_, index) => selected[index]));
  }
  return scoped;
}
