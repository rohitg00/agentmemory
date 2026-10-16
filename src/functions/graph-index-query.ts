import type { StateKV } from "../state/kv.js";
import { createGraphIndexReader, normalizeGraphIndexText } from "../state/graph-retrieval-index.js";
import type { GraphEdge, GraphNode, GraphQueryResult } from "../types.js";

export interface IndexedGraphQuery {
  startNodeId?: string;
  nodeType?: string;
  maxDepth?: number;
  query?: string;
  limit?: number;
  offset?: number;
}

export async function queryGraphIndex(state: StateKV, data: IndexedGraphQuery): Promise<GraphQueryResult> {
  const integer = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  const limit = Math.max(1, Math.min(integer(data.limit, 500), 500));
  const offset = Math.max(0, integer(data.offset, 0));
  const maxDepth = Math.max(0, Math.min(integer(data.maxDepth, 3), 5));
  const empty = (warning: string): GraphQueryResult => ({
    nodes: [], edges: [], depth: 0, totalNodes: 0, totalEdges: 0,
    truncated: true, limit, offset, warning,
  });
  try {
    const reader = await createGraphIndexReader(state, { maxReads: 2048, maxBytes: 4 * 1024 * 1024 });
    if (!reader) return empty("Graph index is unavailable. Run agentmemory graph-index status; legacy stores require an explicit migration.");
    const nodes: GraphNode[] = [];
    const edges = new Map<string, GraphEdge>();
    let truncated = reader.status.incompleteRecords > 0;
    let fullyScanned = false;
    let depth = 0;
    const query = data.query ? normalizeGraphIndexText(data.query) : "";
    const matches = (node: GraphNode) => (!data.nodeType || node.type === data.nodeType) && (!query ||
      normalizeGraphIndexText(node.name).includes(query) ||
      Object.values(node.properties ?? {}).some(value => typeof value === "string" && normalizeGraphIndexText(value).includes(query)));

    if (data.startNodeId && !query) {
      const queue = [{ id: data.startNodeId, depth: 0 }];
      const queued = new Set([data.startNodeId]);
      const visited = new Set<string>();
      for (let head = 0; head < queue.length && !reader.exhausted; head++) {
        const item = queue[head]!;
        if (visited.has(item.id) || item.depth > maxDepth) continue;
        visited.add(item.id);
        const node = await reader.getNode(item.id);
        if (!node || node.stale) continue;
        depth = Math.max(depth, item.depth);
        if (matches(node)) nodes.push(node);
        let cursor: string | undefined;
        do {
          const page = await reader.posting("adjacency", item.id, { cursor, limit: 64 });
          for (const id of page.ids) {
            const edge = await reader.getEdge(id);
            if (!edge || edge.stale || edge.isLatest === false) continue;
            edges.set(edge.id, edge);
            const next = edge.sourceNodeId === item.id ? edge.targetNodeId : edge.sourceNodeId;
            if (item.depth < maxDepth && !queued.has(next)) {
              if (queue.length < 512) {
                queue.push({ id: next, depth: item.depth + 1 });
                queued.add(next);
              }
              else truncated = true;
            }
          }
          cursor = page.cursor ?? undefined;
        } while (cursor && !reader.exhausted);
        if (cursor) truncated = true;
      }
      fullyScanned = !reader.exhausted && !truncated;
    } else {
      let cursor: string | undefined;
      do {
        const page = await reader.posting(query ? "character" : "nodes", query ? Array.from(query)[0]! : "", { cursor, limit: 64 });
        for (const id of page.ids) {
          const node = await reader.getNode(id);
          if (node && !node.stale && matches(node)) nodes.push(node);
        }
        cursor = page.cursor ?? undefined;
        fullyScanned = !cursor && !reader.exhausted;
      } while (cursor && nodes.length < offset + limit && !reader.exhausted);
      if (cursor) truncated = true;
    }

    const pageNodes = nodes.slice(offset, offset + limit);
    const ids = new Set(pageNodes.map(node => node.id));
    if (!data.startNodeId || query) {
      for (const node of pageNodes) {
        let cursor: string | undefined;
        do {
          const page = await reader.posting("adjacency", node.id, { cursor, limit: 64 });
          for (const id of page.ids) {
            if (edges.has(id)) continue;
            const edge = await reader.getEdge(id);
            if (edge && !edge.stale && edge.isLatest !== false && ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId)) edges.set(id, edge);
          }
          cursor = page.cursor ?? undefined;
        } while (cursor && !reader.exhausted);
        if (cursor || reader.exhausted) { truncated = true; break; }
      }
    }
    if (!await reader.finish()) return empty("Graph changed during the query. Retry to read a consistent index revision.");
    const pageEdges = [...edges.values()].filter(edge => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId));
    const allNodes = !query && !data.startNodeId && !data.nodeType;
    truncated ||= reader.exhausted || !fullyScanned || nodes.length > pageNodes.length;
    return {
      nodes: pageNodes, edges: pageEdges, depth: data.startNodeId && !query ? maxDepth : depth,
      totalNodes: allNodes ? reader.status.nodes : nodes.length,
      totalEdges: allNodes ? reader.status.edges : pageEdges.length,
      truncated, limit, offset, fromSnapshot: false,
      ...(truncated ? { warning: "Graph response is bounded. Filtered counts describe examined records; some nodes, edges or oversized fields may be omitted." } : {}),
    };
  } catch {
    return empty("Graph index could not be read consistently. Run agentmemory graph-index status before retrying.");
  }
}
