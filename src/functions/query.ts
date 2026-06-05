import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import type {
  CompressedObservation,
  EnvelopedKind,
  EnvelopedRecord,
  GraphEdge,
  GraphNode,
  Insight,
  Lesson,
  LineageResult,
  MemoryProvider,
  PipelineOpName,
  PipelineStep,
  Predicate,
  ProjectProfile,
  QueryCost,
  QueryRequest,
  QueryResult,
  SearchResult,
  Session,
  SessionSummary,
  StepTrace,
  TimelineItem,
} from "../types.js";
import { KV } from "../state/schema.js";
import { logger } from "../logger.js";
import { safeAudit } from "./audit.js";

// v5-A: server-side composable retrieval pipeline.
// Executor for `mem::query`. Composes existing mem::* tools through
// sdk.trigger so this file never reimplements producer logic — only
// adapts results into a normalized envelope, runs pure-JS transformers,
// and dispatches LLM aggregators against the injected provider.

const COST_CLASS: Record<PipelineOpName, 1 | 3 | 10> = {
  // Producers — medium
  search: 3,
  smart_search: 3,
  lineage: 3,
  lesson_recall: 3,
  graph_query: 3,
  facet_query: 3,
  insight_list: 3,
  timeline: 3,
  sessions: 3,
  frontier: 3,
  vision_search: 3,
  profile: 3,
  // Transformers — cheap
  filter: 1,
  sort: 1,
  limit: 1,
  take: 1,
  drop: 1,
  project: 1,
  distinct: 1,
  flatten: 1,
  concat: 1,
  group_by: 1,
  top_n_per_group: 1,
  // Cross-step — medium (do real work)
  for_each: 3,
  join: 3,
  expand_by_session: 3,
  // Aggregators — expensive (LLM)
  synthesize: 10,
  rank_by_relevance: 10,
};

const ALLOWED_OPS = new Set<PipelineOpName>(Object.keys(COST_CLASS) as PipelineOpName[]);

const PRODUCER_FNID: Partial<Record<PipelineOpName, string>> = {
  search: "mem::search",
  smart_search: "mem::smart-search",
  lineage: "mem::lineage",
  lesson_recall: "mem::lesson-recall",
  graph_query: "mem::graph-query",
  facet_query: "mem::facet-query",
  insight_list: "mem::insight-list",
  timeline: "mem::timeline",
  frontier: "mem::frontier",
  vision_search: "mem::vision-search",
  profile: "mem::profile",
  // sessions: no trigger function; the executor reads kv.list(KV.sessions) directly.
};

// file_history (mem::file-context) is intentionally NOT exposed as a
// producer in v5-A: it returns a textual digest (`{context: string}`)
// rather than a structured record list, so it doesn't fit the envelope
// model. Use `lineage` or `search` with file-related queries instead.

const DEFAULTS = {
  budget: 30,
  budgetMax: 100,
  timeoutMs: 10_000,
  timeoutMaxMs: 30_000,
  maxStepOut: 500,
  maxDepth: 3,
};

const SYNTH_SYSTEM_PROMPT =
  "You are a memory-recall assistant. The user asks a question and you have a small set of records (observations, memories, lessons, summaries) from past sessions. Produce a concise answer that cites specific records by their `_id`. If the records do not answer the question, say so plainly. Do not invent facts not present in the records.";

// ---------------------------------------------------------------------------
// Predicate evaluator
// ---------------------------------------------------------------------------

export function resolveDotPath(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = record;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function evalPredicate(pred: Predicate, record: EnvelopedRecord): boolean {
  if ("all" in pred) return pred.all.every((p) => evalPredicate(p, record));
  if ("any" in pred) return pred.any.some((p) => evalPredicate(p, record));
  if ("not" in pred) return !evalPredicate(pred.not, record);

  const v = resolveDotPath(record as unknown as Record<string, unknown>, pred.field);
  switch (pred.op) {
    case "eq":
      return v === pred.value;
    case "neq":
      return v !== pred.value;
    case "in":
      return Array.isArray(pred.value) && (pred.value as unknown[]).includes(v);
    case "not_in":
      return Array.isArray(pred.value) && !(pred.value as unknown[]).includes(v);
    case "gt":
      return typeof v === "number" && typeof pred.value === "number" && v > pred.value;
    case "gte":
      return typeof v === "number" && typeof pred.value === "number" && v >= pred.value;
    case "lt":
      return typeof v === "number" && typeof pred.value === "number" && v < pred.value;
    case "lte":
      return typeof v === "number" && typeof pred.value === "number" && v <= pred.value;
    case "contains":
      return (
        typeof v === "string" &&
        typeof pred.value === "string" &&
        v.toLowerCase().includes(pred.value.toLowerCase())
      );
    case "starts_with":
      return (
        typeof v === "string" &&
        typeof pred.value === "string" &&
        v.toLowerCase().startsWith(pred.value.toLowerCase())
      );
    case "exists":
      return v !== undefined && v !== null && v !== "";
    case "since":
      if (typeof v !== "string" || typeof pred.value !== "string") return false;
      return Date.parse(v) >= Date.parse(pred.value);
    case "until":
      if (typeof v !== "string" || typeof pred.value !== "string") return false;
      return Date.parse(v) <= Date.parse(pred.value);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Producer mappers
// ---------------------------------------------------------------------------

function mapSearchResults(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r): r is SearchResult => !!r && typeof r === "object" && "observation" in (r as object))
    .map((r) => {
      const obs = r.observation;
      const env: EnvelopedRecord = {
        _kind: "observation",
        _id: obs.id,
        _sessionId: r.sessionId,
        _createdAt: obs.timestamp,
        _score: r.score,
        _kindSpecific: obs.type,
        _source: { op: "search", stepId },
        title: obs.title,
        narrative: obs.narrative,
        type: obs.type,
      };
      return env;
    });
}

function mapLineageResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as LineageResult;
  if (!Array.isArray(r.timeline)) return [];
  return r.timeline.map((t: TimelineItem) => {
    const kind: EnvelopedKind =
      t.channel === "observation"
        ? "observation"
        : t.channel === "memory"
          ? "memory"
          : t.channel === "lesson"
            ? "lesson"
            : "summary";
    const env: EnvelopedRecord = {
      _kind: kind,
      _id: t.id,
      _sessionId: t.sessionId,
      _project: t.project,
      _createdAt: t.timestamp,
      _score: t.score,
      _kindSpecific: t.memoryType ?? t.type,
      _source: { op: "lineage", stepId },
      title: t.title,
      snippet: t.snippet,
      channel: t.channel,
    };
    if (t.session) env["session"] = t.session;
    if (t.adjacentTurns) env["adjacentTurns"] = t.adjacentTurns;
    if (t.sourceFile) env["sourceFile"] = t.sourceFile;
    return env;
  });
}

function mapLessonRecallResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const lessons = (raw as { lessons?: unknown }).lessons;
  if (!Array.isArray(lessons)) return [];
  return lessons
    .filter((l): l is Lesson & { score?: number } => !!l && typeof l === "object" && "id" in l)
    .map((l) => {
      const env: EnvelopedRecord = {
        _kind: "lesson",
        _id: l.id,
        _project: l.project,
        _createdAt: l.createdAt,
        _score: l.score ?? l.confidence,
        _source: { op: "lesson_recall", stepId },
        content: l.content,
        context: l.context,
        confidence: l.confidence,
        tags: l.tags,
      };
      return env;
    });
}

function mapSmartSearchResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { results?: unknown; mode?: string };
  if (!Array.isArray(r.results)) return [];
  // Compact mode: {obsId, sessionId, title, type, score, timestamp}
  // Expanded mode: {obsId, sessionId, observation}
  return r.results
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const i = item as Record<string, unknown>;
      if (i["observation"] && typeof i["observation"] === "object") {
        const obs = i["observation"] as CompressedObservation;
        const env: EnvelopedRecord = {
          _kind: "observation",
          _id: obs.id,
          _sessionId: typeof i["sessionId"] === "string" ? i["sessionId"] : obs.sessionId,
          _createdAt: obs.timestamp,
          _kindSpecific: obs.type,
          _source: { op: "smart_search", stepId },
          title: obs.title,
          narrative: obs.narrative,
          type: obs.type,
        };
        return env;
      }
      const env: EnvelopedRecord = {
        _kind: "observation",
        _id: String(i["obsId"]),
        _sessionId: typeof i["sessionId"] === "string" ? (i["sessionId"] as string) : undefined,
        _createdAt: typeof i["timestamp"] === "string" ? (i["timestamp"] as string) : undefined,
        _score: typeof i["score"] === "number" ? (i["score"] as number) : undefined,
        _kindSpecific: typeof i["type"] === "string" ? (i["type"] as string) : undefined,
        _source: { op: "smart_search", stepId },
        title: i["title"],
        type: i["type"],
      };
      return env;
    })
    .filter((e): e is EnvelopedRecord => e !== null);
}

function mapGraphQueryResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { nodes?: GraphNode[]; edges?: GraphEdge[] };
  const out: EnvelopedRecord[] = [];
  if (Array.isArray(r.nodes)) {
    for (const n of r.nodes) {
      out.push({
        _kind: "graph_node",
        _id: n.id,
        _kindSpecific: n.type,
        _source: { op: "graph_query", stepId },
        name: n.name,
        nodeType: n.type,
        properties: n.properties,
        sourceObservationIds: n.sourceObservationIds,
      });
    }
  }
  if (Array.isArray(r.edges)) {
    for (const e of r.edges) {
      out.push({
        _kind: "graph_edge",
        _id: e.id,
        _kindSpecific: e.type,
        _source: { op: "graph_query", stepId },
        edgeType: e.type,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
      });
    }
  }
  return out;
}

function mapFacetQueryResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { results?: unknown };
  if (!Array.isArray(r.results)) return [];
  return r.results
    .filter(
      (f): f is { targetId: string; targetType: string; matchedFacets: string[] } =>
        !!f && typeof f === "object" && typeof (f as { targetId?: unknown }).targetId === "string",
    )
    .map((f) => {
      const env: EnvelopedRecord = {
        _kind: "facet_hit",
        _id: f.targetId,
        _kindSpecific: f.targetType,
        _source: { op: "facet_query", stepId },
        targetType: f.targetType,
        matchedFacets: f.matchedFacets,
      };
      return env;
    });
}

function mapInsightListResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const insights = (raw as { insights?: unknown }).insights;
  if (!Array.isArray(insights)) return [];
  return insights
    .filter((i): i is Insight => !!i && typeof i === "object" && "id" in i)
    .map((i) => {
      const env: EnvelopedRecord = {
        _kind: "insight",
        _id: i.id,
        _project: i.project,
        _createdAt: i.createdAt,
        _score: i.confidence,
        _source: { op: "insight_list", stepId },
        title: i.title,
        content: i.content,
        confidence: i.confidence,
        sourceConceptCluster: i.sourceConceptCluster,
        sourceMemoryIds: i.sourceMemoryIds,
      };
      return env;
    });
}

function mapTimelineResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && typeof e === "object" && "observation" in (e as object))
    .map((e) => {
      const obs = (e as { observation: CompressedObservation }).observation;
      const sessionId = (e as { sessionId?: string }).sessionId;
      const env: EnvelopedRecord = {
        _kind: "timeline_item",
        _id: obs.id,
        _sessionId: sessionId,
        _createdAt: obs.timestamp,
        _kindSpecific: obs.type,
        _source: { op: "timeline", stepId },
        title: obs.title,
        narrative: obs.narrative,
        type: obs.type,
        relativePosition: (e as { relativePosition?: number }).relativePosition,
      };
      return env;
    });
}

function mapSessionsList(sessions: Session[], stepId?: string, projectFilter?: string): EnvelopedRecord[] {
  const filtered = projectFilter ? sessions.filter((s) => s.project === projectFilter) : sessions;
  return filtered.map((s) => {
    const env: EnvelopedRecord = {
      _kind: "session",
      _id: s.id,
      _project: s.project,
      _createdAt: s.startedAt,
      _source: { op: "sessions", stepId },
      project: s.project,
      status: (s as Session & { status?: string }).status,
      startedAt: s.startedAt,
      firstPrompt: s.firstPrompt,
    };
    return env;
  });
}

function mapFrontierResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const frontier = (raw as { frontier?: unknown }).frontier;
  if (!Array.isArray(frontier)) return [];
  return frontier
    .filter((f) => f && typeof f === "object" && "action" in (f as object))
    .map((f) => {
      const fi = f as { action: { id: string; project?: string; status?: string; title?: string; priority?: number }; score: number; leased?: boolean };
      const env: EnvelopedRecord = {
        _kind: "frontier_entry",
        _id: fi.action.id,
        _project: fi.action.project,
        _score: fi.score,
        _kindSpecific: fi.action.status,
        _source: { op: "frontier", stepId },
        title: fi.action.title,
        priority: fi.action.priority,
        status: fi.action.status,
        leased: fi.leased,
      };
      return env;
    });
}

function mapVisionSearchResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .filter(
      (r): r is { imageRef: string; score: number; sessionId?: string; observationId?: string; updatedAt?: string } =>
        !!r && typeof r === "object" && typeof (r as { imageRef?: unknown }).imageRef === "string",
    )
    .map((r) => {
      const env: EnvelopedRecord = {
        _kind: "vision_hit",
        _id: r.imageRef,
        _sessionId: r.sessionId,
        _createdAt: r.updatedAt,
        _score: r.score,
        _source: { op: "vision_search", stepId },
        imageRef: r.imageRef,
        observationId: r.observationId,
      };
      return env;
    });
}

function mapProfileResult(raw: unknown, stepId?: string): EnvelopedRecord[] {
  if (!raw || typeof raw !== "object") return [];
  const profile = (raw as { profile?: ProjectProfile | null }).profile;
  if (!profile || typeof profile !== "object") return [];
  const env: EnvelopedRecord = {
    _kind: "profile",
    _id: profile.project,
    _project: profile.project,
    _createdAt: profile.updatedAt,
    _source: { op: "profile", stepId },
    topConcepts: profile.topConcepts,
    topFiles: profile.topFiles,
    conventions: profile.conventions,
    commonErrors: profile.commonErrors,
    recentActivity: profile.recentActivity,
    sessionCount: profile.sessionCount,
    totalObservations: profile.totalObservations,
  };
  return [env];
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------

function compareForSort(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  // ISO timestamps sort correctly as strings, but parse to number for safety
  if (typeof a === "string" && typeof b === "string") {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
    return a < b ? -1 : 1;
  }
  return 0;
}

export function stableSort(
  records: EnvelopedRecord[],
  by: string | string[],
  dir: "asc" | "desc" = "desc",
): EnvelopedRecord[] {
  const keys = Array.isArray(by) ? by : [by];
  const sign = dir === "asc" ? 1 : -1;
  return records
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      for (const k of keys) {
        const c = compareForSort(
          resolveDotPath(x.r as unknown as Record<string, unknown>, k),
          resolveDotPath(y.r as unknown as Record<string, unknown>, k),
        );
        if (c !== 0) return sign * c;
      }
      return x.i - y.i;
    })
    .map((wrapped) => wrapped.r);
}

// ---------------------------------------------------------------------------
// Additional transformers
// ---------------------------------------------------------------------------

export function applyProject(
  records: EnvelopedRecord[],
  fields: string[] | undefined,
  rename: Record<string, string> | undefined,
): EnvelopedRecord[] {
  return records.map((r) => {
    let out: EnvelopedRecord;
    if (fields && fields.length > 0) {
      // Always keep envelope core fields so downstream ops still work.
      const core: EnvelopedRecord = {
        _kind: r._kind,
        _id: r._id,
        _source: r._source,
      };
      if (r._sessionId !== undefined) core._sessionId = r._sessionId;
      if (r._project !== undefined) core._project = r._project;
      if (r._createdAt !== undefined) core._createdAt = r._createdAt;
      if (r._score !== undefined) core._score = r._score;
      if (r._kindSpecific !== undefined) core._kindSpecific = r._kindSpecific;
      for (const f of fields) {
        const v = resolveDotPath(r as unknown as Record<string, unknown>, f);
        if (v !== undefined) core[f] = v;
      }
      out = core;
    } else {
      out = { ...r };
    }
    if (rename) {
      for (const [from, to] of Object.entries(rename)) {
        const v = resolveDotPath(out as unknown as Record<string, unknown>, from);
        if (v !== undefined) {
          out[to] = v;
        }
      }
    }
    return out;
  });
}

export function applyDistinct(records: EnvelopedRecord[], by: string): EnvelopedRecord[] {
  const seen = new Set<unknown>();
  const out: EnvelopedRecord[] = [];
  for (const r of records) {
    const key = resolveDotPath(r as unknown as Record<string, unknown>, by);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function applyFlatten(records: EnvelopedRecord[], field: string): EnvelopedRecord[] {
  const out: EnvelopedRecord[] = [];
  for (const r of records) {
    const v = resolveDotPath(r as unknown as Record<string, unknown>, field);
    if (Array.isArray(v)) {
      for (const item of v) {
        out.push({ ...r, [field]: item });
      }
    } else {
      out.push(r);
    }
  }
  return out;
}

export function applyGroupBy(records: EnvelopedRecord[], by: string): EnvelopedRecord[] {
  const groups = new Map<string, EnvelopedRecord[]>();
  for (const r of records) {
    const k = resolveDotPath(r as unknown as Record<string, unknown>, by);
    const key = k === undefined || k === null ? "__null__" : String(k);
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(r);
  }
  const out: EnvelopedRecord[] = [];
  for (const [key, members] of groups) {
    out.push({
      _kind: "group",
      _id: `group:${key}`,
      _source: { op: "group_by" },
      _groupKey: key,
      _groupSize: members.length,
      members,
    });
  }
  return out;
}

export function applyTopNPerGroup(
  records: EnvelopedRecord[],
  n: number,
  by: string | undefined,
  dir: "asc" | "desc",
): EnvelopedRecord[] {
  // Operates on a group-typed stream produced by group_by. Re-flattens
  // to a flat record stream containing the top-N members of each group.
  const out: EnvelopedRecord[] = [];
  for (const g of records) {
    if (g._kind !== "group" || !Array.isArray(g["members"])) {
      out.push(g);
      continue;
    }
    const members = (g["members"] as EnvelopedRecord[]).slice();
    const sortKey = by ?? "_score";
    const sorted = stableSort(members, sortKey, dir);
    out.push(...sorted.slice(0, Math.max(0, n | 0)));
  }
  return out;
}

export function applyJoin(
  left: EnvelopedRecord[],
  right: EnvelopedRecord[],
  on: { left: string; right: string },
  type: "inner" | "left",
): EnvelopedRecord[] {
  const rightIndex = new Map<unknown, EnvelopedRecord[]>();
  for (const r of right) {
    const k = resolveDotPath(r as unknown as Record<string, unknown>, on.right);
    let arr = rightIndex.get(k);
    if (!arr) {
      arr = [];
      rightIndex.set(k, arr);
    }
    arr.push(r);
  }
  const out: EnvelopedRecord[] = [];
  for (const l of left) {
    const k = resolveDotPath(l as unknown as Record<string, unknown>, on.left);
    const matches = rightIndex.get(k);
    if (!matches || matches.length === 0) {
      if (type === "inner") continue;
      out.push({ ...l, _join: { right: null } });
      continue;
    }
    for (const m of matches) {
      out.push({ ...l, _join: { right: m } });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Synthesize (LLM aggregator)
// ---------------------------------------------------------------------------

function buildSynthPrompt(
  records: EnvelopedRecord[],
  question: string,
  style: "answer" | "bullets" | "timeline",
  maxCitations: number,
): string {
  const trimmed = records.slice(0, Math.max(maxCitations * 3, 12));
  const lines: string[] = [];
  lines.push(`Question: ${question}`);
  lines.push(`Style: ${style}`);
  lines.push(`Records (kind, _id, key fields):`);
  for (const r of trimmed) {
    const snippet =
      typeof r["snippet"] === "string"
        ? r["snippet"]
        : typeof r["narrative"] === "string"
          ? r["narrative"]
          : typeof r["content"] === "string"
            ? r["content"]
            : typeof r["title"] === "string"
              ? r["title"]
              : "";
    const compact =
      snippet.length > 400 ? snippet.slice(0, 400).replace(/\s+/g, " ") + "…" : snippet.replace(/\s+/g, " ");
    lines.push(
      `- [${r._kind}] _id=${r._id}${r._createdAt ? ` @${r._createdAt}` : ""}${r._project ? ` proj=${r._project}` : ""}: ${compact}`,
    );
  }
  lines.push("");
  lines.push(
    `Produce a ${style} response. After the response, on its own line, write a JSON array of citations like: CITATIONS: [{"kind":"memory","id":"..."}].`,
  );
  return lines.join("\n");
}

function parseSynthesis(
  rawText: string,
  records: EnvelopedRecord[],
  maxCitations: number,
): { summary: string; citations: { kind: EnvelopedKind; id: string }[] } {
  const idx = rawText.lastIndexOf("CITATIONS:");
  let summary = rawText.trim();
  const citations: { kind: EnvelopedKind; id: string }[] = [];
  if (idx >= 0) {
    summary = rawText.slice(0, idx).trim();
    const tail = rawText.slice(idx + "CITATIONS:".length).trim();
    try {
      const parsed = JSON.parse(tail);
      if (Array.isArray(parsed)) {
        for (const c of parsed.slice(0, maxCitations)) {
          if (c && typeof c === "object" && typeof c.id === "string" && typeof c.kind === "string") {
            citations.push({ kind: c.kind as EnvelopedKind, id: c.id });
          }
        }
      }
    } catch {
      // ignore — fall back to id sniff below
    }
  }
  if (citations.length === 0) {
    // Sniff record ids that appear in the summary text.
    const byId = new Map(records.map((r) => [r._id, r._kind]));
    for (const [id, kind] of byId) {
      if (summary.includes(id)) {
        citations.push({ kind, id });
        if (citations.length >= maxCitations) break;
      }
    }
  }
  return { summary, citations };
}

// ---------------------------------------------------------------------------
// expand_by_session + rank_by_relevance
// ---------------------------------------------------------------------------

async function applyExpandBySession(
  records: EnvelopedRecord[],
  field: string,
  ctx: ExecCtx,
): Promise<EnvelopedRecord[]> {
  const cache = new Map<string, { session: Session | null; summary: SessionSummary | null }>();
  const loadFor = async (sid: string): Promise<{ session: Session | null; summary: SessionSummary | null }> => {
    const cached = cache.get(sid);
    if (cached) return cached;
    let session: Session | null = null;
    let summary: SessionSummary | null = null;
    try {
      session = (await ctx.kv.get<Session>(KV.sessions, sid)) ?? null;
    } catch {
      session = null;
    }
    try {
      summary = (await ctx.kv.get<SessionSummary>(KV.summaries, sid)) ?? null;
    } catch {
      summary = null;
    }
    const entry = { session, summary };
    cache.set(sid, entry);
    return entry;
  };
  const out: EnvelopedRecord[] = [];
  for (const r of records) {
    const sid = resolveDotPath(r as unknown as Record<string, unknown>, field);
    if (typeof sid !== "string" || !sid) {
      out.push(r);
      continue;
    }
    const { session, summary } = await loadFor(sid);
    out.push({
      ...r,
      _session: session
        ? {
            id: session.id,
            project: session.project,
            startedAt: session.startedAt,
            firstPrompt: session.firstPrompt,
          }
        : null,
      _summary: summary
        ? { title: summary.title, narrative: summary.narrative, createdAt: summary.createdAt }
        : null,
    });
  }
  return out;
}

const RANK_SYSTEM_PROMPT =
  "You are a relevance scorer. Given a target query and a list of records (each with `_id` and a brief content), return a JSON array of {id, score} where score is a float in [0,1] expressing how well that record answers the target. Output ONLY the JSON array on a single line, no prose.";

function buildRankPrompt(records: EnvelopedRecord[], target: string): string {
  const lines: string[] = [];
  lines.push(`Target: ${target}`);
  lines.push(`Records:`);
  for (const r of records) {
    const snippet =
      typeof r["snippet"] === "string"
        ? r["snippet"]
        : typeof r["narrative"] === "string"
          ? r["narrative"]
          : typeof r["content"] === "string"
            ? r["content"]
            : typeof r["title"] === "string"
              ? r["title"]
              : "";
    const compact =
      snippet.length > 300 ? snippet.slice(0, 300).replace(/\s+/g, " ") + "…" : snippet.replace(/\s+/g, " ");
    lines.push(`- id=${r._id} [${r._kind}]: ${compact}`);
  }
  lines.push("");
  lines.push("Return: [{\"id\":\"...\",\"score\":0.0}, ...]");
  return lines.join("\n");
}

function parseRankScores(text: string): Map<string, number> {
  const m = new Map<string, number>();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return m;
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === "object" && typeof item.id === "string" && typeof item.score === "number") {
          m.set(item.id, item.score);
        }
      }
    }
  } catch {
    // ignore — empty map means scores stay as-is
  }
  return m;
}

async function applyRankByRelevance(
  records: EnvelopedRecord[],
  target: string,
  topK: number | undefined,
  ctx: ExecCtx,
): Promise<EnvelopedRecord[]> {
  if (records.length === 0) return [];
  const sample = records.slice(0, 50);
  const userPrompt = buildRankPrompt(sample, target);
  const text = await withDeadline(
    Promise.resolve(ctx.provider.summarize(RANK_SYSTEM_PROMPT, userPrompt)),
    ctx.deadlineAt,
    "rank_by_relevance/provider",
  );
  ctx.llmCalls += 1;
  const scores = parseRankScores(text);
  const scored = records.map((r) => {
    const s = scores.get(r._id);
    return s !== undefined ? { ...r, _score: s } : { ...r };
  });
  const ranked = scored.sort((a, b) => (b._score ?? -Infinity) - (a._score ?? -Infinity));
  return topK ? ranked.slice(0, Math.max(0, topK | 0)) : ranked;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePipeline(
  pipeline: unknown,
  ctx: { path?: string; depth?: number; maxDepth?: number } = {},
): { ok: true; pipeline: PipelineStep[] } | { ok: false; error: string } {
  const path = ctx.path ?? "pipeline";
  const depth = ctx.depth ?? 0;
  const maxDepth = ctx.maxDepth ?? DEFAULTS.maxDepth;
  if (!Array.isArray(pipeline)) return { ok: false, error: `${path} must be an array` };
  if (pipeline.length === 0) return { ok: false, error: `${path} must contain at least one step` };
  if (pipeline.length > 32) return { ok: false, error: `${path} exceeds maximum of 32 steps` };
  for (let i = 0; i < pipeline.length; i++) {
    const s = pipeline[i];
    if (!s || typeof s !== "object" || typeof (s as { op?: unknown }).op !== "string") {
      return { ok: false, error: `${path}[${i}]: missing 'op'` };
    }
    const op = (s as { op: string }).op as PipelineOpName;
    if (!ALLOWED_OPS.has(op)) {
      return {
        ok: false,
        error: `${path}[${i}]: op '${op}' is not allowed in mem::query (writers and unknown ops are rejected)`,
      };
    }
    if (op === "synthesize" && i !== pipeline.length - 1) {
      return { ok: false, error: `${path}[${i}]: 'synthesize' must be the terminal step` };
    }
    if (op === "for_each") {
      if (depth + 1 > maxDepth) {
        return { ok: false, error: `${path}[${i}]: for_each depth exceeds ${maxDepth}` };
      }
      const sub = (s as { do?: unknown }).do;
      if (!Array.isArray(sub)) {
        return { ok: false, error: `${path}[${i}]: for_each requires 'do' (array of steps)` };
      }
      // Disallow LLM aggregators inside for_each (cost blowup).
      for (let j = 0; j < sub.length; j++) {
        const subStep = sub[j];
        const subOp = (subStep as { op?: unknown })?.op;
        if (subOp === "synthesize" || subOp === "rank_by_relevance") {
          return {
            ok: false,
            error: `${path}[${i}].do[${j}]: '${subOp}' is not allowed inside for_each (LLM blowup)`,
          };
        }
      }
      const subResult = validatePipeline(sub, { path: `${path}[${i}].do`, depth: depth + 1, maxDepth });
      if (!subResult.ok) return subResult;
    }
  }
  return { ok: true, pipeline: pipeline as PipelineStep[] };
}

// ---------------------------------------------------------------------------
// Cost estimation (for dry_run)
// ---------------------------------------------------------------------------

function estimatePipelineCost(
  pipeline: PipelineStep[],
  maxStepOut: number = DEFAULTS.maxStepOut,
): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const step of pipeline) {
    const cost = COST_CLASS[step.op];
    min += cost;
    max += cost;
    if (step.op === "for_each") {
      // for_each runs the inner pipeline once per input record. We
      // don't know cardinality at plan time, so:
      //   - min: assume 1 iteration (worst case for cost-minimizers)
      //   - max: assume maxStepOut iterations (post-step cap)
      const sub = estimatePipelineCost(step.do, maxStepOut);
      min += sub.min;
      max += sub.max * maxStepOut;
    }
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

interface ExecCtx {
  sdk: ISdk;
  kv: StateKV;
  provider: MemoryProvider;
  startedAt: number;
  deadlineAt: number;
  budget: { spent: number; cap: number };
  llmCalls: number;
  maxStepOut: number;
  maxDepth: number;
  warnings: string[];
}

function enforceDeadline(ctx: ExecCtx, stepLabel: string): void {
  if (Date.now() > ctx.deadlineAt) {
    throw new QueryRuntimeError(`deadline_exceeded at ${stepLabel}`);
  }
}

class QueryRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryRuntimeError";
  }
}

// Race an awaited I/O promise against ctx.deadlineAt. Without this,
// `enforceDeadline()` only fires BETWEEN steps — a single slow
// producer (`sdk.trigger`) or LLM call (`provider.summarize`) can hang
// well past the user's timeoutMs while waiting on async work.
// CodeRabbit caught this on #574.
async function withDeadline<T>(
  p: Promise<T>,
  deadlineAt: number,
  label: string,
): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    throw new QueryRuntimeError(`deadline_exceeded before ${label}`);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new QueryRuntimeError(`deadline_exceeded during ${label}`));
        }, remaining);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function runProducer(
  step: PipelineStep,
  ctx: ExecCtx,
): Promise<EnvelopedRecord[]> {
  // `sessions` has no trigger function — read kv directly, matching the
  // existing memory_sessions dispatch in src/mcp/server.ts.
  if (step.op === "sessions") {
    const sessions = await ctx.kv.list<Session>(KV.sessions);
    const records = mapSessionsList(sessions, step.id, step.project);
    return records.slice(0, step.maxOut ?? ctx.maxStepOut);
  }

  const fnId = PRODUCER_FNID[step.op];
  if (!fnId) throw new QueryRuntimeError(`runProducer called with non-producer op '${(step as { op: string }).op}'`);

  // Build the payload for the existing tool.
  let payload: Record<string, unknown> = {};
  switch (step.op) {
    case "search":
      payload = {
        query: step.query,
        limit: step.limit ?? 10,
        format: step.format ?? "full",
        token_budget: step.token_budget,
      };
      break;
    case "smart_search":
      payload = {
        query: step.query,
        limit: step.limit,
        project: step.project,
        includeLessons: step.includeLessons,
      };
      break;
    case "lineage":
      payload = {
        query: step.query,
        limit: step.limit,
        since: step.since,
        until: step.until,
        channels: step.channels,
        includeAdjacentTurns: step.includeAdjacentTurns,
        includeGraph: step.includeGraph,
        order: step.order,
      };
      break;
    case "lesson_recall":
      payload = {
        query: step.query,
        project: step.project,
        minConfidence: step.minConfidence,
        limit: step.limit,
      };
      break;
    case "graph_query":
      payload = {
        startNodeId: step.startNodeId,
        nodeType: step.nodeType,
        query: step.query,
        maxDepth: step.maxDepth,
      };
      break;
    case "facet_query":
      payload = {
        matchAll: step.matchAll,
        matchAny: step.matchAny,
        targetType: step.targetType,
        limit: step.limit,
      };
      break;
    case "insight_list":
      payload = {
        project: step.project,
        minConfidence: step.minConfidence,
        limit: step.limit,
      };
      break;
    case "timeline":
      payload = {
        anchor: step.anchor,
        project: step.project,
        before: step.before,
        after: step.after,
      };
      break;
    case "frontier":
      payload = {
        project: step.project,
        agentId: step.agentId,
        limit: step.limit,
      };
      break;
    case "vision_search":
      payload = {
        queryText: step.queryText,
        queryImageRef: step.queryImageRef,
        queryImageBase64: step.queryImageBase64,
        topK: step.topK,
        sessionId: step.sessionId,
      };
      break;
    case "profile":
      payload = {
        project: step.project,
        refresh: step.refresh,
      };
      break;
    default:
      throw new QueryRuntimeError(`runProducer payload missing for op '${(step as { op: string }).op}'`);
  }

  const raw = await withDeadline(
    Promise.resolve(ctx.sdk.trigger({ function_id: fnId, payload })),
    ctx.deadlineAt,
    `${step.op}/sdk.trigger`,
  );

  let records: EnvelopedRecord[];
  switch (step.op) {
    case "search":
      records = mapSearchResults(raw, step.id);
      break;
    case "smart_search":
      records = mapSmartSearchResult(raw, step.id);
      break;
    case "lineage":
      records = mapLineageResult(raw, step.id);
      break;
    case "lesson_recall":
      records = mapLessonRecallResult(raw, step.id);
      break;
    case "graph_query":
      records = mapGraphQueryResult(raw, step.id);
      break;
    case "facet_query":
      records = mapFacetQueryResult(raw, step.id);
      break;
    case "insight_list":
      records = mapInsightListResult(raw, step.id);
      break;
    case "timeline":
      records = mapTimelineResult(raw, step.id);
      break;
    case "frontier":
      records = mapFrontierResult(raw, step.id);
      break;
    case "vision_search":
      records = mapVisionSearchResult(raw, step.id);
      break;
    case "profile":
      records = mapProfileResult(raw, step.id);
      break;
    default:
      records = [];
  }

  const cap = "maxOut" in step ? (step as { maxOut?: number }).maxOut : undefined;
  const effectiveCap = cap ?? ctx.maxStepOut;
  return records.slice(0, effectiveCap);
}

async function executeStep(
  step: PipelineStep,
  streams: Map<string, EnvelopedRecord[]>,
  ctx: ExecCtx,
  depth: number,
):
  | Promise<
      | { kind: "ok"; output: EnvelopedRecord[]; outputName: string; llmCallsThisStep: number }
      | { kind: "terminal"; result: QueryResult }
      | { kind: "error"; error: string }
    > {
  const inputName = typeof step.in === "string" ? step.in : "_";
  const outputName = step.out ?? "_";
  const input = streams.get(inputName) ?? [];
  let output: EnvelopedRecord[] = input;
  let llmCallsThisStep = 0;

  switch (step.op) {
    case "search":
    case "smart_search":
    case "lineage":
    case "lesson_recall":
    case "graph_query":
    case "facet_query":
    case "insight_list":
    case "timeline":
    case "sessions":
    case "frontier":
    case "vision_search":
    case "profile":
      output = await runProducer(step, ctx);
      break;
    case "filter": {
      const preds: Predicate[] = Array.isArray(step.where) ? step.where : [step.where];
      output = input.filter((r) => preds.every((p) => evalPredicate(p, r)));
      break;
    }
    case "sort":
      output = stableSort(input, step.by, step.dir ?? "desc");
      break;
    case "limit":
    case "take":
      output = input.slice(0, Math.max(0, step.n | 0));
      break;
    case "drop":
      output = input.slice(Math.max(0, step.n | 0));
      break;
    case "project":
      output = applyProject(input, step.fields, step.rename);
      break;
    case "distinct":
      output = applyDistinct(input, step.by ?? "_id");
      break;
    case "flatten":
      output = applyFlatten(input, step.field);
      break;
    case "concat": {
      const inNames = Array.isArray(step.in) ? step.in : [];
      if (inNames.length === 0) {
        return { kind: "error", error: `step '${step.op}': 'in' must be a non-empty array of stream names` };
      }
      output = inNames.flatMap((name) => streams.get(name) ?? []);
      break;
    }
    case "group_by":
      output = applyGroupBy(input, step.by);
      break;
    case "top_n_per_group":
      output = applyTopNPerGroup(input, step.n, step.by, step.dir ?? "desc");
      break;
    case "for_each": {
      if (depth + 1 > (ctx.maxDepth ?? DEFAULTS.maxDepth)) {
        return { kind: "error", error: `for_each depth exceeded (max ${ctx.maxDepth ?? DEFAULTS.maxDepth})` };
      }
      const intoMode = step.into ?? "merge";
      const collected: EnvelopedRecord[] = [];
      for (const r of input) {
        enforceDeadline(ctx, "for_each.iter");
        const sub = await executePipelineInternal(step.do, ctx, depth + 1, [r]);
        if (sub.kind === "error") {
          return { kind: "error", error: sub.error };
        }
        if (sub.kind === "records") {
          if (intoMode === "list") {
            collected.push({
              _kind: "group",
              _id: `for_each:${r._id}`,
              _source: { op: "for_each", stepId: step.id },
              _parentId: r._id,
              _groupSize: sub.result.length,
              members: sub.result,
            });
          } else {
            collected.push(...sub.result);
          }
        }
      }
      output = collected;
      break;
    }
    case "join": {
      const rightStream = streams.get(step.right) ?? [];
      output = applyJoin(input, rightStream, step.on, step.type ?? "left");
      break;
    }
    case "expand_by_session":
      output = await applyExpandBySession(input, step.field ?? "_sessionId", ctx);
      break;
    case "rank_by_relevance":
      output = await applyRankByRelevance(input, step.target, step.topK, ctx);
      llmCallsThisStep = 1;
      break;
    case "synthesize": {
      const style = step.style ?? "answer";
      const maxCitations = Math.max(1, Math.min(step.maxCitations ?? 6, 20));
      const userPrompt = buildSynthPrompt(input, step.question, style, maxCitations);
      const text = await withDeadline(
        Promise.resolve(ctx.provider.summarize(SYNTH_SYSTEM_PROMPT, userPrompt)),
        ctx.deadlineAt,
        "synthesize/provider",
      );
      ctx.llmCalls += 1;
      const synth = parseSynthesis(text, input, maxCitations);
      return {
        kind: "terminal",
        result: {
          kind: "synthesis",
          result: synth,
          trace: [],
          cost: {
            totalCostUnits: ctx.budget.spent,
            totalMs: 0,
            llmCalls: ctx.llmCalls,
            budgetCap: ctx.budget.cap,
          },
        },
      };
    }
    default: {
      const opName = (step as { op: string }).op;
      return { kind: "error", error: `unsupported op '${opName}'` };
    }
  }

  return { kind: "ok", output, outputName, llmCallsThisStep };
}

async function executePipelineInternal(
  pipeline: PipelineStep[],
  ctx: ExecCtx,
  depth: number,
  initialInput: EnvelopedRecord[] | undefined = undefined,
): Promise<
  | { kind: "records"; result: EnvelopedRecord[]; trace: StepTrace[] }
  | { kind: "synthesis"; result: { summary: string; citations: { kind: EnvelopedKind; id: string }[] }; trace: StepTrace[] }
  | { kind: "error"; error: string; trace: StepTrace[] }
> {
  const trace: StepTrace[] = [];
  const streams = new Map<string, EnvelopedRecord[]>();
  streams.set("_", initialInput ?? []);

  let lastOutputName: string | undefined;

  for (const step of pipeline) {
    enforceDeadline(ctx, step.op);
    const cost = COST_CLASS[step.op];
    if (ctx.budget.spent + cost > ctx.budget.cap) {
      return {
        kind: "error",
        error: `budget_exceeded: would spend ${ctx.budget.spent + cost}, cap=${ctx.budget.cap}`,
        trace,
      };
    }
    const t0 = Date.now();
    const inputName = typeof step.in === "string" ? step.in : "_";
    const inCount = (streams.get(inputName) ?? []).length;
    let result;
    try {
      result = await executeStep(step, streams, ctx, depth);
    } catch (err) {
      const errMsg = err instanceof QueryRuntimeError ? err.message : err instanceof Error ? err.message : String(err);
      return { kind: "error", error: errMsg, trace };
    }
    if (result.kind === "error") {
      return { kind: "error", error: result.error, trace };
    }
    if (result.kind === "terminal") {
      const synthRes = result.result;
      ctx.budget.spent += cost;
      trace.push({
        op: step.op,
        stepId: step.id,
        inCount,
        outCount: 0,
        ms: Date.now() - t0,
        costClass: cost,
        llmCalls: 1,
      });
      if (synthRes.kind === "synthesis") {
        return { kind: "synthesis", result: synthRes.result, trace };
      }
      // Shouldn't happen — terminal only on synthesize today.
      return { kind: "error", error: "internal: terminal result not synthesis", trace };
    }
    const output = result.output.slice(0, ctx.maxStepOut);
    streams.set(result.outputName, output);
    lastOutputName = result.outputName;
    ctx.budget.spent += cost;
    trace.push({
      op: step.op,
      stepId: step.id,
      inCount,
      outCount: output.length,
      ms: Date.now() - t0,
      costClass: cost,
      llmCalls: result.llmCallsThisStep > 0 ? result.llmCallsThisStep : undefined,
    });
  }

  // Return the last emitted stream rather than always `_`. A pipeline
  // whose final step explicitly writes to `out: "foo"` would otherwise
  // drop its result. Default stream "_" wins for the (common) implicit-
  // flow case. CodeRabbit caught this on #574.
  const finalName = lastOutputName ?? "_";
  return { kind: "records", result: streams.get(finalName) ?? [], trace };
}

async function executePipeline(
  pipeline: PipelineStep[],
  ctx: ExecCtx,
): Promise<QueryResult> {
  const inner = await executePipelineInternal(pipeline, ctx, 0);
  if (inner.kind === "error") {
    return {
      kind: "error",
      error: inner.error,
      trace: inner.trace,
      cost: {
        totalCostUnits: ctx.budget.spent,
        totalMs: Date.now() - ctx.startedAt,
        llmCalls: ctx.llmCalls,
        budgetCap: ctx.budget.cap,
      },
    };
  }
  if (inner.kind === "synthesis") {
    return {
      kind: "synthesis",
      result: inner.result,
      trace: inner.trace,
      cost: {
        totalCostUnits: ctx.budget.spent,
        totalMs: Date.now() - ctx.startedAt,
        llmCalls: ctx.llmCalls,
        budgetCap: ctx.budget.cap,
      },
      warnings: ctx.warnings.length > 0 ? [...ctx.warnings] : undefined,
    };
  }
  return {
    kind: "records",
    result: inner.result,
    trace: inner.trace,
    cost: {
      totalCostUnits: ctx.budget.spent,
      totalMs: Date.now() - ctx.startedAt,
      llmCalls: ctx.llmCalls,
      budgetCap: ctx.budget.cap,
    },
    warnings: ctx.warnings.length > 0 ? [...ctx.warnings] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerQueryFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    "mem::query",
    async (data: QueryRequest): Promise<QueryResult> => {
      // Compute maxDepth early so validation can honor user-set higher
      // nesting limits (otherwise a pipeline nested 4-5 levels gets
      // rejected even when options.maxDepth=5 is explicitly set).
      const optsEarly = data?.options ?? {};
      const earlyMaxDepth = Math.min(
        Math.max(optsEarly.maxDepth ?? DEFAULTS.maxDepth, 1),
        5,
      );
      const validation = validatePipeline(data?.pipeline, { maxDepth: earlyMaxDepth });
      if (!validation.ok) {
        return {
          kind: "error",
          error: validation.error,
          trace: [],
          cost: { totalCostUnits: 0, totalMs: 0, llmCalls: 0, budgetCap: 0 },
        };
      }

      const pipeline = validation.pipeline;
      const opts = data.options ?? {};

      const budgetCap = Math.min(
        Math.max(opts.budget ?? DEFAULTS.budget, 1),
        DEFAULTS.budgetMax,
      );
      const timeoutMs = Math.min(
        Math.max(opts.timeoutMs ?? DEFAULTS.timeoutMs, 1_000),
        DEFAULTS.timeoutMaxMs,
      );
      const maxStepOut = Math.min(
        Math.max(opts.maxStepOut ?? DEFAULTS.maxStepOut, 1),
        2_000,
      );
      const maxDepth = Math.min(
        Math.max(opts.maxDepth ?? DEFAULTS.maxDepth, 1),
        5,
      );

      if (opts.dry_run === true) {
        return {
          kind: "dry_run",
          plan: pipeline,
          estimatedCost: estimatePipelineCost(pipeline, maxStepOut),
        };
      }

      const startedAt = Date.now();
      const ctx: ExecCtx = {
        sdk,
        kv,
        provider,
        startedAt,
        deadlineAt: startedAt + timeoutMs,
        budget: { spent: 0, cap: budgetCap },
        llmCalls: 0,
        maxStepOut,
        maxDepth,
        warnings: [],
      };

      const result = await executePipeline(pipeline, ctx);

      // Best-effort audit; non-fatal.
      try {
        const summary: Record<string, unknown> = {
          ops: pipeline.map((s) => s.op),
          kind: result.kind,
          steps: pipeline.length,
        };
        if ("cost" in result) {
          summary["totalCostUnits"] = (result as { cost?: QueryCost }).cost?.totalCostUnits;
          summary["llmCalls"] = (result as { cost?: QueryCost }).cost?.llmCalls;
        }
        void safeAudit(kv, "query", "mem::query", [], summary);
      } catch (err) {
        logger.warn("mem::query audit failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return result;
    },
  );
}
