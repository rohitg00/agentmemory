import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphRetrieval, type GraphObservationAuthorization } from "../src/functions/graph-retrieval.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerMeshFunction } from "../src/functions/mesh.js";
import { registerGraphFunction } from "../src/functions/graph.js";
import { registerSnapshotFunction } from "../src/functions/snapshot.js";
import { getSearchIndex, registerSearchFunction, setHybridRanker, setVectorIndex } from "../src/functions/search.js";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { StateKV, applyUpdateOps } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { indexObservationSession } from "../src/state/obs-index.js";
import { persistGraphRecords } from "../src/state/graph-ingestion.js";
import { setGraphGenerationListener } from "../src/state/graph-generation.js";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { CompressedObservation, GraphNode, GraphEdge } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const timestamp = "2026-10-13T00:00:00.000Z";
const node = (id: string, name = id, sources = [`obs_${id}`]): GraphNode => ({
  id, name, type: "concept", properties: {}, sourceObservationIds: sources, createdAt: timestamp,
});
const edge = (id: string, from: string, to: string, weight = 0.8): GraphEdge => ({
  id, sourceNodeId: from, targetNodeId: to, type: "related_to", weight,
  sourceObservationIds: [`obs_${from}`], createdAt: timestamp,
});
const observation = (id: string): CompressedObservation => ({
  id, sessionId: "session", timestamp, type: "discovery", title: "React auth", narrative: "React authentication",
  facts: [], concepts: [], files: [], importance: 5,
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function rig() {
  const store = new Map<string, Map<string, unknown>>();
  const handlers = new Map<string, (data: any) => Promise<any>>();
  const lists: string[] = [];
  const reads: Array<{ scope: string; key: string }> = [];
  let afterList: ((scope: string) => Promise<void>) | undefined;
  const sdk = {
    registerFunction: (id: string, fn: (data: any) => Promise<any>) => handlers.set(id, fn),
    registerTrigger: vi.fn(),
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }): Promise<any> => {
      if (id.startsWith("stream::")) return {};
      if (!id.startsWith("state::")) return handlers.get(id)!(payload);
      const rows = store.get(payload.scope) ?? new Map<string, unknown>();
      if (id === "state::get") {
        reads.push({ scope: payload.scope, key: payload.key });
        const result = structuredClone(rows.get(payload.key) ?? null);
        await afterList?.(payload.scope);
        return result;
      }
      if (id === "state::list") {
        lists.push(payload.scope);
        const result = structuredClone([...rows.values()]);
        await afterList?.(payload.scope);
        return result;
      }
      const previous = rows.get(payload.key) ?? null;
      if (id === "state::set") rows.set(payload.key, structuredClone(payload.value));
      else if (id === "state::delete") rows.delete(payload.key);
      else if (id === "state::update") rows.set(payload.key, applyUpdateOps(previous, payload.ops));
      else throw new Error(`unexpected state call ${id}`);
      store.set(payload.scope, rows);
      return structuredClone(rows.get(payload.key) ?? null);
    },
  };
  const kv = new StateKV(sdk as never);
  await initializeGraphIndex(kv, { status: "ready" });
  registerGraphFunction(sdk as never, kv, { name: "noop" } as never);
  registerExportImportFunction(sdk as never, kv);
  registerMeshFunction(sdk as never, kv);
  return {
    kv, sdk, lists, reads,
    call: (id: string, payload: any = {}) => sdk.trigger({ function_id: id, payload }),
    intercept: (fn?: typeof afterList) => { afterList = fn; },
    seedSources: async (nodes: GraphNode[], edges: GraphEdge[] = []) => {
      for (const row of [...nodes, ...edges]) for (const id of row.sourceObservationIds) {
        const sessionId = getSearchIndex().sessionOf(id) ?? "session";
        if (!await kv.get(KV.observations(sessionId), id)) await kv.set(KV.observations(sessionId), id, { ...observation(id), sessionId });
        await indexObservationSession(kv, id, sessionId);
      }
    },
    seed: async (nodes: GraphNode[], edges: GraphEdge[] = []) => {
      for (const row of [...nodes, ...edges]) for (const id of row.sourceObservationIds) {
        const sessionId = getSearchIndex().sessionOf(id) ?? "session";
        if (!await kv.get(KV.observations(sessionId), id)) await kv.set(KV.observations(sessionId), id, { ...observation(id), sessionId });
        await indexObservationSession(kv, id, sessionId);
      }
      for (const row of nodes) await kv.set(KV.graphNodes, row.id, row);
      for (const row of edges) await kv.set(KV.graphEdges, row.id, row);
    },
  };
}

function graphReads(lists: string[]) {
  return lists.filter((scope) => scope.startsWith(KV.graphNodes) || scope.startsWith(KV.graphEdges));
}

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  setGraphGenerationListener(null);
  setHybridRanker(null);
  setVectorIndex(null);
  getSearchIndex().clear();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("request graph views", () => {
  it("shares a lazy pinned view across concurrent streams, but never across requests", async () => {
    const r = await rig();
    await r.seed([node("a", "React"), node("b", "Hooks")], [edge("ab", "a", "b")]);
    const retrieval = new GraphRetrieval(r.kv);
    r.reads.length = 0;
    const query = retrieval.createQuery();
    expect(graphReads(r.lists)).toEqual([]);
    const [entities, expanded, temporal] = await Promise.all([
      query.searchByEntities(["React"]), query.expandFromChunks(["obs_a"]), query.temporalQuery("React"),
    ]);
    expect(entities.map((hit) => hit.obsId)).toContain("obs_b");
    expect(expanded.map((hit) => hit.obsId)).toEqual(["obs_b"]);
    expect(temporal.entity?.id).toBe("a");
    expect(graphReads(r.lists)).toEqual([]);
    const recordReads = () => r.reads.filter((read) => read.key.includes(":record:node:"));
    expect(recordReads()).toHaveLength(2);
    await retrieval.searchByEntities(["React"]);
    expect(recordReads()).toHaveLength(4);
  });

  it("refreshes after writes, updates, deletion and stale markers without a TTL", async () => {
    const r = await rig();
    const retrieval = new GraphRetrieval(r.kv);
    await r.seed([node("a", "React"), node("b", "Hooks")], [edge("ab", "a", "b")]);
    expect(await retrieval.expandFromChunks(["obs_a"])).toHaveLength(1);
    await r.kv.update(KV.graphNodes, "b", [{ type: "set", path: "name", value: "Renamed" }]);
    expect((await retrieval.temporalQuery("Renamed")).entity?.id).toBe("b");
    await r.kv.set(KV.graphEdges, "ab", { ...edge("ab", "a", "b"), stale: true });
    expect(await retrieval.expandFromChunks(["obs_a"])).toEqual([]);
    await r.kv.delete(KV.graphNodes, "a");
    expect(await retrieval.searchByEntities(["React"])).toEqual([]);
    await r.seed([node("fresh", "React")]);
    expect((await retrieval.searchByEntities(["React"])).map((hit) => hit.obsId)).toEqual(["obs_fresh"]);
  });

  it("does not mix generations when reset occurs between node and edge reads", async () => {
    const r = await rig();
    await r.seed([node("a", "React"), node("b", "Hooks")], [edge("ab", "a", "b")]);
    const entered = deferred(); const release = deferred();
    r.intercept(async (scope) => {
      if (scope === KV.graphRetrievalData) { r.intercept(); entered.resolve(); await release.promise; }
    });
    const retrieval = new GraphRetrieval(r.kv);
    const pending = retrieval.searchByEntities(["React"]);
    await entered.promise;
    await r.call("mem::graph-reset");
    await r.seed([node("fresh", "React")]);
    release.resolve();
    expect(await pending).toEqual([]);
    expect((await retrieval.searchByEntities(["React"])).map((hit) => hit.obsId)).toEqual(["obs_fresh"]);
  });

  it("retries a failed load on the next request while sharing failure within one request", async () => {
    const r = await rig();
    await r.seed([node("a", "React")]);
    r.reads.length = 0;
    r.intercept(async (scope) => { if (scope === KV.graphRetrievalControl) throw new Error("unavailable"); });
    const retrieval = new GraphRetrieval(r.kv);
    const query = retrieval.createQuery();
    await expect(query.searchByEntities(["React"])).rejects.toThrow("unavailable");
    await expect(query.expandFromChunks(["obs_a"])).rejects.toThrow("unavailable");
    expect(r.reads.filter((read) => read.scope === KV.graphRetrievalControl)).toHaveLength(1);
    expect(graphReads(r.lists)).toEqual([]);
    r.intercept();
    expect(await retrieval.searchByEntities(["React"])).toHaveLength(1);
  });

  it("keeps stores and layer resolvers separate and skips empty work", async () => {
    const a = await rig(); const b = await rig();
    await a.seed([node("a", "React", ["custom_memory", "mem_observation"])]);
    await b.seed([node("b", "React")]);
    await a.kv.set(KV.memories, "custom_memory", { id: "custom_memory", title: "Saved", content: "Saved", sessionIds: [], isLatest: true });
    const retrieval = new GraphRetrieval(a.kv, (id) => id === "custom_memory" ? "memory" : "observation");
    const query = retrieval.createQuery();
    expect((await query.searchByEntities(["React"], 2, 20, "memory")).map((hit) => hit.obsId)).toEqual(["custom_memory"]);
    expect((await query.searchByEntities(["React"], 2, 20, "observation")).map((hit) => hit.obsId)).toEqual(["mem_observation"]);
    expect((await new GraphRetrieval(b.kv).searchByEntities(["React"])).map((hit) => hit.obsId)).toEqual(["obs_b"]);
    a.lists.length = 0;
    expect(await retrieval.searchByEntities(["", "  "])).toEqual([]);
    expect(await retrieval.expandFromChunks([])).toEqual([]);
    expect(await retrieval.searchByEntities(["React"], 2, 0)).toEqual([]);
    expect(graphReads(a.lists)).toEqual([]);
  });
});

describe("graph traversal bounds", () => {
  it("caps matching starts and retains an exact match after many partial matches", async () => {
    const r = await rig();
    await r.seed([...Array.from({ length: 100 }, (_,i) => node(`partial_${i}`, `auth-${i}`)), node("exact", "auth")]);
    const hits = await new GraphRetrieval(r.kv).searchByEntities(["auth"], 2, 1000);
    expect(hits).toHaveLength(25);
    expect(hits[0].obsId).toBe("obs_exact");
  });

  it("orders exact names, partial names, and duplicate-name IDs by code units before the start cap", async () => {
    const r = await rig();
    await r.seed([
      ...["ä", "a", "Z", "😀"].map((id) => node(id, id === "Z" ? "AUTH" : "auth")),
      ...["Ä", "Z", "á", "a", "😀"].map((name) => node(`partial-${name}`, `auth-${name}`)),
      ...Array.from({ length: 30 }, (_, i) => node(`tail-${i}`, `auth-界${String(i).padStart(2, "0")}`)),
    ].reverse());
    const hits = await new GraphRetrieval(r.kv).searchByEntities([" AUTH ", "auth"], 0, 1000);
    expect(hits.map((hit) => hit.obsId)).toEqual([
      "obs_Z", "obs_a", "obs_ä", "obs_😀",
      "obs_partial-a", "obs_partial-Z", "obs_partial-á", "obs_partial-Ä",
      ...Array.from({ length: 17 }, (_, i) => `obs_tail-${i}`),
    ]);
  });

  it("orders chunk-expansion starts by code units rather than host collation", async () => {
    const r = await rig();
    const ids = ["ä", "a", "Z", "😀"];
    await r.seed([
      ...ids.map((id) => node(id, id, ["seed"])),
      ...ids.map((id) => node(`end-${id}`)),
    ], ids.map((id) => edge(`edge-${id}`, id, `end-${id}`)));
    const hits = await new GraphRetrieval(r.kv).expandFromChunks(["seed"], 1, 10);
    expect(hits.map((hit) => hit.obsId)).toEqual(["obs_end-Z", "obs_end-a", "obs_end-ä", "obs_end-😀"]);
  });

  it("breaks equal-weight adjacency ties by neighbor and edge IDs using code units", async () => {
    const r = await rig();
    const ids = ["ä", "a", "Z", "😀"];
    await r.seed([node("hub", "Anchor", ["seed"]), ...ids.map((id) => node(id))], [
      ...ids.map((id) => edge(`edge-${id}`, "hub", id)),
      { ...edge("A", "hub", "Z"), type: "uses" },
      { ...edge("a", "hub", "Z"), type: "imports" },
    ]);
    const hits = await new GraphRetrieval(r.kv).expandFromChunks(["seed"], 1, 10);
    expect(hits.map((hit) => hit.obsId)).toEqual(["obs_Z", "obs_a", "obs_ä", "obs_😀"]);
    expect(hits[0].graphContext).toBe("[graph evidence] React auth");
  });

  it("caps chunk expansion starts as well as entity starts", async () => {
    const r = await rig();
    const starts = Array.from({ length: 100 }, (_, i) => node(`start_${i}`, `source-${i}`, ["seed"]));
    const ends = starts.map((_, i) => node(`end_${i}`));
    await r.seed([...starts, ...ends], starts.map((start, i) => edge(`edge_${i}`, start.id, ends[i].id)));
    const hits = await new GraphRetrieval(r.kv).expandFromChunks(["seed"], 1, 1000);
    expect(hits).toHaveLength(25);
    expect(hits.some((hit) => hit.obsId === "seed")).toBe(false);
  });

  it.each(["entities", "chunks"])("bounds discovered nodes on a wide hub for %s", async (mode) => {
    const r = await rig();
    const spokes = Array.from({ length: 2500 }, (_, i) => node(`spoke_${i}`));
    await r.seed([node("hub", "Anchor"), ...spokes], spokes.map((spoke, i) => edge(`edge_${i}`, "hub", spoke.id)));
    r.reads.length = 0;
    const query = new GraphRetrieval(r.kv).createQuery();
    const hits = mode === "entities" ? await query.searchByEntities(["Anchor"], 2, 5000) : await query.expandFromChunks(["obs_hub"], 2, 5000);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(2000);
    expect(query.diagnostics().truncated).toBe(true);
    expect(r.reads.length).toBeLessThanOrEqual(512);
    expect(graphReads(r.lists)).toEqual([]);
  }, 30_000);

  it("bounds examined edges even when parallel edges discover very few nodes", async () => {
    const r = await rig();
    await r.seed([node("hub", "Anchor"), node("a"), node("tail")], [
      ...Array.from({ length: 10_001 }, (_, i) => edge(`parallel_${i}`, "hub", "a", 1)),
      edge("tail", "hub", "tail", 0.1),
    ]);
    r.reads.length = 0;
    const query = new GraphRetrieval(r.kv).createQuery();
    const hits = await query.searchByEntities(["Anchor"], 2, 100);
    expect(hits.map((hit) => hit.obsId)).toContain("obs_a");
    expect(query.diagnostics().truncated).toBe(true);
    expect(r.reads.filter((read) => read.key.includes(":record:edge:")).length).toBeLessThanOrEqual(256);
    expect(r.reads.length).toBeLessThanOrEqual(512);
    expect(graphReads(r.lists)).toEqual([]);
  }, 30_000);
});

describe("hybrid graph query lifetime", () => {
  it.each(["mem::search", "mem::smart-search"])("retrieves graph-only observations through %s without embeddings and preserves scope", async (handler) => {
    const r = await rig();
    const index = getSearchIndex();
    const captures = [
      { ...observation("owned"), sessionId: "owned_session", agentId: "agent-a" },
      { ...observation("other_project"), sessionId: "other_session", agentId: "agent-a" },
      { ...observation("other_agent"), sessionId: "owned_session", agentId: "agent-b" },
    ].map((obs) => ({ ...obs, title: "Opaque evidence", narrative: "Opaque evidence" }));
    for (const obs of captures) {
      index.add(obs);
      await r.kv.set(KV.observations(obs.sessionId), obs.id, obs);
    }
    await r.kv.set(KV.sessions, "owned_session", { id: "owned_session", project: "project-a", cwd: "/owned" });
    await r.kv.set(KV.sessions, "other_session", { id: "other_session", project: "project-b", cwd: "/other" });
    await r.seed([node("anchor", "GraphAnchor", captures.map((obs) => obs.id))]);
    const hybrid = new HybridSearch(index, null, null, r.kv, 0.4, 0.6, 0.3, false);
    const rank = (query: string, limit: number, layer?: "all" | "memory" | "observation", authorize?: GraphObservationAuthorization) => hybrid.search(query, limit, layer, authorize);
    setHybridRanker(rank);
    registerSearchFunction(r.sdk as never, r.kv);
    registerSmartSearchFunction(r.sdk as never, r.kv, rank);
    expect(index.search("GraphAnchor", 20)).toEqual([]);
    for (const vectors of [null, new VectorIndex()]) {
      setVectorIndex(vectors);
      const result = await r.call(handler, { query: "GraphAnchor", project: "project-a", agentId: "agent-a", targetLayer: "observation", includeLessons: false });
      expect(result.results.map((hit: any) => hit.observation?.id ?? hit.obsId)).toEqual(["owned"]);
      expect((await r.call(handler, { query: "GraphAnchor", targetLayer: "memory", includeLessons: false })).results).toEqual([]);
    }
    const expanded = await hybrid.searchWithExpansion("missing", 20, { original: "missing", reformulations: ["GraphAnchor"], temporalConcretizations: [], entityExtractions: ["GraphAnchor"] });
    expect(expanded.map((hit) => hit.observation.id).sort()).toEqual(captures.map((obs) => obs.id).sort());
    expect(expanded.every((hit) => hit.graphScore > 0 && hit.bm25Score === 0)).toBe(true);
  });

  async function hybridRig(weight = 0.3) {
    const r = await rig(); const index = new SearchIndex(); const vectors = new VectorIndex();
    const obs = observation("obs_a"); index.add(obs); vectors.add(obs.id, obs.sessionId, new Float32Array([1, 0]));
    await r.kv.set(KV.observations(obs.sessionId), obs.id, obs);
    await r.seed([node("a", "React"), node("b", "Hooks")], [edge("ab", "a", "b")]);
    const embed = vi.fn(async () => new Float32Array([1, 0]));
    const hybrid = new HybridSearch(index, vectors, { name: "fixture", dimensions: 2, embed, embedBatch: async () => [] }, r.kv, 0.4, 0.6, weight, false);
    return { ...r, hybrid };
  }

  it.each([false, true])("loads once for entity, vector and reformulated streams (expanded: %s)", async (expanded) => {
    const r = await hybridRig();
    const run = () => expanded
      ? r.hybrid.searchWithExpansion("React auth", 10, { reformulations: ["React", "authentication"], temporalConcretizations: ["recent React"], entityExtractions: ["React"] })
      : r.hybrid.search("React auth", 10);
    expect(await run()).not.toEqual([]);
    expect(graphReads(r.lists)).toEqual([]);
    const readsBefore = r.reads.filter((read) => read.scope === KV.graphRetrievalControl).length;
    await run();
    expect(r.reads.filter((read) => read.scope === KV.graphRetrievalControl).length).toBeGreaterThan(readsBefore);
    expect(graphReads(r.lists)).toEqual([]);
  });

  it("does not read or pin graph state when graph weight is zero, including expansion", async () => {
    const r = await hybridRig(0);
    const get = vi.spyOn(r.kv, "get");
    await r.hybrid.search("React");
    await r.hybrid.searchWithExpansion("React", 10, { reformulations: ["auth"], temporalConcretizations: [], entityExtractions: ["React"] });
    expect(graphReads(r.lists)).toEqual([]);
    expect(get.mock.calls.some(([scope]) => scope === KV.graphControl)).toBe(false);
  });
});

describe("graph mutations between search requests", () => {
  it.each(["import", "mesh"])("sees %s changes without a stale warmed view", async (mode) => {
    const r = await rig();
    const retrieval = new GraphRetrieval(r.kv);
    await r.call("mem::graph-reset");
    expect(await retrieval.searchByEntities(["React"])).toEqual([]);
    const graphNodes = [node("a", "React"), node("b", "Hooks")];
    const graphEdges = [edge("ab", "a", "b")];
    await r.seedSources(graphNodes, graphEdges);
    const result = mode === "import"
      ? await r.call("mem::import", { exportData: { version: "0.9.30", exportedAt: timestamp, sessions: [], observations: {}, memories: [], summaries: [], graphNodes, graphEdges } })
      : await r.call("mem::mesh-receive", { graphNodes, graphEdges });
    expect(result.success).toBe(true);
    expect((await retrieval.searchByEntities(["React"])).map((hit) => hit.obsId).sort()).toEqual(["obs_a", "obs_b"]);
    expect((await retrieval.expandFromChunks(["obs_a"])).map((hit) => hit.obsId)).toEqual(["obs_b"]);
    expect((await retrieval.temporalQuery("React")).currentState.map((item) => item.id)).toEqual(["ab"]);
  });

  it("refreshes the same retrieval instance after snapshot restoration and reset", async () => {
    const r = await rig(); const dir = mkdtempSync(join(process.cwd(), ".graph-query-snapshot-")); dirs.push(dir);
    registerSnapshotFunction(r.sdk as never, r.kv, dir);
    await r.seedSources([node("a", "React"), node("b", "Hooks")], [edge("ab", "a", "b")]);
    await persistGraphRecords(r.kv, [node("a", "React"), node("b", "Hooks")], [edge("ab", "a", "b")]);
    const saved = await r.call("mem::snapshot-create"); expect(saved.success).toBe(true);
    const retrieval = new GraphRetrieval(r.kv);
    expect(await retrieval.searchByEntities(["React"])).toHaveLength(2);
    await r.call("mem::graph-reset");
    expect(await retrieval.searchByEntities(["React"])).toEqual([]);
    expect((await r.call("mem::snapshot-restore", { commitHash: saved.snapshot.commitHash })).success).toBe(true);
    expect(await retrieval.searchByEntities(["React"])).toHaveLength(2);
    expect((await retrieval.expandFromChunks(["obs_a"])).map((hit) => hit.obsId)).toEqual(["obs_b"]);
  });
});
