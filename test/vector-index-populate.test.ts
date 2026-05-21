import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

import { registerRememberFunction } from "../src/functions/remember.js";
import { setVectorIndex, setEmbeddingProvider, getVectorIndex } from "../src/functions/search.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { EmbeddingProvider } from "../src/types.js";

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
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) throw new Error(`unknown fn ${input.function_id}`);
      return fn(input.payload);
    },
  };
}

describe("vector index population on remember", () => {
  const mockEmbedder: EmbeddingProvider = {
    name: "test",
    dimensions: 3,
    embed: async (_text: string) => new Float32Array([0.1, 0.2, 0.3]),
    embedBatch: async (_texts: string[]) =>
      _texts.map(() => new Float32Array([0.1, 0.2, 0.3])),
  };

  let vectorIndex: VectorIndex;

  beforeEach(() => {
    vectorIndex = new VectorIndex();
    setVectorIndex(vectorIndex);
    setEmbeddingProvider(mockEmbedder);
  });

  afterEach(() => {
    setVectorIndex(null);
    setEmbeddingProvider(null);
  });

  it("calls vectorIndex.add() when remember saves a memory", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "Test memory for vector indexing", type: "fact" },
    });

    expect((result as { success: boolean }).success).toBe(true);
    expect(vectorIndex.size).toBe(1);
  });

  it("calls vectorIndex.add() with short content (0% similarity dedup)", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "First unique memory", type: "fact" },
    });
    await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "Second completely different memory", type: "fact" },
    });

    expect(vectorIndex.size).toBe(2);
  });

  it("handles missing embedder gracefully (vectorIndex stays null)", async () => {
    // Override beforeEach setup: this case wants null state explicitly.
    setVectorIndex(null);
    setEmbeddingProvider(null);

    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "This should work without vector index", type: "fact" },
    });

    expect((result as { success: boolean }).success).toBe(true);
    expect(getVectorIndex()).toBeNull();
  });
});
