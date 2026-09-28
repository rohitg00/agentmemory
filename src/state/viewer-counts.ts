import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import { getAgentId, isAgentScopeIsolated } from "../config.js";
import type {
  GraphSnapshot,
  Lesson,
  Memory,
  Session,
} from "../types.js";

export interface ViewerCounts {
  sessions: number;
  activeSessions: number;
  observations: number;
  memories: number;
  latestMemories: number;
  lessons: number;
  actions: number;
  crystals: number;
  semantic: number;
  procedural: number;
  graphNodes: number;
  graphEdges: number;
  updatedAt: string;
}

export type CountedKind = "lessons" | "actions" | "crystals" | "semantic" | "procedural";

const GRAPH_SNAPSHOT_KEY = "current";
const EMIT_DELAY_MS = 500;
const MAX_LOAD_ATTEMPTS = 2;

let counts: ViewerCounts | null = null;
let loading: Promise<ViewerCounts> | null = null;
let changedWhileLoading = false;
let emitter: ((counts: ViewerCounts) => void) | null = null;
let emitTimer: ReturnType<typeof setTimeout> | null = null;

export function setViewerCountsEmitter(fn: ((counts: ViewerCounts) => void) | null): void {
  emitter = fn;
}

function inAgentScope(record: { agentId?: string } | null | undefined): boolean {
  if (!record) return false;
  return !isAgentScopeIsolated() || record.agentId === getAgentId();
}

function isLiveLesson(lesson: Lesson | null | undefined): boolean {
  return Boolean(lesson) && lesson!.deleted !== true;
}

async function listOrEmpty<T>(kv: StateKV, scope: string): Promise<T[]> {
  const rows = await kv.list<T>(scope).catch(() => [] as T[]);
  return Array.isArray(rows) ? rows : [];
}

async function readCounts(kv: StateKV): Promise<ViewerCounts> {
  const [sessions, memories, lessons, actions, crystals, semantic, procedural, snapshot] =
    await Promise.all([
      listOrEmpty<Session>(kv, KV.sessions),
      listOrEmpty<Memory>(kv, KV.memories),
      listOrEmpty<Lesson>(kv, KV.lessons),
      listOrEmpty<unknown>(kv, KV.actions),
      listOrEmpty<unknown>(kv, KV.crystals),
      listOrEmpty<unknown>(kv, KV.semantic),
      listOrEmpty<unknown>(kv, KV.procedural),
      kv.get<GraphSnapshot>(KV.graphSnapshot, GRAPH_SNAPSHOT_KEY).catch(() => null),
    ]);
  const scopedSessions = sessions.filter(inAgentScope);
  const scopedMemories = memories.filter(inAgentScope);
  return {
    sessions: scopedSessions.length,
    activeSessions: scopedSessions.filter((s) => s.status === "active").length,
    observations: scopedSessions.reduce((sum, s) => sum + (s.observationCount || 0), 0),
    memories: scopedMemories.length,
    latestMemories: scopedMemories.filter((m) => m.isLatest !== false).length,
    lessons: lessons.filter(isLiveLesson).length,
    actions: actions.length,
    crystals: crystals.length,
    semantic: semantic.length,
    procedural: procedural.length,
    graphNodes: snapshot?.stats?.totalNodes ?? 0,
    graphEdges: snapshot?.stats?.totalEdges ?? 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function getViewerCounts(kv: StateKV): Promise<ViewerCounts> {
  if (counts) return { ...counts };
  if (!loading) {
    loading = (async () => {
      let result = await readCounts(kv);
      for (let attempt = 1; attempt < MAX_LOAD_ATTEMPTS && changedWhileLoading; attempt++) {
        changedWhileLoading = false;
        result = await readCounts(kv);
      }
      changedWhileLoading = false;
      counts = result;
      return result;
    })().finally(() => {
      loading = null;
    });
  }
  return { ...(await loading) };
}

function scheduleEmit(): void {
  if (!emitter || emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    if (counts && emitter) emitter({ ...counts });
  }, EMIT_DELAY_MS);
  if (typeof emitTimer === "object" && emitTimer && "unref" in emitTimer) emitTimer.unref();
}

function applyDelta(apply: (current: ViewerCounts) => boolean): void {
  if (!counts) {
    if (loading) changedWhileLoading = true;
    return;
  }
  if (!apply(counts)) return;
  counts.updatedAt = new Date().toISOString();
  scheduleEmit();
}

function presence(before: unknown, after: unknown): number {
  return (after ? 1 : 0) - (before ? 1 : 0);
}

export function noteSessionChange(before: Session | null | undefined, after: Session | null | undefined): void {
  const prev = inAgentScope(before) ? before : null;
  const next = inAgentScope(after) ? after : null;
  applyDelta((c) => {
    const sessions = presence(prev, next);
    const active = presence(prev?.status === "active", next?.status === "active");
    const observations = (next?.observationCount || 0) - (prev?.observationCount || 0);
    if (sessions === 0 && active === 0 && observations === 0) return false;
    c.sessions += sessions;
    c.activeSessions += active;
    c.observations += observations;
    return true;
  });
}

export function noteMemoryChange(before: Memory | null | undefined, after: Memory | null | undefined): void {
  const prev = inAgentScope(before) ? before : null;
  const next = inAgentScope(after) ? after : null;
  applyDelta((c) => {
    const total = presence(prev, next);
    const latest = presence(prev && prev.isLatest !== false, next && next.isLatest !== false);
    if (total === 0 && latest === 0) return false;
    c.memories += total;
    c.latestMemories += latest;
    return true;
  });
}

export function noteRowChange(kind: CountedKind, before: unknown, after: unknown): void {
  const alive = (row: unknown) =>
    kind === "lessons" ? isLiveLesson(row as Lesson | null | undefined) : Boolean(row);
  applyDelta((c) => {
    const delta = presence(alive(before), alive(after));
    if (delta === 0) return false;
    c[kind] += delta;
    return true;
  });
}

export function noteGraphStats(stats: GraphSnapshot["stats"] | null | undefined): void {
  if (!stats) return;
  applyDelta((c) => {
    if (c.graphNodes === stats.totalNodes && c.graphEdges === stats.totalEdges) return false;
    c.graphNodes = stats.totalNodes;
    c.graphEdges = stats.totalEdges;
    return true;
  });
}

export function resetViewerCounts(): void {
  counts = null;
  loading = null;
  changedWhileLoading = false;
  emitter = null;
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = null;
}
