import type { EmbeddingProvider, CompressedObservation, Memory } from "../types.js";
import { VectorIndex } from "../state/vector-index.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { logger } from "../logger.js";

export interface MigrateVectorIndexResult {
  success: boolean;
  totalProcessed: number;
  failed: number;
  vectorSize: number;
}

export async function migrateVectorIndex(
  kv: StateKV,
  oldIndex: VectorIndex,
  newProvider: EmbeddingProvider,
): Promise<MigrateVectorIndexResult> {
  const newIndex = new VectorIndex();
  let failed = 0;
  let processed = 0;

  // Re-embed memories
  try {
    const memories = await kv.list<Memory>(KV.memories);
    const textMems = memories.filter(
      (m) => m.isLatest !== false && m.title,
    );
    const texts = textMems.map((m) => m.title! + " " + m.content);

    if (texts.length > 0) {
      const embeddings = await newProvider.embedBatch(texts);
      for (let i = 0; i < textMems.length; i++) {
        newIndex.add(
          textMems[i].id,
          textMems[i].sessionIds[0] ?? "memory",
          embeddings[i],
        );
        processed++;
      }
    }
  } catch (err) {
    logger.warn("migrateVectorIndex: failed to re-embed memories", {
      error: err instanceof Error ? err.message : String(err),
    });
    failed++;
  }

  // Re-embed observations
  try {
    const sessions = await kv.list<{ id: string }>(KV.sessions);
    for (const session of sessions) {
      const observations = await kv.list<CompressedObservation>(
        KV.observations(session.id),
      );
      const textObs = observations.filter((o) => o.title);
      const texts = textObs.map((o) => o.title! + " " + (o.narrative || ""));

      if (texts.length > 0) {
        const embeddings = await newProvider.embedBatch(texts);
        for (let i = 0; i < textObs.length; i++) {
          newIndex.add(textObs[i].id, textObs[i].sessionId, embeddings[i]);
          processed++;
        }
      }
    }
  } catch (err) {
    logger.warn("migrateVectorIndex: failed to re-embed observations", {
      error: err instanceof Error ? err.message : String(err),
    });
    failed++;
  }

  return { success: true, totalProcessed: processed, failed, vectorSize: newIndex.size };
}
