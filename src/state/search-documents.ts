import type { CompressedObservation, Memory } from "../types.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";

export function memoryAsIndexable(memory: Memory): CompressedObservation {
  return {
    id: memory.id,
    sessionId: memory.sessionIds[0] ?? "memory",
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

export async function resolveIndexedObservation(
  kv: StateKV,
  sessionId: string,
  obsId: string,
): Promise<CompressedObservation | null> {
  const observation = await kv
    .get<CompressedObservation>(KV.observations(sessionId), obsId)
    .catch(() => null);
  if (observation) return observation;

  const memory = await kv.get<Memory>(KV.memories, obsId).catch(() => null);
  if (!memory || memory.isLatest === false) return null;
  return memoryAsIndexable(memory);
}
