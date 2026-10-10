import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphRetrieval } from "../src/functions/graph-retrieval.js";
import {
  getSearchIndex,
  rankMemoryIds,
  rebuildKeywordIndex,
  registerSearchFunction,
  setEmbeddingProvider,
  setHybridRanker,
  setVectorIndex,
} from "../src/functions/search.js";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import { KV } from "../src/state/schema.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { CompressedObservation, Memory } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/functions/access-tracker.js", () => ({ recordAccessBatch: vi.fn() }));

const timestamp = "2026-10-10T00:00:00.000Z";

function observation(id: string): CompressedObservation {
  return {
    id, sessionId: "capture-session", timestamp, type: "command_run", title: "quasar policy",
    narrative: "quasar policy", facts: [], concepts: [], files: [], importance: 5, confidence: 0.3,
  };
}

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_decision", title: "quasar policy", content: "Use a single authority for deployment decisions. ".repeat(80),
    type: "fact", concepts: [], files: [], sessionIds: [], strength: 7, createdAt: timestamp,
    updatedAt: timestamp, version: 1, isLatest: true, ...overrides,
  } as Memory;
}

function fixture() {
  const records = new Map<string, unknown>();
  const kv = {
    get: async <T>(scope: string, id: string): Promise<T | null> => (records.get(`${scope}/${id}`) as T) ?? null,
    set: async <T>(scope: string, id: string, value: T): Promise<T> => { records.set(`${scope}/${id}`, value); return value; },
    list: async <T>(scope: string): Promise<T[]> => [...records].filter(([key]) => key.startsWith(`${scope}/`)).map(([, value]) => value as T),
  };
  const handlers = new Map<string, (data: any) => Promise<any>>();
  const sdk = {
    registerFunction: (id: string, handler: (data: any) => Promise<any>) => handlers.set(id, handler),
    trigger: vi.fn(async ({ function_id, payload }: { function_id: string; payload: unknown }) => {
      if (function_id === "mem::lesson-recall") return { success: true, lessons: [] };
      const handler = handlers.get(function_id);
      if (!handler) throw new Error(`Unknown function ${function_id}`);
      return handler(payload);
    }),
  };
  const index = getSearchIndex();
  const vector = new VectorIndex();
  const embedding = { name: "fixed", dimensions: 2, embed: async () => new Float32Array([1, 0]), embedBatch: async () => [] };
  const hybrid = new HybridSearch(index, vector, embedding, kv as never, 0.4, 0.6, 0);
  const search = vi.fn((query: string, limit: number, targetLayer?: "all" | "memory" | "observation") => hybrid.search(query, limit, targetLayer));
  registerSearchFunction(sdk as never, kv as never);
  registerSmartSearchFunction(sdk as never, kv as never, search);
  return {
    kv, sdk, index, vector, embedding, search,
    call: (id: string, args: Record<string, unknown>) => sdk.trigger({ function_id: id, payload: args }),
    addObservation: async (obs: CompressedObservation) => {
      index.add(obs);
      vector.add(obs.id, obs.sessionId, new Float32Array([1, 0]));
      await kv.set(KV.observations(obs.sessionId), obs.id, obs);
    },
    addMemory: async (saved: Memory) => {
      index.add(memoryToObservation(saved), "memory");
      vector.add(saved.id, saved.sessionIds[0] ?? "memory", new Float32Array([0.8, 0.6]));
      await kv.set(KV.memories, saved.id, saved);
    },
  };
}

beforeEach(() => {
  getSearchIndex().clear();
  setVectorIndex(null);
  setEmbeddingProvider(null);
  setHybridRanker(null);
  vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "shared");
  vi.stubEnv("AGENT_ID", "");
});

afterEach(() => {
  setVectorIndex(null);
  setEmbeddingProvider(null);
  setHybridRanker(null);
  vi.unstubAllEnvs();
});

describe("recall layer selection", () => {
  it("filters keyword and vector candidates before their top-k windows under dense capture noise", async () => {
    const f = fixture();
    for (let i = 0; i < 360; i++) await f.addObservation(observation(`obs_${i}`));
    await f.addMemory(memory());

    expect(f.index.search("quasar policy", 1)[0].obsId).toMatch(/^obs_/);
    expect(f.vector.search(new Float32Array([1, 0]), 1)[0].obsId).toMatch(/^obs_/);
    expect(f.index.search("quasar policy", 1, "memory").map((hit) => hit.obsId)).toEqual(["mem_decision"]);
    expect(f.index.search("quas", 1, "memory").map((hit) => hit.obsId)).toEqual(["mem_decision"]);
    expect(f.vector.search(new Float32Array([1, 0]), 1, "memory").map((hit) => hit.obsId)).toEqual(["mem_decision"]);
    expect(SearchIndex.deserialize(f.index.serialize()).search("quasar", 1, "memory")[0].obsId).toBe("mem_decision");
    expect(VectorIndex.deserialize(f.vector.serialize()).search(new Float32Array([1, 0]), 1, "memory")[0].obsId).toBe("mem_decision");

    setVectorIndex(f.vector);
    setEmbeddingProvider(f.embedding);
    expect(await rankMemoryIds("quasar policy", 1)).toEqual({ ids: ["mem_decision"], mode: "hybrid" });
    setHybridRanker(f.search);
    const recall = await f.call("mem::search", { query: "quasar policy", limit: 1, targetLayer: "memory" });
    expect(recall.results[0]).toMatchObject({ layer: "memory", observation: { id: "mem_decision" } });
    expect(f.search).toHaveBeenLastCalledWith("quasar policy", 1, "memory");
    const smart = await f.call("mem::smart-search", { query: "quasar policy", limit: 1, targetLayer: "memory" });
    expect(smart.results).toEqual([expect.objectContaining({ obsId: "mem_decision", layer: "memory" })]);
    expect(smart).not.toHaveProperty("lessons");
  });

  it("keeps keyword-only saved-memory recall independent of capture volume", async () => {
    const f = fixture();
    for (let i = 0; i < 100; i++) await f.addObservation(observation(`obs_${i}`));
    await f.addMemory(memory());
    expect(await rankMemoryIds("quasar", 1)).toEqual({ ids: ["mem_decision"], mode: "keyword" });
    const result = await f.call("mem::search", { query: "quasar", targetLayer: "memory", limit: 1 });
    expect(result.results[0].observation.id).toBe("mem_decision");
    expect((await f.call("mem::search", { query: "quasar", limit: 1 })).results[0].observation.id).toMatch(/^obs_/);
  });

  it("excludes saved memories and synthetic higher layers from observation-only recall", async () => {
    const f = fixture();
    await f.addMemory(memory());
    await f.addObservation(observation("obs_1"));
    for (const [id, sessionId] of [["lsn_1", "lesson"], ["ins_1", "insight"]]) {
      f.index.add({ ...observation(id), sessionId }, sessionId as "lesson" | "insight");
      f.vector.add(id, sessionId, new Float32Array([1, 0]));
    }
    expect(f.index.search("quasar", 10, "observation").map((hit) => hit.obsId)).toEqual(["obs_1"]);
    expect(f.vector.search(new Float32Array([1, 0]), 10, "observation").map((hit) => hit.obsId)).toEqual(["obs_1"]);
    const result = await f.call("mem::smart-search", { query: "quasar", targetLayer: "observation", includeLessons: true });
    expect(result.results.map((hit: any) => hit.obsId)).toEqual(["obs_1"]);
    expect(result).not.toHaveProperty("lessons");
    expect(f.sdk.trigger.mock.calls.some(([call]) => call.function_id === "mem::lesson-recall")).toBe(false);
  });

  it("retains the default mixed search and lesson behavior", async () => {
    const f = fixture();
    await f.addMemory(memory());
    await f.addObservation(observation("obs_1"));
    const result = await f.call("mem::smart-search", { query: "quasar" });
    expect(result.results.map((hit: any) => hit.layer).sort()).toEqual(["memory", "observation"]);
    expect(result.lessons).toEqual([]);
  });

  it("filters graph evidence before its result cap and expansion cap", async () => {
    const f = fixture();
    await f.kv.set(KV.graphNodes, "node", {
      id: "node", name: "Quasar", type: "service", properties: {},
      sourceObservationIds: ["obs_1", "obs_2", "mem_decision", "mem_other"],
    });
    await f.kv.set(KV.graphNodes, "neighbor", {
      id: "neighbor", name: "Rollout", type: "service", properties: {},
      sourceObservationIds: ["obs_3", "mem_other"],
    });
    await f.kv.set(KV.graphEdges, "edge", { id: "edge", sourceNodeId: "node", targetNodeId: "neighbor", type: "uses", weight: 1 });
    const graph = new GraphRetrieval(f.kv as never);
    expect((await graph.searchByEntities(["Quasar"], 2, 1, "memory")).map((hit) => hit.obsId)).toEqual(["mem_decision"]);
    expect((await graph.expandFromChunks(["mem_decision"], 1, 1, "memory")).map((hit) => hit.obsId)).toEqual(["mem_other"]);
  });

  it.each(["mem::search", "mem::smart-search"])("preserves project and agent scope in %s memory-only queries", async (handler) => {
    const f = fixture();
    await f.kv.set(KV.sessions, "linked-session", { id: "linked-session", project: "wrong-project", cwd: "/wrong" });
    await f.addMemory(memory({ id: "mem_owned", project: "project-a", sessionIds: ["linked-session"], agentId: "agent-a" }));
    await f.addMemory(memory({ id: "mem_other_project", project: "project-b", agentId: "agent-a" }));
    await f.addMemory(memory({ id: "mem_other_agent", project: "project-a", agentId: "agent-b" }));
    const result = await f.call(handler, { query: "quasar", targetLayer: "memory", project: "project-a", agentId: "agent-a" });
    const ids = result.results.map((hit: any) => hit.obsId ?? hit.observation.id);
    expect(ids).toEqual(["mem_owned"]);
  });

  it("filters expanded IDs before the expansion cap and respects scope", async () => {
    const f = fixture();
    await f.addMemory(memory({ agentId: "agent-a", project: "project-a" }));
    await f.addObservation(observation("obs_1"));
    const expandIds = [...Array.from({ length: 21 }, (_, i) => `obs_${i}`), "mem_decision"];
    const result = await f.call("mem::smart-search", { expandIds, targetLayer: "memory", project: "project-a", agentId: "agent-a" });
    expect(result.results).toEqual([expect.objectContaining({ obsId: "mem_decision", layer: "memory" })]);
    expect(result.truncated).toBe(false);
    expect((await f.call("mem::smart-search", { expandIds, targetLayer: "memory", agentId: "agent-b" })).results).toEqual([]);
    const observations = await f.call("mem::smart-search", { expandIds: ["mem_decision", { obsId: "obs_1", sessionId: "capture-session" }], targetLayer: "observation" });
    expect(observations.results.map((hit: any) => hit.obsId)).toEqual(["obs_1"]);
  });

  it.each(["mem::search", "mem::smart-search"])("rejects invalid layers in %s without retrieval", async (handler) => {
    const f = fixture();
    await expect(f.call(handler, { query: "quasar", targetLayer: "L2" })).rejects.toThrow("targetLayer must be one of");
    expect(f.search).not.toHaveBeenCalled();
  });

  it("returns no matches when the requested layer has no matching records", async () => {
    const f = fixture();
    await f.addObservation(observation("obs_1"));
    expect((await f.call("mem::search", { query: "quasar", targetLayer: "memory" })).results).toEqual([]);
    expect((await f.call("mem::smart-search", { query: "quasar", targetLayer: "memory" })).results).toEqual([]);
  });

  it("preserves storage provenance for imported IDs through retrieval, expansion, and persisted indexes", async () => {
    const f = fixture();
    const imported = memory({ id: "external-decision", sessionIds: ["real-session"], project: "project-a" });
    await f.addMemory(imported);
    await f.kv.set(KV.sessions, "real-session", { id: "real-session", project: "project-a" });
    const captures = [
      { ...observation("mem_capture"), sessionId: "memory" },
      { ...observation("lsn_capture"), sessionId: "lesson" },
      { ...observation("ins_capture"), sessionId: "insight" },
    ];
    for (const capture of captures) {
      await f.addObservation(capture);
      await f.kv.set(KV.sessions, capture.sessionId, { id: capture.sessionId, project: "project-a" });
    }

    const restored = SearchIndex.deserialize(f.index.serialize());
    expect(restored.layerOf(imported.id)).toBe("memory");
    expect(restored.search("quasar", 10, "memory").map((hit) => hit.obsId)).toEqual([imported.id]);
    expect(restored.search("quasar", 10, "observation").map((hit) => hit.obsId).sort()).toEqual(captures.map((capture) => capture.id).sort());
    const restoredVectors = VectorIndex.deserialize(f.vector.serialize());
    expect(restoredVectors.search(new Float32Array([1, 0]), 10, "memory", (id) => restored.layerOf(id)).map((hit) => hit.obsId)).toEqual([imported.id]);
    const hybrid = new HybridSearch(restored, restoredVectors, f.embedding, f.kv as never, 0.4, 0.6, 0);
    expect((await hybrid.search("quasar", 10, "memory")).map((hit) => [hit.observation.id, hit.layer])).toEqual([[imported.id, "memory"]]);
    setVectorIndex(restoredVectors);
    setEmbeddingProvider(f.embedding);
    expect((await rankMemoryIds("quasar", 10)).ids).toEqual([imported.id]);

    for (const handler of ["mem::search", "mem::smart-search"]) {
      const result = await f.call(handler, { query: "quasar", targetLayer: "memory" });
      expect(result.results.map((hit: any) => hit.obsId ?? hit.observation.id)).toEqual([imported.id]);
      const observations = await f.call(handler, { query: "quasar", targetLayer: "observation" });
      expect(observations.results.map((hit: any) => hit.obsId ?? hit.observation.id).sort()).toEqual(captures.map((capture) => capture.id).sort());
    }

    const expanded = await f.call("mem::smart-search", { expandIds: ["mem_capture", imported.id], targetLayer: "memory" });
    expect(expanded.results.map((hit: any) => [hit.obsId, hit.layer])).toEqual([[imported.id, "memory"]]);
    const expandedObservation = await f.call("mem::smart-search", {
      expandIds: [{ obsId: "lsn_capture", sessionId: "lesson" }], targetLayer: "observation",
    });
    expect(expandedObservation.results[0]).toMatchObject({ obsId: "lsn_capture", layer: "observation" });

    const oldSnapshot = JSON.parse(f.index.serialize());
    oldSnapshot.v = 2;
    for (const [, entry] of oldSnapshot.entries) delete entry.layer;
    f.index.restoreFrom(SearchIndex.deserialize(JSON.stringify(oldSnapshot)));
    expect(f.index.size).toBe(4);
    await rebuildKeywordIndex(f.kv as never);
    expect(f.index.layerOf(imported.id)).toBe("memory");
    expect(f.index.search("quasar", 10, "memory").map((hit) => hit.obsId)).toEqual([imported.id]);
    expect(f.index.observationCountsBySession()).toEqual(new Map(captures.map((capture) => [capture.sessionId, 1])));
  });

  it("uses indexed provenance for graph candidates with arbitrary imported IDs", async () => {
    const f = fixture();
    await f.addMemory(memory({ id: "imported-decision" }));
    await f.addObservation(observation("mem_capture"));
    await f.kv.set(KV.graphNodes, "node", {
      id: "node", name: "Quasar", type: "service", properties: {},
      sourceObservationIds: ["mem_capture", "imported-decision"],
    });
    const graph = new GraphRetrieval(f.kv as never, (id) => f.index.layerOf(id));
    expect((await graph.searchByEntities(["Quasar"], 2, 1, "memory")).map((hit) => hit.obsId)).toEqual(["imported-decision"]);
    expect((await graph.searchByEntities(["Quasar"], 2, 1, "observation")).map((hit) => hit.obsId)).toEqual(["mem_capture"]);
  });

  it("bounds expansion work and reports unprocessed IDs", async () => {
    const f = fixture();
    await f.addMemory(memory({ id: "imported-decision" }));
    const get = vi.spyOn(f.kv, "get");
    const result = await f.call("mem::smart-search", {
      expandIds: [...Array.from({ length: 100 }, (_, index) => `absent-${index}`), "imported-decision"],
      targetLayer: "memory",
    });
    expect(result.results).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(get.mock.calls.filter(([scope]) => scope === KV.memories)).toHaveLength(100);
  });

  it("fails closed when a saved memory's owning project cannot be loaded", async () => {
    const f = fixture();
    const saved = memory({ project: "private", sessionIds: ["public-session"] });
    await f.addMemory(saved);
    await f.kv.set(KV.sessions, "public-session", { id: "public-session", project: "public" });
    setVectorIndex(f.vector);
    setHybridRanker(async () => [{ observation: memoryToObservation(saved), layer: "memory", sessionId: "public-session", combinedScore: 1 }]);
    const originalGet = f.kv.get;
    vi.spyOn(f.kv, "get").mockImplementation(async (scope, id) => {
      if (scope === KV.memories) throw new Error("project lookup failed");
      return originalGet(scope, id);
    });
    await expect(f.call("mem::search", { query: "quasar", targetLayer: "memory", project: "public" })).rejects.toThrow("project lookup failed");
  });
});
