import type { CompressedObservation, Lesson, Memory } from "../types.js";

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

// The text a record is embedded with for the vector index: title + body +
// concepts. concepts is the field the compression prompt explicitly asks
// the model to fill with "reusable search terms", and for non-English
// users it is the only field that may carry words in their language —
// leaving it out left CJK queries with no anchor in the vector leg
// (issue #1539: the English paraphrase of a query hit #3 while the
// same-meaning Chinese paraphrase missed the top-100). Every site that
// embeds a record goes through this so live writes and the migrate
// rebuild produce the same text.
export function observationEmbedText(
  record: Pick<CompressedObservation, "title" | "narrative" | "concepts">,
): string {
  return `${record.title} ${record.narrative || ""} ${(record.concepts || []).join(" ")}`.trim();
}
