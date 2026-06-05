import type { ISdk } from "iii-sdk";
import type {
  CompressedObservation,
  GraphEdge,
  GraphNode,
  GraphNodeType,
  Lesson,
  LineageChannel,
  LineageGraphNeighbor,
  LineageResult,
  Memory,
  Session,
  SessionSummary,
  TimelineItem,
} from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { getSearchIndex, rebuildIndex } from "./search.js";
import { safeAudit } from "./audit.js";
import { logger } from "../logger.js";

// Concept-lineage retrieval. Unlike mem::search (relevance) and
// mem::smart-search (lessons-first ranker), this primitive returns
// chronologically-sorted hits across observation, memory, lesson, and
// summary channels — answering "when did this term enter the corpus,
// and what surrounded it?". Reuses the existing BM25 index for obs/mem
// and falls through to substring scans for lessons/summaries.

const ALL_CHANNELS: LineageChannel[] = [
  "observation",
  "memory",
  "lesson",
  "summary",
];

interface LineageRequest {
  query: string;
  limit?: number;
  since?: string;
  until?: string;
  channels?: LineageChannel[];
  includeAdjacentTurns?: boolean;
  includeGraph?: boolean;
  order?: "asc" | "desc";
}

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function buildSnippet(content: string, qLower: string): string {
  if (!content) return "";
  const lower = content.toLowerCase();
  const pos = lower.indexOf(qLower);
  if (pos < 0) {
    return content.length <= 300 ? content : content.slice(0, 300) + "…";
  }
  const start = Math.max(0, pos - 150);
  const end = Math.min(content.length, pos + qLower.length + 150);
  const head = start > 0 ? "…" : "";
  const tail = end < content.length ? "…" : "";
  return head + content.slice(start, end) + tail;
}

// Repo doc and session-handoff memories embed their source in the first
// line of content. Pull it out so callers can filter by sourceFile.
// Headers come in two flavors:
//   [Repo doc] <project>: <path/to/file>
//   [Session handoff] <project>: <path/to/file>
// Both have an optional "(chunk i/n)" suffix. Capture the path token.
const REPO_DOC_RE = /^\[Repo doc\] [^:]+:\s+([^\s(]+)/;
const SESSION_HANDOFF_RE = /^\[Session handoff\] [^:]+:\s+([^\s(]+)/;

function extractMemorySourceFile(content: string): string | undefined {
  const firstLine = content.split("\n", 1)[0] ?? "";
  const repo = REPO_DOC_RE.exec(firstLine);
  if (repo) return repo[1];
  const handoff = SESSION_HANDOFF_RE.exec(firstLine);
  if (handoff) return handoff[1];
  return undefined;
}

function inRange(timestamp: string, since?: number, until?: number): boolean {
  const t = Date.parse(timestamp);
  if (!Number.isFinite(t)) return false;
  if (since !== undefined && t < since) return false;
  if (until !== undefined && t > until) return false;
  return true;
}

function tieBreak(a: TimelineItem, b: TimelineItem): number {
  if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function registerLineageFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::lineage",
    async (data: LineageRequest): Promise<LineageResult | { error: string }> => {
      if (typeof data?.query !== "string" || !data.query.trim()) {
        return { error: "query is required" };
      }
      const query = data.query.trim();
      const qLower = query.toLowerCase();

      const limit =
        typeof data.limit === "number" && Number.isInteger(data.limit) && data.limit > 0
          ? Math.min(data.limit, 500)
          : 50;

      const since = isValidIsoTimestamp(data.since) ? Date.parse(data.since) : undefined;
      const until = isValidIsoTimestamp(data.until) ? Date.parse(data.until) : undefined;

      const requestedChannels =
        Array.isArray(data.channels) && data.channels.length > 0
          ? (data.channels.filter((c): c is LineageChannel =>
              ALL_CHANNELS.includes(c as LineageChannel),
            ) as LineageChannel[])
          : ALL_CHANNELS;
      const channelSet = new Set<LineageChannel>(requestedChannels);

      const includeAdjacentTurns = data.includeAdjacentTurns !== false;
      const includeGraph = data.includeGraph === true;
      const order: "asc" | "desc" = data.order === "desc" ? "desc" : "asc";

      const items: TimelineItem[] = [];

      // (a) BM25 path covers observations + memories (memories are
      // indexed under their own id with sessionId fallback "memory"
      // via memoryToObservation).
      if (channelSet.has("observation") || channelSet.has("memory")) {
        const idx = getSearchIndex();
        if (idx.size === 0) {
          try {
            const count = await rebuildIndex(kv);
            logger.info("Search index rebuilt for lineage", { entries: count });
          } catch (err) {
            logger.warn("lineage: rebuild index failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        // v4-A Gap 2 fix: bound the sweep generously so deep-in-session
        // references in large jsonl-imported sessions (10k+ obs) still
        // rank into the channel-filtered top N. Was min(limit*4, 500),
        // which missed in-session refs in the Apr 26→May 17 GA session.
        const bm25Hits = idx.search(query, Math.min(Math.max(limit * 20, 1000), 5000));

        // Resolve each hit to either an observation or a memory.
        const memoryCache = new Map<string, Memory | null>();
        const obsCache = new Map<string, CompressedObservation | null>();

        for (const hit of bm25Hits) {
          // Memory hits have sessionId == "memory" (synthetic) OR live
          // in KV.memories with a real sessionId. Probe memory scope by
          // id first; fall back to observation lookup.
          let mem = memoryCache.get(hit.obsId);
          if (mem === undefined) {
            try {
              mem = (await kv.get<Memory>(KV.memories, hit.obsId)) ?? null;
            } catch {
              mem = null;
            }
            memoryCache.set(hit.obsId, mem);
          }
          if (mem && mem.isLatest !== false) {
            if (!channelSet.has("memory")) continue;
            const ts = mem.createdAt;
            if (!inRange(ts, since, until)) continue;
            items.push({
              timestamp: ts,
              channel: "memory",
              id: mem.id,
              title: mem.title,
              snippet: buildSnippet(mem.content, qLower),
              score: hit.score,
              sourceFile: extractMemorySourceFile(mem.content),
              memoryType: mem.type,
            });
            continue;
          }

          if (!channelSet.has("observation")) continue;
          let obs = obsCache.get(hit.obsId);
          if (obs === undefined) {
            try {
              obs =
                (await kv.get<CompressedObservation>(
                  KV.observations(hit.sessionId),
                  hit.obsId,
                )) ?? null;
            } catch {
              obs = null;
            }
            obsCache.set(hit.obsId, obs);
          }
          if (!obs) continue;
          if (!inRange(obs.timestamp, since, until)) continue;
          const snippetSource =
            obs.narrative || obs.facts.join(" ") || obs.title;
          items.push({
            timestamp: obs.timestamp,
            channel: "observation",
            id: obs.id,
            sessionId: obs.sessionId,
            title: obs.title,
            type: obs.type,
            snippet: buildSnippet(snippetSource, qLower),
            score: hit.score,
          });
        }
      }

      // (b) lesson substring scan
      if (channelSet.has("lesson")) {
        const lessons = await kv.list<Lesson>(KV.lessons);
        for (const lesson of lessons) {
          if (lesson.deleted) continue;
          if (!lesson.content) continue;
          if (!lesson.content.toLowerCase().includes(qLower)) continue;
          const ts = lesson.createdAt;
          if (!inRange(ts, since, until)) continue;
          items.push({
            timestamp: ts,
            channel: "lesson",
            id: lesson.id,
            project: lesson.project,
            title: lesson.content.slice(0, 80),
            snippet: buildSnippet(lesson.content, qLower),
            score: 0,
          });
        }
      }

      // (c) summary substring scan
      if (channelSet.has("summary")) {
        const summaries = await kv.list<SessionSummary>(KV.summaries);
        for (const sum of summaries) {
          if (!sum.narrative) continue;
          if (!sum.narrative.toLowerCase().includes(qLower)) continue;
          const ts = sum.createdAt;
          if (!inRange(ts, since, until)) continue;
          items.push({
            timestamp: ts,
            channel: "summary",
            id: sum.sessionId,
            sessionId: sum.sessionId,
            project: sum.project,
            title: sum.title,
            snippet: buildSnippet(sum.narrative, qLower),
            score: 0,
          });
        }
      }

      // Sort, trim to limit, then enrich (so enrichment cost scales
      // with displayed items, not raw match count).
      items.sort((a, b) => {
        const ta = Date.parse(a.timestamp);
        const tb = Date.parse(b.timestamp);
        if (ta !== tb) return order === "asc" ? ta - tb : tb - ta;
        return tieBreak(a, b);
      });
      const trimmed = items.slice(0, limit);

      // Session lookup cache for observation/summary items.
      const sessionCache = new Map<string, Session | null>();
      const loadSession = async (sessionId: string): Promise<Session | null> => {
        if (sessionCache.has(sessionId)) return sessionCache.get(sessionId)!;
        let s: Session | null = null;
        try {
          s = (await kv.get<Session>(KV.sessions, sessionId)) ?? null;
        } catch {
          s = null;
        }
        sessionCache.set(sessionId, s);
        return s;
      };

      // Per-session observation cache so multiple hits in one session
      // share a single KV.list call when computing adjacent turns.
      const obsListCache = new Map<string, CompressedObservation[]>();
      const loadSessionObs = async (
        sessionId: string,
      ): Promise<CompressedObservation[]> => {
        if (obsListCache.has(sessionId)) return obsListCache.get(sessionId)!;
        let list: CompressedObservation[] = [];
        try {
          list = await kv.list<CompressedObservation>(KV.observations(sessionId));
        } catch {
          list = [];
        }
        list.sort(
          (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
        );
        obsListCache.set(sessionId, list);
        return list;
      };

      for (const item of trimmed) {
        if (item.channel === "observation" && item.sessionId) {
          const s = await loadSession(item.sessionId);
          if (s) {
            item.session = {
              id: s.id,
              project: s.project,
              startedAt: s.startedAt,
              firstPrompt: s.firstPrompt,
            };
            if (!item.project) item.project = s.project;
          }
          if (includeAdjacentTurns) {
            const obsList = await loadSessionObs(item.sessionId);
            const idx = obsList.findIndex((o) => o.id === item.id);
            if (idx >= 0) {
              // Walk backwards for the previous conversation turn
              // (userPrompt → obs.narrative when type=="conversation")
              // and the previous non-conversation turn (assistant-side
              // tool use, which acts as a stand-in for the assistant's
              // most recent observable action).
              let prevUser: CompressedObservation | undefined;
              let prevAssistant: CompressedObservation | undefined;
              for (let i = idx - 1; i >= 0; i--) {
                const o = obsList[i];
                if (!prevUser && o.type === "conversation") prevUser = o;
                else if (!prevAssistant && o.type !== "conversation")
                  prevAssistant = o;
                if (prevUser && prevAssistant) break;
              }
              if (prevUser || prevAssistant) {
                item.adjacentTurns = {
                  previousUserPrompt: prevUser?.narrative,
                  previousAssistantSummary:
                    prevAssistant?.title && prevAssistant.narrative
                      ? `${prevAssistant.title}: ${prevAssistant.narrative}`
                      : prevAssistant?.narrative,
                };
              }
            }
          }
        } else if (item.channel === "summary" && item.sessionId) {
          const s = await loadSession(item.sessionId);
          if (s) {
            item.session = {
              id: s.id,
              project: s.project,
              startedAt: s.startedAt,
              firstPrompt: s.firstPrompt,
            };
            if (!item.project) item.project = s.project;
          }
        }
      }

      const totalsByChannel: Record<LineageChannel, number> = {
        observation: 0,
        memory: 0,
        lesson: 0,
        summary: 0,
      };
      for (const it of items) totalsByChannel[it.channel]++;

      // firstMention always points at the earliest timestamp in the
      // ENTIRE filtered set, independent of `order` AND of how the
      // tiebreaker ranks items with equal earliest timestamps. Pick the
      // min-by-timestamp directly instead of trusting position in the
      // (order-dependent) sorted list — CodeRabbit caught the
      // tiebreaker variance in the #570 re-review.
      const earliest = items.length > 0
        ? items.reduce((a, b) =>
            Date.parse(a.timestamp) <= Date.parse(b.timestamp) ? a : b,
          )
        : undefined;
      const firstMention = earliest
        ? {
            timestamp: earliest.timestamp,
            channel: earliest.channel,
            sessionId: earliest.sessionId,
            project: earliest.project,
          }
        : null;

      let graphNeighbors: LineageGraphNeighbor[] | undefined;
      if (includeGraph) {
        graphNeighbors = [];
        try {
          const nodes = await kv.list<GraphNode>(KV.graphNodes);
          const tokens = qLower
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length >= 3);
          const matchedNodes = nodes.filter((n) => {
            if (!n || typeof n.name !== "string") return false;
            const nameLower = n.name.toLowerCase();
            if (nameLower.includes(qLower)) return true;
            for (const tok of tokens) {
              if (nameLower.includes(tok)) return true;
            }
            return false;
          });
          if (matchedNodes.length > 0) {
            const edges = await kv.list<GraphEdge>(KV.graphEdges);
            const nodeById = new Map<string, GraphNode>();
            for (const n of nodes) nodeById.set(n.id, n);
            for (const node of matchedNodes) {
              const related = edges.filter(
                (e) => e.sourceNodeId === node.id || e.targetNodeId === node.id,
              );
              const edgeOut = related
                .map((e) => {
                  const otherId =
                    e.sourceNodeId === node.id ? e.targetNodeId : e.sourceNodeId;
                  const other = nodeById.get(otherId);
                  if (!other) return null;
                  return {
                    kind: e.type,
                    neighbor: other.name,
                    neighborType: other.type as GraphNodeType,
                  };
                })
                .filter((e): e is NonNullable<typeof e> => e !== null);
              graphNeighbors.push({
                name: node.name,
                type: node.type,
                edges: edgeOut,
              });
            }
          }
        } catch (err) {
          logger.warn("lineage: graph neighbor lookup failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      void safeAudit(kv, "query", "mem::lineage", [], {
        query,
        hits: items.length,
        returned: trimmed.length,
        channels: requestedChannels,
        includeAdjacentTurns,
        includeGraph,
      });

      const result: LineageResult = {
        query,
        firstMention,
        timeline: trimmed,
        totalsByChannel,
      };
      if (graphNeighbors !== undefined) result.graphNeighbors = graphNeighbors;
      return result;
    },
  );
}
