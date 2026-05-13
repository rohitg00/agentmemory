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
  failedSessions: string[];
}

// Validate one embedding's shape against the provider's declared dimensions
// before pushing it into the index. Mirrors the symmetric guard in
// search.ts::vectorIndexAddGuarded — without this, a misconfigured
// provider returning the wrong-length Float32Array would silently corrupt
// the rebuilt index (per #248).
function isValidEmbedding(
  embedding: Float32Array,
  provider: EmbeddingProvider,
  context: { kind: "memory" | "observation"; id: string },
): boolean {
  if (embedding.length !== provider.dimensions) {
    logger.warn("migrateVectorIndex: dimension mismatch — skipping", {
      kind: context.kind,
      id: context.id,
      provider: provider.name,
      expected: provider.dimensions,
      received: embedding.length,
    });
    return false;
  }
  return true;
}

// Rebuilds a fresh VectorIndex against `newProvider`, re-embedding every
// memory and per-session observation in `kv`. Each phase (memories +
// per-session observations) is isolated — a single session that throws
// on kv.list or embedBatch increments `failed` and appends to
// `failedSessions`, but the migration continues. Returns a structured
// result the caller can inspect to decide whether to swap the index in.
export async function migrateVectorIndex(
  kv: StateKV,
  newProvider: EmbeddingProvider,
): Promise<MigrateVectorIndexResult> {
  const newIndex = new VectorIndex();
  let failed = 0;
  let processed = 0;
  const failedSessions: string[] = [];

  // --- Memories phase ----------------------------------------------------
  // textMems is declared outside the try so the catch can attribute the
  // batch-level failure to the correct number of missed embeddings (the
  // size of the batch we were about to embed), not a flat +1.
  let textMems: Memory[] = [];
  try {
    const memories = await kv.list<Memory>(KV.memories);
    textMems = memories.filter(
      (m) => m.isLatest !== false && m.title && m.content && m.content.trim() !== "",
    );
    const texts = textMems.map((m) => m.title + " " + m.content);

    if (texts.length > 0) {
      const embeddings = await newProvider.embedBatch(texts);
      for (let i = 0; i < textMems.length; i++) {
        if (!isValidEmbedding(embeddings[i], newProvider, { kind: "memory", id: textMems[i].id })) {
          failed++;
          continue;
        }
        newIndex.add(
          textMems[i].id,
          textMems[i].sessionIds[0] ?? "memory",
          embeddings[i],
        );
        processed++;
      }
    }
  } catch (err) {
    // If kv.list threw before textMems was populated, the batch size is
    // unknown — count as +1 (something failed but we don't know what).
    // If embedBatch threw, textMems.length is the real number of missed
    // memories. Caller relying on `failed` for retry math needs this
    // attribution to be accurate.
    const missed = textMems.length > 0 ? textMems.length : 1;
    logger.warn("migrateVectorIndex: failed to re-embed memories", {
      missed,
      error: err instanceof Error ? err.message : String(err),
    });
    failed += missed;
  }

  // --- Observations phase (per-session isolation) ------------------------
  // Without per-session try/catch, one bad session (kv.list throws,
  // embedBatch rejects, etc.) would abort every later session and silently
  // truncate the migration. Each session now has its own boundary; failures
  // increment `failed`, append the session id to failedSessions, and the
  // loop moves on.
  let sessions: Array<{ id: string }>;
  try {
    sessions = await kv.list<{ id: string }>(KV.sessions);
  } catch (err) {
    logger.warn("migrateVectorIndex: failed to list sessions", {
      error: err instanceof Error ? err.message : String(err),
    });
    failed++;
    // Distinguish a list-sessions failure (catastrophic: no sessions
    // could be enumerated) from a per-session failure (one specific id
    // threw). Without the marker the caller sees failed=N + an empty
    // failedSessions list and can't tell apart "0 sessions, all OK"
    // from "kv.list itself blew up".
    failedSessions.push("<sessions-list-failed>");
    return { success: false, totalProcessed: processed, failed, vectorSize: newIndex.size, failedSessions };
  }

  for (const session of sessions) {
    try {
      const observations = await kv.list<CompressedObservation>(
        KV.observations(session.id),
      );
      const textObs = observations.filter((o) => o.title);
      const texts = textObs.map((o) => o.title + " " + (o.narrative || ""));
      if (texts.length === 0) continue;

      const embeddings = await newProvider.embedBatch(texts);
      for (let i = 0; i < textObs.length; i++) {
        if (!isValidEmbedding(embeddings[i], newProvider, { kind: "observation", id: textObs[i].id })) {
          failed++;
          continue;
        }
        newIndex.add(textObs[i].id, textObs[i].sessionId, embeddings[i]);
        processed++;
      }
    } catch (err) {
      logger.warn("migrateVectorIndex: failed to re-embed session", {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
      failedSessions.push(session.id);
    }
  }

  return {
    success: failed === 0,
    totalProcessed: processed,
    failed,
    vectorSize: newIndex.size,
    failedSessions,
  };
}
