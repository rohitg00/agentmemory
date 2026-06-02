import type { ISdk } from "iii-sdk";
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
import { logger } from "../logger.js";

// #753: keep the response payload below the iii state channel ceiling.
// 500 nodes + their incident edges hold well under the limit on the
// reported 11k-node / 28k-edge corpus, and 5,000 is the upper bound a
// caller can request explicitly. Tuned conservatively because edges
// fan out faster than nodes.
const DEFAULT_GRAPH_QUERY_LIMIT = 500;
const MAX_GRAPH_QUERY_LIMIT = 5000;

function resolvePagination(
  rawLimit: number | undefined,
  rawOffset: number | undefined,
): { limit: number; offset: number } {
  const requested = typeof rawLimit === "number" && Number.isFinite(rawLimit)
    ? Math.floor(rawLimit)
    : DEFAULT_GRAPH_QUERY_LIMIT;
  const limit = Math.max(1, Math.min(requested, MAX_GRAPH_QUERY_LIMIT));
  const offset = Math.max(
    0,
    typeof rawOffset === "number" && Number.isFinite(rawOffset)
      ? Math.floor(rawOffset)
      : 0,
  );
  return { limit, offset };
}

// Score nodes by incident-edge count so the default-cap page surfaces
// the densest part of the graph rather than an arbitrary KV scan order.
function rankByDegree(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.sourceNodeId, (degree.get(edge.sourceNodeId) ?? 0) + 1);
    degree.set(edge.targetNodeId, (degree.get(edge.targetNodeId) ?? 0) + 1);
  }
  return [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
}

function paginate(
  nodes: GraphNode[],
  allEdges: GraphEdge[],
  depth: number,
  limit: number,
  offset: number,
): GraphQueryResult {
  const totalNodes = nodes.length;
  const pageNodes = nodes.slice(offset, offset + limit);
  const pageNodeIds = new Set(pageNodes.map((n) => n.id));
  // Edges restricted to the page so the response payload scales with
  // `limit`, not with the global edge count. An edge is included only
  // when BOTH endpoints land in the page — half-edges to nodes outside
  // the page would render as dangling links in the viewer.
  const pageEdges = allEdges.filter(
    (e) => pageNodeIds.has(e.sourceNodeId) && pageNodeIds.has(e.targetNodeId),
  );
  // Total edges (for the same node universe). Counted unbounded so the
  // viewer can show "showing X of Y" without re-querying.
  const universeIds = new Set(nodes.map((n) => n.id));
  const totalEdges = allEdges.reduce(
    (count, e) =>
      universeIds.has(e.sourceNodeId) && universeIds.has(e.targetNodeId)
        ? count + 1
        : count,
    0,
  );
  return {
    nodes: pageNodes,
    edges: pageEdges,
    depth,
    totalNodes,
    totalEdges,
    truncated: totalNodes > pageNodes.length,
    limit,
    offset,
  };
}

// Parse all key="value" pairs from a tag's attribute string, in any
// order. The previous parser hard-coded attribute order
// (type before name on <entity>, type/source/target/weight on
// <relationship>) and silently dropped nodes/edges when the upstream
// LLM emitted attributes in a different order — Codex in particular
// likes to lead with `name=` (#635).
function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][\w:-]*)="([^"]*)"/g;
  let m;
  while ((m = attrRegex.exec(raw)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

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

  // Two passes because <entity> can be self-closing or have a body
  // (<property> children). The self-closing form needs `[^>]*[^/]` on
  // the attr group so the trailing `/` isn't swallowed into the match
  // (root cause of #494). The explicit-close form picks up the
  // property block.
  const entitySelfClose = /<entity\b([^>]*?)\/>/g;
  const entityWithBody = /<entity\b([^>]*[^/])>([\s\S]*?)<\/entity>/g;

  const addEntity = (rawAttrs: string, propsBlock = ""): void => {
    const attrs = parseAttrs(rawAttrs);
    const type = attrs["type"] as GraphNode["type"] | undefined;
    const name = attrs["name"];
    if (!type || !name) return;
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
  };

  let match;
  while ((match = entitySelfClose.exec(xml)) !== null) {
    addEntity(match[1]);
  }
  while ((match = entityWithBody.exec(xml)) !== null) {
    addEntity(match[1], match[2]);
  }

  const relRegex = /<relationship\b([^>]*?)\/>/g;
  while ((match = relRegex.exec(xml)) !== null) {
    const attrs = parseAttrs(match[1]);
    const type = attrs["type"] as GraphEdge["type"] | undefined;
    const sourceName = attrs["source"];
    const targetName = attrs["target"];
    if (!type || !sourceName || !targetName) continue;
    const parsedWeight = parseFloat(attrs["weight"] ?? "");
    const weight = Number.isFinite(parsedWeight) ? parsedWeight : 0.5;

    const sourceNode = nodes.find((n) => n.name === sourceName);
    const targetNode = nodes.find((n) => n.name === targetName);
    if (!sourceNode || !targetNode) continue;
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

  return { nodes, edges };
}

export function registerGraphFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction("mem::graph-extract", 
    async (data: { observations: CompressedObservation[] }) => {
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

        logger.info("Graph extraction complete", {
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
        logger.error("Graph extraction failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  // #753: every branch now applies a default cap and reports the
  // unbounded `total*` counts. Before this change, an unfiltered POST
  // /graph/query body (`{}`) on a corpus with ~10k+ nodes serialized
  // to a payload large enough that the iii state response channel
  // rejected it with HTTP 500 "Invocation stopped", leaving the viewer
  // graph tab silently blank.
  sdk.registerFunction("mem::graph-query",
    async (data: {
      startNodeId?: string;
      nodeType?: string;
      maxDepth?: number;
      query?: string;
      limit?: number;
      offset?: number;
    }): Promise<GraphQueryResult> => {
      const allNodes = (await kv.list<GraphNode>(KV.graphNodes)).filter((n) => !n.stale);
      const allEdges = (await kv.list<GraphEdge>(KV.graphEdges)).filter((e) => !e.stale);
      const maxDepth = Math.min(data.maxDepth || 3, 5);
      const { limit, offset } = resolvePagination(data.limit, data.offset);

      if (data.query) {
        const lower = data.query.toLowerCase();
        const matchingNodes = allNodes.filter(
          (n) =>
            n.name.toLowerCase().includes(lower) ||
            Object.values(n.properties).some(
              (v) => typeof v === "string" && v.toLowerCase().includes(lower),
            ),
        );
        return paginate(matchingNodes, allEdges, 0, limit, offset);
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

        return paginate(resultNodes, resultEdges, maxDepth, limit, offset);
      }

      let filtered = allNodes;
      if (data.nodeType) {
        filtered = allNodes.filter((n) => n.type === data.nodeType);
      }
      // Empty-body / nodeType-only branch is the path the viewer hits
      // on tab load. Page by the most-connected nodes first so the
      // truncated view conveys the densest part of the graph (#753).
      const ranked = rankByDegree(filtered, allEdges);
      return paginate(ranked, allEdges, 0, limit, offset);
    },
  );

  sdk.registerFunction("mem::graph-stats",  async () => {
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
