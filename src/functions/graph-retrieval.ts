import type {
  GraphNode,
  GraphEdge,
  Session,
  CompressedObservation,
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

  /**
   * Resolve each result to the session whose KV namespace actually holds
   * its observation, so HybridSearch.enrichResults can load it via
   * KV.observations(sessionId) (#656).
   *
   * The node-provided `sessionId` is only a hint: a node accumulates
   * sourceObservationIds across many extracts/sessions but stores a single
   * (most-recent) session, and legacy pre-#656 nodes store none. So for
   * every result we VERIFY the obsId actually lives in the hinted session;
   * on a miss (wrong hint, empty hint, multi-session node) we fall back to
   * scanning known sessions. This makes the resolution authoritative
   * rather than trusting a hint that can be stale or shared.
   *
   * Cost: the common single-session node confirms in one lookup. Results
   * sharing an obsId are cached, so repeats are free. Only genuine misses
   * pay the per-session scan.
   */
  private async resolveSessionIds(
    results: GraphRetrievalResult[],
  ): Promise<void> {
    if (results.length === 0) return;

    // obsId -> owning sessionId, or null when no known session holds it
    // (so an unresolved obsId is scanned at most once, not per result).
    const resolved = new Map<string, string | null>();
    let sessions: Session[] | null = null; // lazily listed on first miss

    const probe = async (sessionId: string, obsId: string): Promise<boolean> => {
      const obs = await this.kv
        .get<CompressedObservation>(KV.observations(sessionId), obsId)
        .catch(() => null);
      return obs !== null;
    };

    for (const r of results) {
      if (resolved.has(r.obsId)) {
        r.sessionId = resolved.get(r.obsId) ?? "";
        continue;
      }

      // 1) Trust-but-verify the node's hint first (cheapest path).
      if (r.sessionId && (await probe(r.sessionId, r.obsId))) {
        resolved.set(r.obsId, r.sessionId);
        continue;
      }

      // 2) Hint was empty or wrong — scan known sessions for the obs.
      // Guard the list like probe() guards its get(): a KV failure here
      // should degrade to an unresolved sessionId ("") for this obs, not
      // abort the whole retrieval. Empty array also caches the miss below.
      if (sessions === null) {
        sessions = await this.kv
          .list<Session>(KV.sessions)
          .catch(() => [] as Session[]);
      }
      let found: string | null = null;
      for (const session of sessions) {
        if (session.id === r.sessionId) continue; // already probed above
        if (await probe(session.id, r.obsId)) {
          found = session.id;
          break;
        }
      }
      resolved.set(r.obsId, found);
      r.sessionId = found ?? "";
    }
  }

  async searchByEntities(
    entityNames: string[],
    maxDepth = 2,
    maxResults = 20,
  ): Promise<GraphRetrievalResult[]> {
    const allNodes = (await this.kv.list<GraphNode>(KV.graphNodes)).filter((n) => !n.stale);
    const allEdges = (await this.kv.list<GraphEdge>(KV.graphEdges)).filter((e) => !e.stale);

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
      const paths = this.dijkstraTraversal(
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
            sessionId: lastNode.sessionId ?? "",
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
          sessionId: startNode.sessionId ?? "",
          score: 1.0,
          graphContext: `[${startNode.type}] ${startNode.name}`,
          pathLength: 0,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, maxResults);
    // Resolve sessions only for the surviving top-K so verification/scan
    // work never runs for results that get trimmed away.
    await this.resolveSessionIds(top);
    return top;
  }

  async expandFromChunks(
    obsIds: string[],
    maxDepth = 1,
    maxResults = 10,
  ): Promise<GraphRetrievalResult[]> {
    const allNodes = (await this.kv.list<GraphNode>(KV.graphNodes)).filter((n) => !n.stale);
    const allEdges = (await this.kv.list<GraphEdge>(KV.graphEdges)).filter((e) => !e.stale);

    const linkedNodes = allNodes.filter((n) =>
      n.sourceObservationIds.some((id) => obsIds.includes(id)),
    );

    const results: GraphRetrievalResult[] = [];
    const visitedObs = new Set<string>(obsIds);

    for (const node of linkedNodes) {
      const paths = this.dijkstraTraversal(node, allNodes, allEdges, maxDepth);
      for (const path of paths) {
        const lastNode = path[path.length - 1].node;
        for (const obsId of lastNode.sourceObservationIds) {
          if (visitedObs.has(obsId)) continue;
          visitedObs.add(obsId);

          const pathLength = path.length;
          const score = 0.5 * (1 / (pathLength + 1));

          results.push({
            obsId,
            sessionId: lastNode.sessionId ?? "",
            score,
            graphContext: buildGraphContext(path),
            pathLength,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, maxResults);
    await this.resolveSessionIds(top);
    return top;
  }

  async temporalQuery(
    entityName: string,
    asOf?: string,
  ): Promise<{
    entity: GraphNode | null;
    currentState: GraphEdge[];
    history: GraphEdge[];
  }> {
    const allNodes = (await this.kv.list<GraphNode>(KV.graphNodes)).filter((n) => !n.stale);
    const allEdges = (await this.kv.list<GraphEdge>(KV.graphEdges)).filter((e) => !e.stale);

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

  // Weighted shortest-path traversal (#328). Replaces the prior BFS,
  // which fell back to edge-count order and ignored the 0.1-1.0 weight
  // attached to every graph edge. Dijkstra over `cost = 1/weight`
  // (cheaper edges = stronger relationships) returns the
  // highest-weighted path to each reachable node within maxDepth. Also
  // tightens the perf profile:
  //   - Adjacency built once in O(V+E) (previous BFS re-filtered
  //     allEdges per visited node, O(V·E) overall).
  //   - Min-heap dequeue is O(log V) per pop (previous queue.shift()
  //     was O(n) — the dominant cost on graphs above ~200 nodes per
  //     the contributor's benchmark in #328).
  private dijkstraTraversal(
    startNode: GraphNode,
    allNodes: GraphNode[],
    allEdges: GraphEdge[],
    maxDepth: number,
  ): Array<Array<{ node: GraphNode; edge?: GraphEdge }>> {
    const nodeIndex = new Map<string, GraphNode>();
    for (const n of allNodes) nodeIndex.set(n.id, n);

    const adjacency = new Map<string, Array<{ neighborId: string; edge: GraphEdge }>>();
    for (const edge of allEdges) {
      const a = edge.sourceNodeId;
      const b = edge.targetNodeId;
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a)!.push({ neighborId: b, edge });
      adjacency.get(b)!.push({ neighborId: a, edge });
    }

    const dist = new Map<string, number>();
    const pathTo = new Map<string, Array<{ node: GraphNode; edge?: GraphEdge }>>();
    dist.set(startNode.id, 0);
    pathTo.set(startNode.id, [{ node: startNode }]);

    const heap = new MinHeap<{ nodeId: string; depth: number; cost: number }>(
      (a, b) => a.cost - b.cost,
    );
    heap.push({ nodeId: startNode.id, depth: 0, cost: 0 });

    while (heap.size() > 0) {
      const { nodeId, depth, cost } = heap.pop()!;
      // Skip stale heap entries (cost beaten by a later push).
      if (cost > (dist.get(nodeId) ?? Infinity)) continue;
      if (depth >= maxDepth) continue;

      const neighbors = adjacency.get(nodeId) ?? [];
      for (const { neighborId, edge } of neighbors) {
        const nextNode = nodeIndex.get(neighborId);
        if (!nextNode) continue;
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
