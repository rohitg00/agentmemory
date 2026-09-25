import type { GraphNode, GraphEdge, GraphSnapshot } from "../types.js";
import { KV } from "./schema.js";
import type { StateKV } from "./kv.js";
import { withKeyedLock } from "./keyed-mutex.js";

export const NAME_SHARD_COUNT = 64;
export const GRAPH_INDEX_VERSION = 2;
const META_KEY = "current";
const SNAPSHOT_KEY = "current";

export interface NameCatalogEntry {
  id: string;
  name: string;
  aliases?: string[];
}

interface GraphIndexMeta {
  version: typeof GRAPH_INDEX_VERSION;
  status: "initializing" | "ready" | "unavailable";
  generation: string;
  updatedAt: string;
  reason?: string;
}

export interface GraphIndexReadiness {
  ready: boolean;
  status: GraphIndexMeta["status"] | "missing";
  generation?: string;
  resetAt?: string;
  reason?: string;
}

function newGeneration(): string {
  return `gidx_${crypto.randomUUID()}`;
}

function nameShardStorageKey(generation: string, shard: string): string {
  return `${generation}:${shard}`;
}

function adjacencyStorageKey(generation: string, nodeId: string): string {
  return `${generation}:${nodeId}`;
}

function observationStorageKey(generation: string, obsId: string): string {
  return `${generation}:${obsId}`;
}

function freshSnapshot(
  generation: string,
  resetAt?: string,
): GraphSnapshot {
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
    updatedAt: new Date().toISOString(),
    dirty: false,
    indexGeneration: generation,
    ...(resetAt ? { resetAt } : {}),
  };
}

async function readMeta(kv: StateKV): Promise<GraphIndexMeta | null> {
  return kv.get<GraphIndexMeta>(KV.graphIndexMeta, META_KEY);
}

async function readSnapshot(kv: StateKV): Promise<GraphSnapshot | null> {
  return kv.get<GraphSnapshot>(KV.graphSnapshot, SNAPSHOT_KEY);
}

async function writeMeta(
  kv: StateKV,
  status: GraphIndexMeta["status"],
  generation: string,
  reason?: string,
): Promise<void> {
  await kv.set(KV.graphIndexMeta, META_KEY, {
    version: GRAPH_INDEX_VERSION,
    status,
    generation,
    updatedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  } satisfies GraphIndexMeta);
}

export async function markGraphIndexesUnavailable(
  kv: StateKV,
  reason: string,
  expectedGeneration?: string,
): Promise<void> {
  let meta: GraphIndexMeta | null;
  try {
    meta = await readMeta(kv);
  } catch (error) {
    if (!expectedGeneration) throw error;
    await writeMeta(kv, "unavailable", expectedGeneration, reason);
    return;
  }
  if (expectedGeneration && meta?.generation !== expectedGeneration) return;
  await writeMeta(
    kv,
    "unavailable",
    meta?.generation ?? expectedGeneration ?? newGeneration(),
    reason,
  );
}

export function nameShardKey(nodeId: string): string {
  let hash = 5381;
  for (let i = 0; i < nodeId.length; i++) {
    hash = ((hash * 33) ^ nodeId.charCodeAt(i)) >>> 0;
  }
  return String(hash % NAME_SHARD_COUNT);
}

export async function graphIndexReadiness(
  kv: StateKV,
): Promise<GraphIndexReadiness> {
  const [meta, snapshot] = await Promise.all([readMeta(kv), readSnapshot(kv)]);
  if (
    meta?.version === GRAPH_INDEX_VERSION &&
    meta.status === "ready" &&
    typeof meta.generation === "string" &&
    meta.generation.length > 0 &&
    snapshot?.indexGeneration === meta.generation
  ) {
    return {
      ready: true,
      status: "ready",
      generation: meta.generation,
      resetAt: snapshot.resetAt,
    };
  }
  return {
    ready: false,
    status: meta?.status ?? "missing",
    generation: meta?.generation,
    resetAt: snapshot?.resetAt,
    reason:
      meta?.reason ??
      (meta?.status === "ready"
        ? "graph index generation does not match the active snapshot"
        : "graph read indexes are not initialized"),
  };
}

export async function graphIndexesReady(kv: StateKV): Promise<boolean> {
  return (await graphIndexReadiness(kv)).ready;
}

export async function initializeGraphIndexes(
  kv: StateKV,
): Promise<GraphIndexReadiness> {
  return withKeyedLock("gidx:init", async () => {
    const current = await graphIndexReadiness(kv);
    if (current.ready || current.status === "unavailable") return current;

    const groups = await kv.listGroups();
    const graphScopesPresent =
      groups.includes(KV.graphNodes) || groups.includes(KV.graphEdges);
    if (graphScopesPresent) {
      const generation = current.generation ?? newGeneration();
      const reason =
        "legacy graph scopes contain data but cannot be scanned safely; reset the graph or wait for paginated state scanning support";
      await writeMeta(kv, "unavailable", generation, reason);
      return {
        ready: false,
        status: "unavailable",
        generation,
        resetAt: current.resetAt,
        reason,
      };
    }

    const generation = newGeneration();
    await writeMeta(kv, "initializing", generation);
    await kv.set(KV.graphSnapshot, SNAPSHOT_KEY, freshSnapshot(generation));
    await writeMeta(kv, "ready", generation);
    return {
      ready: true,
      status: "ready",
      generation,
    };
  });
}

export async function resetGraphIndexes(kv: StateKV): Promise<GraphSnapshot> {
  return withGraphIndexMutation(() =>
    withKeyedLock("gidx:init", async () => {
      const generation = newGeneration();
      const resetAt = new Date().toISOString();
      const snapshot = freshSnapshot(generation, resetAt);
      await writeMeta(kv, "initializing", generation);
      await kv.set(KV.graphSnapshot, SNAPSHOT_KEY, snapshot);
      await writeMeta(kv, "ready", generation);
      return snapshot;
    }),
  );
}

export function withGraphIndexMutation<T>(fn: () => Promise<T>): Promise<T> {
  return withKeyedLock("gidx:mutation", fn);
}

async function failClosedGraphMutation<T>(
  kv: StateKV,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const before = await graphIndexReadiness(kv).catch(() => null);
  let expectedGeneration = before?.ready ? before.generation : undefined;
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!expectedGeneration) {
      const current = await graphIndexReadiness(kv).catch(() => null);
      expectedGeneration = current?.ready ? current.generation : undefined;
    }
    if (expectedGeneration) {
      await markGraphIndexesUnavailable(
        kv,
        `${operation} failed after graph mutation started: ${message}`,
        expectedGeneration,
      ).catch(() => {});
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

export function withFailClosedGraphMutation<T>(
  kv: StateKV,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withGraphIndexMutation(() =>
    failClosedGraphMutation(kv, operation, fn),
  );
}

async function readyGeneration(
  kv: StateKV,
  expectedGeneration?: string,
): Promise<string | null> {
  const readiness = await graphIndexReadiness(kv);
  if (!readiness.ready || !readiness.generation) return null;
  if (
    expectedGeneration &&
    readiness.generation !== expectedGeneration
  ) {
    return null;
  }
  return readiness.generation;
}

export async function indexGraphNode(
  kv: StateKV,
  node: GraphNode,
  expectedGeneration?: string,
): Promise<boolean> {
  if (!node?.id || typeof node.name !== "string") return false;
  const generation = await readyGeneration(kv, expectedGeneration);
  if (!generation) return false;
  const shard = nameShardKey(node.id);
  const storageKey = nameShardStorageKey(generation, shard);
  await withKeyedLock(`gidx:shard:${storageKey}`, async () => {
    const entries =
      (await kv.get<NameCatalogEntry[]>(KV.graphNameShards, storageKey)) ?? [];
    const next = entries.filter((entry) => entry.id !== node.id);
    next.push({
      id: node.id,
      name: node.name,
      ...(node.aliases?.length ? { aliases: node.aliases } : {}),
    });
    await kv.set(KV.graphNameShards, storageKey, next);
  });
  await linkObservationsForGeneration(
    kv,
    generation,
    node.id,
    node.sourceObservationIds,
  );
  return true;
}

async function linkObservationsForGeneration(
  kv: StateKV,
  generation: string,
  nodeId: string,
  obsIds: string[] | undefined,
): Promise<void> {
  for (const obsId of obsIds ?? []) {
    const storageKey = observationStorageKey(generation, obsId);
    await withKeyedLock(`gidx:obs:${storageKey}`, async () => {
      const nodeIds =
        (await kv.get<string[]>(KV.graphObsNodes, storageKey)) ?? [];
      if (!nodeIds.includes(nodeId)) {
        nodeIds.push(nodeId);
        await kv.set(KV.graphObsNodes, storageKey, nodeIds);
      }
    });
  }
}

export async function indexGraphEdge(
  kv: StateKV,
  edge: GraphEdge,
  expectedGeneration?: string,
): Promise<boolean> {
  if (!edge?.id || !edge.sourceNodeId || !edge.targetNodeId) return false;
  const generation = await readyGeneration(kv, expectedGeneration);
  if (!generation) return false;
  const endpoints =
    edge.sourceNodeId === edge.targetNodeId
      ? [edge.sourceNodeId]
      : [edge.sourceNodeId, edge.targetNodeId];
  for (const nodeId of endpoints) {
    const storageKey = adjacencyStorageKey(generation, nodeId);
    await withKeyedLock(`gidx:adj:${storageKey}`, async () => {
      const edgeIds =
        (await kv.get<string[]>(KV.graphAdjacency, storageKey)) ?? [];
      if (!edgeIds.includes(edge.id)) {
        edgeIds.push(edge.id);
        await kv.set(KV.graphAdjacency, storageKey, edgeIds);
      }
    });
  }
  return true;
}

async function invalidateFailedIndexWrite(
  kv: StateKV,
  kind: "node" | "edge",
  id: string,
  expectedGeneration: string | undefined,
  error: unknown,
): Promise<never> {
  const message = error instanceof Error ? error.message : String(error);
  await markGraphIndexesUnavailable(
    kv,
    `graph ${kind} ${id} could not be indexed: ${message}`,
    expectedGeneration,
  ).catch(() => {});
  throw error instanceof Error ? error : new Error(message);
}

export async function indexGraphNodeOrInvalidate(
  kv: StateKV,
  node: GraphNode,
  expectedGeneration?: string,
): Promise<void> {
  let generation = expectedGeneration;
  try {
    const readiness = await graphIndexReadiness(kv);
    generation ??= readiness.generation;
    if (
      !readiness.ready ||
      !generation ||
      readiness.generation !== generation ||
      !(await indexGraphNode(kv, node, generation))
    ) {
      throw new Error(`graph node ${node.id} could not be indexed`);
    }
  } catch (error) {
    await invalidateFailedIndexWrite(
      kv,
      "node",
      node.id,
      generation,
      error,
    );
  }
}

export async function removeGraphNodeFromIndexOrInvalidate(
  kv: StateKV,
  nodeId: string,
  expectedGeneration: string,
): Promise<void> {
  try {
    const generation = await readyGeneration(kv, expectedGeneration);
    if (!generation) throw new Error(`graph node ${nodeId} could not be removed`);
    const storageKey = nameShardStorageKey(
      generation,
      nameShardKey(nodeId),
    );
    await withKeyedLock(`gidx:shard:${storageKey}`, async () => {
      const entries =
        (await kv.get<NameCatalogEntry[]>(KV.graphNameShards, storageKey)) ?? [];
      await kv.set(
        KV.graphNameShards,
        storageKey,
        entries.filter((entry) => entry.id !== nodeId),
      );
    });
  } catch (error) {
    await invalidateFailedIndexWrite(
      kv,
      "node",
      nodeId,
      expectedGeneration,
      error,
    );
  }
}

export async function indexGraphEdgeOrInvalidate(
  kv: StateKV,
  edge: GraphEdge,
  expectedGeneration?: string,
): Promise<void> {
  let generation = expectedGeneration;
  try {
    const readiness = await graphIndexReadiness(kv);
    generation ??= readiness.generation;
    if (
      !readiness.ready ||
      !generation ||
      readiness.generation !== generation ||
      !(await indexGraphEdge(kv, edge, generation))
    ) {
      throw new Error(`graph edge ${edge.id} could not be indexed`);
    }
  } catch (error) {
    await invalidateFailedIndexWrite(
      kv,
      "edge",
      edge.id,
      generation,
      error,
    );
  }
}

async function loadCatalogForGeneration(
  kv: StateKV,
  generation: string,
): Promise<NameCatalogEntry[]> {
  const shards = await Promise.all(
    Array.from({ length: NAME_SHARD_COUNT }, (_, shard) =>
      kv.get<NameCatalogEntry[]>(
        KV.graphNameShards,
        nameShardStorageKey(generation, String(shard)),
      ),
    ),
  );
  const catalog: NameCatalogEntry[] = [];
  for (const entries of shards) {
    if (Array.isArray(entries)) catalog.push(...entries);
  }
  return catalog;
}

export async function loadNameCatalog(
  kv: StateKV,
): Promise<NameCatalogEntry[]> {
  const generation = await readyGeneration(kv);
  return generation ? loadCatalogForGeneration(kv, generation) : [];
}

async function loadAdjacentEdgeIdsForGeneration(
  kv: StateKV,
  generation: string,
  nodeId: string,
): Promise<string[]> {
  const edgeIds = await kv.get<string[]>(
    KV.graphAdjacency,
    adjacencyStorageKey(generation, nodeId),
  );
  return Array.isArray(edgeIds) ? edgeIds : [];
}

async function loadNodeIdsForObservationsForGeneration(
  kv: StateKV,
  generation: string,
  obsIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  for (const obsId of obsIds) {
    const nodeIds = await kv.get<string[]>(
      KV.graphObsNodes,
      observationStorageKey(generation, obsId),
    );
    if (Array.isArray(nodeIds)) {
      for (const id of nodeIds) ids.add(id);
    }
  }
  return [...ids];
}

export class GraphIndexReader {
  private nodeCache = new Map<string, GraphNode | null>();
  private edgeCache = new Map<string, GraphEdge | null>();
  private catalog: NameCatalogEntry[] | null = null;
  private indexedNodeIds: Set<string> | null = null;
  private indexedEdgeIds = new Set<string>();

  private constructor(
    private kv: StateKV,
    private generation: string,
  ) {}

  static async open(
    kv: StateKV,
    expectedGeneration?: string,
  ): Promise<GraphIndexReader | null> {
    const readiness = await graphIndexReadiness(kv);
    if (
      !readiness.ready ||
      !readiness.generation ||
      (expectedGeneration && readiness.generation !== expectedGeneration)
    ) {
      return null;
    }
    return new GraphIndexReader(kv, readiness.generation);
  }

  async isCurrent(): Promise<boolean> {
    try {
      const readiness = await graphIndexReadiness(this.kv);
      return readiness.ready && readiness.generation === this.generation;
    } catch {
      return false;
    }
  }

  async getNode(nodeId: string): Promise<GraphNode | null> {
    const cached = this.nodeCache.get(nodeId);
    if (cached !== undefined) return cached;
    if (!this.indexedNodeIds) await this.getNameCatalog();
    if (!this.indexedNodeIds!.has(nodeId)) {
      this.nodeCache.set(nodeId, null);
      return null;
    }
    const raw = await this.kv.get<GraphNode>(KV.graphNodes, nodeId);
    const node = raw && !raw.stale ? raw : null;
    this.nodeCache.set(nodeId, node);
    return node;
  }

  async getEdge(edgeId: string): Promise<GraphEdge | null> {
    const cached = this.edgeCache.get(edgeId);
    if (cached !== undefined) return cached;
    if (!this.indexedEdgeIds.has(edgeId)) return null;
    const raw = await this.kv.get<GraphEdge>(KV.graphEdges, edgeId);
    const edge = raw && !raw.stale ? raw : null;
    this.edgeCache.set(edgeId, edge);
    return edge;
  }

  async getNameCatalog(): Promise<NameCatalogEntry[]> {
    if (!this.catalog) {
      this.catalog = await loadCatalogForGeneration(this.kv, this.generation);
      this.indexedNodeIds = new Set(this.catalog.map((entry) => entry.id));
    }
    return this.catalog;
  }

  async getNodeIdsForObservations(obsIds: string[]): Promise<string[]> {
    return loadNodeIdsForObservationsForGeneration(
      this.kv,
      this.generation,
      obsIds,
    );
  }

  async getIncidentEdges(
    nodeId: string,
    maxEdges = Number.POSITIVE_INFINITY,
  ): Promise<GraphEdge[]> {
    if (!this.indexedNodeIds) await this.getNameCatalog();
    if (!this.indexedNodeIds!.has(nodeId)) return [];
    if (!(await this.getNode(nodeId))) return [];
    const edgeIds = await loadAdjacentEdgeIdsForGeneration(
      this.kv,
      this.generation,
      nodeId,
    );
    const edges: GraphEdge[] = [];
    for (const edgeId of edgeIds) {
      if (edges.length >= maxEdges) break;
      this.indexedEdgeIds.add(edgeId);
      const edge = await this.getEdge(edgeId);
      if (
        edge &&
        (await this.getNode(edge.sourceNodeId)) &&
        (await this.getNode(edge.targetNodeId)) &&
        (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId)
      ) {
        edges.push(edge);
      }
    }
    return edges;
  }

  async getNeighbors(
    nodeId: string,
  ): Promise<Array<{ node: GraphNode; edge: GraphEdge }>> {
    const neighbors: Array<{ node: GraphNode; edge: GraphEdge }> = [];
    for (const edge of await this.getIncidentEdges(nodeId)) {
      const neighborId =
        edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
      const node = await this.getNode(neighborId);
      if (node) neighbors.push({ node, edge });
    }
    return neighbors;
  }
}

export async function backfillGraphIndexes(
  kv: StateKV,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<void> {
  await withGraphIndexMutation(async () => {
    const readiness = await graphIndexReadiness(kv);
    if (!readiness.ready || !readiness.generation) {
      throw new Error("graph read indexes are unavailable");
    }
    for (const node of nodes) {
      await indexGraphNodeOrInvalidate(kv, node, readiness.generation);
    }
    for (const edge of edges) {
      await indexGraphEdgeOrInvalidate(kv, edge, readiness.generation);
    }
  });
}

export async function readIndexedGraph(
  kv: StateKV,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] } | null> {
  const reader = await GraphIndexReader.open(kv);
  if (!reader) return null;
  const nodeIds = new Set(
    (await reader.getNameCatalog()).map((entry) => entry.id),
  );
  const nodes: GraphNode[] = [];
  for (const nodeId of nodeIds) {
    const node = await reader.getNode(nodeId);
    if (node) nodes.push(node);
  }
  const edgeIds = new Set<string>();
  for (const node of nodes) {
    for (const edge of await reader.getIncidentEdges(node.id)) {
      edgeIds.add(edge.id);
    }
  }
  const edges: GraphEdge[] = [];
  for (const edgeId of edgeIds) {
    const edge = await reader.getEdge(edgeId);
    if (edge) edges.push(edge);
  }
  return (await reader.isCurrent()) ? { nodes, edges } : null;
}
