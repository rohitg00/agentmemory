import type { StateKV } from "../state/kv.js";
import { createGraphIndexReader, normalizeGraphIndexText } from "../state/graph-retrieval-index.js";
import type { GraphEdge, GraphNode } from "../types.js";

export async function readIndexedEntity(state: StateKV, name: string, includeAliases = true): Promise<{
  entity: GraphNode;
  relatedEdges: GraphEdge[];
  entityHistory: GraphEdge[];
  truncated: boolean;
} | { error: string }> {
  if (typeof name !== "string" || !name.trim()) return { error: "Entity name is required" };
  try {
    const reader = await createGraphIndexReader(state, { maxReads: 2048, maxBytes: 4 * 1024 * 1024 });
    if (!reader) return { error: "Graph index unavailable. Run agentmemory graph-index status; legacy stores require an explicit migration." };
    const normalized = normalizeGraphIndexText(name);
    const matches = await reader.posting("name", normalized, { limit: 64 });
    let entity: GraphNode | null = null;
    for (const id of matches.ids) {
      const node = await reader.getNode(id);
      if (node && !node.stale && (normalizeGraphIndexText(node.name) === normalized ||
        includeAliases && node.aliases?.some(alias => normalizeGraphIndexText(alias) === normalized))) {
        if (!entity || node.id < entity.id) entity = node;
      }
    }
    if (!entity) return { error: matches.cursor || reader.exhausted
      ? "Entity lookup exceeded the graph read budget" : `Entity "${name}" not found` };
    let truncated = !!matches.cursor || reader.status.incompleteRecords > 0;
    const readEdges = async (history: boolean) => {
      const edges = new Map<string, GraphEdge>();
      let cursor: string | undefined;
      do {
        const page = await reader.posting(history ? "history" : "adjacency", entity!.id, { cursor, limit: 64 });
        for (const id of page.ids) {
          const edge = history ? await reader.getHistoryEdge(id) : await reader.getEdge(id);
          if (!edge || edge.stale) continue;
          if (edge.sourceNodeId !== entity!.id && edge.targetNodeId !== entity!.id) continue;
          const other = edge.sourceNodeId === entity!.id ? edge.targetNodeId : edge.sourceNodeId;
          const neighbor = await reader.getNode(other);
          if (neighbor && !neighbor.stale) edges.set(id, edge);
        }
        cursor = page.cursor ?? undefined;
      } while (cursor && !reader.exhausted && edges.size < 512);
      if (cursor || reader.exhausted) truncated = true;
      return [...edges.values()];
    };
    const relatedEdges = await readEdges(false);
    const entityHistory = await readEdges(true);
    if (!await reader.finish()) return { error: "Graph changed during temporal lookup; retry the request" };
    return { entity, relatedEdges, entityHistory, truncated };
  } catch {
    return { error: "Graph index could not be read consistently. Run agentmemory graph-index status." };
  }
}
