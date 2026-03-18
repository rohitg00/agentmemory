import type {
  GraphNode,
  GraphEdge,
} from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";

export interface GraphRetrievalResult {
  obsId: string;
  sessionId: string;
  score: number;
  graphContext: string;
  pathLength: number;
}

function buildGraphContext(
  path: Array<{ node: GraphNode; edge?: GraphEdge }>,
): string {
  const parts: string[] = [];
  for (const step of path) {
    const props = Object.entries(step.node.properties)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    let line = `[${step.node.type}] ${step.node.name}`;
    if (props) line += ` (${props})`;
    if (step.edge) {
      line += ` --${step.edge.type}-->`;
      if (step.edge.context?.reasoning) {
        line += ` [${step.edge.context.reasoning}]`;
      }
      if (step.edge.tvalid) {
        line += ` @${step.edge.tvalid}`;
      }
    }
    parts.push(line);
  }
  return parts.join(" ");
}

export class GraphRetrieval {
  constructor(private kv: StateKV) {}

  async searchByEntities(
    entityNames: string[],
    maxDepth = 2,
    maxResults = 20,
  ): Promise<GraphRetrievalResult[]> {
    const allNodes = await this.kv.list<GraphNode>(KV.graphNodes);
    const allEdges = await this.kv.list<GraphEdge>(KV.graphEdges);

    const matchingNodes = allNodes.filter((n) => {
      const nameLower = n.name.toLowerCase();
      return entityNames.some(
        (e) =>
          nameLower.includes(e.toLowerCase()) ||
          e.toLowerCase().includes(nameLower),
      );
    });

    if (matchingNodes.length === 0) return [];

    const results: GraphRetrievalResult[] = [];
    const visitedObs = new Set<string>();

    for (const startNode of matchingNodes) {
      const paths = this.bfsTraversal(
        startNode,
        allNodes,
        allEdges,
        maxDepth,
      );

      for (const path of paths) {
        const lastNode = path[path.length - 1].node;
        for (const obsId of lastNode.sourceObservationIds) {
          if (visitedObs.has(obsId)) continue;
          visitedObs.add(obsId);

          const pathLength = path.length;
          const edgeWeights = path
            .filter((s) => s.edge)
            .map((s) => s.edge!.weight);
          const avgWeight =
            edgeWeights.length > 0
              ? edgeWeights.reduce((a, b) => a + b, 0) / edgeWeights.length
              : 0.5;
          const score = avgWeight * (1 / pathLength);

          results.push({
            obsId,
            sessionId: "",
            score,
            graphContext: buildGraphContext(path),
            pathLength,
          });
        }
      }

      for (const obsId of startNode.sourceObservationIds) {
        if (visitedObs.has(obsId)) continue;
        visitedObs.add(obsId);
        results.push({
          obsId,
          sessionId: "",
          score: 1.0,
          graphContext: `[${startNode.type}] ${startNode.name}`,
          pathLength: 0,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  async expandFromChunks(
    obsIds: string[],
    maxDepth = 1,
    maxResults = 10,
  ): Promise<GraphRetrievalResult[]> {
    const allNodes = await this.kv.list<GraphNode>(KV.graphNodes);
    const allEdges = await this.kv.list<GraphEdge>(KV.graphEdges);

    const linkedNodes = allNodes.filter((n) =>
      n.sourceObservationIds.some((id) => obsIds.includes(id)),
    );

    const results: GraphRetrievalResult[] = [];
    const visitedObs = new Set<string>(obsIds);

    for (const node of linkedNodes) {
      const paths = this.bfsTraversal(node, allNodes, allEdges, maxDepth);
      for (const path of paths) {
        const lastNode = path[path.length - 1].node;
        for (const obsId of lastNode.sourceObservationIds) {
          if (visitedObs.has(obsId)) continue;
          visitedObs.add(obsId);

          const pathLength = path.length;
          const score = 0.5 * (1 / (pathLength + 1));

          results.push({
            obsId,
            sessionId: "",
            score,
            graphContext: buildGraphContext(path),
            pathLength,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  async temporalQuery(
    entityName: string,
    asOf?: string,
  ): Promise<{
    entity: GraphNode | null;
    currentState: GraphEdge[];
    history: GraphEdge[];
  }> {
    const allNodes = await this.kv.list<GraphNode>(KV.graphNodes);
    const allEdges = await this.kv.list<GraphEdge>(KV.graphEdges);

    const entity = allNodes.find(
      (n) => n.name.toLowerCase() === entityName.toLowerCase(),
    );
    if (!entity) return { entity: null, currentState: [], history: [] };

    const relatedEdges = allEdges.filter(
      (e) => e.sourceNodeId === entity.id || e.targetNodeId === entity.id,
    );

    if (!asOf) {
      const latestEdges = this.getLatestEdges(relatedEdges);
      const historicalEdges = relatedEdges.filter(
        (e) => !latestEdges.some((le) => le.id === e.id),
      );
      return { entity, currentState: latestEdges, history: historicalEdges };
    }

    const asOfDate = new Date(asOf).getTime();
    const validEdges = relatedEdges.filter((e) => {
      const commitDate = new Date(e.tcommit || e.createdAt).getTime();
      if (commitDate > asOfDate) return false;
      if (e.tvalid) {
        const validDate = new Date(e.tvalid).getTime();
        if (validDate > asOfDate) return false;
      }
      if (e.tvalidEnd) {
        const endDate = new Date(e.tvalidEnd).getTime();
        if (endDate < asOfDate) return false;
      }
      return true;
    });

    return {
      entity,
      currentState: this.getLatestEdges(validEdges),
      history: validEdges,
    };
  }

  private getLatestEdges(edges: GraphEdge[]): GraphEdge[] {
    const byKey = new Map<string, GraphEdge[]>();
    for (const e of edges) {
      const key = `${e.sourceNodeId}|${e.targetNodeId}|${e.type}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(e);
    }

    const latest: GraphEdge[] = [];
    for (const group of byKey.values()) {
      if (group.length === 0) continue;
      group.sort(
        (a, b) =>
          new Date(b.tcommit || b.createdAt).getTime() -
          new Date(a.tcommit || a.createdAt).getTime(),
      );
      const newest = group.find((e) => e.isLatest !== false) || group[0];
      latest.push(newest);
    }
    return latest;
  }

  private bfsTraversal(
    startNode: GraphNode,
    allNodes: GraphNode[],
    allEdges: GraphEdge[],
    maxDepth: number,
  ): Array<Array<{ node: GraphNode; edge?: GraphEdge }>> {
    const paths: Array<Array<{ node: GraphNode; edge?: GraphEdge }>> = [];
    const visited = new Set<string>();
    const queue: Array<{
      nodeId: string;
      depth: number;
      path: Array<{ node: GraphNode; edge?: GraphEdge }>;
    }> = [{ nodeId: startNode.id, depth: 0, path: [{ node: startNode }] }];

    visited.add(startNode.id);

    while (queue.length > 0) {
      const { nodeId, depth, path } = queue.shift()!;
      paths.push(path);

      if (depth >= maxDepth) continue;

      const neighborEdges = allEdges.filter(
        (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId,
      );

      for (const edge of neighborEdges) {
        const nextId =
          edge.sourceNodeId === nodeId
            ? edge.targetNodeId
            : edge.sourceNodeId;
        if (visited.has(nextId)) continue;
        visited.add(nextId);

        const nextNode = allNodes.find((n) => n.id === nextId);
        if (!nextNode) continue;

        queue.push({
          nodeId: nextId,
          depth: depth + 1,
          path: [...path, { node: nextNode, edge }],
        });
      }
    }

    return paths;
  }
}
