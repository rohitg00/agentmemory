import type { ISdk } from "iii-sdk";
import type {
  CompactLessonResult,
  CompactSearchResult,
  CompressedObservation,
  HybridSearchResult,
  Lesson,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { recordAccessBatch } from "./access-tracker.js";
import {
  getAgentId,
  isAgentScopeIsolated,
  getFollowupWindowSeconds,
} from "../config.js";
import { logger } from "../logger.js";
import { getCounters } from "../telemetry/setup.js";

// #771: smart-search followup-rate diagnostic. Stored per session as
// the most recent search payload, used to detect whether the next
// search inside the window had a disjoint result set. sessionId is
// duplicated into the row so the hourly sweep can delete by it
// (StateKV.list returns values only).
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

// v4-B: detect "who is X" / "what is X" / "what does X mean" patterns
// and pull out X so we can boost hits that name the concept directly.
// BM25 already rewards the exact phrase, but for short named-concept
// queries (typically 2–4 tokens) the question scaffolding ("who is the")
// adds noise that depresses true matches relative to broader, busier
// observations. This is the v4-A "careful generator" regression in
// docs/plans/v4-lineage-test-case-careful-generator.md, surfacing in
// smart-search rather than lineage.
const NAMED_CONCEPT_PATTERNS: RegExp[] = [
  /^\s*who\s+is\s+(?:the\s+|a\s+|an\s+)?(.+?)\s*\??\s*$/i,
  /^\s*what\s+is\s+(?:the\s+|a\s+|an\s+)?(.+?)\s*\??\s*$/i,
  /^\s*what(?:'s|\sis)\s+(?:the\s+|a\s+|an\s+)?(.+?)\s*\??\s*$/i,
  /^\s*what\s+does\s+(.+?)\s+mean\s*\??\s*$/i,
  /^\s*who(?:'s|\sis)\s+(?:the\s+|a\s+|an\s+)?(.+?)\s*\??\s*$/i,
];

export function extractNamedConcept(query: string): string | null {
  if (!query) return null;
  for (const re of NAMED_CONCEPT_PATTERNS) {
    const m = re.exec(query);
    if (m && m[1]) {
      const phrase = m[1].trim().replace(/[?.!]+$/, "").trim();
      // Skip degenerate matches (single very short token like "it",
      // "this") — those aren't real named concepts.
      if (phrase.length >= 3 && phrase.split(/\s+/).length <= 6) {
        return phrase;
      }
    }
  }
  return null;
}

const NAMED_CONCEPT_TITLE_BOOST = 2.0;
const NAMED_CONCEPT_BODY_BOOST = 1.3;

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
      // optional per-call agent filter for runtimes routing many
      // roles through one server. "*" opts out of the env-default
      // scope and returns hits from every agent.
      agentId?: string;
      // #771: session anchor for the followup-rate diagnostic. The
      // API trigger fills this from req.body / headers; direct
      // sdk.trigger callers can pass it explicitly.
      sessionId?: string;
      // #771: marks viewer-originated searches so the diagnostic
      // ignores them — only agent-initiated re-queries should count.
      source?: string;
    }) => {

      // Compute the agent filter once, up front. Both the expandIds
      // branch and the hybrid-search branch consult it — otherwise
      // expandIds becomes a cross-agent leak (#554 follow-up).
      //
      // #817 follow-up: fail-closed when isolated mode is on AND no
      // agent id is resolvable from any source. Silently letting
      // filterAgentId fall through to `undefined` would be the same
      // cross-agent leak this filter is meant to prevent.
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
        }> = [];

        const results = await Promise.all(
          items.map(({ obsId, sessionId }) =>
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
          returned: scoped.length,
          filteredOutOfScope: expanded.length - scoped.length,
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
      const includeLessons = data.includeLessons !== false;

      // Run observation hybrid-search and lesson recall in parallel so the
      // extra lesson lookup adds no wallclock when the underlying calls
      // can overlap. Lesson recall is best-effort: if mem::lesson-recall
      // fails or returns unexpected shape, log + fall back to empty.
      // Over-fetch when EITHER a named-concept query (post-rank boost
      // needs material when BM25 mis-ranks the exact match under
      // question-scaffolding noise) OR an agentId filter is active
      // (hybrid search can't filter on agentId — BM25/vector indexes
      // don't carry it — so we trim post-filter). 3×, capped at 300.
      const namedConcept = extractNamedConcept(data.query);
      const searchLimit =
        namedConcept || filterAgentId ? Math.min(limit * 3, 300) : limit;
      const [rawHybridResults, rawLessons] = await Promise.all([
        searchFn(data.query, searchLimit),
        includeLessons
          ? recallLessons(sdk, data.query, lessonLimit, data.project, namedConcept ?? undefined)
          : Promise.resolve([]),
      ]);

      // Filter by agentId first (hybrid indexes can't), then apply the
      // named-concept boost on the surviving set, then trim to limit.
      let workingHybrid = filterAgentId
        ? rawHybridResults.filter((r) => r.observation.agentId === filterAgentId)
        : rawHybridResults;
      let lessons = rawLessons;
      if (namedConcept) {
        const phrase = namedConcept.toLowerCase();
        const boostHybrid = (r: HybridSearchResult): HybridSearchResult => {
          const title = (r.observation.title || "").toLowerCase();
          const narrative = (r.observation.narrative || "").toLowerCase();
          // Multiplicative: title AND narrative both match → 2.0 × 1.3 = 2.6×.
          // CodeRabbit caught the prior else-if capping dual matches at 2.0×.
          let mult = 1;
          if (title.includes(phrase)) mult *= NAMED_CONCEPT_TITLE_BOOST;
          if (narrative.includes(phrase)) mult *= NAMED_CONCEPT_BODY_BOOST;
          return mult === 1 ? r : { ...r, combinedScore: r.combinedScore * mult };
        };
        workingHybrid = workingHybrid
          .map(boostHybrid)
          .sort((a, b) => b.combinedScore - a.combinedScore);
        // Use boostMatched (set by recallLessons against the full
        // pre-truncation content) instead of re-scanning the 240-char
        // preview here. Falls back to scanning preview if boostMatched
        // is absent (recallLessons called without boostPhrase).
        lessons = rawLessons
          .map((l) => {
            const matched =
              (l as CompactLessonResult & { boostMatched?: boolean }).boostMatched === true ||
              (typeof l.content === "string" && l.content.toLowerCase().includes(phrase));
            if (!matched) return l;
            return { ...l, score: (l.score ?? 0) * NAMED_CONCEPT_TITLE_BOOST };
          })
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        logger.info("Smart search named-concept boost applied", {
          query: data.query,
          concept: namedConcept,
          boostedHybrid: workingHybrid.filter((r) => {
            const t = (r.observation.title || "").toLowerCase();
            const n = (r.observation.narrative || "").toLowerCase();
            return t.includes(phrase) || n.includes(phrase);
          }).length,
        });
      }
      const hybridResults = workingHybrid.slice(0, limit);

      const compact: CompactSearchResult[] = hybridResults.map((r) => ({
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

      // #771: followup-rate diagnostic. Only fires for agent-initiated
      // searches that carry a sessionId — viewer-originated searches
      // (source === "viewer") and direct-sdk callers without a session
      // anchor are skipped. The result-set comparison uses obsIds: a
      // disjoint set under the window suggests the previous call's
      // results were not used, which is our directional proxy for
      // reader-failure-with-evidence.
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
  sdk: ISdk,
  query: string,
  limit: number,
  project?: string,
  boostPhrase?: string,
): Promise<CompactLessonResult[]> {
  try {
    const result = (await sdk.trigger({
      function_id: "mem::lesson-recall",
      payload: { query, limit, project },
    })) as { success?: boolean; lessons?: Array<Lesson & { score?: number }> };
    if (!result?.success || !Array.isArray(result.lessons)) return [];
    const phraseLower = boostPhrase?.toLowerCase();
    return result.lessons.map((l) => {
      // Decide boost match against the FULL pre-truncation content so a
      // phrase that lives past the 240-char preview window can still
      // signal relevance. CodeRabbit caught this on #571.
      const boostMatched = phraseLower
        ? `${l.content ?? ""} ${l.context ?? ""}`.toLowerCase().includes(phraseLower)
        : false;
      return {
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
        boostMatched,
      };
    });
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
