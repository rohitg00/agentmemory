import type { ISdk } from "iii-sdk";
import type {
  GraphNode,
  GraphEdge,
  GraphQueryResult,
  CompressedObservation,
  MemoryProvider,
  Session,
  Memory,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { memoryToObservation } from "../state/memory-utils.js";
import { getGraphBatchSize } from "../config.js";
import {
  GRAPH_EXTRACTION_SYSTEM,
  buildGraphExtractionPrompt,
} from "../prompts/graph-extraction.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";

export type GraphBuildOptions = {
  dryRun?: boolean;
  source?: "observations" | "memories" | "all";
  force?: boolean;
  batchSize?: number;
  sessionId?: string;
  includeActiveSessions?: boolean;
  latestMemoriesOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type GraphBuildResult = {
  success: boolean;
  dryRun: boolean;
  source: "observations" | "memories" | "all";
  sessionsScanned: number;
  memoriesScanned: number;
  observationsFound: number;
  observationsEligible: number;
  observationsSkippedExisting: number;
  observationsSelected: number;
  batchesPlanned: number;
  batchesProcessed: number;
  nodes: number;
  edges: number;
  nodesAdded: number;
  edgesAdded: number;
  errors: Array<{ batch: number; error: string }>;
};

function isGraphBuildSource(value: unknown): value is GraphBuildOptions["source"] {
  return value === "observations" || value === "memories" || value === "all";
}

function isEligibleObservation(value: unknown): value is CompressedObservation {
  const obs = value as Partial<CompressedObservation>;
  return (
    typeof obs.id === "string" &&
    obs.id.trim().length > 0 &&
    typeof obs.title === "string" &&
    obs.title.trim().length > 0 &&
    typeof obs.narrative === "string" &&
    typeof obs.type === "string" &&
    Array.isArray(obs.concepts) &&
    Array.isArray(obs.files)
  );
}

function collectProcessedSourceIds(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    for (const id of node.sourceObservationIds || []) ids.add(id);
  }
  for (const edge of edges) {
    for (const id of edge.sourceObservationIds || []) ids.add(id);
  }
  return ids;
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

  const entityRegex =
    /<entity\s+type="([^"]+)"\s+name="([^"]+)"[^>]*(?:\/>|>([\s\S]*?)<\/entity>)/g;
  let match;
  while ((match = entityRegex.exec(xml)) !== null) {
    const type = match[1] as GraphNode["type"];
    const name = match[2];
    const propsBlock = match[3] ?? "";
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
  sdk.registerFunction("mem::graph-build",
    async (data: GraphBuildOptions = {}): Promise<GraphBuildResult> => {
      const source = isGraphBuildSource(data.source) ? data.source : "all";
      const dryRun = data.dryRun !== false;
      const force = data.force === true;
      const includeActiveSessions = data.includeActiveSessions === true;
      const latestMemoriesOnly = data.latestMemoriesOnly !== false;
      const parsedBatchSize =
        typeof data.batchSize === "number"
          ? data.batchSize
          : getGraphBatchSize();
      const batchSize = Math.max(
        1,
        Math.min(50, Number.isFinite(parsedBatchSize) ? parsedBatchSize : 8),
      );
      const offset =
        typeof data.offset === "number" && Number.isFinite(data.offset)
          ? Math.max(0, Math.floor(data.offset))
          : 0;
      const limit =
        typeof data.limit === "number" && Number.isFinite(data.limit)
          ? Math.max(0, Math.floor(data.limit))
          : undefined;

      const existingNodes = await kv.list<GraphNode>(KV.graphNodes);
      const existingEdges = await kv.list<GraphEdge>(KV.graphEdges);
      const processedIds = force
        ? new Set<string>()
        : collectProcessedSourceIds(existingNodes, existingEdges);

      const observations: CompressedObservation[] = [];
      let sessionsScanned = 0;
      let memoriesScanned = 0;
      let observationsFound = 0;

      if (source === "observations" || source === "all") {
        const allSessions = await kv.list<Session>(KV.sessions);
        const sessions = allSessions.filter((s) => {
          if (data.sessionId && s.id !== data.sessionId) return false;
          if (!includeActiveSessions && s.status === "active") return false;
          return true;
        });
        sessionsScanned = sessions.length;

        for (const session of sessions) {
          const sessionObservations = await kv
            .list<CompressedObservation>(KV.observations(session.id))
            .catch(() => []);
          observationsFound += sessionObservations.length;
          observations.push(...sessionObservations.filter(isEligibleObservation));
        }
      }

      if (!data.sessionId && (source === "memories" || source === "all")) {
        const allMemories = await kv.list<Memory>(KV.memories);
        const memories = latestMemoriesOnly
          ? allMemories.filter((m) => m.isLatest)
          : allMemories;
        memoriesScanned = memories.length;
        observationsFound += memories.length;
        observations.push(
          ...memories
            .map((memory) => memoryToObservation(memory))
            .filter(isEligibleObservation),
        );
      }

      observations.sort((a, b) =>
        String(a.timestamp || "").localeCompare(String(b.timestamp || "")),
      );
      const eligible = observations.filter((observation) => {
        if (force) return true;
        return !processedIds.has(observation.id);
      });
      const selected = eligible.slice(
        offset,
        limit === undefined ? undefined : offset + limit,
      );
      const batches: CompressedObservation[][] = [];
      for (let i = 0; i < selected.length; i += batchSize) {
        batches.push(selected.slice(i, i + batchSize));
      }

      const result: GraphBuildResult = {
        success: true,
        dryRun,
        source,
        sessionsScanned,
        memoriesScanned,
        observationsFound,
        observationsEligible: eligible.length,
        observationsSkippedExisting: observations.length - eligible.length,
        observationsSelected: selected.length,
        batchesPlanned: batches.length,
        batchesProcessed: 0,
        nodes: existingNodes.length,
        edges: existingEdges.length,
        nodesAdded: 0,
        edgesAdded: 0,
        errors: [],
      };

      if (dryRun) return result;

      for (let i = 0; i < batches.length; i++) {
        try {
          const extracted = (await sdk.trigger({
            function_id: "mem::graph-extract",
            payload: { observations: batches[i] },
          })) as {
            success?: boolean;
            nodesAdded?: number;
            edgesAdded?: number;
            nodesCreated?: number;
            edgesCreated?: number;
            error?: string;
          };
          if (extracted?.success === false) {
            result.errors.push({
              batch: i,
              error: extracted.error || "graph extraction failed",
            });
            continue;
          }
          result.batchesProcessed++;
          result.nodesAdded += extracted?.nodesCreated ?? extracted?.nodesAdded ?? 0;
          result.edgesAdded += extracted?.edgesCreated ?? extracted?.edgesAdded ?? 0;
        } catch (err) {
          result.errors.push({
            batch: i,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      result.success = result.errors.length === 0;
      const [nodes, edges] = await Promise.all([
        kv.list<GraphNode>(KV.graphNodes),
        kv.list<GraphEdge>(KV.graphEdges),
      ]);
      result.nodes = nodes.length;
      result.edges = edges.length;
      await recordAudit(
        kv,
        "observe",
        "mem::graph-build",
        selected.map((observation) => observation.id),
        {
          source,
          dryRun,
          force,
          batches: result.batchesProcessed,
          nodes: result.nodes,
          edges: result.edges,
          errors: result.errors.length,
        },
      );
      return result;
    },
  );

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
        const resolvedNodeIds = new Map<string, string>();
        let nodesCreated = 0;
        let nodesUpdated = 0;
        let edgesCreated = 0;
        let edgesUpdated = 0;

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
            resolvedNodeIds.set(`${node.type}:${node.name}`, existing.id);
            nodesUpdated++;
          } else {
            await kv.set(KV.graphNodes, node.id, node);
            existingNodes.push(node);
            resolvedNodeIds.set(`${node.type}:${node.name}`, node.id);
            nodesCreated++;
          }
        }

        for (const edge of edges) {
          const sourceParsedNode = nodes.find((n) => n.id === edge.sourceNodeId);
          const targetParsedNode = nodes.find((n) => n.id === edge.targetNodeId);
          const sourceNodeId = sourceParsedNode
            ? resolvedNodeIds.get(`${sourceParsedNode.type}:${sourceParsedNode.name}`)
            : edge.sourceNodeId;
          const targetNodeId = targetParsedNode
            ? resolvedNodeIds.get(`${targetParsedNode.type}:${targetParsedNode.name}`)
            : edge.targetNodeId;
          if (!sourceNodeId || !targetNodeId) continue;
          edge.sourceNodeId = sourceNodeId;
          edge.targetNodeId = targetNodeId;
          const edgeKey = `${edge.sourceNodeId}|${edge.targetNodeId}|${edge.type}`;
          const existingEdge = existingEdges.find(
            (e) => `${e.sourceNodeId}|${e.targetNodeId}|${e.type}` === edgeKey,
          );
          if (existingEdge) {
            existingEdge.sourceObservationIds = [
              ...new Set([...existingEdge.sourceObservationIds, ...obsIds]),
            ];
            await kv.set(KV.graphEdges, existingEdge.id, existingEdge);
            edgesUpdated++;
          } else {
            await kv.set(KV.graphEdges, edge.id, edge);
            existingEdges.push(edge);
            edgesCreated++;
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
          nodesParsed: nodes.length,
          edgesParsed: edges.length,
          nodesCreated,
          nodesUpdated,
          edgesCreated,
          edgesUpdated,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Graph extraction failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction("mem::graph-query", 
    async (data: {
      startNodeId?: string;
      nodeType?: string;
      maxDepth?: number;
      query?: string;
    }): Promise<GraphQueryResult> => {
      const allNodes = (await kv.list<GraphNode>(KV.graphNodes)).filter((n) => !n.stale);
      const allEdges = (await kv.list<GraphEdge>(KV.graphEdges)).filter((e) => !e.stale);
      const maxDepth = Math.min(data.maxDepth || 3, 5);

      if (data.query) {
        const lower = data.query.toLowerCase();
        const matchingNodes = allNodes.filter(
          (n) =>
            n.name.toLowerCase().includes(lower) ||
            Object.values(n.properties).some(
              (v) => typeof v === "string" && v.toLowerCase().includes(lower),
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
