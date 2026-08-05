import type { CompressedObservation, Memory } from "../types.js";

export type MemoryReferenceField = "supersedes" | "parentId" | "relatedIds";

/**
 * Remove references to `idsToRemove` from a memory's inter-memory reference
 * fields (`supersedes`, `parentId`, `relatedIds`). Returns a shallow copy with
 * the dangling references dropped, plus what was removed.
 *
 * Pure (no KV): used by governance-delete to keep a delete from leaving
 * dangling back-references in *other* memories, and by diagnostics heal to
 * prune references that already point at non-existent memories. Covering all
 * three fields here keeps the two call sites consistent — a partial fix that
 * cleared only `supersedes`/`parentId` would leave `relatedIds` dangling for
 * the same root cause.
 */
export function stripMemoryReferences(
  memory: Memory,
  idsToRemove: Set<string>,
): {
  memory: Memory;
  changed: boolean;
  removed: Array<{ field: MemoryReferenceField; value: string }>;
} {
  const removed: Array<{ field: MemoryReferenceField; value: string }> = [];
  const next: Memory = { ...memory };

  if (next.supersedes && next.supersedes.length > 0) {
    const kept = next.supersedes.filter((id) => {
      if (idsToRemove.has(id)) {
        removed.push({ field: "supersedes", value: id });
        return false;
      }
      return true;
    });
    if (kept.length !== next.supersedes.length) {
      next.supersedes = kept;
    }
  }

  if (next.parentId && idsToRemove.has(next.parentId)) {
    removed.push({ field: "parentId", value: next.parentId });
    next.parentId = undefined;
  }

  if (next.relatedIds && next.relatedIds.length > 0) {
    const kept = next.relatedIds.filter((id) => {
      if (idsToRemove.has(id)) {
        removed.push({ field: "relatedIds", value: id });
        return false;
      }
      return true;
    });
    if (kept.length !== next.relatedIds.length) {
      next.relatedIds = kept;
    }
  }

  return { memory: next, changed: removed.length > 0, removed };
}

// Wraps a Memory record in the CompressedObservation shape that
// SearchIndex / VectorIndex / enrichment paths consume. Memories share
// the same searchable fields as observations (title + content +
// concepts + files); type is normalized to "decision" so memories stay
// distinguishable in result metadata without colliding with observation
// enums (file_read, command_run, …). The synthetic sessionId
// ("memory" or memory.sessionIds[0]) is what enrich-side fallbacks key
// off of when looking up the source record in KV.memories.
export function memoryToObservation(memory: Memory): CompressedObservation {
  return {
    id: memory.id,
    sessionId: memory.sessionIds?.[0] ?? "memory",
    timestamp: memory.createdAt,
    type: "decision",
    title: memory.title,
    facts: [memory.content],
    narrative: memory.content,
    concepts: memory.concepts,
    files: memory.files,
    importance: memory.strength,
  };
}
