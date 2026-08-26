import type { ISdk } from "iii-sdk";
import type { EmbeddingProvider } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { isManagedImagePath } from "../utils/image-store.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";

interface StoredEmbedding {
  imageRef: string;
  vector: number[];
  modelName: string;
  dimensions: number;
  updatedAt: string;
  sessionId?: string;
  observationId?: string;
}

export function registerVisionSearchFunctions(
  sdk: ISdk,
  kv: StateKV,
  imageProvider: EmbeddingProvider | null,
): void {
  sdk.registerFunction(
    "mem::vision-embed",
    async (data: {
      imageRef: string;
      sessionId?: string;
      observationId?: string;
    }) => {
      if (!imageProvider?.embedImage) {
        return { success: false, error: "image embeddings disabled (set AGENTMEMORY_IMAGE_EMBEDDINGS=true)" };
      }
      if (!data?.imageRef || typeof data.imageRef !== "string") {
        return { success: false, error: "imageRef required" };
      }
      if (!isManagedImagePath(data.imageRef)) {
        return { success: false, error: "imageRef must point to a file under the managed image store" };
      }
      const refCount = await kv.get<number>(KV.imageRefs, data.imageRef);
      if (!refCount || Number(refCount) < 1) {
        return { success: false, error: "imageRef not registered in mem:image-refs" };
      }
      try {
        const vec = await imageProvider.embedImage(data.imageRef);
        const stored: StoredEmbedding = {
          imageRef: data.imageRef,
          vector: Array.from(vec),
          modelName: imageProvider.name,
          dimensions: imageProvider.dimensions,
          updatedAt: new Date().toISOString(),
          sessionId: data.sessionId,
          observationId: data.observationId,
        };
        await kv.set(KV.imageEmbeddings, data.imageRef, stored);
        await recordAudit(kv, "vision_embed", "mem::vision-embed", [data.imageRef], {
          modelName: imageProvider.name,
          dimensions: stored.dimensions,
          sessionId: data.sessionId,
          observationId: data.observationId,
        });
        return { success: true, imageRef: data.imageRef, dimensions: stored.dimensions };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("vision-embed failed", { imageRef: data.imageRef, error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction(
    "mem::vision-search",
    async (data: {
      queryText?: string;
      queryImageRef?: string;
      queryImageBase64?: string;
      topK?: number;
      limit?: number;
      sessionId?: string;
    }) => {
      if (!imageProvider?.embedImage) {
        return { success: false, error: "image embeddings disabled (set AGENTMEMORY_IMAGE_EMBEDDINGS=true)" };
      }
      const requested = data?.topK ?? data?.limit;
      const requestedTopK =
        typeof requested === "number" && Number.isFinite(requested)
          ? Math.trunc(requested)
          : 10;
      const topK = Math.min(50, Math.max(1, requestedTopK));

      let queryVec: Float32Array | null = null;
      try {
        if (data?.queryText) {
          queryVec = await imageProvider.embed(data.queryText);
        } else if (data?.queryImageBase64) {
          const b64 = data.queryImageBase64.startsWith("data:")
            ? data.queryImageBase64
            : `data:image/png;base64,${data.queryImageBase64}`;
          queryVec = await imageProvider.embedImage(b64);
        } else if (data?.queryImageRef) {
          if (!isManagedImagePath(data.queryImageRef)) {
            return { success: false, error: "queryImageRef must point to a file under the managed image store" };
          }
          const refCount = await kv.get<number>(KV.imageRefs, data.queryImageRef);
          if (!refCount || Number(refCount) < 1) {
            return { success: false, error: "queryImageRef not registered in mem:image-refs" };
          }
          queryVec = await imageProvider.embedImage(data.queryImageRef);
        } else {
          return { success: false, error: "queryText, queryImageRef, or queryImageBase64 required" };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `query embed failed: ${msg}` };
      }

      if (!queryVec) return { success: false, error: "failed to build query vector" };

      const stored = await kv.list<StoredEmbedding>(KV.imageEmbeddings);
      const filtered = data?.sessionId
        ? stored.filter((s) => s.sessionId === data.sessionId)
        : stored;

      const scored = filtered.map((s) => ({
        imageRef: s.imageRef,
        score: cosine(queryVec!, s.vector),
        sessionId: s.sessionId,
        observationId: s.observationId,
        updatedAt: s.updatedAt,
      }));
      scored.sort((a, b) => b.score - a.score);
      return { success: true, results: scored.slice(0, topK), total: scored.length };
    },
  );
}

function cosine(a: Float32Array, b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
