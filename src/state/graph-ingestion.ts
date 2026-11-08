import type { GraphEdge, GraphNode, GraphSnapshot, GraphMutationWrite, GraphIndexMembership } from "../types.js";
import type { StateKV } from "./kv.js";
import { KV } from "./schema.js";
import { pinGraphState, replaceGraphGeneration } from "./graph-generation.js";
import { isKeyedLockHeld, withKeyedLock } from "./keyed-mutex.js";
import { withoutGraphRecovery } from "./graph-consistency.js";

export interface GraphIngestionOptions {
  mode?: "merge" | "skip" | "lww";
  replace?: boolean;
}

const TOP_N = 500;
const BATCH_SIZE = 50;
const MAX_SNAPSHOT_EDGES = 2000;
const nodeKey = (node: GraphNode) => `${node.type}|${node.name}`;
const edgeKey = (edge: GraphEdge) => `${edge.sourceNodeId}|${edge.targetNodeId}|${edge.type}`;
const membershipKey = (scope: string, key: string) => JSON.stringify([scope, key]);

function emptySnapshot(): GraphSnapshot {
  return { version: 1, topNodes: [], topEdges: [], topDegrees: {},
    stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, edgesByType: {} },
    dirty: false, updatedAt: new Date().toISOString() };
}

function valid(row: unknown, edge: boolean): row is GraphNode | GraphEdge {
  if (!row || typeof row !== "object") return false;
  const value = row as Record<string, unknown>;
  return typeof value.id === "string" && value.id.length > 0 && typeof value.type === "string" && value.type.length > 0 &&
    (edge ? typeof value.sourceNodeId === "string" && value.sourceNodeId.length > 0 && typeof value.targetNodeId === "string" && value.targetNodeId.length > 0
      : typeof value.name === "string" && typeof value.properties === "object" && value.properties !== null && !Array.isArray(value.properties));
}

export function validateGraphRecords(nodes: unknown, edges: unknown): void {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error("Graph nodes and edges must be arrays");
  if (nodes.some((n) => !valid(n, false)) || edges.some((e) => !valid(e, true))) {
    throw new Error("Invalid graph node or edge");
  }
}

function bounded<T extends GraphNode | GraphEdge>(record: T): T {
  const ids = Array.isArray(record.sourceObservationIds) ? record.sourceObservationIds : [];
  return { ...record, sourceObservationIds: [...new Set(ids)].slice(-32) };
}

function changeCount(counts: Record<string, number>, type: string, amount: number): void {
  const next = Math.max(0, (Object.hasOwn(counts, type) ? counts[type] : 0) + amount);
  if (next) Object.defineProperty(counts, type, { value: next, writable: true, enumerable: true, configurable: true });
  else delete counts[type];
}

export async function persistGraphRecords(
  state: StateKV,
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: GraphIngestionOptions = {},
): Promise<{ nodesWritten: number; edgesWritten: number; nodesSkipped: number; edgesSkipped: number }> {
  const mode = options.mode ?? "merge";
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error("Graph nodes and edges must be arrays");
  if (mode !== "lww") validateGraphRecords(nodes, edges);
  const result = { nodesWritten: 0, edgesWritten: 0, nodesSkipped: 0, edgesSkipped: 0 };
  if (!options.replace && nodes.length === 0 && edges.length === 0) return result;
  const kv = await pinGraphState(state);
  const run = async (target: StateKV, fresh = false) => {
    // Reading through StateKV first recovers an interrupted prior batch.
    const initial = await target.get<GraphSnapshot>(KV.graphSnapshot, "current");
    if (initial && initial.version !== 1) throw new Error("Unsupported graph snapshot version");
    let snapshot = initial ?? emptySnapshot();
    if (fresh) await target.set(KV.graphSnapshot, "current", snapshot);
    const records: Array<{ row: GraphNode | GraphEdge; edge: boolean }> = [
      ...nodes.map((row) => ({ row, edge: false })), ...edges.map((row) => ({ row, edge: true })),
    ];
    for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
      snapshot = await withoutGraphRecovery(async () => {
        const before = structuredClone(snapshot);
        const next = structuredClone(snapshot);
        const writes = new Map<string, GraphMutationWrite>();
        const get = async <T>(scope: string, key: string): Promise<T | null> => {
          const staged = writes.get(JSON.stringify([scope, key]));
          return staged ? staged.value as T | null : target.get<T>(scope, key);
        };
        const set = (scope: string, key: string, value: unknown) => {
          writes.set(JSON.stringify([scope, key]), { scope, key, value });
        };
        const candidates = new Map(next.topNodes.filter((n) => !n.stale).map((n) => [n.id, n]));
        const topEdges = new Map(next.topEdges.filter((e) => !e.stale).map((e) => [e.id, e]));
        const changedDegrees = new Map<string, number>();
        const degree = async (id: string) => changedDegrees.get(id) ?? (Object.hasOwn(next.topDegrees, id) ? next.topDegrees[id] : await get<number>(KV.graphNodeDegree, id) ?? 0);
        const adjustDegree = async (id: string, delta: number) => {
          const previous = await degree(id);
          const value = Math.max(0, previous + delta);
          changedDegrees.set(id, value);
          set(KV.graphNodeDegree, id, value);
          if (delta < 0 && next.stats.totalNodes > TOP_N) next.sampleIncomplete = true;
          if (!candidates.has(id)) {
            const node = await get<GraphNode>(KV.graphNodes, id);
            if (node && !node.stale) candidates.set(id, node);
          }
        };
        const updateIndex = async (scope: string, key: string, id: string, add: boolean) => {
          const memberKey = membershipKey(scope, key);
          const saved = await get<GraphIndexMembership>(KV.graphMembership, memberKey);
          const canonical = await get<string>(scope, key);
          const ids = new Set(saved?.ids ?? []);
          if (canonical) ids.add(canonical);
          if (add) ids.add(id); else ids.delete(id);
          const members = [...ids];
          set(KV.graphMembership, memberKey, members.length ? { ids: members } : null);
          set(scope, key, members.at(-1) ?? null);
        };
        const updateAdjacency = async (edge: GraphEdge, add: boolean) => {
          for (const id of new Set([edge.sourceNodeId, edge.targetNodeId])) {
            const key = membershipKey("adjacency", id);
            const saved = await get<GraphIndexMembership>(KV.graphMembership, key);
            const ids = new Set(saved?.ids ?? []);
            if (add) ids.add(edge.id); else ids.delete(edge.id);
            set(KV.graphMembership, key, ids.size ? { ids: [...ids] } : null);
          }
        };
        for (const item of records.slice(offset, offset + BATCH_SIZE)) {
          const count = item.edge ? "edges" : "nodes";
          const incoming = item.row;
          const timestamp = item.edge ? incoming?.createdAt : (incoming as GraphNode)?.updatedAt || incoming?.createdAt;
          if (!valid(incoming, item.edge) || (mode === "lww" && (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))))) {
            result[`${count}Skipped`] += 1;
            continue;
          }
          const scope = item.edge ? KV.graphEdges : KV.graphNodes;
          const indexScope = item.edge ? KV.graphEdgeKey : KV.graphNameIndex;
          const keyFor = item.edge ? (r: GraphNode | GraphEdge) => edgeKey(r as GraphEdge) : (r: GraphNode | GraphEdge) => nodeKey(r as GraphNode);
          const old = await get<GraphNode | GraphEdge>(scope, incoming.id);
          const oldTs = item.edge ? old?.createdAt : (old as GraphNode)?.updatedAt || old?.createdAt;
          if ((mode === "skip" && old) || (mode === "lww" && old && Date.parse(oldTs ?? "") >= Date.parse(timestamp))) {
            result[`${count}Skipped`] += 1;
            continue;
          }
          const row = bounded(incoming);
          if (old && JSON.stringify(old) === JSON.stringify(row)) {
            // Still reconcile old imports whose raw row predates the indexes.
            const members = await get<GraphIndexMembership>(KV.graphMembership, membershipKey(indexScope, keyFor(row)));
            if (members?.ids.includes(row.id)) { result[`${count}Written`] += 1; continue; }
          }
          const oldIndexed = old && (await get<string>(indexScope, keyFor(old)) === old.id ||
            (await get<GraphIndexMembership>(KV.graphMembership, membershipKey(indexScope, keyFor(old))))?.ids.includes(old.id) ||
            (item.edge ? topEdges.has(old.id) : candidates.has(old.id)));
          const oldLive = old && !old.stale && oldIndexed;
          const newLive = !row.stale;
          const counts = item.edge ? next.stats.edgesByType : next.stats.nodesByType;
          const total = item.edge ? "totalEdges" : "totalNodes";
          if (oldLive) { next.stats[total] = Math.max(0, next.stats[total] - 1); changeCount(counts, old.type, -1); }
          if (newLive) { next.stats[total] += 1; changeCount(counts, row.type, 1); }
          if (old) await updateIndex(indexScope, keyFor(old), old.id, false);
          if (newLive) await updateIndex(indexScope, keyFor(row), row.id, true);
          set(scope, row.id, row);
          if (item.edge) {
            topEdges.delete(row.id);
            if (old) await updateAdjacency(old as GraphEdge, false);
            if (newLive) await updateAdjacency(row as GraphEdge, true);
            if (oldLive) {
              await adjustDegree((old as GraphEdge).sourceNodeId, -1);
              await adjustDegree((old as GraphEdge).targetNodeId, -1);
            }
            if (newLive) {
              const edge = row as GraphEdge;
              await adjustDegree(edge.sourceNodeId, 1);
              await adjustDegree(edge.targetNodeId, 1);
              topEdges.set(edge.id, edge);
            }
          } else {
            candidates.delete(row.id);
            if (newLive) candidates.set(row.id, row as GraphNode);
            else if (next.stats.totalNodes > TOP_N) next.sampleIncomplete = true;
            const value = await degree(row.id);
            set(KV.graphNodeDegree, row.id, value);
          }
          result[`${count}Written`] += 1;
        }
        if (!writes.size) return snapshot;
        const degrees = new Map<string, number>();
        for (const id of candidates.keys()) degrees.set(id, await degree(id));
        next.topNodes = [...candidates.values()].sort((a, b) => degrees.get(b.id)! - degrees.get(a.id)!).slice(0, TOP_N);
        const ids = new Set(next.topNodes.map((n) => n.id));
        next.topDegrees = Object.fromEntries(next.topNodes.map((n) => [n.id, degrees.get(n.id)!]));
        const previouslyCached = new Set(before.topNodes.map((n) => n.id));
        let remainingEdgeReads = MAX_SNAPSHOT_EDGES;
        for (const id of ids) {
          if (previouslyCached.has(id)) continue;
          const adjacent = await get<GraphIndexMembership>(KV.graphMembership, membershipKey("adjacency", id));
          for (const edgeId of adjacent?.ids ?? []) {
            if (topEdges.has(edgeId)) continue;
            if (remainingEdgeReads-- <= 0) { next.sampleIncomplete = true; break; }
            const edge = await get<GraphEdge>(KV.graphEdges, edgeId);
            if (edge && !edge.stale) topEdges.set(edge.id, edge);
          }
        }
        next.topEdges = [...topEdges.values()].filter((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId));
        if (next.topEdges.length > MAX_SNAPSHOT_EDGES) {
          next.topEdges = next.topEdges.slice(-MAX_SNAPSHOT_EDGES);
          next.sampleIncomplete = true;
        }
        if (next.stats.totalNodes === 0) { next.topNodes = []; next.topEdges = []; next.topDegrees = {}; }
        next.updatedAt = new Date().toISOString();
        next.dirty = false;
        const pending = { ...before, dirty: true, pendingMutation: { writes: [...writes.values()], snapshot: next } };
        // Absolute writes make replay idempotent even if the engine committed a
        // write whose response was lost. The final snapshot clears the journal.
        if (Buffer.byteLength(JSON.stringify(pending), "utf8") > 8 * 1024 * 1024) {
          throw new Error("Graph reconciliation batch exceeds the 8 MiB state payload budget; reduce graph record size");
        }
        await target.set(KV.graphSnapshot, "current", pending);
        for (const write of writes.values()) {
          if (write.value === null) await target.delete(write.scope, write.key);
          else await target.set(write.scope, write.key, write.value);
        }
        await target.set(KV.graphSnapshot, "current", next);
        return next;
      });
    }
    return result;
  };
  const persist = () => options.replace
    ? replaceGraphGeneration(kv, (fresh) => run(fresh, true))
    : run(kv);
  return isKeyedLockHeld("graph:persist") ? persist() : withKeyedLock("graph:persist", persist);
}
