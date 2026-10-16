import { createHash } from "node:crypto";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { getGraphGeneration, pinGraphState } from "../state/graph-generation.js";
import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { createGraphIndexReader, mutateIndexedGraphRecord } from "../state/graph-retrieval-index.js";
import type { Memory, GraphCascadeProgress } from "../types.js";
import { safeAudit } from "./audit.js";

export function registerCascadeFunction(sdk: IIIClient, state: StateKV): void {
  sdk.registerFunction("mem::cascade-update", 
    async (data: { supersededMemoryId: string }) => {
      if (!data || !data.supersededMemoryId || typeof data.supersededMemoryId !== "string") {
        return { success: false, error: "supersededMemoryId is required" };
      }

      const kv = await pinGraphState(state);
      const superseded = await kv.get<Memory>(KV.memories, data.supersededMemoryId);
      if (!superseded) {
        return { success: false, error: "superseded memory not found" };
      }

      let flaggedNodes = 0;
      let flaggedEdges = 0;
      let flaggedMemories = 0;

      const sourceIds = [...new Set(superseded.sourceObservationIds ?? [])];
      const obsIds = new Set(sourceIds);
      let graphDeferred = false;
      let graphReason: string | undefined;
      let graphTruncated = false;
      let progressSaved = true;
      const progressKey = `cascade:${createHash("sha256").update(data.supersededMemoryId).digest("hex")}`;
      if (obsIds.size > 0) {
        const generation = await getGraphGeneration(kv);
        const sourceFingerprint = createHash("sha256").update(JSON.stringify(sourceIds)).digest("hex");
        let offset = 0;
        let continueBatches = true;
        while (continueBatches) {
          continueBatches = false;
          graphDeferred = false; graphTruncated = false; graphReason = undefined;
          const priorCount = flaggedNodes + flaggedEdges;
          try {
            const saved = await kv.get<GraphCascadeProgress>(KV.graphControl, progressKey);
            if (saved?.schema === 1 && saved.generation === generation && saved.sourceFingerprint === sourceFingerprint &&
                Number.isSafeInteger(saved.offset) && saved.offset >= 0 && saved.offset < sourceIds.length) offset = saved.offset;
            const reader = await createGraphIndexReader(kv, { maxReads: 512 });
            if (!reader) {
              graphDeferred = true;
              graphReason = "Graph index is unavailable. Complete graph-index migration or recovery, then retry cascade-update.";
            } else {
              const previousOffset = offset;
              const candidates = new Map<string, { kind: "node" | "edge"; id: string }>();
              let nextOffset = offset;
              for (let i = offset; i < sourceIds.length; i++) {
                if (i - offset >= 64 || candidates.size >= 64 || reader.remainingReads < 4) { graphTruncated = true; break; }
                const observationId = sourceIds[i]!;
                if (typeof observationId !== "string" || Buffer.byteLength(observationId) > 1024) {
                  graphDeferred = true; graphReason = "A source observation ID exceeds the graph index limit."; break;
                }
                const limit = Math.max(1, Math.floor((64 - candidates.size) / 2));
                const [nodes, edges] = await Promise.all([
                  reader.posting("observation", observationId, { limit }),
                  reader.posting("edgeObservation", observationId, { limit }),
                ]);
                for (const id of nodes.ids) candidates.set(`node:${id}`, { kind: "node", id });
                for (const id of edges.ids) candidates.set(`edge:${id}`, { kind: "edge", id });
                if (nodes.cursor || edges.cursor || reader.exhausted) { graphTruncated = true; nextOffset = i; break; }
                nextOffset = i + 1;
              }
              if (!await reader.finish()) {
                graphDeferred = true;
                graphReason = "Graph changed during cascade discovery; retry cascade-update.";
              } else {
                const now = new Date().toISOString();
                for (const { kind, id } of candidates.values()) {
                  const changed = await mutateIndexedGraphRecord(kv, kind, id, (latest) => {
                    if (!latest || latest.stale || !(latest.sourceObservationIds ?? []).some((sourceId) => obsIds.has(sourceId))) return undefined;
                    return { ...latest, stale: true, ...(kind === "node" ? { updatedAt: now } : {}) };
                  });
                  if (!changed) continue;
                  if (kind === "node") flaggedNodes++; else flaggedEdges++;
                  await safeAudit(kv, "consolidate", "mem::cascade-update", [id], {
                    resourceType: kind === "node" ? "GraphNode" : "GraphEdge",
                    change: "marked stale from superseded memory", supersededMemoryId: data.supersededMemoryId,
                  });
                }
                offset = nextOffset;
                continueBatches = graphTruncated && !graphReason && reader.status.incompleteRecords === 0 &&
                  (offset > previousOffset || flaggedNodes + flaggedEdges > priorCount);
                graphDeferred ||= graphTruncated || offset < sourceIds.length || reader.status.incompleteRecords > 0;
                if (reader.status.incompleteRecords > 0) graphReason = "Graph index coverage is partial. Repair oversized records and retry cascade-update.";
                else if (graphDeferred && !graphReason) graphReason = "Bounded cascade batch completed; retry cascade-update to continue saved progress.";
                if (offset >= sourceIds.length && graphDeferred) offset = 0;
              }
            }
          } catch {
            continueBatches = false;
            graphDeferred = true;
            graphReason = "Graph cascade stopped after a storage or consistency failure; retry after graph index recovery.";
          }
          try {
            if (graphDeferred) {
              await kv.set<GraphCascadeProgress>(KV.graphControl, progressKey, { schema: 1, generation, sourceFingerprint,
                offset, reason: graphReason!, updatedAt: new Date().toISOString() });
            } else await kv.delete(KV.graphControl, progressKey);
          } catch { continueBatches = false; progressSaved = false; graphDeferred = true; graphReason = "Graph cascade progress could not be saved; retry after storage recovery."; }
          if (continueBatches) await yieldToEventLoop();
        }
      } else {
        await kv.delete(KV.graphControl, progressKey).catch(() => {});
      }

      const supersededConcepts = new Set(
        (superseded.concepts ?? []).map((c) => c.toLowerCase()),
      );
      if (supersededConcepts.size >= 2) {
        const allMemories = await kv.list<Memory>(KV.memories);
        for (const mem of allMemories) {
          if (mem.id === data.supersededMemoryId) continue;
          if (!mem.isLatest) continue;

          const sharedCount = (mem.concepts ?? []).filter((c) =>
            supersededConcepts.has(c.toLowerCase()),
          ).length;
          if (sharedCount >= 2) {
            flaggedMemories++;
          }
        }
      }

      return {
        success: true,
        graphDeferred,
        graphTruncated,
        ...(graphDeferred ? { graphReason, retryable: true, progressSaved } : {}),
        flagged: {
          nodes: flaggedNodes,
          edges: flaggedEdges,
          siblingMemories: flaggedMemories,
        },
        total: flaggedNodes + flaggedEdges + flaggedMemories,
      };
    },
  );
}
