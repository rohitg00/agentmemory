import type { GraphEdge, GraphNode } from "../types.js";
import { KV } from "./schema.js";
import type { StateKV } from "./kv.js";
import { getEnvVar } from "../config.js";
import { logger } from "../logger.js";

// GraphRetrieval used to run `kv.list(graphNodes)` + `kv.list(graphEdges)`
// inside BOTH searchByEntities and expandFromChunks, so every hybrid
// search paid four full-scope enumerations. At 69K nodes / 185K edges
// that measured 24s per node+edge pair — 48s per search, growing with
// the graph, past the 60s MCP tool timeout. The same 37MB-WS-frame
// hazard documented on KV.graphNameIndex applies here: a full list
// blocks the worker event loop long enough to miss heartbeats.
//
// This module holds one in-process view of the graph per StateKV and
// keeps it warm through write-through patching, so the expensive
// enumeration happens once per process instead of four times per
// query. Every graph write routes through StateKV.set/update/delete,
// which is where the patch hooks live — no caller has to remember to
// invalidate.
//
// Keyed per StateKV rather than globally: a process can hold more than
// one store (tests do), and a view built from one must never answer
// for another.
//
// The view is released after an idle period so a search-quiet daemon
// does not hold the whole graph resident (RSS on this corpus is
// already flagged at 95%).

export interface GraphView {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  /** nodeId -> incident edges, both directions (traversal treats the graph as undirected). */
  adjacency: Map<string, Array<{ neighborId: string; edgeId: string }>>;
  /** observationId -> ids of nodes that cite it. */
  nodesByObservation: Map<string, Set<string>>;
}

// A mutation that lands while buildView is awaiting the two kv.list calls
// has nothing to patch, and the build would then publish a snapshot taken
// before it. Queue those mutations and replay them onto the finished view;
// an invalidation arriving mid-build discards the result instead.
type PendingOp =
  | { kind: "write"; scope: string; key: string; value: unknown }
  | { kind: "delete"; scope: string; key: string };

interface CacheEntry {
  view: GraphView | null;
  builtAt: number;
  building: Promise<GraphView> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  pending: PendingOp[];
  invalidatedDuringBuild: boolean;
}

const DEFAULT_TTL_MS = 300_000;
const DEFAULT_IDLE_MS = 600_000;

const GRAPH_SCOPES = new Set<string>([KV.graphNodes, KV.graphEdges]);

const caches = new WeakMap<object, CacheEntry>();

function entryFor(kv: object): CacheEntry {
  let entry = caches.get(kv);
  if (!entry) {
    entry = {
      view: null,
      builtAt: 0,
      building: null,
      idleTimer: null,
      pending: [],
      invalidatedDuringBuild: false,
    };
    caches.set(kv, entry);
  }
  return entry;
}

function envMs(key: string, fallback: number): number {
  const raw = getEnvVar(key);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function emptyView(): GraphView {
  return {
    nodes: new Map(),
    edges: new Map(),
    adjacency: new Map(),
    nodesByObservation: new Map(),
  };
}

function indexNode(v: GraphView, node: GraphNode): void {
  v.nodes.set(node.id, node);
  for (const obsId of node.sourceObservationIds ?? []) {
    let ids = v.nodesByObservation.get(obsId);
    if (!ids) {
      ids = new Set();
      v.nodesByObservation.set(obsId, ids);
    }
    ids.add(node.id);
  }
}

function deindexNode(v: GraphView, nodeId: string): void {
  const existing = v.nodes.get(nodeId);
  if (!existing) return;
  for (const obsId of existing.sourceObservationIds ?? []) {
    const ids = v.nodesByObservation.get(obsId);
    if (!ids) continue;
    ids.delete(nodeId);
    if (ids.size === 0) v.nodesByObservation.delete(obsId);
  }
  v.nodes.delete(nodeId);
}

function linkEdge(v: GraphView, edge: GraphEdge): void {
  v.edges.set(edge.id, edge);
  const pairs: Array<[string, string]> = [
    [edge.sourceNodeId, edge.targetNodeId],
    [edge.targetNodeId, edge.sourceNodeId],
  ];
  for (const [from, to] of pairs) {
    let list = v.adjacency.get(from);
    if (!list) {
      list = [];
      v.adjacency.set(from, list);
    }
    if (!list.some((entry) => entry.edgeId === edge.id)) {
      list.push({ neighborId: to, edgeId: edge.id });
    }
  }
}

function unlinkEdge(v: GraphView, edgeId: string): void {
  const existing = v.edges.get(edgeId);
  if (!existing) return;
  for (const nodeId of [existing.sourceNodeId, existing.targetNodeId]) {
    const list = v.adjacency.get(nodeId);
    if (!list) continue;
    const next = list.filter((entry) => entry.edgeId !== edgeId);
    if (next.length === 0) v.adjacency.delete(nodeId);
    else v.adjacency.set(nodeId, next);
  }
  v.edges.delete(edgeId);
}

function armIdleRelease(entry: CacheEntry): void {
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => {
    if (!entry.view) return;
    logger.info("Graph view released (idle)", {
      nodes: entry.view.nodes.size,
      edges: entry.view.edges.size,
    });
    entry.view = null;
    entry.builtAt = 0;
  }, envMs("AGENTMEMORY_GRAPH_CACHE_IDLE_MS", DEFAULT_IDLE_MS));
  // Never keep the process alive for cache bookkeeping.
  entry.idleTimer.unref?.();
}

async function buildView(kv: StateKV): Promise<GraphView> {
  const startedAt = Date.now();
  // Sequential, not Promise.all: two multi-megabyte WS frames in flight
  // at once doubles the peak parse cost on the worker event loop.
  const rawNodes = await kv.list<GraphNode>(KV.graphNodes);
  const rawEdges = await kv.list<GraphEdge>(KV.graphEdges);

  const next = emptyView();
  for (const node of rawNodes ?? []) {
    if (!node || node.stale) continue;
    indexNode(next, node);
  }
  for (const edge of rawEdges ?? []) {
    if (!edge || edge.stale) continue;
    linkEdge(next, edge);
  }

  logger.info("Graph view built", {
    nodes: next.nodes.size,
    edges: next.edges.size,
    ms: Date.now() - startedAt,
  });
  return next;
}

/**
 * Returns the shared graph view for this store, building it if absent
 * or older than the TTL. Concurrent callers share one build so a burst
 * of queries cannot trigger parallel full enumerations.
 */
export async function getGraphView(kv: StateKV): Promise<GraphView> {
  const entry = entryFor(kv as unknown as object);
  const ttlMs = envMs("AGENTMEMORY_GRAPH_CACHE_TTL_MS", DEFAULT_TTL_MS);
  if (entry.view && Date.now() - entry.builtAt < ttlMs) {
    armIdleRelease(entry);
    return entry.view;
  }
  if (!entry.building) {
    entry.invalidatedDuringBuild = false;
    entry.pending = [];
    entry.building = buildView(kv)
      .then((built) => {
        if (entry.invalidatedDuringBuild) {
          // Something invalidated the graph while this build was reading.
          // Serve the result once, but do not cache a snapshot we already
          // know is behind.
          entry.invalidatedDuringBuild = false;
          entry.pending = [];
          entry.view = null;
          entry.builtAt = 0;
          return built;
        }
        entry.view = built;
        entry.builtAt = Date.now();
        for (const op of entry.pending) {
          if (op.kind === "write") applyWrite(built, op.scope, op.key, op.value);
          else applyDelete(built, op.scope, op.key);
        }
        entry.pending = [];
        armIdleRelease(entry);
        return built;
      })
      .catch((err) => {
        logger.warn("Graph view build failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        // Serve whatever we have rather than failing the search: graph
        // results are a best-effort third stream behind BM25 + vector.
        return entry.view ?? emptyView();
      })
      .finally(() => {
        entry.building = null;
      });
  }
  return entry.building;
}

function applyWrite(
  view: GraphView,
  scope: string,
  key: string,
  value: unknown,
): void {
  if (scope === KV.graphNodes) {
    const node = value as GraphNode;
    deindexNode(view, key);
    if (!node.stale) indexNode(view, { ...node, id: node.id ?? key });
    return;
  }
  const edge = value as GraphEdge;
  unlinkEdge(view, key);
  if (!edge.stale) linkEdge(view, { ...edge, id: edge.id ?? key });
}

function applyDelete(view: GraphView, scope: string, key: string): void {
  if (scope === KV.graphNodes) deindexNode(view, key);
  else unlinkEdge(view, key);
}

/** Drops this store's view so the next read rebuilds from KV. */
export function invalidateGraphCache(kv: object): void {
  const entry = caches.get(kv);
  if (!entry) return;
  entry.view = null;
  entry.builtAt = 0;
  entry.pending = [];
  if (entry.building) entry.invalidatedDuringBuild = true;
}

/**
 * Write-through patch for a single graph row. Called from StateKV so
 * every writer (graph-extract, mesh, import, cascade, snapshot restore)
 * keeps the view warm instead of forcing a full rebuild on the next
 * search. Rows for other scopes are ignored.
 */
export function onGraphWrite(
  kv: object,
  scope: string,
  key: string,
  value: unknown,
): void {
  if (!GRAPH_SCOPES.has(scope)) return;
  const entry = caches.get(kv);
  if (!entry) return;
  if (!value || typeof value !== "object") {
    invalidateGraphCache(kv);
    return;
  }
  if (!entry.view) {
    if (entry.building) entry.pending.push({ kind: "write", scope, key, value });
    return;
  }
  applyWrite(entry.view, scope, key, value);
}

/** Write-through removal for a single graph row. */
export function onGraphDelete(kv: object, scope: string, key: string): void {
  if (!GRAPH_SCOPES.has(scope)) return;
  const entry = caches.get(kv);
  if (!entry) return;
  if (!entry.view) {
    if (entry.building) entry.pending.push({ kind: "delete", scope, key });
    return;
  }
  applyDelete(entry.view, scope, key);
}

/**
 * `state::update` applies opaque ops server-side, so the patched row
 * cannot be reconstructed locally. Drop the view instead of guessing.
 */
export function onGraphUpdate(kv: object, scope: string): void {
  if (GRAPH_SCOPES.has(scope)) invalidateGraphCache(kv);
}
