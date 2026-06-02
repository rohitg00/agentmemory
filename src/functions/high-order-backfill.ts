import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { SemanticMemory, ProceduralMemory, Crystal, Insight } from "../types.js";
import { getEmbeddingProvider } from "./search.js";
import { float32ToBase64 } from "../state/vector-index.js";
import { logger } from "../logger.js";

const BACKFILL_BATCH_SIZE = 20;

export function registerHighOrderBackfillFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::backfill-embeddings::high-order", async () => {
    const ep = getEmbeddingProvider();
    if (!ep) {
      return { success: false, error: "No embedding provider available" };
    }

    const results = {
      semantic: 0,
      procedural: 0,
      crystals: 0,
      insights: 0,
    };

    try {
      // 1. Semantic Facts
      const semantics = await kv.list<SemanticMemory>(KV.semantic);
      const semToUpdate = semantics.filter(
        (s) => !s.embedding || s.embeddingModel !== ep.name
      );
      for (let i = 0; i < semToUpdate.length; i += BACKFILL_BATCH_SIZE) {
        const batch = semToUpdate.slice(i, i + BACKFILL_BATCH_SIZE);
        const texts = batch.map((s) => s.fact);
        try {
          const vectors = await ep.embedBatch(texts);
          for (let j = 0; j < batch.length; j++) {
            batch[j].embedding = float32ToBase64(vectors[j]);
            batch[j].embeddingModel = ep.name;
            await kv.set(KV.semantic, batch[j].id, batch[j]);
          }
          results.semantic += batch.length;
        } catch (e) {
          logger.warn("Semantic backfill batch failed", { error: String(e) });
        }
      }

      // 2. Procedural Skills
      const procedurals = await kv.list<ProceduralMemory>(KV.procedural);
      const procToUpdate = procedurals.filter(
        (p) => !p.embedding || p.embeddingModel !== ep.name
      );
      for (let i = 0; i < procToUpdate.length; i += BACKFILL_BATCH_SIZE) {
        const batch = procToUpdate.slice(i, i + BACKFILL_BATCH_SIZE);
        const texts = batch.map((p) => `${p.name} ${p.triggerCondition} ${p.steps.join(" ")}`);
        try {
          const vectors = await ep.embedBatch(texts);
          for (let j = 0; j < batch.length; j++) {
            batch[j].embedding = float32ToBase64(vectors[j]);
            batch[j].embeddingModel = ep.name;
            await kv.set(KV.procedural, batch[j].id, batch[j]);
          }
          results.procedural += batch.length;
        } catch (e) {
          logger.warn("Procedural backfill batch failed", { error: String(e) });
        }
      }

      // 3. Crystals
      const crystals = await kv.list<Crystal>(KV.crystals);
      const crysToUpdate = crystals.filter(
        (c) => !c.embedding || c.embeddingModel !== ep.name
      );
      for (let i = 0; i < crysToUpdate.length; i += BACKFILL_BATCH_SIZE) {
        const batch = crysToUpdate.slice(i, i + BACKFILL_BATCH_SIZE);
        const texts = batch.map((c) => `${c.narrative} ${c.lessons.join(" ")}`);
        try {
          const vectors = await ep.embedBatch(texts);
          for (let j = 0; j < batch.length; j++) {
            batch[j].embedding = float32ToBase64(vectors[j]);
            batch[j].embeddingModel = ep.name;
            await kv.set(KV.crystals, batch[j].id, batch[j]);
          }
          results.crystals += batch.length;
        } catch (e) {
          logger.warn("Crystal backfill batch failed", { error: String(e) });
        }
      }

      // 4. Insights
      const insights = await kv.list<Insight>(KV.insights);
      const insToUpdate = insights.filter(
        (ins) => !ins.deleted && (!ins.embedding || ins.embeddingModel !== ep.name)
      );
      for (let i = 0; i < insToUpdate.length; i += BACKFILL_BATCH_SIZE) {
        const batch = insToUpdate.slice(i, i + BACKFILL_BATCH_SIZE);
        const texts = batch.map((ins) => `${ins.title} ${ins.content}`);
        try {
          const vectors = await ep.embedBatch(texts);
          for (let j = 0; j < batch.length; j++) {
            batch[j].embedding = float32ToBase64(vectors[j]);
            batch[j].embeddingModel = ep.name;
            await kv.set(KV.insights, batch[j].id, batch[j]);
          }
          results.insights += batch.length;
        } catch (e) {
          logger.warn("Insight backfill batch failed", { error: String(e) });
        }
      }

      const total = results.semantic + results.procedural + results.crystals + results.insights;
      if (total > 0) {
        logger.info("High-order embedding backfill complete", { backfilled: results });
      }

      return { success: true, backfilled: results };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("High-order backfill encountered a fatal error", { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  });
}
