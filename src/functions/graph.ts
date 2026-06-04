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

// #814: the precomputed snapshot covers the top-degree subgraph used by
// the empty-body / nodeType-only branch — the path the viewer hits on
// tab load. Sized to match the default query limit so the snapshot can
// service a default-cap request without falling back to live
// enumeration. Aggregate stats (nodesByType / edgesByType) are computed
// fresh during rebuild and stored alongside.
const SNAPSHOT_TOP_NODES = DEFAULT_GRAPH_QUERY_LIMIT;
const SNAPSHOT_KEY = "current";

// `state::list` over a 75K-node scope can exceed the iii invocation
// timeout. The query handler races the enumeration against this budget
// and falls back to the snapshot (or a warning envelope) when the live
// path is too slow. 6000ms leaves headroom under the default 8s engine
// invocation deadline.
const LIVE_ENUMERATION_BUDGET_MS = 6000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label}: exceeded ${ms}ms budget`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

function emptySnapshot(): GraphSnapshot {
  return {
    version: 1,
    topNodes: [],
    topEdges: [],
    topDegrees: {},
    stats: {
      totalNodes: 0,
      totalEdges: 0,
      nodesByType: {},
      edgesByType: {},
    },
    updatedAt: new Date(0).toISOString(),
    dirty: true,
  };
}

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

// #814 v2: the rebuild path won't terminate on corpora large enough
// that kv.list returns a payload too big to JSON.parse without
// starving the iii heartbeat. We don't actually know the corpus size
// without enumerating, but we can refuse to start a rebuild if the
// snapshot's recorded `totalNodes` already exceeds this threshold —
// the rebuild path is unreliable above it, and an incremental
// extract-driven snapshot is the right approach for those corpora.
// Operators above the threshold should use mem::graph-reset and let
// future extracts rebuild incrementally.
const REBUILD_SAFE_NODE_CEILING = 25000;

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

        // #814 v2: targeted name-index lookups replace the O(n) scan
        // over `kv.list<GraphNode>(KV.graphNodes)`. At 75K nodes the
        // list payload exceeds the iii heartbeat budget and the worker
        // dies before merge can complete. Each name-index entry is a
        // single small kv.get/set pair.
        const snap = (await readSnapshot(kv)) ?? emptySnapshot();
        const capturedAt = new Date().toISOString();
        let newNodeCount = 0;
        let newEdgeCount = 0;
        const newEdgesForTopCheck: GraphEdge[] = [];

        for (const node of nodes) {
          const indexKey = nameIndexKey(node.type, node.name);
          const existingId = await kv.get<string>(
            KV.graphNameIndex,
            indexKey,
          );

          let existing: GraphNode | null = null;
          if (existingId) {
            existing = await kv.get<GraphNode>(KV.graphNodes, existingId);
          }

          if (existing) {
            const merged = mergeNode(existing, node, obsIds, capturedAt);
            await kv.set(KV.graphNodes, existing.id, merged);
            // Update topNodes entry if present so a stale clone isn't
            // returned from the snapshot fast path.
            const topIdx = snap.topNodes.findIndex(
              (n) => n.id === existing!.id,
            );
            if (topIdx !== -1) snap.topNodes[topIdx] = merged;
          } else {
            await kv.set(KV.graphNodes, node.id, node);
            await kv.set(KV.graphNameIndex, indexKey, node.id);
            await kv.set(KV.graphNodeDegree, node.id, 0);
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

        for (const edge of edges) {
          const eKey = edgeIndexKey(
            edge.sourceNodeId,
            edge.targetNodeId,
            edge.type,
          );
          const existingId = await kv.get<string>(KV.graphEdgeKey, eKey);

          let existing: GraphEdge | null = null;
          if (existingId) {
            existing = await kv.get<GraphEdge>(KV.graphEdges, existingId);
          }

          if (existing) {
            const merged = mergeEdge(existing, obsIds);
            await kv.set(KV.graphEdges, existing.id, merged);
            // Replace cached topEdges entry too if present.
            const topIdx = snap.topEdges.findIndex(
              (e) => e.id === existing!.id,
            );
            if (topIdx !== -1) snap.topEdges[topIdx] = merged;
          } else {
            await kv.set(KV.graphEdges, edge.id, edge);
            await kv.set(KV.graphEdgeKey, eKey, edge.id);
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

        if (newNodeCount > 0 || newEdgeCount > 0) {
          snap.updatedAt = capturedAt;
          snap.dirty = false;
          await kv.set(KV.graphSnapshot, SNAPSHOT_KEY, snap);
        }

        await recordAudit(kv, "observe", "mem::graph-extract", obsIds, {
          nodesExtracted: nodes.length,
          edgesExtracted: edges.length,
        });

        logger.info("Graph extraction complete", {
          nodes: nodes.length,
          edges: edges.length,
          newNodes: newNodeCount,
          newEdges: newEdgeCount,
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

      // #814 v2: the empty-body / nodeType-only path NEVER enumerates.
      // It reads the snapshot exclusively. The snapshot is updated
      // inline by graph-extract, so for newly-built corpora it's
      // always current. For legacy corpora missing a snapshot the
      // operator must run mem::graph-snapshot-rebuild (safe under
      // REBUILD_SAFE_NODE_CEILING) or mem::graph-reset to wipe and
      // rebuild incrementally from new observations.
      const noWalk = !data.query && !data.startNodeId;
      if (noWalk) {
        const snap = await readSnapshot(kv);
        if (snap && snap.stats.totalNodes > 0) {
          return paginateFromSnapshot(snap, data.nodeType, limit, offset);
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
          warning:
            "No graph snapshot available. Either no graph has been " +
            "extracted yet, or you are on a legacy corpus from a pre-#814 " +
            "agentmemory build. Run POST /agentmemory/graph/snapshot-rebuild " +
            "(safe up to ~25K nodes) or POST /agentmemory/graph/reset to " +
            "wipe and let future extracts repopulate.",
        };
      }

      // Query / startNodeId paths still need broader access. Race the
      // live enumeration against a wall-clock budget so a long
      // kv.list doesn't block the worker indefinitely. On timeout the
      // caller gets a snapshot-backed approximation instead of a 500.
      let allNodes: GraphNode[];
      let allEdges: GraphEdge[];
      try {
        const [rawNodes, rawEdges] = await withTimeout(
          Promise.all([
            kv.list<GraphNode>(KV.graphNodes),
            kv.list<GraphEdge>(KV.graphEdges),
          ]),
          LIVE_ENUMERATION_BUDGET_MS,
          "graph-query enumeration",
        );
        allNodes = rawNodes.filter((n) => !n.stale);
        allEdges = rawEdges.filter((e) => !e.stale);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Graph query enumeration timed out, using snapshot", {
          error: msg,
        });
        const snap = await readSnapshot(kv);
        if (snap) {
          return {
            ...paginateFromSnapshot(snap, data.nodeType, limit, offset),
            warning:
              "Live graph enumeration exceeded budget. Query / " +
              "startNodeId paths degrade on >25K-node corpora until a " +
              "per-node edge index lands. Result reflects top-degree " +
              "snapshot, not the requested walk.",
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
          warning:
            "Graph enumeration exceeded budget and no snapshot is available.",
        };
      }

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

      // Unreachable — noWalk branch handles the rest.
      return paginate([], [], 0, limit, offset);
    },
  );

  // #814 v2: graph-stats reads the snapshot exclusively. The snapshot
  // is maintained inline by mem::graph-extract, so for any corpus built
  // on a post-#814 agentmemory the stats are always current without an
  // enumeration. Legacy corpora without a snapshot get an empty
  // envelope + a warning pointing at the snapshot-rebuild or graph-reset
  // endpoints — never a 500.
  sdk.registerFunction("mem::graph-stats", async () => {
    const snap = await readSnapshot(kv);
    if (snap) {
      return {
        ...snap.stats,
        fromSnapshot: true,
        updatedAt: snap.updatedAt,
        ...(snap.dirty
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
      warning:
        "No graph snapshot available. Run POST /agentmemory/graph/snapshot-rebuild " +
        "(safe up to ~25K nodes) or POST /agentmemory/graph/reset to wipe " +
        "and let future extracts repopulate.",
    };
  });

  // #814 v2: explicit rebuild backfills the snapshot AND the name /
  // edge-key / degree indexes from existing graphNodes/graphEdges
  // scopes. This is the path operators run once after upgrading to a
  // post-#814 build to bring legacy corpora online. It enumerates via
  // kv.list — the same pair that breaks at 75K+ — so we refuse to
  // run on corpora large enough that the response payload would
  // block the worker heartbeat. Above the ceiling the only safe path
  // is mem::graph-reset followed by incremental re-extraction.
  sdk.registerFunction("mem::graph-snapshot-rebuild", async () => {
    const started = Date.now();
    try {
      const [nodes, edges] = await withTimeout(
        Promise.all([
          kv.list<GraphNode>(KV.graphNodes),
          kv.list<GraphEdge>(KV.graphEdges),
        ]),
        LIVE_ENUMERATION_BUDGET_MS,
        "graph-snapshot-rebuild enumeration",
      );

      if (nodes.length > REBUILD_SAFE_NODE_CEILING) {
        logger.warn("Graph snapshot rebuild aborted: corpus too large", {
          totalNodes: nodes.length,
          ceiling: REBUILD_SAFE_NODE_CEILING,
        });
        return {
          success: false,
          tooLarge: true,
          totalNodes: nodes.length,
          ceiling: REBUILD_SAFE_NODE_CEILING,
          error:
            `Corpus has ${nodes.length} graph nodes; safe-rebuild ceiling ` +
            `is ${REBUILD_SAFE_NODE_CEILING}. Run POST /agentmemory/graph/reset ` +
            `to wipe and let future extracts rebuild incrementally.`,
        };
      }

      // Backfill the targeted-lookup indexes so post-rebuild
      // graph-extract calls hit the O(1) path instead of falling
      // through to the (already-removed) full-scope scan. Batch
      // writes via Promise.all to avoid N sequential round-trips —
      // BATCH_SIZE bounds in-flight writes so we don't open thousands
      // of concurrent state channels on huge corpora.
      const liveNodes = nodes.filter((n) => !n.stale);
      const liveEdges = edges.filter((e) => !e.stale);
      const degree = new Map<string, number>();
      for (const e of liveEdges) {
        degree.set(e.sourceNodeId, (degree.get(e.sourceNodeId) ?? 0) + 1);
        degree.set(e.targetNodeId, (degree.get(e.targetNodeId) ?? 0) + 1);
      }
      const BATCH_SIZE = 100;
      for (let i = 0; i < liveNodes.length; i += BATCH_SIZE) {
        const batch = liveNodes.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.flatMap((n) => [
            kv.set(KV.graphNameIndex, nameIndexKey(n.type, n.name), n.id),
            kv.set(KV.graphNodeDegree, n.id, degree.get(n.id) ?? 0),
          ]),
        );
      }
      for (let i = 0; i < liveEdges.length; i += BATCH_SIZE) {
        const batch = liveEdges.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((e) =>
            kv.set(
              KV.graphEdgeKey,
              edgeIndexKey(e.sourceNodeId, e.targetNodeId, e.type),
              e.id,
            ),
          ),
        );
      }

      const snap = buildSnapshotFromArrays(nodes, edges);
      await kv.set(KV.graphSnapshot, SNAPSHOT_KEY, snap);
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
  });

  // #814 v2: clean-restart escape hatch for legacy corpora too large
  // for safe rebuild. Wipes every graph KV scope and writes an empty
  // snapshot. Observations are NOT touched, so recall + history stay
  // intact; the graph rebuilds incrementally from future
  // mem::graph-extract calls (or a one-shot api::graph-build replay
  // from existing observations).
  sdk.registerFunction("mem::graph-reset", async () => {
    const started = Date.now();
    const counts: Record<string, number> = {
      [KV.graphNodes]: 0,
      [KV.graphEdges]: 0,
      [KV.graphNameIndex]: 0,
      [KV.graphEdgeKey]: 0,
      [KV.graphNodeDegree]: 0,
      [KV.graphEdgeHistory]: 0,
      [KV.graphSnapshot]: 0,
    };

    // Composite-key scopes (graphNameIndex / graphEdgeKey /
    // graphNodeDegree) store primitives, not objects, so we can't
    // recover their keys via kv.list (which returns values only). The
    // only reliable wipe path is to walk the canonical object scopes
    // (graphNodes / graphEdges) and reconstruct the composite keys
    // from each node/edge's fields, deleting both the canonical row
    // AND every derived index entry in lock-step.
    try {
      const nodes = await withTimeout(
        kv.list<GraphNode>(KV.graphNodes),
        LIVE_ENUMERATION_BUDGET_MS,
        "graph-reset list graphNodes",
      );
      counts[KV.graphNodes] = nodes.length;
      for (const node of nodes) {
        if (!node?.id) continue;
        await Promise.all([
          kv.delete(KV.graphNodes, node.id).catch(() => undefined),
          kv
            .delete(KV.graphNameIndex, nameIndexKey(node.type, node.name))
            .catch(() => undefined),
          kv.delete(KV.graphNodeDegree, node.id).catch(() => undefined),
        ]);
        counts[KV.graphNameIndex] += 1;
        counts[KV.graphNodeDegree] += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("graph-reset: graphNodes list failed", { error: msg });
      counts[KV.graphNodes] = -1;
    }

    try {
      const edges = await withTimeout(
        kv.list<GraphEdge>(KV.graphEdges),
        LIVE_ENUMERATION_BUDGET_MS,
        "graph-reset list graphEdges",
      );
      counts[KV.graphEdges] = edges.length;
      for (const edge of edges) {
        if (!edge?.id) continue;
        await Promise.all([
          kv.delete(KV.graphEdges, edge.id).catch(() => undefined),
          kv
            .delete(
              KV.graphEdgeKey,
              edgeIndexKey(edge.sourceNodeId, edge.targetNodeId, edge.type),
            )
            .catch(() => undefined),
        ]);
        counts[KV.graphEdgeKey] += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("graph-reset: graphEdges list failed", { error: msg });
      counts[KV.graphEdges] = -1;
    }

    // graphEdgeHistory entries also key by id (audit row shape). Best
    // effort — failures here don't block the reset.
    try {
      const history = await withTimeout(
        kv.list<{ id?: string }>(KV.graphEdgeHistory),
        LIVE_ENUMERATION_BUDGET_MS,
        "graph-reset list graphEdgeHistory",
      );
      counts[KV.graphEdgeHistory] = history.length;
      for (const row of history) {
        if (row?.id) {
          await kv.delete(KV.graphEdgeHistory, row.id).catch(() => undefined);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("graph-reset: graphEdgeHistory list failed", { error: msg });
      counts[KV.graphEdgeHistory] = -1;
    }

    await kv.set(KV.graphSnapshot, SNAPSHOT_KEY, emptySnapshot());
    counts[KV.graphSnapshot] = 1;
    const tookMs = Date.now() - started;
    logger.info("Graph state reset", { counts, tookMs });
    return { success: true, cleared: counts, tookMs };
  });
}
