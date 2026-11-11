import { createHash, randomUUID } from "node:crypto";
import type { GraphEdge, GraphNode, GraphSnapshot, GraphRetrievalIndexControl, GraphRetrievalIndexRecord } from "../types.js";
import type { StateKV } from "./kv.js";
import { getGraphGeneration, pinGraphState, pinGraphStateGeneration } from "./graph-generation.js";
import { ensureGraphConsistency, noteGraphSnapshotWrite, withoutGraphRecovery } from "./graph-consistency.js";
import { isKeyedLockHeld, withKeyedLock } from "./keyed-mutex.js";
import { KV } from "./schema.js";

export const GRAPH_INDEX_MAX_ID_BYTES = 1024;
export const GRAPH_INDEX_MAX_RECORD_BYTES = 32 * 1024;
const MAX_CONTROL_BYTES = 8 * 1024;
const MAX_PROJECTION_BYTES = 16 * 1024;
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const MAX_POSTINGS = 192;
const CONTROL_KEY = "current";
export type GraphIndexRecordKind = "node" | "edge" | "history";
export type GraphPostingKind = "name" | "character" | "observation" | "edgeObservation" | "edgeKey" | "adjacency" | "history" | "nodes" | "edges" | "historyEdges";
export type GraphNodeProjection = GraphNode & { indexIncomplete?: boolean };
export type GraphEdgeProjection = GraphEdge & { indexIncomplete?: boolean };
type PostingRoot = { head: string | null; count: number };
type PostingEntry = { id: string; previous: string | null; next: string | null };
type IndexWrite = { key: string; value: unknown };
type IndexJournal = { schema: 1; buildId: string; revision: number; writes: IndexWrite[]; next: GraphRetrievalIndexControl };

export class GraphIndexError extends Error {}
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
const hash = (value: string) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= GRAPH_INDEX_MAX_ID_BYTES;
const finiteCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const boundedOption = (value: number | undefined, fallback: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(1, Math.floor(value!))) : fallback;
const graphLock = <T>(fn: () => Promise<T>) => isKeyedLockHeld("graph:persist") ? fn() : withKeyedLock("graph:persist", fn);
async function lock<T>(state: StateKV, fn: () => Promise<T>): Promise<T> {
  const key = `graph:retrieval:${await getGraphGeneration(state) ?? "legacy"}`;
  return isKeyedLockHeld(key) ? fn() : withKeyedLock(key, fn);
}
const WAIT_FOR_BATCH = Symbol("graph index batch");
const NODE_TYPES = new Set(["file", "function", "concept", "error", "decision", "pattern", "library", "person", "project", "preference", "location", "organization", "event"]);
const EDGE_TYPES = new Set(["uses", "imports", "modifies", "causes", "fixes", "depends_on", "related_to", "works_at", "prefers", "blocked_by", "caused_by", "optimizes_for", "rejected", "avoids", "located_in", "succeeded_by"]);
export const normalizeGraphIndexText = (value: string): string => value.normalize("NFKC").toLowerCase();
export const graphEdgeLookupKey = (edge: Pick<GraphEdge, "sourceNodeId" | "targetNodeId" | "type">): string => JSON.stringify([edge.sourceNodeId, edge.targetNodeId, edge.type]);
const token = (kind: GraphPostingKind, value: string) => hash(`${kind}\0${kind === "name" || kind === "character" ? normalizeGraphIndexText(value) : value}`);
const recordKey = (buildId: string, kind: GraphIndexRecordKind, id: string) => `${buildId}:record:${kind}:${hash(id)}`;
const rootKey = (buildId: string, posting: string) => `${buildId}:root:${posting}`;
const entryKey = (buildId: string, posting: string, id: string) => `${buildId}:entry:${posting}:${id}`;
const countKey = (kind: GraphIndexRecordKind) => kind === "node" ? "nodes" : kind === "edge" ? "edges" : "historyEdges";

function validateControl(value: GraphRetrievalIndexControl): void {
  if (bytes(value) > MAX_CONTROL_BYTES || value.schema !== 2 || typeof value.buildId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.buildId) ||
      !["building", "ready", "paused"].includes(value.status) ||
      ![value.revision, value.nodes, value.edges, value.historyEdges, value.incompleteRecords, value.otherTypes].every(finiteCount) ||
      !value.nodesByType || !value.edgesByType ||
      Object.entries(value.nodesByType).some(([type, count]) => (!NODE_TYPES.has(type) && type !== "other") || !finiteCount(count)) ||
      Object.entries(value.edgesByType).some(([type, count]) => (!EDGE_TYPES.has(type) && type !== "other") || !finiteCount(count)) ||
      (value.batchPending !== undefined && typeof value.batchPending !== "boolean") ||
      (value.pending && (!["node", "edge", "history"].includes(value.pending.kind) || !validId(value.pending.id)))) {
    throw new GraphIndexError("Invalid graph retrieval index control; run explicit graph-index migration");
  }
}

export async function getGraphIndexStatus(state: StateKV): Promise<GraphRetrievalIndexControl | null> {
  const value = await state.get<GraphRetrievalIndexControl>(KV.graphRetrievalControl, CONTROL_KEY);
  if (value !== null && value !== undefined) validateControl(value);
  return value ?? null;
}

export async function initializeGraphIndex(state: StateKV, options: { status: "building" | "ready"; buildId?: string }): Promise<GraphRetrievalIndexControl> {
  const kv = await pinGraphState(state);
  return lock(kv, async () => {
    const value: GraphRetrievalIndexControl = { schema: 2, buildId: options.buildId ?? randomUUID(), status: options.status,
      revision: 0, nodes: 0, edges: 0, historyEdges: 0, incompleteRecords: 0, nodesByType: {}, edgesByType: {}, otherTypes: 0, updatedAt: new Date().toISOString() };
    validateControl(value);
    const previous = await kv.get<GraphRetrievalIndexControl>(KV.graphRetrievalControl, CONTROL_KEY);
    if (previous?.buildId === value.buildId) throw new GraphIndexError("A graph index rebuild requires a new build ID");
    await kv.set(KV.graphRetrievalControl, CONTROL_KEY, value);
    return value;
  });
}

function project(kind: GraphIndexRecordKind, id: string, input: unknown): GraphRetrievalIndexRecord | null {
  if (input === null || input === undefined) return null;
  const source = input as Record<string, unknown>;
  if (!source || typeof source !== "object" || Array.isArray(source) || !validId(id) || source.id !== id) {
    return { row: null, postings: [], incomplete: true };
  }
  if (source.stale === true) return { row: null, postings: [], incomplete: false };
  let incomplete = false;
  const text = (value: unknown, max = 512): string => {
    if (typeof value !== "string") { incomplete = true; return ""; }
    const result = Array.from(value.slice(0, max * 2)).slice(0, max).join("");
    if (result !== value) incomplete = true;
    return result;
  };
  const ids: string[] = [];
  if (!Array.isArray(source.sourceObservationIds)) incomplete = true;
  else for (const value of source.sourceObservationIds.slice(0, 512)) {
    if (!validId(value)) { incomplete = true; continue; }
    if (ids.includes(value)) continue;
    if (ids.length >= 128) { incomplete = true; break; }
    ids.push(value);
  }
  if (Array.isArray(source.sourceObservationIds) && source.sourceObservationIds.length > 512) incomplete = true;
  const common = { id, type: text(source.type, 64), sourceObservationIds: ids, createdAt: text(source.createdAt, 64) };
  let row: GraphNodeProjection | GraphEdgeProjection;
  if (kind === "node") {
    const properties: Record<string, unknown> = {};
    if (!source.properties || typeof source.properties !== "object" || Array.isArray(source.properties)) incomplete = true;
    else for (const key in source.properties) {
      if (!Object.hasOwn(source.properties, key)) continue;
      if (Object.keys(properties).length >= 32) { incomplete = true; break; }
      const value = (source.properties as Record<string, unknown>)[key];
      if (key.length > 128) { incomplete = true; continue; }
      if (typeof value === "string") Object.defineProperty(properties, key, { value: text(value), enumerable: true, writable: true, configurable: true });
      else if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) Object.defineProperty(properties, key, { value, enumerable: true, writable: true, configurable: true });
      else incomplete = true;
    }
    const aliases = Array.isArray(source.aliases) ? source.aliases.slice(0, 16).filter((v): v is string => typeof v === "string").map((v) => text(v)) : [];
    if (Array.isArray(source.aliases) && aliases.length !== source.aliases.length) incomplete = true;
    row = { ...common, type: common.type as GraphNode["type"], name: text(source.name), properties, ...(aliases.length ? { aliases } : {}),
      ...(typeof source.updatedAt === "string" ? { updatedAt: text(source.updatedAt, 64) } : {}) };
  } else {
    if (!validId(source.sourceNodeId) || !validId(source.targetNodeId)) return { row: null, postings: [], incomplete: true };
    const edge: GraphEdgeProjection = { ...common, type: common.type as GraphEdge["type"], sourceNodeId: source.sourceNodeId,
      targetNodeId: source.targetNodeId, weight: typeof source.weight === "number" && Number.isFinite(source.weight) ? source.weight : 0 };
    if (edge.weight !== source.weight) incomplete = true;
    for (const key of ["tcommit", "tvalid", "tvalidEnd", "supersededBy"] as const) if (typeof source[key] === "string") edge[key] = text(source[key], key === "supersededBy" ? 1024 : 64);
    if (typeof source.version === "number" && Number.isFinite(source.version)) edge.version = source.version;
    if (typeof source.isLatest === "boolean") edge.isLatest = source.isLatest;
    if (source.context && typeof source.context === "object" && !Array.isArray(source.context)) {
      const context = source.context as Record<string, unknown>;
      edge.context = {};
      for (const key of ["reasoning", "sentiment"] as const) if (typeof context[key] === "string") edge.context[key] = text(context[key]);
      if (typeof context.confidence === "number" && Number.isFinite(context.confidence)) edge.context.confidence = context.confidence;
      if (context.alternatives !== undefined || context.situationalFactors !== undefined) incomplete = true;
    }
    row = edge;
  }
  while (bytes(row) > MAX_PROJECTION_BYTES - 64) {
    incomplete = true;
    if ("properties" in row && Object.keys(row.properties).length) delete row.properties[Object.keys(row.properties).at(-1)!];
    else if ("aliases" in row && row.aliases?.length) row.aliases.pop();
    else if ("context" in row && row.context) delete row.context;
    else if (row.sourceObservationIds.length) row.sourceObservationIds.pop();
    else return { row: null, postings: [], incomplete: true };
  }
  const postings = new Set<string>([token(countKey(kind), "")]);
  if (kind === "node") {
    const node = row as GraphNodeProjection;
    for (const value of [node.name, ...(node.aliases ?? [])]) postings.add(token("name", value));
    const searchable = [node.name, ...(node.aliases ?? []), ...Object.values(node.properties).filter((v): v is string => typeof v === "string")];
    const characters = new Set(searchable.flatMap((value) => Array.from(normalizeGraphIndexText(value))));
    for (const character of characters) {
      if (postings.size >= MAX_POSTINGS - row.sourceObservationIds.length) { incomplete = true; break; }
      postings.add(token("character", character));
    }
    for (const observationId of row.sourceObservationIds) postings.add(token("observation", observationId));
  } else {
    const edge = row as GraphEdgeProjection;
    for (const nodeId of [edge.sourceNodeId, edge.targetNodeId]) postings.add(token(kind === "history" ? "history" : "adjacency", nodeId));
    if (kind === "edge") {
      if (edge.isLatest !== false) postings.add(token("edgeKey", graphEdgeLookupKey(edge)));
      for (const observationId of row.sourceObservationIds) postings.add(token("edgeObservation", observationId));
    }
  }
  if (incomplete) row.indexIncomplete = true;
  return { row, postings: [...postings], incomplete };
}

function validateRecord(value: GraphRetrievalIndexRecord): void {
  if (bytes(value) > GRAPH_INDEX_MAX_RECORD_BYTES || !Array.isArray(value.postings) || value.postings.length > MAX_POSTINGS ||
      value.postings.some((p) => !/^[a-f0-9]{64}$/.test(p)) || typeof value.incomplete !== "boolean") throw new GraphIndexError("Invalid graph retrieval record");
}

async function planRecord(kv: StateKV, control: GraphRetrievalIndexControl, kind: GraphIndexRecordKind, id: string, input: unknown): Promise<IndexJournal> {
  const writes = new Map<string, unknown>();
  const read = async <T>(key: string): Promise<T | null> => writes.has(key) ? writes.get(key) as T | null : kv.get<T>(KV.graphRetrievalData, key);
  const put = (key: string, value: unknown) => { if (bytes(value) > GRAPH_INDEX_MAX_RECORD_BYTES) throw new GraphIndexError("Graph retrieval index write exceeds record budget"); writes.set(key, value); };
  const key = recordKey(control.buildId, kind, id);
  const before = await read<GraphRetrievalIndexRecord>(key);
  if (before) validateRecord(before);
  const after = project(kind, id, input);
  if (after) validateRecord(after);
  const memberId = hash(id);
  const editPosting = async (posting: string, add: boolean) => {
    const rootId = rootKey(control.buildId, posting), itemId = entryKey(control.buildId, posting, memberId);
    const root = await read<PostingRoot>(rootId) ?? { head: null, count: 0 };
    const saved = await read<PostingEntry>(itemId);
    if (!finiteCount(root.count) || (root.head !== null && !/^[a-f0-9]{64}$/.test(root.head))) throw new GraphIndexError("Invalid graph posting root");
    if (add) {
      if (saved) return;
      if (root.head) {
        const headId = entryKey(control.buildId, posting, root.head), head = await read<PostingEntry>(headId);
        if (!head) throw new GraphIndexError("Missing graph posting head");
        put(headId, { ...head, previous: memberId });
      }
      put(itemId, { id, previous: null, next: root.head });
      put(rootId, { head: memberId, count: root.count + 1 });
    } else {
      if (!saved) return;
      if (saved.previous) {
        const previousId = entryKey(control.buildId, posting, saved.previous), previous = await read<PostingEntry>(previousId);
        if (!previous) throw new GraphIndexError("Missing previous graph posting entry");
        put(previousId, { ...previous, next: saved.next });
      } else {
        if (root.head !== memberId) throw new GraphIndexError("Invalid graph posting head link");
        root.head = saved.next;
      }
      if (saved.next) {
        const nextId = entryKey(control.buildId, posting, saved.next), next = await read<PostingEntry>(nextId);
        if (!next) throw new GraphIndexError("Missing next graph posting entry");
        put(nextId, { ...next, previous: saved.previous });
      }
      put(itemId, null);
      put(rootId, { head: root.head, count: Math.max(0, root.count - 1) });
    }
  };
  const oldPostings = new Set(before?.postings ?? []), newPostings = new Set(after?.postings ?? []);
  for (const posting of oldPostings) if (!newPostings.has(posting)) await editPosting(posting, false);
  for (const posting of newPostings) if (!oldPostings.has(posting)) await editPosting(posting, true);
  put(key, after);
  const { pending: _, ...clean } = control;
  const next = { ...clean, revision: control.revision + 1, updatedAt: new Date().toISOString() };
  const counted = (row: GraphNode | GraphEdge | null | undefined) => Boolean(row && (kind !== "edge" || (row as GraphEdge).isLatest !== false));
  next[countKey(kind)] += Number(counted(after?.row)) - Number(counted(before?.row));
  next.incompleteRecords += Number(Boolean(after?.incomplete)) - Number(Boolean(before?.incomplete));
  if (kind !== "history") {
    const field = kind === "node" ? "nodesByType" : "edgesByType";
    const known = kind === "node" ? NODE_TYPES : EDGE_TYPES;
    next[field] = { ...control[field] };
    for (const [row, amount] of [[before?.row, -1], [after?.row, 1]] as const) {
      if (!row || !counted(row)) continue;
      const type = known.has(row.type) ? row.type : "other";
      next[field][type] = (next[field][type] ?? 0) + amount;
      if (!next[field][type]) delete next[field][type];
      if (type === "other") next.otherTypes += amount;
    }
  }
  validateControl(next);
  const journal: IndexJournal = { schema: 1, buildId: control.buildId, revision: control.revision, writes: [...writes].map(([key, value]) => ({ key, value })), next };
  if (bytes(journal) > MAX_JOURNAL_BYTES) throw new GraphIndexError("Graph retrieval index journal exceeds payload budget");
  return journal;
}

async function applyJournal(kv: StateKV, control: GraphRetrievalIndexControl, journal: IndexJournal): Promise<void> {
  if (journal.schema !== 1 || journal.buildId !== control.buildId || journal.revision !== control.revision ||
      !Array.isArray(journal.writes) || journal.writes.length > 2048 || bytes(journal) > MAX_JOURNAL_BYTES || journal.next.buildId !== control.buildId ||
      journal.next.revision !== control.revision + 1 || journal.next.pending) throw new GraphIndexError("Invalid graph retrieval recovery journal");
  validateControl(journal.next);
  for (const write of journal.writes) {
    if (!write || typeof write.key !== "string" || !write.key.startsWith(`${control.buildId}:`) || write.key.length > 512 || bytes(write.value) > GRAPH_INDEX_MAX_RECORD_BYTES) {
      throw new GraphIndexError("Invalid graph retrieval recovery write");
    }
  }
  for (const write of journal.writes) {
    if (write.value === null) await kv.delete(KV.graphRetrievalData, write.key);
    else await kv.set(KV.graphRetrievalData, write.key, write.value);
  }
  await kv.set(KV.graphRetrievalControl, CONTROL_KEY, journal.next);
}

async function reconcilePending(kv: StateKV, control: GraphRetrievalIndexControl, input?: unknown): Promise<void> {
  if (!control.pending) return;
  const journalKey = `journal:${control.buildId}`;
  const saved = await kv.get<IndexJournal>(KV.graphRetrievalControl, journalKey);
  if (saved?.buildId === control.buildId && saved.revision === control.revision) return applyJournal(kv, control, saved);
  const { kind, id } = control.pending;
  const scope = kind === "node" ? KV.graphNodes : kind === "edge" ? KV.graphEdges : KV.graphEdgeHistory;
  const row = input === undefined ? await withoutGraphRecovery(() => kv.get(scope, id)) : input;
  const journal = await planRecord(kv, control, kind, id, row);
  await kv.set(KV.graphRetrievalControl, journalKey, journal);
  await applyJournal(kv, control, journal);
}

export async function recoverGraphIndex(state: StateKV, options: { allowSnapshotRecovery?: boolean } = {}): Promise<void> {
  const kv = await pinGraphState(state);
  await graphLock(() => lock(kv, async () => {
    let control = await getGraphIndexStatus(kv);
    if (control?.batchPending && options.allowSnapshotRecovery) {
      const snapshot = await withoutGraphRecovery(() => kv.get<GraphSnapshot>(KV.graphSnapshot, "current"));
      if (snapshot?.pendingMutation) {
        const generation = await getGraphGeneration(kv);
        const scope = generation === null ? KV.graphSnapshot : `${KV.graphSnapshot}:generation:${generation}`;
        noteGraphSnapshotWrite(kv, scope, "current");
        await ensureGraphConsistency(kv, scope);
      } else if (snapshot && !snapshot.dirty) {
        const { batchPending: _, ...clean } = control;
        await kv.set(KV.graphRetrievalControl, CONTROL_KEY, { ...clean, revision: clean.revision + 1 });
      }
      control = await getGraphIndexStatus(kv);
    }
    if (control?.pending) await reconcilePending(kv, control);
  }));
}

export async function reconcileGraphIndexRecord(state: StateKV, kind: GraphIndexRecordKind, id: string, row: GraphNode | GraphEdge | null, options: { readCanonical?: boolean } = {}): Promise<void> {
  const kv = await pinGraphState(state);
  await lock(kv, async () => {
    let control = await getGraphIndexStatus(kv);
    if (!control) throw new GraphIndexError("Graph retrieval index must be initialized explicitly");
    if (control.status === "paused") throw new GraphIndexError("Graph retrieval index is paused; run explicit migration");
    if (control.pending) { await reconcilePending(kv, control); control = (await getGraphIndexStatus(kv))!; }
    if (!validId(id)) throw new GraphIndexError("Graph record ID exceeds index migration budget");
    control = { ...control, pending: { kind, id } };
    await kv.set(KV.graphRetrievalControl, CONTROL_KEY, control);
    await reconcilePending(kv, control, options.readCanonical ? undefined : row);
  });
}

export async function mutateIndexedGraphRecord(state: StateKV, kind: GraphIndexRecordKind, id: string, transform: (row: GraphNode | GraphEdge | null) => GraphNode | GraphEdge | null | undefined): Promise<boolean> {
  const kv = await pinGraphState(state);
  return graphLock(() => lock(kv, async () => {
    const control = await getGraphIndexStatus(kv);
    if (!control || control.status !== "ready" || control.pending || control.batchPending) throw new GraphIndexError("Graph index is unavailable; retry the graph mutation after recovery");
    const scope = kind === "node" ? KV.graphNodes : kind === "edge" ? KV.graphEdges : KV.graphEdgeHistory;
    const current = await withoutGraphRecovery(() => kv.get<GraphNode | GraphEdge>(scope, id));
    const next = transform(current);
    if (next === undefined) return false;
    if (next === null) await withoutGraphRecovery(() => kv.delete(scope, id));
    else await withoutGraphRecovery(() => kv.set(scope, id, next));
    return true;
  }));
}

export async function finishGraphIndexBuild(state: StateKV, buildId: string): Promise<GraphRetrievalIndexControl> {
  const kv = await pinGraphState(state);
  return lock(kv, async () => {
    const current = await getGraphIndexStatus(kv);
    if (!current || current.buildId !== buildId || current.status === "paused" || current.pending || current.batchPending) throw new GraphIndexError("Graph index build is incomplete or superseded");
    const next = { ...current, status: "ready" as const, revision: current.revision + 1, updatedAt: new Date().toISOString() };
    await kv.set(KV.graphRetrievalControl, CONTROL_KEY, next);
    return next;
  });
}

function canonicalScope(scope: string): { kind: GraphIndexRecordKind; generation: string | null } | null {
  for (const [base, kind] of [[KV.graphNodes, "node"], [KV.graphEdges, "edge"], [KV.graphEdgeHistory, "history"]] as const) {
    if (scope === base) return { kind, generation: null };
    if (scope.startsWith(`${base}:generation:`)) return { kind, generation: scope.slice(base.length + 12) };
  }
  return null;
}

export async function withGraphIndexMutation<T>(state: StateKV, scope: string, id: string, mutate: () => Promise<T>): Promise<T> {
  const location = canonicalScope(scope);
  if (!location) return mutate();
  const kv = pinGraphStateGeneration(state, location.generation);
  const run = () => lock(kv, async () => {
    let control = await getGraphIndexStatus(kv);
    if (!control || control.status === "paused") return mutate();
    if (control.batchPending && !isKeyedLockHeld("graph:persist")) throw WAIT_FOR_BATCH;
    if (control.pending) { await reconcilePending(kv, control); control = (await getGraphIndexStatus(kv))!; }
    if (!validId(id)) {
      await kv.set(KV.graphRetrievalControl, CONTROL_KEY, { ...control, status: "paused", error: "Graph record ID exceeds bounded recovery budget", revision: control.revision + 1 });
      return mutate();
    }
    control = { ...control, pending: { kind: location.kind, id } };
    await kv.set(KV.graphRetrievalControl, CONTROL_KEY, control);
    const result = await mutate();
    await reconcilePending(kv, control);
    return result;
  });
  try { return await run(); } catch (error) {
    if (error !== WAIT_FOR_BATCH) throw error;
    return graphLock(run);
  }
}

export async function withGraphSnapshotIndexBarrier<T>(state: StateKV, scope: string, key: string, value: unknown, mutate: () => Promise<T>): Promise<T> {
  if (key !== "current" || !(scope === KV.graphSnapshot || scope.startsWith(`${KV.graphSnapshot}:generation:`))) return mutate();
  const kv = pinGraphStateGeneration(state, scope === KV.graphSnapshot ? null : scope.slice(KV.graphSnapshot.length + 12));
  return graphLock(() => lock(kv, async () => {
    const control = await getGraphIndexStatus(kv);
    if (!control) return mutate();
    const snapshot = value as GraphSnapshot | null;
    const dirty = !snapshot || typeof snapshot !== "object" || snapshot.version !== 1 || snapshot.dirty !== false || Boolean(snapshot.pendingMutation);
    if (dirty && !control.batchPending) await kv.set(KV.graphRetrievalControl, CONTROL_KEY, { ...control, batchPending: true });
    const result = await mutate();
    if (!dirty) {
      const after = await getGraphIndexStatus(kv);
      if (after?.batchPending && !after.pending) {
        const { batchPending: _, ...clean } = after;
        await kv.set(KV.graphRetrievalControl, CONTROL_KEY, { ...clean, revision: clean.revision + 1, updatedAt: new Date().toISOString() });
      }
    }
    return result;
  }));
}

export async function withGraphSnapshotUnknownMutation<T>(state: StateKV, scope: string, key: string, mutate: () => Promise<T>): Promise<T> {
  if (key !== "current" || !(scope === KV.graphSnapshot || scope.startsWith(`${KV.graphSnapshot}:generation:`))) return mutate();
  return graphLock(async () => {
    const result = await withGraphSnapshotIndexBarrier(state, scope, key, { dirty: true }, mutate);
    const snapshot = await withoutGraphRecovery(() => state.get(scope, key));
    return withGraphSnapshotIndexBarrier(state, scope, key, snapshot, async () => result);
  });
}

export interface GraphIndexReaderOptions { signal?: AbortSignal; maxReads?: number; maxBytes?: number; maxConcurrent?: number }
export class GraphIndexReader {
  readonly status: GraphRetrievalIndexControl;
  exhausted = false;
  private reads = 2;
  private readBytes: number;
  private active = 0;
  private waiting: Array<() => void> = [];
  private cache = new Map<string, Promise<unknown>>();
  private readonly maxReads: number;
  private readonly maxBytes: number;
  private readonly maxConcurrent: number;
  constructor(private state: StateKV, private generation: string | null, status: GraphRetrievalIndexControl, private options: GraphIndexReaderOptions) {
    this.status = status;
    this.readBytes = bytes(status);
    this.maxReads = boundedOption(options.maxReads, 512, 4096);
    this.maxBytes = boundedOption(options.maxBytes, 2 * 1024 * 1024, 16 * 1024 * 1024);
    this.maxConcurrent = boundedOption(options.maxConcurrent, 4, 8);
  }
  get remainingReads(): number { return Math.max(0, this.maxReads - this.reads - 2); }
  async read<T>(scope: string, key: string): Promise<T | null> {
    if (scope !== KV.graphRetrievalData) return this.readFresh<T>(scope, key);
    const cached = this.cache.get(key);
    if (cached) return cached as Promise<T | null>;
    const pending = this.readFresh<T>(scope, key);
    if (!this.exhausted) this.cache.set(key, pending);
    return pending;
  }
  async readFresh<T>(scope: string, key: string): Promise<T | null> {
    if (this.options.signal?.aborted || this.exhausted || this.remainingReads === 0 || this.readBytes >= this.maxBytes) { this.exhausted = true; return null; }
    this.reads++;
    if (this.active >= this.maxConcurrent) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      if (this.options.signal?.aborted || this.exhausted) { this.exhausted = true; return null; }
      const value = await this.state.get<T>(scope, key);
      const size = bytes(value);
      this.readBytes += size;
      if (this.readBytes > this.maxBytes || this.options.signal?.aborted) { this.exhausted = true; return null; }
      if (scope === KV.graphRetrievalData && size > GRAPH_INDEX_MAX_RECORD_BYTES) throw new GraphIndexError("Graph retrieval record exceeds payload budget");
      return value;
    } finally {
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }
  private async record(kind: GraphIndexRecordKind, id: string): Promise<GraphRetrievalIndexRecord | null> {
    if (!validId(id)) { this.exhausted = true; return null; }
    const value = await this.read<GraphRetrievalIndexRecord>(KV.graphRetrievalData, recordKey(this.status.buildId, kind, id));
    if (value) validateRecord(value);
    return value;
  }
  async getNode(id: string): Promise<GraphNodeProjection | null> { return (await this.record("node", id))?.row as GraphNodeProjection | null ?? null; }
  async getEdge(id: string): Promise<GraphEdgeProjection | null> { return (await this.record("edge", id))?.row as GraphEdgeProjection | null ?? null; }
  async getHistoryEdge(id: string): Promise<GraphEdgeProjection | null> { return (await this.record("history", id))?.row as GraphEdgeProjection | null ?? null; }
  async posting(kind: GraphPostingKind, key = "", options: { cursor?: string | null; limit?: number } = {}): Promise<{ ids: string[]; cursor: string | null; total: number }> {
    const posting = token(kind, key), root = await this.read<PostingRoot>(KV.graphRetrievalData, rootKey(this.status.buildId, posting));
    const inventoryCount = key === "" && (kind === "nodes" || kind === "edges" || kind === "historyEdges") ? this.status[kind] : undefined;
    if (!root) {
      if (!this.exhausted && inventoryCount) throw new GraphIndexError("Missing graph inventory root");
      return { ids: [], cursor: null, total: 0 };
    }
    if (!finiteCount(root.count) || (root.head !== null && !/^[a-f0-9]{64}$/.test(root.head)) ||
        (root.count === 0) !== (root.head === null)) throw new GraphIndexError("Invalid graph posting root");
    if (inventoryCount !== undefined && (kind === "edges" ? root.count < inventoryCount : root.count !== inventoryCount)) {
      throw new GraphIndexError("Graph inventory count does not match index control");
    }
    const prefix = `${this.status.buildId}.${this.status.revision}.${posting}.`;
    if (options.cursor && (!options.cursor.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(options.cursor.slice(prefix.length)))) throw new GraphIndexError("Invalid or expired graph posting cursor");
    let current = options.cursor ? options.cursor.slice(prefix.length) : root.head;
    const limit = boundedOption(options.limit, 64, 128), ids: string[] = [], seen = new Set<string>();
    while (current && ids.length < limit) {
      if (seen.has(current)) throw new GraphIndexError("Cyclic graph posting entry");
      seen.add(current);
      const value = await this.read<PostingEntry>(KV.graphRetrievalData, entryKey(this.status.buildId, posting, current));
      if (!value) { if (this.exhausted) break; throw new GraphIndexError("Missing graph posting entry"); }
      if (!validId(value.id) || hash(value.id) !== current || (value.next !== null && !/^[a-f0-9]{64}$/.test(value.next))) throw new GraphIndexError("Invalid graph posting entry");
      ids.push(value.id); current = value.next;
    }
    return { ids, cursor: current ? `${prefix}${current}` : null, total: root.count };
  }
  async finish(): Promise<boolean> {
    if (this.options.signal?.aborted || this.reads + 2 > this.maxReads) return false;
    this.reads += 2;
    const current = await getGraphIndexStatus(this.state);
    const generation = await this.state.get<string>(KV.graphControl, "generation");
    if ((generation ?? null) !== this.generation) return false;
    this.readBytes += bytes(generation) + bytes(current);
    if (this.readBytes > this.maxBytes) { this.exhausted = true; return false; }
    return Boolean(current && current.status === "ready" && !current.pending && !current.batchPending && current.buildId === this.status.buildId && current.revision === this.status.revision);
  }
}

export async function createGraphIndexReader(state: StateKV, options: GraphIndexReaderOptions = {}): Promise<GraphIndexReader | null> {
  if (options.signal?.aborted) return null;
  const kv = await pinGraphState(state), generation = await getGraphGeneration(kv), status = await getGraphIndexStatus(kv);
  if (!status || status.status !== "ready" || status.pending || status.batchPending) return null;
  return new GraphIndexReader(kv, generation, status, options);
}
