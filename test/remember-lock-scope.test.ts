import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerRememberFunction } from "../src/functions/remember.js";
import {
  setVectorIndex,
  setEmbeddingProvider,
  setIndexPersistence,
  vectorIndexAddGuarded,
} from "../src/functions/search.js";
import { logger } from "../src/logger.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { KV } from "../src/state/schema.js";
import type { EmbeddingProvider, Memory } from "../src/types.js";

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
      if (!fn) return null;
      return fn(input.payload);
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RememberResult = {
  success: boolean;
  memory: Memory;
};

describe("mem::remember lock scope", () => {
  const EMBED_DELAY_MS = 60;
  let vectorIndex: VectorIndex;
  let embedCalls: Array<{ start: number; end: number }>;

  beforeEach(() => {
    vectorIndex = new VectorIndex();
    setVectorIndex(vectorIndex);
    embedCalls = [];
    const slowEmbedder: EmbeddingProvider = {
      name: "slow-test",
      dimensions: 3,
      embed: async (_text: string) => {
        const start = Date.now();
        await delay(EMBED_DELAY_MS);
        embedCalls.push({ start, end: Date.now() });
        return new Float32Array([0.1, 0.2, 0.3]);
      },
      embedBatch: async (texts: string[]) =>
        texts.map(() => new Float32Array([0.1, 0.2, 0.3])),
    };
    setEmbeddingProvider(slowEmbedder);
  });

  afterEach(() => {
    setVectorIndex(null);
    setEmbeddingProvider(null);
  });

  it("overlaps embedding time across concurrent saves instead of serializing behind the mem:remember lock", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await Promise.all([
      sdk.trigger({
        function_id: "mem::remember",
        payload: {
          content: "alpha content about the deploy pipeline rollout gates",
          type: "fact",
        },
      }),
      sdk.trigger({
        function_id: "mem::remember",
        payload: {
          content: "bravo content about a completely unrelated caching layer",
          type: "fact",
        },
      }),
    ]);

    expect(embedCalls).toHaveLength(2);
    const [a, b] = embedCalls;
    expect(a.start).toBeLessThan(b.end);
    expect(b.start).toBeLessThan(a.end);
  });

  it("still dedups two identical saves fired concurrently, even with a slow embedder", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const content =
      "the deploy pipeline uses blue green rollout with health gates";
    const [first, second] = (await Promise.all([
      sdk.trigger({
        function_id: "mem::remember",
        payload: { content, type: "architecture" },
      }),
      sdk.trigger({
        function_id: "mem::remember",
        payload: { content, type: "architecture" },
      }),
    ])) as RememberResult[];

    expect(first.memory.version).toBe(1);
    expect(second.memory.version).toBe(2);
    expect(second.memory.supersedes).toContain(first.memory.id);
    expect(second.memory.parentId).toBe(first.memory.id);

    const stored = await kv.get<Memory>(KV.memories, first.memory.id);
    expect(stored?.isLatest).toBe(false);
  });

  it("keeps a superseded memory out of the vector index even when its embedding finishes after the second save removes it", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const content =
      "the deploy pipeline uses blue green rollout with health gates";
    const [first, second] = (await Promise.all([
      sdk.trigger({
        function_id: "mem::remember",
        payload: { content, type: "architecture" },
      }),
      sdk.trigger({
        function_id: "mem::remember",
        payload: { content, type: "architecture" },
      }),
    ])) as RememberResult[];

    const results = vectorIndex.search(new Float32Array([0.1, 0.2, 0.3]), 10);
    const indexedIds = results.map((r) => r.obsId);
    expect(indexedIds).not.toContain(first.memory.id);
    expect(indexedIds).toContain(second.memory.id);
    expect(vectorIndex.size).toBe(1);
  });

  it("schedules an index save after the deferred vector-index commit lands", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);
    const scheduleSave = vi.fn();
    setIndexPersistence({ scheduleSave, save: vi.fn(async () => {}) });

    try {
      await sdk.trigger({
        function_id: "mem::remember",
        payload: {
          content: "schedule an index save after the vector commit lands",
          type: "fact",
        },
      });

      expect(scheduleSave.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      setIndexPersistence(null);
    }
  });

  it("logs a vector-index commit failure distinctly from an embed failure", async () => {
    const failingCommit = vi.fn(async () => {
      throw new Error("kv unavailable");
    });

    const result = await vectorIndexAddGuarded(
      "mem_commit_fail",
      "memory",
      "some memory text",
      { kind: "memory", logId: "mem_commit_fail" },
      failingCommit,
    );

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "vector-index add: commit failed — skipping",
      expect.objectContaining({ id: "mem_commit_fail" }),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      "vector-index add: embed failed — skipping",
      expect.anything(),
    );
  });
});
