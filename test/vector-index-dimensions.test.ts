import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { VectorIndex } from "../src/state/vector-index.js";
import { migrateVectorIndex } from "../src/functions/migrate-vector-index.js";
import type { EmbeddingProvider } from "../src/types.js";

describe("VectorIndex.validateDimensions", () => {
  it("reports no mismatches and an empty dim set on an empty index", () => {
    const result = new VectorIndex().validateDimensions(384);
    expect(result.mismatches).toEqual([]);
    expect(Array.from(result.seenDimensions)).toEqual([]);
  });

  it("reports no mismatches when every vector matches the expected dimension", () => {
    const idx = new VectorIndex();
    idx.add("o1", "s1", new Float32Array(384));
    idx.add("o2", "s1", new Float32Array(384));
    const result = idx.validateDimensions(384);
    expect(result.mismatches).toEqual([]);
    expect(Array.from(result.seenDimensions)).toEqual([384]);
  });

  it("reports every wrong-dimension vector, not just the first", () => {
    const idx = new VectorIndex();
    idx.add("good1", "s1", new Float32Array(384));
    idx.add("bad1", "s1", new Float32Array(1536));
    idx.add("good2", "s1", new Float32Array(384));
    idx.add("bad2", "s1", new Float32Array(768));
    const result = idx.validateDimensions(384);
    expect(result.mismatches).toHaveLength(2);
    expect(result.mismatches.map((m) => m.obsId).sort()).toEqual(["bad1", "bad2"]);
    expect(Array.from(result.seenDimensions).sort((a, b) => a - b)).toEqual([
      384, 768, 1536,
    ]);
  });

  it("flags every entry when the entire index has the wrong dimension", () => {
    const idx = new VectorIndex();
    idx.add("o1", "s1", new Float32Array(384));
    idx.add("o2", "s1", new Float32Array(384));
    const result = idx.validateDimensions(1536);
    expect(result.mismatches).toHaveLength(2);
    expect(Array.from(result.seenDimensions)).toEqual([384]);
  });
});

describe("migrateVectorIndex", () => {
  const newProvider: EmbeddingProvider = {
    name: "test-4d",
    dimensions: 4,
    embed: async (_text: string) => new Float32Array([0.1, 0.2, 0.3, 0.4]),
    embedBatch: async (_texts: string[]) =>
      _texts.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])),
  };

  function mockKV() {
    const store = new Map<string, Map<string, unknown>>();
    return {
      get: async <T>(scope: string, key: string): Promise<T | null> =>
        (store.get(scope)?.get(key) as T) ?? null,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (!store.has(scope)) store.set(scope, new Map());
        store.get(scope)!.set(key, data);
        return data;
      },
      delete: async (_scope: string, _key: string): Promise<void> => {},
      list: async <T>(scope: string): Promise<T[]> => {
        const entries = store.get(scope);
        return entries ? (Array.from(entries.values()) as T[]) : [];
      },
    };
  }

  it("re-embeds observations with new provider dimensions", async () => {
    const kv = mockKV();
    await kv.set("mem:sessions", "ses_1", { id: "ses_1" });
    await kv.set("mem:obs:ses_1", "obs_1", {
      id: "obs_1",
      sessionId: "ses_1",
      timestamp: new Date().toISOString(),
      type: "decision",
      title: "migration test",
      facts: ["test"],
      narrative: "Testing migration",
      concepts: ["test"],
      files: [],
      importance: 5,
    });

    const result = await migrateVectorIndex(kv as never, newProvider);
    expect(result.success).toBe(true);
    expect(result.totalProcessed).toBe(1);
    expect(result.vectorSize).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("re-embeds memories with new provider dimensions", async () => {
    const kv = mockKV();
    await kv.set("mem:memories", "mem_1", {
      id: "mem_1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: "fact",
      title: "migration memory",
      content: "This memory will be re-embedded",
      concepts: ["test"],
      files: [],
      sessionIds: ["ses_1"],
      strength: 7,
      version: 1,
      isLatest: true,
    });

    const result = await migrateVectorIndex(kv as never, newProvider);
    expect(result.totalProcessed).toBe(1);
    expect(result.vectorSize).toBe(1);
  });

  it("handles empty KV gracefully", async () => {
    const kv = mockKV();

    const result = await migrateVectorIndex(kv as never, newProvider);
    expect(result.success).toBe(true);
    expect(result.totalProcessed).toBe(0);
    expect(result.vectorSize).toBe(0);
    expect(result.failed).toBe(0);
  });
});
