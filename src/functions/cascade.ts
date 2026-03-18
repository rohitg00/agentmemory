import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { Memory, GraphNode, GraphEdge } from "../types.js";

export function registerCascadeFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::cascade-update" },
    async (data: { supersededMemoryId: string }) => {
      if (!data.supersededMemoryId || typeof data.supersededMemoryId !== "string") {
        return { success: false, error: "supersededMemoryId is required" };
      }

      const superseded = await kv.get<Memory>(KV.memories, data.supersededMemoryId);
      if (!superseded) {
        return { success: false, error: "superseded memory not found" };
      }

      let flaggedNodes = 0;
      let flaggedEdges = 0;
      let flaggedMemories = 0;

      const obsIds = new Set(superseded.sourceObservationIds || []);

      if (obsIds.size > 0) {
        const now = new Date().toISOString();
        const nodes = await kv.list<GraphNode>(KV.graphNodes);
        for (const node of nodes) {
          if (node.stale) continue;
          const overlap = (node.sourceObservationIds ?? []).some((id) => obsIds.has(id));
          if (overlap) {
            node.stale = true;
            node.updatedAt = now;
            await kv.set(KV.graphNodes, node.id, node);
            flaggedNodes++;
          }
        }

        const edges = await kv.list<GraphEdge>(KV.graphEdges);
        for (const edge of edges) {
          if (edge.stale) continue;
          const overlap = (edge.sourceObservationIds ?? []).some((id) => obsIds.has(id));
          if (overlap) {
            edge.stale = true;
            await kv.set(KV.graphEdges, edge.id, edge);
            flaggedEdges++;
          }
        }
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
