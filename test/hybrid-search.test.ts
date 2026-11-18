import { describe, it, expect, beforeEach, vi } from "vitest";
import { VectorIndex } from "../src/state/vector-index.js";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { KV } from "../src/state/schema.js";
import { SearchIndex } from "../src/state/search-index.js";
import type { CompressedObservation, EmbeddingProvider, Memory } from "../src/types.js";
import { memoryToObservation } from "../src/state/memory-utils.js";

function makeObs(
  overrides: Partial<CompressedObservation> = {},
): CompressedObservation {
  return {
    id: "obs_1",
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "file_edit",
    title: "Edit auth middleware",
    subtitle: "JWT validation",
    facts: ["Added token check"],
    narrative: "Modified the auth middleware to validate JWT tokens",
    concepts: ["authentication", "jwt"],
    files: ["src/middleware/auth.ts"],
    importance: 7,
    ...overrides,
  };
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

describe("HybridSearch", () => {
  let bm25: SearchIndex;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    bm25 = new SearchIndex();
    kv = mockKV();
  });

  it("does not cap saved memories at three by their shared synthetic session", async () => {
    for (let i = 1; i <= 6; i++) {
      const memory: Memory = {
        id: `mem_${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: "fact",
        title: `quasar policy ${i}`,
        content: `quasar quasar quasar policy rule ${i}`,
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 7,
        version: 1,
        isLatest: true,
      };
      await kv.set(KV.memories, memory.id, memory);
      bm25.add(memoryToObservation(memory), "memory");
    }
    for (let i = 1; i <= 5; i++) {
      const obs = makeObs({ id: `obs_${i}`, sessionId: `ses_${i}`, title: `quasar note ${i}`, narrative: `quasar mention ${i}`, facts: [], concepts: [], files: [] });
      bm25.add(obs);
      await kv.set(KV.observations(obs.sessionId), obs.id, obs);
    }
    const hybrid = new HybridSearch(bm25, null, null, kv as never, 0.4, 0.6, 0, false);
    const results = await hybrid.search("quasar policy", 6);
    expect(results.map((r) => r.observation.id).filter((id) => id.startsWith("mem_"))).toHaveLength(6);
  });

  it("ranks a record first when it scores well in both keyword and vector search, even for a one-result search", async () => {
    const keywordOnly = makeObs({ id: "obs_keyword", sessionId: "ses_k", title: "zephyr zephyr zephyr", narrative: "zephyr zephyr zephyr", facts: [], concepts: [], files: [] });
    const keywordSecond = makeObs({ id: "obs_keyword2", sessionId: "ses_k2", title: "zephyr zephyr notes", narrative: "zephyr zephyr notes", facts: [], concepts: [], files: [] });
    const both = makeObs({ id: "obs_both", sessionId: "ses_b", title: "zephyr notes notes", narrative: "zephyr notes notes", facts: [], concepts: [], files: [] });
    const vectorOnly = makeObs({ id: "obs_vector", sessionId: "ses_v", title: "unrelated", narrative: "unrelated", facts: [], concepts: [], files: [] });
    for (const obs of [keywordOnly, keywordSecond, both]) bm25.add(obs);
    for (const obs of [keywordOnly, keywordSecond, both, vectorOnly]) await kv.set(KV.observations(obs.sessionId), obs.id, obs);
    const vector = new VectorIndex();
    vector.add(vectorOnly.id, vectorOnly.sessionId, new Float32Array([1, 0]));
    vector.add(both.id, both.sessionId, new Float32Array([0.9, 0.1]));
    const provider = { name: "test", dimensions: 2, embed: vi.fn(async () => new Float32Array([1, 0])), embedBatch: vi.fn() };
    const hybrid = new HybridSearch(bm25, vector, provider, kv as never, 0.4, 0.6, 0, false);
    const results = await hybrid.search("zephyr", 1);
    expect(results.map((r) => r.observation.id)).toEqual(["obs_both"]);
  });

  it("returns a valid lower-ranked record when stale index entries fill the first enrichment pass", async () => {
    for (let i = 0; i < 25; i++) {
      bm25.add(makeObs({ id: `obs_stale_${i}`, sessionId: `ses_stale_${i}`, title: "nebula nebula nebula", narrative: "nebula nebula nebula", facts: [], concepts: [], files: [] }));
    }
    const valid = makeObs({ id: "obs_valid", sessionId: "ses_valid", title: "nebula notes notes", narrative: "nebula notes notes", facts: [], concepts: [], files: [] });
    bm25.add(valid);
    await kv.set(KV.observations(valid.sessionId), valid.id, valid);
    const hybrid = new HybridSearch(bm25, null, null, kv as never, 0.4, 0.6, 0, false);
    const results = await hybrid.search("nebula", 5);
    expect(results.map((r) => r.observation.id)).toEqual(["obs_valid"]);
  });

  it("uses query embeddings for direct, cached and expanded searches", async () => {
    const obs = makeObs();
    bm25.add(obs);
    await kv.set(KV.observations(obs.sessionId), obs.id, obs);
    const vector = new VectorIndex();
    vector.add(obs.id, obs.sessionId, new Float32Array([1, 0]));
    const embed = vi.fn(async () => new Float32Array([0, 1]));
    const embedQuery = vi.fn(async (_text: string) => new Float32Array([1, 0]));
    const provider = { name: "test", dimensions: 2, embed, embedQuery, embedBatch: vi.fn() };
    const hybrid = new HybridSearch(bm25, vector, provider, kv as never, 0.4, 0.6, 0);
    expect(await hybrid.search("auth")).toHaveLength(1);
    const request = {};
    await hybrid.search("auth", 20, "all", undefined, request);
    await hybrid.search("auth", 40, "all", undefined, request);
    expect(embedQuery).toHaveBeenCalledTimes(2);
    await hybrid.searchWithExpansion("auth", 20, {
      reformulations: ["authentication"], temporalConcretizations: [], entityExtractions: [],
    });
    expect(embedQuery.mock.calls.map((args) => args[0])).toEqual(["auth", "auth", "auth", "authentication"]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("reuses query embeddings only within a recall request", async () => {
    const obs = makeObs();
    bm25.add(obs);
    await kv.set(KV.observations(obs.sessionId), obs.id, obs);
    const vector = new VectorIndex();
    vector.add(obs.id, obs.sessionId, new Float32Array([1, 0]));
    const embed = vi.fn(async () => new Float32Array([1, 0]));
    const provider = { name: "test", dimensions: 2, embed, embedBatch: vi.fn() };
    const hybrid = new HybridSearch(bm25, vector, provider, kv as never, 0.4, 0.6, 0);
    const request = {};
    await hybrid.search("auth", 100, "all", undefined, request);
    await hybrid.search("auth", 200, "all", undefined, request);
    expect(embed).toHaveBeenCalledTimes(1);
    await hybrid.search("auth", 100, "all", undefined, {});
    expect(embed).toHaveBeenCalledTimes(2);
  });

  it("retries a failed embedding and then reuses the recovered request embedding", async () => {
    const bm25Obs = makeObs({ id: "obs_bm25" });
    const vectorObs = makeObs({ id: "obs_vector" });
    bm25.add(bm25Obs);
    await kv.set(KV.observations(bm25Obs.sessionId), bm25Obs.id, bm25Obs);
    await kv.set(KV.observations(vectorObs.sessionId), vectorObs.id, vectorObs);
    const vector = new VectorIndex();
    vector.add(vectorObs.id, vectorObs.sessionId, new Float32Array([1, 0]));
    const embed = vi.fn<() => Promise<Float32Array>>()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValue(new Float32Array([1, 0]));
    const provider = { name: "test", dimensions: 2, embed, embedBatch: vi.fn() };
    const hybrid = new HybridSearch(bm25, vector, provider, kv as never, 0.4, 0.6, 0);
    const request = {};
    const first = await hybrid.search("auth", 100, "all", undefined, request);
    expect(first.map((hit) => hit.observation.id)).not.toContain(vectorObs.id);
    const recovered = await hybrid.search("auth", 200, "all", undefined, request);
    expect(recovered.map((hit) => hit.observation.id)).toContain(vectorObs.id);
    expect(embed).toHaveBeenCalledTimes(2);
    await hybrid.search("auth", 400, "all", undefined, request);
    expect(embed).toHaveBeenCalledTimes(2);
  });

  it("returns BM25-only results when no vector index is provided", async () => {
    const obs = makeObs({ id: "obs_1", sessionId: "ses_1" });
    bm25.add(obs);
    await kv.set("mem:obs:ses_1", "obs_1", obs);

    const hybrid = new HybridSearch(bm25, null, null, kv as never);
    const results = await hybrid.search("auth");

    expect(results.length).toBe(1);
    expect(results[0].observation.id).toBe("obs_1");
    expect(results[0].vectorScore).toBe(0);
    expect(results[0].bm25Score).toBeGreaterThan(0);
  });

  it("returns empty results for no-match query", async () => {
    const obs = makeObs({ id: "obs_1", sessionId: "ses_1" });
    bm25.add(obs);
    await kv.set("mem:obs:ses_1", "obs_1", obs);

    const hybrid = new HybridSearch(bm25, null, null, kv as never);
    const results = await hybrid.search("database");
    expect(results).toEqual([]);
  });

  it("combinedScore is derived from bm25Score when no vector index", async () => {
    const obs = makeObs({ id: "obs_1", sessionId: "ses_1" });
    bm25.add(obs);
    await kv.set("mem:obs:ses_1", "obs_1", obs);

    const hybrid = new HybridSearch(bm25, null, null, kv as never);
    const results = await hybrid.search("auth");

    expect(results[0].combinedScore).toBeGreaterThan(0);
    expect(results[0].vectorScore).toBe(0);
    expect(results[0].graphScore).toBe(0);
  });

  it("results are sorted by combinedScore descending", async () => {
    const obs1 = makeObs({
      id: "obs_1",
      sessionId: "ses_1",
      title: "auth handler",
      narrative: "auth auth auth module",
      concepts: ["auth"],
    });
    const obs2 = makeObs({
      id: "obs_2",
      sessionId: "ses_1",
      title: "database setup",
      narrative: "auth connection config",
      concepts: ["database"],
    });
    bm25.add(obs1);
    bm25.add(obs2);
    await kv.set("mem:obs:ses_1", "obs_1", obs1);
    await kv.set("mem:obs:ses_1", "obs_2", obs2);

    const hybrid = new HybridSearch(bm25, null, null, kv as never);
    const results = await hybrid.search("auth");

    expect(results.length).toBe(2);
    expect(results[0].combinedScore).toBeGreaterThanOrEqual(
      results[1].combinedScore,
    );
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 10; i++) {
      const obs = makeObs({
        id: `obs_${i}`,
        sessionId: "ses_1",
        title: `auth feature ${i}`,
      });
      bm25.add(obs);
      await kv.set("mem:obs:ses_1", `obs_${i}`, obs);
    }

    const hybrid = new HybridSearch(bm25, null, null, kv as never);
    const results = await hybrid.search("auth", 3);
    expect(results.length).toBe(3);
  });

  it("skips observations not found in KV", async () => {
    const obs = makeObs({ id: "obs_missing", sessionId: "ses_1" });
    bm25.add(obs);

    const hybrid = new HybridSearch(bm25, null, null, kv as never);
    const results = await hybrid.search("auth");
    expect(results).toEqual([]);
  });

  it("falls back to KV.memories when an indexed entry is a saved memory", async () => {
    // mem::remember writes to KV.memories under the synthetic sessionId
    // "memory" — the BM25 index sees that synthetic sessionId, but
    // KV.observations("memory") never has anything.
    const indexable = makeObs({
      id: "mem_abc",
      sessionId: "memory",
      title: "Test memory for search",
      narrative: "Test memory for search",
      concepts: ["test", "search"],
    });
    bm25.add(indexable);

    const memory = {
      id: "mem_abc",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: "fact",
      title: "Test memory for search",
      content: "Test memory for search",
      concepts: ["test", "search"],
      files: [],
      sessionIds: [],
      strength: 7,
      version: 1,
      isLatest: true,
    };
    await kv.set("mem:memories", "mem_abc", memory);

    const hybrid = new HybridSearch(bm25, null, null, kv as never);
    const results = await hybrid.search("test memory search");

    expect(results.length).toBe(1);
    expect(results[0].observation.id).toBe("mem_abc");
    expect(results[0].observation.narrative).toBe("Test memory for search");
    expect(results[0].observation.concepts).toEqual(["test", "search"]);
  });
});
