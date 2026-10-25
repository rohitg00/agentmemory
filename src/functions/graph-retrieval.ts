import type { CompressedObservation, GraphNode, GraphEdge, Memory } from "../types.js";
import { matchesSearchLayer, type SearchLayer, type SearchLayerResolver, type SearchResultLayer } from "../state/search-layer.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { lookupObservationSession } from "../state/obs-index.js";
import { memoryToObservation } from "../state/memory-utils.js";
import { createGraphIndexReader, getGraphIndexStatus, normalizeGraphIndexText, type GraphIndexReader } from "../state/graph-retrieval-index.js";

export interface GraphRetrievalResult {
  obsId: string;
  sessionId: string;
  score: number;
  graphContext: string;
  pathLength: number;
}

export type GraphObservationAuthorization = (
  record: CompressedObservation | Memory,
  sessionId: string,
  read: GraphIndexReader["read"],
) => boolean | Promise<boolean>;

export type GraphQueryDiagnostic = { status: string; truncated: boolean; reason?: string };

type Evidence = { observation: CompressedObservation; layer: SearchResultLayer };
type Path = Array<{ node: GraphNode; edge?: GraphEdge }>;
const MAX_START_NODES = 25;
const MAX_CANDIDATES = 128;
const MAX_STATES = 512;
const MAX_EDGES = 1024;
const MAX_EVIDENCE = 256;
const MAX_OPERATIONS = 32;
const MAX_RESULTS = 32;
const FINAL_EVIDENCE_READS = 64;

function compareText(a: string, b: string): number { return a === b ? 0 : a < b ? -1 : 1; }
function nodeNames(node: GraphNode): string[] {
  return [node.name, ...(node.aliases ?? [])].map(normalizeGraphIndexText).filter(Boolean);
}

export class GraphRetrieval {
  constructor(
    private kv: StateKV,
    private resolveLayer?: SearchLayerResolver,
    private sessionOf?: (id: string) => string | undefined,
  ) {}

  createQuery(authorize?: GraphObservationAuthorization): GraphQuery {
    return new GraphQuery(this.kv, this.resolveLayer, this.sessionOf, authorize);
  }

  searchByEntities(...args: Parameters<GraphQuery["searchByEntities"]>): Promise<GraphRetrievalResult[]> {
    return this.createQuery().searchByEntities(...args);
  }
  expandFromChunks(...args: Parameters<GraphQuery["expandFromChunks"]>): Promise<GraphRetrievalResult[]> {
    return this.createQuery().expandFromChunks(...args);
  }
  temporalQuery(...args: Parameters<GraphQuery["temporalQuery"]>): ReturnType<GraphQuery["temporalQuery"]> {
    return this.createQuery().temporalQuery(...args);
  }
}

export class GraphQuery {
  private controller = new AbortController();
  private reader?: Promise<GraphIndexReader | null>;
  private evidence = new Map<string, Promise<Evidence | null>>();
  private operations = new Map<string, Promise<GraphRetrievalResult[]>>();
  private states = 0;
  private edges = 0;
  private examinedEvidence = 0;
  private diagnostic: GraphQueryDiagnostic = { status: "idle", truncated: false };

  constructor(
    private kv: StateKV,
    private resolveLayer?: SearchLayerResolver,
    private sessionOf?: (id: string) => string | undefined,
    private authorize?: GraphObservationAuthorization,
  ) {}

  cancel(): void { this.controller.abort(); this.diagnostic = { ...this.diagnostic, status: "cancelled", truncated: true }; }
  diagnostics(): GraphQueryDiagnostic { return { ...this.diagnostic }; }

  private async load(): Promise<GraphIndexReader | null> {
    this.reader ??= createGraphIndexReader(this.kv, { signal: this.controller.signal }).then(async (reader) => {
      this.controller.signal.throwIfAborted();
      if (!reader) {
        const status = await getGraphIndexStatus(this.kv);
        this.diagnostic = { status: status?.pending || status?.batchPending ? "dirty" : status?.status ?? "needs-migration", truncated: false, reason: "Graph index is unavailable; run graph-index status for recovery instructions." };
      } else {
        this.diagnostic.status = "ready";
        this.diagnostic.truncated ||= reader.status.incompleteRecords > 0;
      }
      return reader;
    });
    this.controller.signal.throwIfAborted();
    return this.reader;
  }

  private truncated(): void { this.diagnostic.truncated = true; }

  private async finish(reader: GraphIndexReader, results: GraphRetrievalResult[]): Promise<GraphRetrievalResult[]> {
    this.controller.signal.throwIfAborted();
    if (reader.exhausted) this.truncated();
    const current: GraphRetrievalResult[] = [];
    const read = reader.read.bind(reader) as GraphIndexReader["read"];
    for (const result of results.slice(0, MAX_RESULTS)) {
      const prior = await this.evidence.get(result.obsId);
      if (!prior) continue;
      const record = prior.layer === "memory"
        ? await read<Memory>(KV.memories, result.obsId)
        : await read<CompressedObservation>(KV.observations(result.sessionId), result.obsId);
      if (!record || record.id !== result.obsId || ("isLatest" in record && record.isLatest === false)) continue;
      if ("sessionId" in record && record.sessionId !== result.sessionId) continue;
      if (this.authorize && !await this.authorize(record, result.sessionId, read)) continue;
      current.push({ ...result, graphContext: `[graph evidence] ${record.title.slice(0, 512)}` });
    }
    if (reader.exhausted || results.length > MAX_RESULTS) this.truncated();
    if (!await reader.finish()) {
      this.diagnostic = { status: "changed", truncated: true, reason: "Graph changed during retrieval; graph enrichment was skipped." };
      return [];
    }
    return current;
  }

  private async source(reader: GraphIndexReader, id: string): Promise<Evidence | null> {
    let pending = this.evidence.get(id);
    if (pending) return pending;
    if (++this.examinedEvidence > MAX_EVIDENCE) { this.truncated(); return null; }
    pending = (async () => {
      const read = reader.read.bind(reader) as GraphIndexReader["read"];
      let sessionId = this.sessionOf?.(id);
      const layer = this.resolveLayer?.(id, sessionId ?? "");
      if (layer === "lesson" || layer === "insight") return null;
      if (layer !== "memory") {
        sessionId ??= await lookupObservationSession({ get: read } as StateKV, id) ?? undefined;
        if (sessionId) {
          const obs = await read<CompressedObservation>(KV.observations(sessionId), id);
          if (obs?.id === id && obs.sessionId === sessionId) {
            if (this.authorize && !await this.authorize(obs, sessionId, read)) return null;
            return { observation: obs, layer: "observation" as const };
          }
          if (layer === "observation") return null;
        }
      }
      const memory = await read<Memory>(KV.memories, id);
      if (!memory || memory.id !== id || memory.isLatest === false) return null;
      const observation = memoryToObservation(memory);
      if (this.authorize && !await this.authorize(memory, observation.sessionId, read)) return null;
      return { observation, layer: "memory" as const };
    })().catch(() => null);
    this.evidence.set(id, pending);
    return pending;
  }

  private async backed(reader: GraphIndexReader, row: GraphNode | GraphEdge): Promise<boolean> {
    if ("indexIncomplete" in row && row.indexIncomplete) this.truncated();
    for (const id of row.sourceObservationIds ?? []) {
      if (await this.source(reader, id)) return true;
      if (reader.exhausted || this.controller.signal.aborted) return false;
    }
    return false;
  }

  private async append(
    reader: GraphIndexReader, node: GraphNode, results: Map<string, GraphRetrievalResult>, excluded: Set<string>,
    score: number, pathLength: number, layer: SearchLayer,
  ): Promise<void> {
    for (const id of node.sourceObservationIds ?? []) {
      if (excluded.has(id)) continue;
      const kept = results.get(id);
      if (kept && kept.score >= score) continue;
      const evidence = await this.source(reader, id);
      if (!evidence || !matchesSearchLayer(id, evidence.observation.sessionId, layer, evidence.layer)) continue;
      results.delete(id);
      results.set(id, { obsId: id, sessionId: evidence.observation.sessionId, score, pathLength,
        graphContext: `[graph evidence] ${evidence.observation.title.slice(0, 512)}` });
    }
  }

  private run(key: string, work: () => Promise<GraphRetrievalResult[]>): Promise<GraphRetrievalResult[]> {
    if (this.controller.signal.aborted) return Promise.reject(this.controller.signal.reason);
    const existing = this.operations.get(key);
    if (existing) return existing;
    if (this.operations.size >= MAX_OPERATIONS) { this.truncated(); return Promise.resolve([]); }
    const pending = work().catch((error) => {
      if (!this.controller.signal.aborted) this.diagnostic = { status: "unavailable", truncated: true, reason: "Graph index could not be read; graph enrichment was skipped." };
      throw error;
    });
    this.operations.set(key, pending);
    return pending;
  }

  async searchByEntities(entityNames: string[], maxDepth = 2, maxResults = 20, targetLayer: SearchLayer = "all"): Promise<GraphRetrievalResult[]> {
    if (entityNames.length > MAX_START_NODES || entityNames.some((name) => name.length > 512)) this.truncated();
    const names = [...new Set(entityNames.slice(0, MAX_START_NODES).map((name) => normalizeGraphIndexText(name.slice(0, 512).trim())).filter(Boolean))];
    if (!names.length || maxResults <= 0) return [];
    return this.run(JSON.stringify(["entities", names, maxDepth, maxResults, targetLayer]), async () => {
      const reader = await this.load();
      if (!reader) return [];
      const selected = new Map<string, GraphNode>();
      const exactNames = new Set(names);
      for (const name of names) {
        const page = await reader.posting("name", name, { limit: MAX_START_NODES });
        if (page.cursor) this.truncated();
        for (const id of page.ids) {
          if (selected.size >= MAX_START_NODES) { this.truncated(); break; }
          const node = await reader.getNode(id);
          if (node && !node.stale && nodeNames(node).some((value) => exactNames.has(value)) && await this.backed(reader, node)) selected.set(id, node);
        }
      }
      const partialCandidates = new Map<string, GraphNode>();
      const examined = new Set<string>();
      for (const name of names) {
        if (selected.size >= MAX_START_NODES || reader.exhausted || reader.remainingReads <= FINAL_EVIDENCE_READS) break;
        const characters = [...new Set([...name].filter((value) => value.trim()))];
        if (characters.length > 16) this.truncated();
        for (const [position, character] of characters.slice(0, 16).entries()) {
          if (reader.remainingReads <= FINAL_EVIDENCE_READS || selected.size >= MAX_START_NODES) { this.truncated(); break; }
          const page = await reader.posting("character", character, { limit: position === 0 ? MAX_CANDIDATES : 16 });
          if (page.cursor) this.truncated();
          for (const id of page.ids) {
            if (selected.has(id) || examined.has(id)) continue;
            if (examined.size >= MAX_CANDIDATES || reader.remainingReads <= FINAL_EVIDENCE_READS) { this.truncated(); break; }
            examined.add(id);
            const node = await reader.getNode(id);
            if (node && !node.stale && nodeNames(node).some((value) => value.includes(name) || name.includes(value))) partialCandidates.set(id, node);
          }
        }
      }
      const orderedPartials = [...partialCandidates.values()].sort((a, b) => compareText(normalizeGraphIndexText(a.name), normalizeGraphIndexText(b.name)) || compareText(a.id, b.id));
      for (const node of orderedPartials) {
        if (selected.size >= MAX_START_NODES) { this.truncated(); break; }
        if (await this.backed(reader, node)) selected.set(node.id, node);
      }
      const nodes = [...selected.values()].sort((a, b) =>
        Number(nodeNames(b).some((n) => exactNames.has(n))) - Number(nodeNames(a).some((n) => exactNames.has(n))) || compareText(normalizeGraphIndexText(a.name), normalizeGraphIndexText(b.name)) || compareText(a.id, b.id));
      const results = new Map<string, GraphRetrievalResult>();
      const excluded = new Set<string>();
      for (const node of nodes) await this.append(reader, node, results, excluded, 1, 0, targetLayer);
      for (const id of results.keys()) excluded.add(id);
      for (const node of nodes) {
        for (const path of await this.traverse(reader, node, maxDepth)) {
          const weights = path.slice(1).map((step) => step.edge!.weight);
          const score = weights.reduce((sum, weight) => sum + weight, 0) / weights.length / path.length;
          await this.append(reader, path[path.length - 1].node, results, excluded, score, path.length, targetLayer);
        }
      }
      const ranked = [...results.values()].sort((a, b) => b.score - a.score);
      return this.finish(reader, ranked.slice(0, maxResults));
    });
  }

  async expandFromChunks(obsIds: string[], maxDepth = 1, maxResults = 10, targetLayer: SearchLayer = "all"): Promise<GraphRetrievalResult[]> {
    if (!obsIds.length || maxResults <= 0) return [];
    const ids = [...new Set(obsIds.slice(0, MAX_START_NODES))];
    return this.run(JSON.stringify(["chunks", ids, maxDepth, maxResults, targetLayer]), async () => {
      const reader = await this.load();
      if (!reader) return [];
      const nodes = new Map<string, GraphNode>();
      for (const id of ids) {
        if (!await this.source(reader, id)) continue;
        const page = await reader.posting("observation", id, { limit: MAX_START_NODES });
        if (page.cursor) this.truncated();
        for (const nodeId of page.ids) {
          const node = await reader.getNode(nodeId);
          if (node && !node.stale && await this.backed(reader, node)) nodes.set(nodeId, node);
          if (nodes.size >= MAX_START_NODES) { this.truncated(); break; }
        }
        if (nodes.size >= MAX_START_NODES) break;
      }
      const results = new Map<string, GraphRetrievalResult>();
      const excluded = new Set(ids);
      for (const node of [...nodes.values()].sort((a, b) => compareText(a.id, b.id))) {
        for (const path of await this.traverse(reader, node, maxDepth)) {
          await this.append(reader, path[path.length - 1].node, results, excluded, 0.5 / (path.length + 1), path.length, targetLayer);
        }
      }
      const ranked = [...results.values()].sort((a, b) => b.score - a.score);
      return this.finish(reader, ranked.slice(0, maxResults));
    });
  }

  async temporalQuery(entityName: string, asOf?: string): Promise<{ entity: GraphNode | null; currentState: GraphEdge[]; history: GraphEdge[] }> {
    const empty = { entity: null, currentState: [], history: [] };
    const reader = await this.load();
    if (!reader) return empty;
    const page = await reader.posting("name", normalizeGraphIndexText(entityName), { limit: MAX_START_NODES });
    let entity: GraphNode | null = null;
    for (const id of page.ids) {
      const node = await reader.getNode(id);
      if (node && !node.stale) { entity = node; break; }
    }
    if (!entity) return empty;
    const adjacent = await reader.posting("adjacency", entity.id, { limit: MAX_CANDIDATES });
    const historyPage = await reader.posting("history", entity.id, { limit: MAX_CANDIDATES });
    if (adjacent.cursor || historyPage.cursor) this.truncated();
    const edges = new Map<string, GraphEdge>();
    const keepEdge = async (edge: GraphEdge | null) => {
      if (!edge || edge.stale || (edge.sourceNodeId !== entity!.id && edge.targetNodeId !== entity!.id)) return;
      const neighbor = await reader.getNode(edge.sourceNodeId === entity!.id ? edge.targetNodeId : edge.sourceNodeId);
      if (neighbor && !neighbor.stale && !edges.has(edge.id)) edges.set(edge.id, edge);
    };
    for (const id of adjacent.ids) await keepEdge(await reader.getEdge(id));
    for (const id of historyPage.ids) await keepEdge(await reader.getHistoryEdge(id));
    const at = asOf === undefined ? undefined : Date.parse(asOf);
    if (at !== undefined && !Number.isFinite(at)) return empty;
    const valid = [...edges.values()].filter((edge) => at === undefined ||
      (Date.parse(edge.tcommit || edge.createdAt) <= at && (!edge.tvalid || Date.parse(edge.tvalid) <= at) && (!edge.tvalidEnd || Date.parse(edge.tvalidEnd) >= at)));
    const latest = new Map<string, GraphEdge>();
    for (const edge of valid) {
      if (at === undefined && edge.isLatest === false) continue;
      const key = `${edge.sourceNodeId}|${edge.targetNodeId}|${edge.type}`;
      const prior = latest.get(key);
      if (!prior || Date.parse(edge.tcommit || edge.createdAt) > Date.parse(prior.tcommit || prior.createdAt)) latest.set(key, edge);
    }
    if (!await reader.finish()) return empty;
    const currentState = [...latest.values()];
    return { entity, currentState, history: at === undefined ? valid.filter((edge) => !currentState.includes(edge)) : valid };
  }

  private async traverse(reader: GraphIndexReader, start: GraphNode, maxDepth: number): Promise<Path[]> {
    const depthLimit = Math.max(0, Math.min(8, Math.floor(maxDepth)));
    if (!depthLimit || this.states >= MAX_STATES) return [];
    const stateKey = (id: string, depth: number) => JSON.stringify([id, depth]);
    const initial = stateKey(start.id, 0);
    const distance = new Map<string, number>([[initial, 0]]);
    const paths = new Map<string, Path>([[initial, [{ node: start }]]]);
    const best = new Map<string, { cost: number; path: Path }>();
    const heap = new MinHeap<{ id: string; depth: number; cost: number }>((a, b) => a.cost - b.cost || a.depth - b.depth || compareText(a.id, b.id));
    heap.push({ id: start.id, depth: 0, cost: 0 });
    this.states++;
    while (heap.size() && this.edges < MAX_EDGES && !reader.exhausted && reader.remainingReads > FINAL_EVIDENCE_READS) {
      this.controller.signal.throwIfAborted();
      const current = heap.pop()!;
      const key = stateKey(current.id, current.depth);
      if (current.cost > (distance.get(key) ?? Infinity) || current.depth >= depthLimit) continue;
      const page = await reader.posting("adjacency", current.id, { limit: MAX_CANDIDATES });
      if (page.cursor) this.truncated();
      const adjacent: GraphEdge[] = [];
      for (const id of page.ids) {
        if (reader.remainingReads <= FINAL_EVIDENCE_READS) { this.truncated(); break; }
        if (++this.edges > MAX_EDGES) { this.truncated(); break; }
        const edge = await reader.getEdge(id);
        if (edge && !edge.stale && edge.isLatest !== false && Number.isFinite(edge.weight)) adjacent.push(edge);
      }
      adjacent.sort((a, b) => b.weight - a.weight || compareText(a.id, b.id));
      for (const edge of adjacent) {
        if (reader.remainingReads <= FINAL_EVIDENCE_READS) { this.truncated(); break; }
        if (edge.sourceNodeId !== current.id && edge.targetNodeId !== current.id) continue;
        const id = edge.sourceNodeId === current.id ? edge.targetNodeId : edge.sourceNodeId;
        const path = paths.get(key)!;
        if (path.some((step) => step.node.id === id)) continue;
        const node = await reader.getNode(id);
        if (!node || node.stale || !await this.backed(reader, edge) || !await this.backed(reader, node)) continue;
        const cost = current.cost + 1 / Math.max(edge.weight, 0.01);
        const nextKey = stateKey(id, current.depth + 1);
        if (cost >= (distance.get(nextKey) ?? Infinity)) continue;
        if (!distance.has(nextKey) && ++this.states > MAX_STATES) { this.truncated(); continue; }
        const nextPath = [...path, { node, edge }];
        distance.set(nextKey, cost);
        paths.set(nextKey, nextPath);
        if (cost < (best.get(id)?.cost ?? Infinity)) best.set(id, { cost, path: nextPath });
        heap.push({ id, depth: current.depth + 1, cost });
      }
    }
    if (reader.exhausted || heap.size()) this.truncated();
    return [...best.values()].map((entry) => entry.path);
  }
}

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
