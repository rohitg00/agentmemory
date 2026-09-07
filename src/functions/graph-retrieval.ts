import type {
  GraphNode,
  GraphEdge,
} from "../types.js";
import type { StateKV } from "../state/kv.js";
import { getGraphView, type GraphView } from "../state/graph-cache.js";
import { getEnvVar } from "../config.js";

// Traversal bounds. Both are here because this corpus grew to 69K
// nodes / 185K edges: an unbounded start-node set means one Dijkstra
// per matching node, and an unbounded expansion lets a single hub node
// walk most of the graph on maxDepth=2.
const DEFAULT_MAX_START_NODES = 25;
const DEFAULT_MAX_VISITED = 2000;

function envInt(key: string, fallback: number): number {
  const raw = getEnvVar(key);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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
    const view = await getGraphView(this.kv);

    const lowered = entityNames.map((e) => e.toLowerCase());
    const matchingNodes: Array<{ node: GraphNode; exact: boolean }> = [];
    for (const node of view.nodes.values()) {
      const nameLower = node.name.toLowerCase();
      let matched = false;
      let exact = false;
      for (const entity of lowered) {
        if (nameLower === entity) {
          matched = true;
          exact = true;
          break;
        }
        if (nameLower.includes(entity) || entity.includes(nameLower)) {
          matched = true;
        }
      }
      if (matched) matchingNodes.push({ node, exact });
    }

    if (matchingNodes.length === 0) return [];

    // One Dijkstra per start node, so the start set has to be bounded.
    // Rank exact name matches first, then the shortest names — a short
    // node name that contains the query term is the more specific
    // entity, a long one is usually an incidental substring hit.
    matchingNodes.sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      return a.node.name.length - b.node.name.length;
    });
    const startNodes = matchingNodes
      .slice(0, envInt("AGENTMEMORY_GRAPH_MAX_START_NODES", DEFAULT_MAX_START_NODES))
      .map((m) => m.node);

    const results: GraphRetrievalResult[] = [];
    const visitedObs = new Set<string>();

    for (const startNode of startNodes) {
      const paths = this.dijkstraTraversal(startNode, view, maxDepth);

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
    const view = await getGraphView(this.kv);

    // obsId -> node ids is maintained by the view, so this no longer
    // scans every node to find the handful that cite these chunks.
    const linkedNodes: GraphNode[] = [];
    const seenNodes = new Set<string>();
    for (const obsId of obsIds) {
      for (const nodeId of view.nodesByObservation.get(obsId) ?? []) {
        if (seenNodes.has(nodeId)) continue;
        seenNodes.add(nodeId);
        const node = view.nodes.get(nodeId);
        if (node) linkedNodes.push(node);
      }
    }

    const results: GraphRetrievalResult[] = [];
    const visitedObs = new Set<string>(obsIds);

    for (const node of linkedNodes) {
      const paths = this.dijkstraTraversal(node, view, maxDepth);
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
    const view = await getGraphView(this.kv);

    const wanted = entityName.toLowerCase();
    let entity: GraphNode | null = null;
    for (const node of view.nodes.values()) {
      if (node.name.toLowerCase() === wanted) {
        entity = node;
        break;
      }
    }
    if (!entity) return { entity: null, currentState: [], history: [] };

    // Incident edges come straight off the adjacency index instead of
    // filtering the whole edge scope.
    const relatedEdges: GraphEdge[] = [];
    for (const { edgeId } of view.adjacency.get(entity.id) ?? []) {
      const edge = view.edges.get(edgeId);
      if (edge) relatedEdges.push(edge);
    }

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

  // Weighted shortest-path traversal (#328). Replaces the prior BFS,
  // which fell back to edge-count order and ignored the 0.1-1.0 weight
  // attached to every graph edge. Dijkstra over `cost = 1/weight`
  // (cheaper edges = stronger relationships) returns the
  // highest-weighted path to each reachable node within maxDepth.
  //
  // The node index and adjacency map now come from the shared graph
  // view, so they are built once per process rather than once per
  // start node (the previous code rebuilt both from the full node and
  // edge arrays on every call).
  private dijkstraTraversal(
    startNode: GraphNode,
    view: GraphView,
    maxDepth: number,
  ): Array<Array<{ node: GraphNode; edge?: GraphEdge }>> {
    const maxVisited = envInt("AGENTMEMORY_GRAPH_MAX_VISITED", DEFAULT_MAX_VISITED);

    const dist = new Map<string, number>();
    const pathTo = new Map<string, Array<{ node: GraphNode; edge?: GraphEdge }>>();
    dist.set(startNode.id, 0);
    pathTo.set(startNode.id, [{ node: startNode }]);

    const heap = new MinHeap<{ nodeId: string; depth: number; cost: number }>(
      (a, b) => a.cost - b.cost,
    );
    heap.push({ nodeId: startNode.id, depth: 0, cost: 0 });

    let visited = 0;
    while (heap.size() > 0) {
      const { nodeId, depth, cost } = heap.pop()!;
      // Skip stale heap entries (cost beaten by a later push).
      if (cost > (dist.get(nodeId) ?? Infinity)) continue;
      if (depth >= maxDepth) continue;
      // A hub node on a large graph can reach much of the corpus even at
      // depth 2. Results past this point are weak paths the caller drops.
      if (++visited > maxVisited) break;

      const neighbors = view.adjacency.get(nodeId) ?? [];
      for (const { neighborId, edgeId } of neighbors) {
        const nextNode = view.nodes.get(neighborId);
        if (!nextNode) continue;
        const edge = view.edges.get(edgeId);
        if (!edge) continue;
        // Bound discovery, not just expansion. A single hub node can add
        // tens of thousands of neighbours in one iteration, all of which
        // would be returned and scored even though the loop stops
        // expanding them.
        if (!dist.has(neighborId) && pathTo.size >= maxVisited) continue;
        // Clamp weight to avoid division-by-zero on malformed edges;
        // 0.01 is below the documented 0.1 floor.
        const edgeCost = 1 / Math.max(edge.weight, 0.01);
        const newCost = cost + edgeCost;
        if (newCost < (dist.get(neighborId) ?? Infinity)) {
          dist.set(neighborId, newCost);
          pathTo.set(neighborId, [
            ...pathTo.get(nodeId)!,
            { node: nextNode, edge },
          ]);
          heap.push({ nodeId: neighborId, depth: depth + 1, cost: newCost });
        }
      }
    }

    // Drop the startNode's own entry before returning: callers
    // (searchByEntities, expandFromChunks) score start-node
    // observations via a dedicated fallback loop with score=1.0. If
    // we leave it in here, the start-path (length 1, no edges) goes
    // through the generic path-scoring loop first — pathLength=1 +
    // empty edgeWeights makes avgWeight fall to 0.5, the obs get
    // marked visited, and the score=1.0 fallback becomes dead code.
    pathTo.delete(startNode.id);
    return Array.from(pathTo.values());
  }
}

// Minimal binary min-heap. Pulled inline so graph-retrieval doesn't
// take a new dependency for the perf-critical inner loop of #328.
// Comparator returns negative when `a` should pop before `b`.
class MinHeap<T> {
  private heap: T[] = [];

  constructor(private compare: (a: T, b: T) => number) {}

  size(): number {
    return this.heap.length;
  }

  push(value: T): void {
    this.heap.push(value);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(this.heap[i], this.heap[parent]) < 0) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
