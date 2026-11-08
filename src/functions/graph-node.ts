import type { StateKV } from "../state/kv.js";
import { createGraphIndexReader, getGraphIndexStatus } from "../state/graph-retrieval-index.js";
import { lookupObservationSession } from "../state/obs-index.js";
import { KV } from "../state/schema.js";
import type { CompressedObservation, GraphEdge, GraphNode, Memory, Session } from "../types.js";
import { getSearchIndex } from "./search.js";

const MAX_RELATIONS = 200;
const MAX_OBSERVATIONS = 40;
const MAX_MEMORIES = 25;

export type GraphNodeRelation = {
  edgeId: string;
  type: string;
  direction: "out" | "in";
  weight: number;
  observationCount: number;
  neighbor: { id: string; name: string; type: string } | null;
};

export type GraphNodeDetail = {
  node: GraphNode;
  degree: number;
  relations: GraphNodeRelation[] | null;
  relationsTotal: number;
  relationsTotalExact: boolean;
  relationsCursor: string | null;
  relationsTruncated: boolean;
  relationsWarning?: string;
  provenance: {
    truncated: boolean;
    observationIds: string[];
    observations: Array<{ id: string; sessionId: string; title?: string; type?: string; timestamp?: string }>;
    sessions: Array<{ id: string; project?: string; agentId?: string; status?: string; startedAt?: string }>;
    projects: string[];
    memories: Array<{ id: string; title?: string; type?: string; project?: string; via: "observation" | "name" }>;
    structural: { source: string; sourceFile?: string } | null;
  };
};

export type GraphNodeUnavailable = { graphIndex: { status: string }; error: string };

function matchesName(values: string[] | undefined, name: string): boolean {
  const lower = name.toLowerCase();
  return (values ?? []).some((value) => {
    const text = String(value).toLowerCase();
    return text === lower || text.endsWith("/" + lower) || lower.endsWith("/" + text);
  });
}

export async function describeGraphNode(
  kv: StateKV,
  nodeId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<GraphNodeDetail | GraphNodeUnavailable | null> {
  const reader = await createGraphIndexReader(kv);
  if (!reader) return { graphIndex: (await getGraphIndexStatus(kv)) ?? { status: "needs-migration" }, error: "Graph index is unavailable; run agentmemory graph-index status." };
  const node = await reader.getNode(nodeId);
  if (!node || node.stale) return null;
  const limit = Math.max(1, Math.min(MAX_RELATIONS, options.limit ?? MAX_RELATIONS));
  const page = await reader.posting("adjacency", nodeId, { cursor: options.cursor, limit });
  const edges: GraphEdge[] = [];
  for (const id of page.ids) {
    const edge = await reader.getEdge(id);
    if (edge && !edge.stale && edge.isLatest !== false && (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId)) edges.push(edge);
  }
  edges.sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const relations: GraphNodeRelation[] = [];
  const sourceIds = new Set(node.sourceObservationIds ?? []);
  for (const edge of edges) {
    const out = edge.sourceNodeId === nodeId;
    const neighbor = await reader.getNode(out ? edge.targetNodeId : edge.sourceNodeId);
    if (!neighbor || neighbor.stale) continue;
    for (const id of edge.sourceObservationIds ?? []) {
      if (sourceIds.size >= MAX_OBSERVATIONS) break;
      sourceIds.add(id);
    }
    relations.push({ edgeId: edge.id, type: edge.type, direction: out ? "out" : "in", weight: edge.weight,
      observationCount: edge.sourceObservationIds?.length ?? 0,
      neighbor: { id: neighbor.id, name: neighbor.name, type: neighbor.type } });
  }

  const index = getSearchIndex();
  const observationIds: string[] = [];
  const observations: GraphNodeDetail["provenance"]["observations"] = [];
  const sessionIds = new Set<string>();
  const memories: GraphNodeDetail["provenance"]["memories"] = [];
  const read = reader.read.bind(reader);
  for (const id of [...sourceIds].slice(0, MAX_OBSERVATIONS)) {
    const layer = index.layerOf(id);
    if (layer === "lesson" || layer === "insight") continue;
    if (layer !== "memory") {
      const sessionId = index.sessionOf(id) ?? await lookupObservationSession({ get: read } as StateKV, id);
      if (sessionId) {
        const obs = await read<CompressedObservation>(KV.observations(sessionId), id);
        if (obs?.id === id && obs.sessionId === sessionId) {
          observationIds.push(id);
          sessionIds.add(sessionId);
          observations.push({ id, sessionId, title: obs.title, type: obs.type, timestamp: obs.timestamp });
          continue;
        }
        if (layer === "observation") continue;
      }
    }
    const memory = await read<Memory>(KV.memories, id);
    if (memory?.isLatest !== false && memory?.id === id) {
      observationIds.push(id);
      memories.push({ id, title: memory.title, type: memory.type, project: memory.project, via: "observation" });
    }
  }
  if ((node.sourceObservationIds?.length ?? 0) > 0 && !observationIds.some((id) => node.sourceObservationIds.includes(id))) {
    if (node.sourceObservationIds.length > MAX_OBSERVATIONS || reader.exhausted || node.indexIncomplete) {
      return { graphIndex: { status: "partial" }, error: "Node provenance could not be verified within the read budget." };
    }
    return null;
  }
  const sessions: GraphNodeDetail["provenance"]["sessions"] = [];
  for (const id of sessionIds) {
    const session = await reader.read<Session>(KV.sessions, id);
    if (session) sessions.push({ id, project: session.project, agentId: session.agentId, status: session.status, startedAt: session.startedAt });
  }
  const projects = [...new Set(sessions.map((session) => session.project).filter((project): project is string => !!project))].sort();
  const sourceSet = new Set(observationIds);
  const basename = node.name.split(/[\/\\]/).filter(Boolean).at(-1) ?? node.name;
  for (const hit of index.search(`${node.name} ${basename.replace(/\.[^.]+$/, "")}`, MAX_MEMORIES, "memory")) {
    if (memories.some((memory) => memory.id === hit.obsId)) continue;
    const memory = await reader.read<Memory>(KV.memories, hit.obsId);
    if (!memory || memory.isLatest === false) continue;
    const viaObservation = (memory.sourceObservationIds ?? []).some((id) => sourceSet.has(id));
    if (!viaObservation && !matchesName(memory.concepts, node.name) && !matchesName(memory.files, node.name)) continue;
    memories.push({ id: memory.id, title: memory.title, type: memory.type, project: memory.project, via: viaObservation ? "observation" : "name" });
    if (memories.length >= MAX_MEMORIES) break;
  }
  const props = node.properties ?? {};
  const structural = typeof props.source === "string"
    ? { source: props.source, ...(typeof props.sourceFile === "string" ? { sourceFile: props.sourceFile } : {}) } : null;
  const truncated = Boolean(page.cursor || options.cursor || reader.exhausted || node.indexIncomplete);
  if (!await reader.finish()) return { graphIndex: { status: "changed" }, error: "Graph changed during retrieval; retry the request." };
  return {
    node: { ...node, sourceObservationIds: observationIds.filter((id) => node.sourceObservationIds.includes(id)) },
    degree: page.total, relations, relationsTotal: truncated ? page.total : relations.length,
    relationsTotalExact: !truncated, relationsCursor: page.cursor, relationsTruncated: truncated,
    ...(truncated ? { relationsWarning: "Relations are a bounded page; counts include unfiltered adjacency entries when truncated." } : {}),
    provenance: { truncated: true, observationIds, observations, sessions, projects, memories, structural },
  };
}
