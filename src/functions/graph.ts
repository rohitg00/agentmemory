import type { ISdk } from "iii-sdk";
import type {
  GraphNode,
  GraphEdge,
  GraphQueryResult,
  GraphSnapshot,
  CompressedObservation,
  MemoryProvider,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import {
  GraphIndexReader,
  graphIndexReadiness,
  initializeGraphIndexes,
  indexGraphEdgeOrInvalidate,
  indexGraphNodeOrInvalidate,
  markGraphIndexesUnavailable,
  readIndexedGraph,
  resetGraphIndexes,
  withFailClosedGraphMutation,
  withGraphIndexMutation,
} from "../state/graph-indexes.js";
import {
  GRAPH_EXTRACTION_SYSTEM,
  buildGraphExtractionPrompt,
} from "../prompts/graph-extraction.js";
import { isGraphExtractionEnabled } from "../config.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";

// #753: keep the response payload below the iii state channel ceiling.
// 500 nodes + their incident edges hold well under the limit on the
// reported 11k-node / 28k-edge corpus, and 5,000 is the upper bound a
// caller can request explicitly. Tuned conservatively because edges
// fan out faster than nodes.
const DEFAULT_GRAPH_QUERY_LIMIT = 500;
const MAX_GRAPH_QUERY_LIMIT = 5000;

// #814: the precomputed snapshot covers the top-degree subgraph used by
// the empty-body / nodeType-only branch — the path the viewer hits on
// tab load. Sized to match the default query limit so the snapshot can
// service a default-cap request without falling back to live
// enumeration. Aggregate stats (nodesByType / edgesByType) are computed
// fresh during rebuild and stored alongside.
const SNAPSHOT_TOP_NODES = DEFAULT_GRAPH_QUERY_LIMIT;
const SNAPSHOT_KEY = "current";

async function readSnapshot(kv: StateKV): Promise<GraphSnapshot | null> {
  try {
    const snap = await kv.get<GraphSnapshot>(KV.graphSnapshot, SNAPSHOT_KEY);
    if (snap && typeof snap === "object" && snap.version === 1) {
      return snap;
    }
    return null;
  } catch (err) {
    logger.warn("Graph snapshot read failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function buildSnapshotFromArrays(
  nodes: GraphNode[],
  edges: GraphEdge[],
  indexGeneration: string,
  resetAt?: string,
): GraphSnapshot {
  const liveNodes = nodes.filter((n) => !n.stale);
  const liveEdges = edges.filter((e) => !e.stale);
  // Build the global degree map once so we can both rank by it AND
  // snapshot the per-top-node values into topDegrees for synchronous
  // re-sort after incremental edge writes.
  const degree = new Map<string, number>();
  for (const e of liveEdges) {
    degree.set(e.sourceNodeId, (degree.get(e.sourceNodeId) ?? 0) + 1);
    degree.set(e.targetNodeId, (degree.get(e.targetNodeId) ?? 0) + 1);
  }
  const ranked = [...liveNodes]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, SNAPSHOT_TOP_NODES);
  const rankedIds = new Set(ranked.map((n) => n.id));
  const topEdges = liveEdges.filter(
    (e) => rankedIds.has(e.sourceNodeId) && rankedIds.has(e.targetNodeId),
  );
  const topDegrees: Record<string, number> = {};
  for (const n of ranked) {
    topDegrees[n.id] = degree.get(n.id) ?? 0;
  }
  const nodesByType: Record<string, number> = {};
  for (const n of liveNodes) {
    nodesByType[n.type] = (nodesByType[n.type] || 0) + 1;
  }
  const edgesByType: Record<string, number> = {};
  for (const e of liveEdges) {
    edgesByType[e.type] = (edgesByType[e.type] || 0) + 1;
  }
  return {
    version: 1,
    topNodes: ranked,
    topEdges,
    topDegrees,
    stats: {
      totalNodes: liveNodes.length,
      totalEdges: liveEdges.length,
      nodesByType,
      edgesByType,
    },
    updatedAt: new Date().toISOString(),
    dirty: false,
    indexGeneration,
    ...(resetAt ? { resetAt } : {}),
  };
}

function paginateFromSnapshot(
  snap: GraphSnapshot,
  filterType: string | undefined,
  limit: number,
  offset: number,
): GraphQueryResult {
  const filteredNodes = filterType
    ? snap.topNodes.filter((n) => n.type === filterType)
    : snap.topNodes;
  const total = filterType
    ? snap.stats.nodesByType[filterType] ?? 0
    : snap.stats.totalNodes;
  const pageNodes = filteredNodes.slice(offset, offset + limit);
  const pageIds = new Set(pageNodes.map((n) => n.id));
  const pageEdges = snap.topEdges.filter(
    (e) => pageIds.has(e.sourceNodeId) && pageIds.has(e.targetNodeId),
  );
  return {
    nodes: pageNodes,
    edges: pageEdges,
    depth: 0,
    totalNodes: total,
    totalEdges: snap.stats.totalEdges,
    truncated: total > pageNodes.length,
    limit,
    offset,
    fromSnapshot: true,
  };
}

// Bounds the index-served BFS in mem::graph-query so a dense corpus
// can't expand into an unbounded number of targeted gets. Hitting the
// cap returns a truncated page with an explanatory warning.
const TRAVERSAL_VISIT_CAP = 5000;
const GRAPH_QUERY_EDGE_CAP = 5000;

async function queryViaIndexes(
  reader: GraphIndexReader,
  snapshot: GraphSnapshot | null,
  query: string,
  limit: number,
  offset: number,
): Promise<GraphQueryResult> {
  const lower = query.toLowerCase();
  const catalog = await reader.getNameCatalog();
  const candidateIds: string[] = [];
  const seenIds = new Set<string>();
  for (const entry of catalog) {
    if (!entry.name.toLowerCase().includes(lower)) continue;
    seenIds.add(entry.id);
    candidateIds.push(entry.id);
  }

  for (const node of snapshot?.topNodes ?? []) {
    if (node.stale || seenIds.has(node.id)) continue;
    const propertyMatch = Object.values(node.properties).some(
      (value) =>
        typeof value === "string" && value.toLowerCase().includes(lower),
    );
    if (propertyMatch) {
      seenIds.add(node.id);
      candidateIds.push(node.id);
    }
  }

  const pageIds = candidateIds.slice(offset, offset + limit);
  const nodes: GraphNode[] = [];
  for (const nodeId of pageIds) {
    const node = await reader.getNode(nodeId);
    if (node) nodes.push(node);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set<string>();
  const edges: GraphEdge[] = [];
  let edgeCapped = false;
  for (const node of nodes) {
    const remaining = GRAPH_QUERY_EDGE_CAP - edgeIds.size;
    if (remaining <= 0) {
      edgeCapped = true;
      break;
    }
    const incident = await reader.getIncidentEdges(node.id, remaining);
    if (incident.length === remaining) edgeCapped = true;
    for (const edge of incident) {
      if (edgeIds.has(edge.id)) continue;
      edgeIds.add(edge.id);
      if (
        nodeIds.has(edge.sourceNodeId) &&
        nodeIds.has(edge.targetNodeId)
      ) {
        edges.push(edge);
      }
    }
  }

  const warnings: string[] = [];
  if (!snapshot || snapshot.stats.totalNodes > snapshot.topNodes.length) {
    warnings.push(
      "Property-value matches are limited to the top-degree snapshot; " +
        "all nodes are still matched by name.",
    );
  }
  if (edgeCapped) {
    warnings.push(
      `Incident-edge reads were capped at ${GRAPH_QUERY_EDGE_CAP} records.`,
    );
  }
  if (nodes.length < pageIds.length) {
    warnings.push(
      "One or more catalog candidates were stale or missing; totals are " +
        "candidate-count estimates.",
    );
  }
  if (
    offset > 0 ||
    pageIds.length < candidateIds.length ||
    nodes.length < pageIds.length ||
    edgeCapped
  ) {
    warnings.push(
      "totalEdges is bounded to edges whose endpoints are both in the " +
        "returned page.",
    );
  }
  return {
    nodes,
    edges,
    depth: 0,
    totalNodes: candidateIds.length,
    totalEdges: edges.length,
    truncated: candidateIds.length > offset + nodes.length || edgeCapped,
    limit,
    offset,
    ...(warnings.length ? { warning: warnings.join(" ") } : {}),
  };
}

async function traverseViaIndexes(
  reader: GraphIndexReader,
  startNodeId: string,
  nodeType: string | undefined,
  maxDepth: number,
  limit: number,
  offset: number,
): Promise<GraphQueryResult> {
  const visited = new Set<string>();
  const visitedEdges = new Set<string>();
  const resultNodes: GraphNode[] = [];
  const resultEdges: GraphEdge[] = [];
  const queue: Array<{ nodeId: string; depth: number }> = [
    { nodeId: startNodeId, depth: 0 },
  ];
  const enqueued = new Set([startNodeId]);
  let capped = false;

  traversal:
  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;
    if (visited.has(nodeId) || depth > maxDepth) continue;
    if (visited.size >= TRAVERSAL_VISIT_CAP) {
      capped = true;
      break;
    }
    visited.add(nodeId);

    const node = await reader.getNode(nodeId);
    if (node && (!nodeType || node.type === nodeType)) {
      resultNodes.push(node);
    }

    const remainingEdges = GRAPH_QUERY_EDGE_CAP - visitedEdges.size;
    if (remainingEdges <= 0) {
      capped = true;
      break;
    }
    const incident = await reader.getIncidentEdges(nodeId, remainingEdges);
    if (incident.length === remainingEdges) capped = true;
    for (const edge of incident) {
      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        resultEdges.push(edge);
      }
      const nextId =
        edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
      if (!enqueued.has(nextId)) {
        if (enqueued.size >= TRAVERSAL_VISIT_CAP) {
          capped = true;
          break traversal;
        }
        enqueued.add(nextId);
        queue.push({ nodeId: nextId, depth: depth + 1 });
      }
    }
    if (capped && visitedEdges.size >= GRAPH_QUERY_EDGE_CAP) break;
  }

  const result = paginate(resultNodes, resultEdges, maxDepth, limit, offset);
  if (capped) {
    return {
      ...result,
      truncated: true,
      warning:
        `Traversal stopped at the ${TRAVERSAL_VISIT_CAP}-node or ` +
        `${GRAPH_QUERY_EDGE_CAP}-edge safety cap. Lower maxDepth or start ` +
        `from a lower-degree node for a complete walk.`,
    };
  }
  return result;
}

function nameIndexKey(type: string, name: string): string {
  return `${type}|${name}`;
}

function edgeIndexKey(
  sourceNodeId: string,
  targetNodeId: string,
  type: string,
): string {
  return `${sourceNodeId}|${targetNodeId}|${type}`;
}

// Mutates `snap` to apply a +1 (or -1) degree delta for nodeId,
// maintaining the top-N ranking. Returns the new degree. Reads /
// writes the per-node degree counter via targeted kv.get/set so we
// never enumerate. Top-N membership flips when:
//   - node's new degree > current min in topNodes AND it's not in
//     topNodes (promote, evict tail if topNodes is full)
//   - node IS in topNodes and its position needs resorting (re-sort
//     topNodes in place)
async function applyDegreeDelta(
  kv: StateKV,
  snap: GraphSnapshot,
  nodeId: string,
  delta: number,
): Promise<number> {
  const prev = (await kv.get<number>(KV.graphNodeDegree, nodeId)) ?? 0;
  const next = Math.max(0, prev + delta);
  await kv.set(KV.graphNodeDegree, nodeId, next);

  const inTop = snap.topNodes.findIndex((n) => n.id === nodeId);
  if (inTop !== -1) {
    // Cache the new degree in topDegrees so the comparator runs
    // synchronously over numbers, not async kv.get calls. Re-sort
    // descending by degree.
    snap.topDegrees[nodeId] = next;
    snap.topNodes.sort(
      (a, b) =>
        (snap.topDegrees[b.id] ?? 0) - (snap.topDegrees[a.id] ?? 0),
    );
    return next;
  }

  if (snap.topNodes.length < SNAPSHOT_TOP_NODES) {
    // Capacity available — fetch + promote.
    const node = await kv.get<GraphNode>(KV.graphNodes, nodeId);
    if (node && !node.stale) {
      snap.topNodes.push(node);
      snap.topDegrees[node.id] = next;
      snap.topNodes.sort(
        (a, b) =>
          (snap.topDegrees[b.id] ?? 0) - (snap.topDegrees[a.id] ?? 0),
      );
    }
    return next;
  }

  // topNodes is full; the cutoff is the tail's cached degree.
  const tailEntry = snap.topNodes[snap.topNodes.length - 1];
  if (!tailEntry) return next;
  const tailDegree = snap.topDegrees[tailEntry.id] ?? 0;
  if (next > tailDegree) {
    const node = await kv.get<GraphNode>(KV.graphNodes, nodeId);
    if (node && !node.stale) {
      const evicted = snap.topNodes.pop();
      if (evicted) delete snap.topDegrees[evicted.id];
      snap.topNodes.push(node);
      snap.topDegrees[node.id] = next;
      snap.topNodes.sort(
        (a, b) =>
          (snap.topDegrees[b.id] ?? 0) - (snap.topDegrees[a.id] ?? 0),
      );
    }
  }
  return next;
}

function snapshotPushEdgeIfBothInTop(
  snap: GraphSnapshot,
  edge: GraphEdge,
): void {
  const topIds = new Set(snap.topNodes.map((n) => n.id));
  if (topIds.has(edge.sourceNodeId) && topIds.has(edge.targetNodeId)) {
    // Dedupe in case the same edge gets pushed twice.
    if (!snap.topEdges.find((e) => e.id === edge.id)) {
      snap.topEdges.push(edge);
    }
  }
}

function mergeNode(
  existing: GraphNode,
  incoming: GraphNode,
  obsIds: string[],
  capturedAt: string,
): GraphNode {
  return {
    ...existing,
    sourceObservationIds: [
      ...new Set([
        ...existing.sourceObservationIds,
        ...incoming.sourceObservationIds,
        ...obsIds,
      ]),
    ],
    properties: { ...existing.properties, ...incoming.properties },
    updatedAt: capturedAt,
  };
}

function mergeEdge(
  existing: GraphEdge,
  obsIds: string[],
): GraphEdge {
  return {
    ...existing,
    sourceObservationIds: [
      ...new Set([...existing.sourceObservationIds, ...obsIds]),
    ],
  };
}

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

const HEURISTIC_EDGE_WEIGHT = 0.4;
const MAX_HEURISTIC_EDGES_PER_OBS = 12;

export function extractGraphHeuristics(
  observations: CompressedObservation[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const now = new Date().toISOString();
  const nodes: GraphNode[] = [];
  const nodeByKey = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeByPair = new Map<string, GraphEdge>();

  const nodeFor = (
    type: GraphNode["type"],
    name: string,
    obsId: string,
  ): GraphNode | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const key = `${type}\0${trimmed.toLowerCase()}`;
    let node = nodeByKey.get(key);
    if (!node) {
      node = {
        id: generateId("gn"),
        type,
        name: trimmed,
        properties: {},
        sourceObservationIds: [obsId],
        createdAt: now,
      };
      nodeByKey.set(key, node);
      nodes.push(node);
    } else if (!node.sourceObservationIds.includes(obsId)) {
      node.sourceObservationIds.push(obsId);
    }
    return node;
  };

  for (const obs of observations) {
    let budget = MAX_HEURISTIC_EDGES_PER_OBS;
    const link = (a: GraphNode | null, b: GraphNode | null): void => {
      if (!a || !b || a.id === b.id) return;
      const pair = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      const existing = edgeByPair.get(pair);
      if (existing) {
        if (!existing.sourceObservationIds.includes(obs.id)) {
          existing.sourceObservationIds.push(obs.id);
        }
        return;
      }
      if (budget <= 0) return;
      budget -= 1;
      const edge: GraphEdge = {
        id: generateId("ge"),
        type: "related_to",
        sourceNodeId: a.id,
        targetNodeId: b.id,
        weight: HEURISTIC_EDGE_WEIGHT,
        sourceObservationIds: [obs.id],
        createdAt: now,
      };
      edgeByPair.set(pair, edge);
      edges.push(edge);
    };

    const fileNodes = (obs.files ?? []).map((f) =>
      nodeFor("file", f, obs.id),
    );
    const conceptNodes = (obs.concepts ?? []).map((c) =>
      nodeFor("concept", c, obs.id),
    );

    for (const concept of conceptNodes) {
      for (const file of fileNodes) link(concept, file);
    }
    for (let i = 0; i + 1 < conceptNodes.length; i++) {
      link(conceptNodes[i], conceptNodes[i + 1]);
    }
    for (let i = 0; i + 1 < fileNodes.length; i++) {
      link(fileNodes[i], fileNodes[i + 1]);
    }
  }

  return { nodes, edges };
}

// Shared persistence for a batch of extracted/imported nodes and edges.
// Factored out of mem::graph-extract so structural importers (graphify)
// reuse the exact same name-index upsert, degree bookkeeping, and snapshot
// maintenance — which also makes re-imports idempotent: an existing
// (type, name) resolves through the name index and merges instead of
// duplicating.
//
// #814 v2: targeted name-index lookups replace the O(n) scan over
// `kv.list<GraphNode>(KV.graphNodes)`. At 75K nodes the list payload
// exceeds the iii heartbeat budget and the worker dies before merge can
// complete. Each name-index entry is a single small kv.get/set pair.
async function persistGraphDeltaUnlocked(
  kv: StateKV,
  nodes: GraphNode[],
  edges: GraphEdge[],
  obsIds: string[],
): Promise<{ newNodeCount: number; newEdgeCount: number }> {
  const readiness = await initializeGraphIndexes(kv);
  if (!readiness.ready || !readiness.generation) {
    throw new Error(
      readiness.reason ??
        "Graph writes require generation-matched read indexes. Run graph reset before extracting or importing new graph data.",
    );
  }
  const snap = await readSnapshot(kv);
  if (!snap || snap.indexGeneration !== readiness.generation) {
    throw new Error(
      "Graph writes require a snapshot matched to the active index generation.",
    );
  }
  const reader = await GraphIndexReader.open(kv, readiness.generation);
  if (!reader) throw new Error("Graph read indexes became unavailable.");
  const indexedNodeIds = new Set(
    (await reader.getNameCatalog()).map((entry) => entry.id),
  );
  const capturedAt = new Date().toISOString();
  let newNodeCount = 0;
  let newEdgeCount = 0;
  // Merge-only batches mutate cached topNodes/topEdges entries without
  // changing the counts; track that separately so the snapshot still persists.
  let snapMutated = false;
  const newEdgesForTopCheck: GraphEdge[] = [];
  // When a freshly-minted node merges into an existing row via the name
  // index, edges in the same batch still reference the fresh id. Remap edge
  // endpoints to the persisted ids so edges never dangle and re-runs hit the
  // same edge-index key instead of duplicating.
  const idRemap = new Map<string, string>();
  const activeEdgeIds = new Set<string>();

  for (const node of nodes) {
    const indexKey = nameIndexKey(node.type, node.name);
    const existingId = await kv.get<string>(KV.graphNameIndex, indexKey);

    let existing: GraphNode | null = null;
    if (existingId) {
      existing = await kv.get<GraphNode>(KV.graphNodes, existingId);
      // #825 follow-up: name-index lookups can resolve into
      // pre-reset rows. Drop them so extract writes a fresh
      // node + index entry instead of silently reconnecting
      // to a legacy orphan (which would keep the snapshot at
      // 0 forever after a reset).
      if (
        existing &&
        (existing.type !== node.type || existing.name !== node.name)
      ) {
        existing = null;
      }
      if (existing && !indexedNodeIds.has(existing.id)) {
        existing = null;
      }
    }

    if (existing) {
      idRemap.set(node.id, existing.id);
      const merged = mergeNode(existing, node, obsIds, capturedAt);
      await kv.set(KV.graphNodes, existing.id, merged);
      await indexGraphNodeOrInvalidate(kv, merged, readiness.generation);
      indexedNodeIds.add(existing.id);
      // Update topNodes entry if present so a stale clone isn't
      // returned from the snapshot fast path.
      const topIdx = snap.topNodes.findIndex((n) => n.id === existing!.id);
      if (topIdx !== -1) {
        snap.topNodes[topIdx] = merged;
        snapMutated = true;
      }
    } else {
      await kv.set(KV.graphNodes, node.id, node);
      await kv.set(KV.graphNameIndex, indexKey, node.id);
      await kv.set(KV.graphNodeDegree, node.id, 0);
      await indexGraphNodeOrInvalidate(kv, node, readiness.generation);
      indexedNodeIds.add(node.id);
      snap.stats.totalNodes += 1;
      snap.stats.nodesByType[node.type] =
        (snap.stats.nodesByType[node.type] ?? 0) + 1;
      newNodeCount += 1;
      if (snap.topNodes.length < SNAPSHOT_TOP_NODES) {
        // Degree 0 still beats an empty slot — sit at the tail
        // until edges arrive and promote.
        snap.topNodes.push(node);
        snap.topDegrees[node.id] = 0;
      }
    }
  }

  for (const rawEdge of edges) {
    const edge: GraphEdge = {
      ...rawEdge,
      sourceNodeId: idRemap.get(rawEdge.sourceNodeId) ?? rawEdge.sourceNodeId,
      targetNodeId: idRemap.get(rawEdge.targetNodeId) ?? rawEdge.targetNodeId,
    };
    const eKey = edgeIndexKey(edge.sourceNodeId, edge.targetNodeId, edge.type);
    const existingId = await kv.get<string>(KV.graphEdgeKey, eKey);

    let existing: GraphEdge | null = null;
    if (existingId) {
      existing = await kv.get<GraphEdge>(KV.graphEdges, existingId);
      // Same #825 orphan check as the node path above.
      if (
        existing &&
        (existing.sourceNodeId !== edge.sourceNodeId ||
          existing.targetNodeId !== edge.targetNodeId ||
          existing.type !== edge.type)
      ) {
        existing = null;
      }
      if (existing && !activeEdgeIds.has(existing.id)) {
        const indexedEdges = await reader.getIncidentEdges(
          existing.sourceNodeId,
        );
        if (!indexedEdges.some((candidate) => candidate.id === existing!.id)) {
          existing = null;
        }
      }
    }

    if (existing) {
      const merged = mergeEdge(existing, obsIds);
      await kv.set(KV.graphEdges, existing.id, merged);
      await indexGraphEdgeOrInvalidate(kv, merged, readiness.generation);
      activeEdgeIds.add(existing.id);
      // Replace cached topEdges entry too if present.
      const topIdx = snap.topEdges.findIndex((e) => e.id === existing!.id);
      if (topIdx !== -1) {
        snap.topEdges[topIdx] = merged;
        snapMutated = true;
      }
    } else {
      await kv.set(KV.graphEdges, edge.id, edge);
      await kv.set(KV.graphEdgeKey, eKey, edge.id);
      await indexGraphEdgeOrInvalidate(kv, edge, readiness.generation);
      activeEdgeIds.add(edge.id);
      snap.stats.totalEdges += 1;
      snap.stats.edgesByType[edge.type] =
        (snap.stats.edgesByType[edge.type] ?? 0) + 1;
      newEdgeCount += 1;
      await applyDegreeDelta(kv, snap, edge.sourceNodeId, +1);
      await applyDegreeDelta(kv, snap, edge.targetNodeId, +1);
      newEdgesForTopCheck.push(edge);
    }
  }

  // Push newly-added edges into snapshot.topEdges if both
  // endpoints are in the top-N (post-degree-delta). Done after
  // all degree updates so the topIds set is stable.
  for (const edge of newEdgesForTopCheck) {
    snapshotPushEdgeIfBothInTop(snap, edge);
  }

  if (newNodeCount > 0 || newEdgeCount > 0 || snapMutated) {
    const current = await graphIndexReadiness(kv);
    if (!current.ready || current.generation !== readiness.generation) {
      throw new Error("Graph index generation changed during persistence.");
    }
    snap.updatedAt = capturedAt;
    snap.dirty = false;
    await kv.set(KV.graphSnapshot, SNAPSHOT_KEY, snap);
  }

  return { newNodeCount, newEdgeCount };
}

export async function persistGraphDelta(
  kv: StateKV,
  nodes: GraphNode[],
  edges: GraphEdge[],
  obsIds: string[],
): Promise<{ newNodeCount: number; newEdgeCount: number }> {
  return withFailClosedGraphMutation(kv, "graph persistence", () =>
    persistGraphDeltaUnlocked(kv, nodes, edges, obsIds),
  );
}

async function rebuildGraphSnapshotFromIndexesInMutation(
  kv: StateKV,
  expectedGeneration: string,
): Promise<GraphSnapshot> {
  const readiness = await graphIndexReadiness(kv);
  if (
    !readiness.ready ||
    !readiness.generation ||
    readiness.generation !== expectedGeneration
  ) {
    throw new Error(
      "Graph snapshot rebuild requires generation-matched read indexes.",
    );
  }
  const indexed = await readIndexedGraph(kv);
  if (!indexed) {
    throw new Error("Graph read indexes became unavailable during rebuild.");
  }
  const current = await graphIndexReadiness(kv);
  if (!current.ready || current.generation !== expectedGeneration) {
    throw new Error("Graph index generation changed during snapshot rebuild.");
  }

  const degrees = new Map(indexed.nodes.map((node) => [node.id, 0]));
  const latestEdges = new Map<string, GraphEdge>();
  for (const edge of indexed.edges) {
    degrees.set(edge.sourceNodeId, (degrees.get(edge.sourceNodeId) ?? 0) + 1);
    degrees.set(edge.targetNodeId, (degrees.get(edge.targetNodeId) ?? 0) + 1);
    const key = edgeIndexKey(edge.sourceNodeId, edge.targetNodeId, edge.type);
    const previous = latestEdges.get(key);
    const edgeTime = new Date(edge.tcommit ?? edge.createdAt).getTime();
    const previousTime = previous
      ? new Date(previous.tcommit ?? previous.createdAt).getTime()
      : -Infinity;
    const edgeIsLatest = edge.isLatest !== false;
    const previousIsLatest = previous?.isLatest !== false;
    if (
      !previous ||
      (edgeIsLatest && !previousIsLatest) ||
      (edgeIsLatest === previousIsLatest && edgeTime > previousTime)
    ) {
      latestEdges.set(key, edge);
    }
  }
  for (const node of indexed.nodes) {
    await kv.set(KV.graphNameIndex, nameIndexKey(node.type, node.name), node.id);
    await kv.set(KV.graphNodeDegree, node.id, degrees.get(node.id) ?? 0);
  }
  for (const [key, edge] of latestEdges) {
    await kv.set(KV.graphEdgeKey, key, edge.id);
  }

  const snapshot = buildSnapshotFromArrays(
    indexed.nodes,
    indexed.edges,
    expectedGeneration,
    readiness.resetAt,
  );
  const beforeWrite = await graphIndexReadiness(kv);
  if (!beforeWrite.ready || beforeWrite.generation !== expectedGeneration) {
    throw new Error("Graph index generation changed during snapshot rebuild.");
  }
  await kv.set(KV.graphSnapshot, SNAPSHOT_KEY, snapshot);
  return snapshot;
}

export async function rebuildGraphSnapshotOrInvalidateInMutation(
  kv: StateKV,
  expectedGeneration: string,
): Promise<GraphSnapshot> {
  try {
    return await rebuildGraphSnapshotFromIndexesInMutation(
      kv,
      expectedGeneration,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markGraphIndexesUnavailable(
      kv,
      `graph snapshot rebuild failed after a graph mutation: ${message}`,
      expectedGeneration,
    ).catch(() => {});
    throw error;
  }
}

export async function rebuildGraphSnapshotFromIndexes(
  kv: StateKV,
): Promise<GraphSnapshot> {
  return withGraphIndexMutation(async () => {
    const readiness = await graphIndexReadiness(kv);
    if (!readiness.ready || !readiness.generation) {
      throw new Error(
        "Graph snapshot rebuild requires generation-matched read indexes.",
      );
    }
    return rebuildGraphSnapshotOrInvalidateInMutation(
      kv,
      readiness.generation,
    );
  });
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

      const obsIds = data.observations.map((o) => o.id);

      let nodes: GraphNode[] = [];
      let edges: GraphEdge[] = [];
      try {
        const heuristic = extractGraphHeuristics(data.observations);
        nodes = heuristic.nodes;
        edges = heuristic.edges;
      } catch (err) {
        logger.warn("heuristic graph extraction failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const llmEnabled =
        isGraphExtractionEnabled() && !provider.name.includes("noop");
      let llmError: string | undefined;
      if (llmEnabled) {
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
          const parsed = parseGraphXml(response, obsIds);
          nodes = nodes.concat(parsed.nodes);
          edges = edges.concat(parsed.edges);
        } catch (err) {
          llmError = err instanceof Error ? err.message : String(err);
          logger.error("LLM graph extraction failed", { error: llmError });
        }
      }

      if (nodes.length === 0 && edges.length === 0) {
        return llmError
          ? { success: false, error: llmError }
          : { success: true, nodesAdded: 0, edgesAdded: 0 };
      }

      try {
        const { newNodeCount, newEdgeCount } = await persistGraphDelta(
          kv,
          nodes,
          edges,
          obsIds,
        );
        await recordAudit(kv, "observe", "mem::graph-extract", obsIds, {
          nodesExtracted: nodes.length,
          edgesExtracted: edges.length,
        });

        logger.info("Graph extraction complete", {
          nodes: nodes.length,
          edges: edges.length,
          newNodes: newNodeCount,
          newEdges: newEdgeCount,
          llm: llmEnabled && !llmError,
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
      const maxDepth = Math.min(data.maxDepth || 3, 5);
      const { limit, offset } = resolvePagination(data.limit, data.offset);
      const readiness = await graphIndexReadiness(kv);
      const snapshot = await readSnapshot(kv);
      const viewReadiness = await graphIndexReadiness(kv);

      // The empty-body / nodeType-only path reads the snapshot only.
      // Legacy snapshots can still be returned, but are explicitly
      // marked unavailable until a reset starts a new indexed generation.
      const noWalk = !data.query && !data.startNodeId;
      if (noWalk) {
        if (snapshot) {
          const snapshotReady =
            readiness.ready &&
            viewReadiness.ready &&
            readiness.generation === viewReadiness.generation &&
            snapshot.indexGeneration === viewReadiness.generation;
          return {
            ...paginateFromSnapshot(snapshot, data.nodeType, limit, offset),
            indexStatus: snapshotReady ? "ready" : "unavailable",
            ...(!snapshotReady
              ? {
                  warning:
                    "Graph read indexes are unavailable for this legacy corpus. " +
                    "The response is limited to the stored snapshot. Run graph reset " +
                    "to start a new indexed generation; complete legacy recovery " +
                    "requires paginated state scanning.",
                }
              : {}),
          };
        }
        return {
          nodes: [],
          edges: [],
          depth: 0,
          totalNodes: 0,
          totalEdges: 0,
          truncated: false,
          limit,
          offset,
          indexStatus: "unavailable",
          warning:
            "No graph snapshot or generation-matched read index is available. " +
            "Run graph reset to start a new indexed generation; complete legacy " +
            "recovery requires paginated state scanning.",
        };
      }

      const expectedGeneration =
        readiness.ready &&
        viewReadiness.ready &&
        readiness.generation === viewReadiness.generation
          ? readiness.generation
          : undefined;
      const reader = expectedGeneration
        ? await GraphIndexReader.open(kv, expectedGeneration)
        : null;
      if (reader) {
        const matchedSnapshot =
          snapshot?.indexGeneration === expectedGeneration
            ? snapshot
            : null;
        const result = data.query
          ? await queryViaIndexes(
              reader,
              matchedSnapshot,
              data.query,
              limit,
              offset,
            )
          : await traverseViaIndexes(
              reader,
              data.startNodeId!,
              data.nodeType,
              maxDepth,
              limit,
              offset,
            );
        if (await reader.isCurrent()) {
          return { ...result, indexStatus: "ready" };
        }
      }

      const fallbackReadiness = await graphIndexReadiness(kv).catch(() => null);
      const stableSnapshot =
        snapshot &&
        expectedGeneration &&
        fallbackReadiness?.ready &&
        fallbackReadiness.generation === expectedGeneration &&
        snapshot.indexGeneration === expectedGeneration
          ? snapshot
          : null;
      return {
        ...(stableSnapshot
          ? paginateFromSnapshot(stableSnapshot, data.nodeType, limit, offset)
          : {
              nodes: [],
              edges: [],
              depth: 0,
              totalNodes: 0,
              totalEdges: 0,
              truncated: false,
              limit,
              offset,
            }),
        indexStatus: "unavailable",
        warning:
          "Graph read indexes are unavailable or changed during the requested " +
          "search or traversal. Any snapshot response is generation-matched. " +
          "Run graph reset " +
          "to start a new indexed generation; complete legacy recovery requires " +
          "paginated state scanning.",
      };
    },
  );

  // graph-stats reads the snapshot exclusively and never enumerates graph
  // scopes. Missing legacy snapshots remain unavailable until graph reset.
  sdk.registerFunction("mem::graph-stats", async () => {
    const readiness = await graphIndexReadiness(kv);
    const snap = await readSnapshot(kv);
    const current = await graphIndexReadiness(kv);
    if (snap) {
      const trusted =
        readiness.ready &&
        current.ready &&
        readiness.generation === current.generation &&
        snap.indexGeneration === current.generation;
      return {
        ...snap.stats,
        fromSnapshot: true,
        indexStatus: trusted ? "ready" : "unavailable",
        updatedAt: snap.updatedAt,
        ...(!trusted
          ? {
              warning:
                "Graph snapshot counts are not matched to a ready index " +
                "generation and may be incomplete.",
            }
          : snap.dirty
          ? {
              warning:
                "Snapshot is marked dirty (write was in-flight when read). " +
                "Counts are eventually consistent.",
            }
          : {}),
      };
    }
    return {
      totalNodes: 0,
      totalEdges: 0,
      nodesByType: {},
      edgesByType: {},
      fromSnapshot: false,
      indexStatus: "unavailable",
      warning:
        "No graph snapshot available. Run POST /agentmemory/graph/reset to " +
        "start a new indexed generation. Legacy recovery requires paginated " +
        "state scanning.",
    };
  });

  sdk.registerFunction(
    "mem::graph-snapshot-rebuild",
    async () => {
      const started = Date.now();
      try {
        const readiness = await graphIndexReadiness(kv);
        if (!readiness.ready || !readiness.generation) {
          return {
            success: false,
            indexUnavailable: true,
            status: readiness.status,
            error:
              "Graph snapshot rebuild requires generation-matched read indexes. " +
              "Legacy graph scopes cannot be recovered safely until iii exposes " +
              "paginated state scanning. Run graph reset to start a new generation.",
          };
        }
        const snap = await rebuildGraphSnapshotFromIndexes(kv);
        const tookMs = Date.now() - started;
        logger.info("Graph snapshot rebuilt", {
          totalNodes: snap.stats.totalNodes,
          totalEdges: snap.stats.totalEdges,
          topNodes: snap.topNodes.length,
          topEdges: snap.topEdges.length,
          tookMs,
        });
        return {
          success: true,
          ...snap.stats,
          topNodes: snap.topNodes.length,
          topEdges: snap.topEdges.length,
          updatedAt: snap.updatedAt,
          tookMs,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Graph snapshot rebuild failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction("mem::graph-reset", async () => {
    const started = Date.now();
    await resetGraphIndexes(kv);
    const counts: Record<string, number> = {
      [KV.graphSnapshot]: 1,
    };
    const tookMs = Date.now() - started;
    logger.info("Graph state reset", { counts, tookMs });
    return { success: true, cleared: counts, tookMs };
  });
}
