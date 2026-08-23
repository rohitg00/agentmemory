import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type { Memory, GraphEdge } from "../types.js";
import {
  GraphIndexReader,
  graphIndexReadiness,
  removeGraphNodeFromIndexOrInvalidate,
  withFailClosedGraphMutation,
} from "../state/graph-indexes.js";
import { recordAudit } from "./audit.js";
import { rebuildGraphSnapshotOrInvalidateInMutation } from "./graph.js";

export function registerCascadeFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::cascade-update", 
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
        await withFailClosedGraphMutation(kv, "graph cascade update", async () => {
          const readiness = await graphIndexReadiness(kv);
          if (!readiness.ready || !readiness.generation) return;
          const reader = await GraphIndexReader.open(kv, readiness.generation);
          if (!reader) return;
          const nodes = [];
          const edges = new Map<string, GraphEdge>();
          for (const nodeId of await reader.getNodeIdsForObservations([
            ...obsIds,
          ])) {
            const node = await reader.getNode(nodeId);
            if (!node) continue;
            nodes.push(node);
            for (const edge of await reader.getIncidentEdges(node.id)) {
              edges.set(edge.id, edge);
            }
          }

          const now = new Date().toISOString();
          for (const node of nodes) {
            if (
              !(node.sourceObservationIds ?? []).some((id) => obsIds.has(id))
            ) {
              continue;
            }
            node.stale = true;
            node.updatedAt = now;
            await kv.set(KV.graphNodes, node.id, node);
            await removeGraphNodeFromIndexOrInvalidate(
              kv,
              node.id,
              readiness.generation,
            );
            await recordAudit(kv, "consolidate", "mem::cascade-update", [node.id], {
              resourceType: "GraphNode",
              change: "marked stale from superseded memory",
              supersededMemoryId: data.supersededMemoryId,
            });
            flaggedNodes++;
          }

          for (const edge of edges.values()) {
            if (
              !(edge.sourceObservationIds ?? []).some((id) => obsIds.has(id))
            ) {
              continue;
            }
            edge.stale = true;
            await kv.set(KV.graphEdges, edge.id, edge);
            await recordAudit(kv, "consolidate", "mem::cascade-update", [edge.id], {
              resourceType: "GraphEdge",
              change: "marked stale from superseded memory",
              supersededMemoryId: data.supersededMemoryId,
            });
            flaggedEdges++;
          }

          if (flaggedNodes > 0 || flaggedEdges > 0) {
            await rebuildGraphSnapshotOrInvalidateInMutation(
              kv,
              readiness.generation,
            );
          }
        });
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
