import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  GraphNode,
  GraphEdge,
  GraphQueryResult,
  CompressedObservation,
  MemoryProvider,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import {
  GRAPH_EXTRACTION_SYSTEM,
  buildGraphExtractionPrompt,
} from "../prompts/graph-extraction.js";
import { recordAudit } from "./audit.js";

function parseGraphXml(
  xml: string,
  observationIds: string[],
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const now = new Date().toISOString();

  const entityRegex =
    /<entity\s+type="([^"]+)"\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/entity>/g;
  let match;
  while ((match = entityRegex.exec(xml)) !== null) {
    const type = match[1] as GraphNode["type"];
    const name = match[2];
    const propsBlock = match[3];
    const properties: Record<string, string> = {};

    const propRegex = /<property\s+key="([^"]+)">([^<]*)<\/property>/g;
    let propMatch;
    while ((propMatch = propRegex.exec(propsBlock)) !== null) {
      properties[propMatch[1]] = propMatch[2];
    }

    nodes.push({
      id: generateId("gn"),
      type,
      name,
      properties,
      sourceObservationIds: observationIds,
      createdAt: now,
    });
  }

  const relRegex =
    /<relationship\s+type="([^"]+)"\s+source="([^"]+)"\s+target="([^"]+)"\s+weight="([^"]+)"\s*\/>/g;
  while ((match = relRegex.exec(xml)) !== null) {
    const type = match[1] as GraphEdge["type"];
    const sourceName = match[2];
    const targetName = match[3];
    const parsedWeight = parseFloat(match[4]);
    const weight = Number.isNaN(parsedWeight) ? 0.5 : parsedWeight;

    const sourceNode = nodes.find((n) => n.name === sourceName);
    const targetNode = nodes.find((n) => n.name === targetName);

    if (sourceNode && targetNode) {
      edges.push({
        id: generateId("ge"),
        type,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        weight: Math.max(0, Math.min(1, weight)),
        sourceObservationIds: observationIds,
        createdAt: now,
      });
    }
  }

  return { nodes, edges };
}

export function registerGraphFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    { id: "mem::graph-extract" },
    async (data: { observations: CompressedObservation[] }) => {
      const ctx = getContext();
      if (!data.observations || data.observations.length === 0) {
        return { success: false, error: "No observations provided" };
      }

      const prompt = buildGraphExtractionPrompt(
        data.observations.map((o) => ({
          title: o.title,
          narrative: o.narrative,
          concepts: o.concepts,
          files: o.files,
          type: o.type,
        })),
      );

      try {
        const response = await provider.compress(
          GRAPH_EXTRACTION_SYSTEM,
          prompt,
        );

        const obsIds = data.observations.map((o) => o.id);
        const { nodes, edges } = parseGraphXml(response, obsIds);

        const existingNodes = await kv.list<GraphNode>(KV.graphNodes);
        const existingEdges = await kv.list<GraphEdge>(KV.graphEdges);

        for (const node of nodes) {
          const existing = existingNodes.find(
            (n) => n.name === node.name && n.type === node.type,
          );
          if (existing) {
            const merged = {
              ...existing,
              sourceObservationIds: [
                ...new Set([...existing.sourceObservationIds, ...obsIds]),
              ],
              properties: { ...existing.properties, ...node.properties },
            };
            await kv.set(KV.graphNodes, existing.id, merged);
            const idx = existingNodes.findIndex((n) => n.id === existing.id);
            if (idx !== -1) existingNodes[idx] = merged;
          } else {
            await kv.set(KV.graphNodes, node.id, node);
            existingNodes.push(node);
          }
        }

        for (const edge of edges) {
          const edgeKey = `${edge.sourceNodeId}|${edge.targetNodeId}|${edge.type}`;
          const existingEdge = existingEdges.find(
            (e) => `${e.sourceNodeId}|${e.targetNodeId}|${e.type}` === edgeKey,
          );
          if (existingEdge) {
            existingEdge.sourceObservationIds = [
              ...new Set([...existingEdge.sourceObservationIds, ...obsIds]),
            ];
            await kv.set(KV.graphEdges, existingEdge.id, existingEdge);
          } else {
            await kv.set(KV.graphEdges, edge.id, edge);
            existingEdges.push(edge);
          }
        }

        await recordAudit(kv, "observe", "mem::graph-extract", obsIds, {
          nodesExtracted: nodes.length,
          edgesExtracted: edges.length,
        });

        ctx.logger.info("Graph extraction complete", {
          nodes: nodes.length,
          edges: edges.length,
        });
        return {
          success: true,
          nodesAdded: nodes.length,
          edgesAdded: edges.length,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error("Graph extraction failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction(
    { id: "mem::graph-query" },
    async (data: {
      startNodeId?: string;
      nodeType?: string;
      maxDepth?: number;
      query?: string;
    }): Promise<GraphQueryResult> => {
      const allNodes = await kv.list<GraphNode>(KV.graphNodes);
      const allEdges = await kv.list<GraphEdge>(KV.graphEdges);
      const maxDepth = Math.min(data.maxDepth || 3, 5);

      if (data.query) {
        const lower = data.query.toLowerCase();
        const matchingNodes = allNodes.filter(
          (n) =>
            n.name.toLowerCase().includes(lower) ||
            Object.values(n.properties).some((v) =>
              v.toLowerCase().includes(lower),
            ),
        );
        const nodeIds = new Set(matchingNodes.map((n) => n.id));
        const relatedEdges = allEdges.filter(
          (e) => nodeIds.has(e.sourceNodeId) || nodeIds.has(e.targetNodeId),
        );
        return { nodes: matchingNodes, edges: relatedEdges, depth: 0 };
      }

      if (data.startNodeId) {
        const visited = new Set<string>();
        const visitedEdges = new Set<string>();
        const resultNodes: GraphNode[] = [];
        const resultEdges: GraphEdge[] = [];
        const queue: Array<{ nodeId: string; depth: number }> = [
          { nodeId: data.startNodeId, depth: 0 },
        ];

        while (queue.length > 0) {
          const { nodeId, depth } = queue.shift()!;
          if (visited.has(nodeId) || depth > maxDepth) continue;
          visited.add(nodeId);

          const node = allNodes.find((n) => n.id === nodeId);
          if (node) {
            if (!data.nodeType || node.type === data.nodeType) {
              resultNodes.push(node);
            }
          }

          const neighborEdges = allEdges.filter(
            (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId,
          );
          for (const edge of neighborEdges) {
            if (!visitedEdges.has(edge.id)) {
              visitedEdges.add(edge.id);
              resultEdges.push(edge);
            }
            const nextId =
              edge.sourceNodeId === nodeId
                ? edge.targetNodeId
                : edge.sourceNodeId;
            if (!visited.has(nextId)) {
              queue.push({ nodeId: nextId, depth: depth + 1 });
            }
          }
        }

        return { nodes: resultNodes, edges: resultEdges, depth: maxDepth };
      }

      let filtered = allNodes;
      if (data.nodeType) {
        filtered = allNodes.filter((n) => n.type === data.nodeType);
      }
      return { nodes: filtered, edges: allEdges, depth: 0 };
    },
  );

  sdk.registerFunction({ id: "mem::graph-stats" }, async () => {
    const nodes = await kv.list<GraphNode>(KV.graphNodes);
    const edges = await kv.list<GraphEdge>(KV.graphEdges);

    const nodesByType: Record<string, number> = {};
    for (const n of nodes) {
      nodesByType[n.type] = (nodesByType[n.type] || 0) + 1;
    }

    const edgesByType: Record<string, number> = {};
    for (const e of edges) {
      edgesByType[e.type] = (edgesByType[e.type] || 0) + 1;
    }

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType,
      edgesByType,
    };
  });
}
