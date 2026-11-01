import { describe, it, expect } from "vitest";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { CompressedObservation } from "../src/types.js";

// A disabled graph stream must not even probe index readiness.

const obs: CompressedObservation = {
  id: "obs_1",
  sessionId: "ses_1",
  timestamp: new Date().toISOString(),
  type: "file_edit",
  title: "Edit auth middleware",
  subtitle: "JWT validation",
  facts: ["Added token check"],
  narrative:
    "Modified the AuthMiddleware in src/middleware/auth.ts to validate JWT tokens",
  concepts: ["authentication", "jwt"],
  files: ["src/middleware/auth.ts"],
  importance: 7,
};

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const listed: string[] = [];
  const reads: string[] = [];
  return {
    listed, reads,
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      reads.push(scope);
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
      listed.push(scope);
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

async function searchWith(graphWeight: number | undefined) {
  const bm25 = new SearchIndex();
  bm25.add(obs);
  const kv = mockKV();
  await kv.set("mem:obs:ses_1", "obs_1", obs);
  const hybrid =
    graphWeight === undefined
      ? new HybridSearch(bm25, null, null, kv as never)
      : new HybridSearch(bm25, null, null, kv as never, 0.4, 0.6, graphWeight);
  const results = await hybrid.search(
    "AuthMiddleware src/middleware/auth.ts JWT",
    10,
  );
  return {
    results,
    graphReads: kv.reads.filter((s) => s.startsWith("mem:graph:")),
  };
}

describe("graph weight 0 skips graph retrieval", () => {
  it("control: the default weight reads the graph", async () => {
    const { graphReads } = await searchWith(undefined);
    expect(graphReads.length).toBeGreaterThan(0);
  });

  it("weight 0 never reads a graph scope", async () => {
    const { graphReads } = await searchWith(0);
    expect(graphReads).toEqual([]);
  });

  it("weight 0 still returns the BM25 result", async () => {
    const { results } = await searchWith(0);
    expect(
      results.map((r) => r.observation?.id ?? (r as { obsId?: string }).obsId),
    ).toContain("obs_1");
  });
});

describe("graph weight 0 also skips vector-chunk graph expansion", () => {
  // Lowercase query with no entity-like tokens, so only the expansion
  // traversal (driven by the top vector hits) can read the graph.
  const embedder = {
    name: "fake",
    dimensions: 3,
    embed: async () => new Float32Array([1, 0, 0]),
    embedBatch: async (t: string[]) => t.map(() => new Float32Array([1, 0, 0])),
  };

  async function vectorSearchWith(graphWeight: number) {
    const bm25 = new SearchIndex();
    bm25.add(obs);
    const vector = new VectorIndex();
    vector.add("obs_1", "ses_1", new Float32Array([1, 0, 0]));
    const kv = mockKV();
    await kv.set("mem:obs:ses_1", "obs_1", obs);
    const hybrid = new HybridSearch(
      bm25,
      vector,
      embedder as never,
      kv as never,
      0.4,
      0.6,
      graphWeight,
    );
    await hybrid.search("validate tokens", 10);
    return kv.reads.filter((sc) => sc.startsWith("mem:graph:"));
  }

  it("control: a positive weight expands through the graph", async () => {
    expect((await vectorSearchWith(0.3)).length).toBeGreaterThan(0);
  });

  it("weight 0 does not expand through the graph", async () => {
    expect(await vectorSearchWith(0)).toEqual([]);
  });
});
