import type { CompressedObservation, Lesson, Memory } from "../types.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import { withReentrantKeyedLock } from "./keyed-mutex.js";

const MAX_DATE_MS = 8.64e15;

export function deleteMemoryUnderLock<T = Memory>(
  kv: StateKV,
  scope: string,
  id: string,
): Promise<T | null> {
  return withReentrantKeyedLock("mem:remember", async () => {
    const current = await kv.get<T>(scope, id);
    if (!current) return null;
    await kv.delete(scope, id);
    return current;
  });
}

export function supersededAt(previous: string | undefined, now: string): string {
  const prior = previous ? Date.parse(previous) : Number.NaN;
  const current = Date.parse(now);
  if (Number.isNaN(prior) || current > prior) return now;
  return new Date(Math.min(prior + 1, MAX_DATE_MS)).toISOString();
}

export async function writeSuccessor(
  kv: StateKV,
  successor: Memory,
  previous: Memory,
  now: string,
): Promise<void> {
  await kv.set(KV.memories, successor.id, successor);
  try {
    await kv.set(KV.memories, previous.id, {
      ...previous,
      isLatest: false,
      updatedAt: supersededAt(previous.updatedAt, now),
    });
  } catch (error) {
    const restored = await kv.set(KV.memories, previous.id, previous).then(
      () => true,
      () => false,
    );
    if (restored) await kv.delete(KV.memories, successor.id).catch(() => {});
    throw error;
  }
}

export function supersededButLatest(memories: Memory[]): Array<{ id: string; successorId: string }> {
  const successors = new Map<string, Memory[]>();
  for (const memory of memories) {
    for (const id of memory.supersedes ?? []) {
      const list = successors.get(id);
      if (list) list.push(memory);
      else successors.set(id, [memory]);
    }
  }
  const newestCurrent = (id: string, seen: Set<string>): string | undefined => {
    for (const next of successors.get(id) ?? []) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      const deeper = newestCurrent(next.id, seen);
      if (deeper) return deeper;
      if (next.isLatest !== false) return next.id;
    }
    return undefined;
  };
  const pairs: Array<{ id: string; successorId: string }> = [];
  for (const memory of memories) {
    if (memory.isLatest === false) continue;
    const successorId = newestCurrent(memory.id, new Set([memory.id]));
    if (successorId) pairs.push({ id: memory.id, successorId });
  }
  return pairs;
}

export function sharesMemoryScope(
  a: Pick<Memory, "project" | "agentId">,
  b: Pick<Memory, "project" | "agentId">,
): boolean {
  if ((a.agentId || undefined) !== (b.agentId || undefined)) return false;
  return !(a.project && b.project && a.project !== b.project);
}

// Wraps a Memory record in the CompressedObservation shape that
// SearchIndex / VectorIndex / enrichment paths consume. Memories share
// the same searchable fields as observations (title + content +
// ("memory" or memory.sessionIds[0]) is what enrich-side fallbacks key
// off of when looking up the source record in KV.memories.
export function memoryToObservation(memory: Memory): CompressedObservation {
  return {
    id: memory.id,
    sessionId: memory.sessionIds?.[0] ?? "memory",
    timestamp: memory.createdAt,
    type: "decision",
    memoryType: memory.type,
    title: memory.title,
    facts: [memory.content],
    narrative: memory.content,
    concepts: memory.concepts,
    files: memory.files,
    importance: memory.strength,
    // Carry the owning agent through so agent-scoped search filters see
    // memories, not just raw observations. Dropping it made every memory
    // invisible to any agentId-scoped query.
    ...(memory.agentId ? { agentId: memory.agentId } : {}),
  };
}

// Same adapter for lessons, kept beside memoryToObservation so a new
// CompressedObservation field has one obvious place to be threaded
// through both record kinds.
export function lessonToObservation(l: Lesson): CompressedObservation {
  return {
    id: l.id,
    sessionId: "lesson",
    timestamp: l.createdAt,
    type: "decision",
    title: l.content.slice(0, 120),
    facts: [l.content],
    narrative: l.context || "",
    concepts: l.tags,
    files: [],
    importance: l.confidence,
  };
}

export function observationEmbedText(
  record: Pick<CompressedObservation, "title" | "narrative" | "concepts">,
): string {
  return [record.title, ...(record.concepts || []), record.narrative || ""]
    .filter((part) => part && part.trim())
    .join(" ")
    .trim();
}
