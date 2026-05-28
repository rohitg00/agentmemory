import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

import { registerRememberFunction } from "../src/functions/remember.js";
import {
  getSearchIndex,
  setIndexPersistence,
} from "../src/functions/search.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import type { Memory } from "../src/types.js";

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

describe("mem::forget audit coverage (issue #125)", () => {
  it("emits a single audit row when a memory is forgotten", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await kv.set("mem:memories", "mem_a", { id: "mem_a", content: "x" });

    const result = await sdk.trigger({
      function_id: "mem::forget",
      payload: { memoryId: "mem_a" },
    });
    expect((result as { deleted: number }).deleted).toBe(1);

    const auditRows = await kv.list<{
      operation: string;
      functionId: string;
      targetIds: string[];
      details: Record<string, unknown>;
    }>("mem:audit");
    expect(auditRows).toHaveLength(1);
    const [row] = auditRows;
    expect(row.operation).toBe("forget");
    expect(row.functionId).toBe("mem::forget");
    expect(row.targetIds).toEqual(["mem_a"]);
    expect(row.details.memoriesDeleted).toBe(1);
    expect(row.details.observationsDeleted).toBe(0);
    expect(row.details.sessionDeleted).toBe(false);
  });

  it("emits one batched audit row when an entire session is forgotten", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await kv.set("mem:sessions", "sess_1", { id: "sess_1" });
    await kv.set("mem:summaries", "sess_1", { id: "sess_1" });
    await kv.set("mem:obs:sess_1", "obs_a", { id: "obs_a" });
    await kv.set("mem:obs:sess_1", "obs_b", { id: "obs_b" });

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: "sess_1" },
    });

    const auditRows = await kv.list<{
      targetIds: string[];
      details: Record<string, unknown>;
    }>("mem:audit");
    expect(auditRows).toHaveLength(1);
    const [row] = auditRows;
    expect([...row.targetIds].sort()).toEqual(["obs_a", "obs_b"]);
    expect(row.details.memoriesDeleted).toBe(0);
    expect(row.details.observationsDeleted).toBe(2);
    expect(row.details.sessionDeleted).toBe(true);
    expect(row.details.deleted).toBe(4);
  });

  it("does not emit an audit row when nothing is deleted", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: undefined, memoryId: undefined },
    });

    const auditRows = await kv.list("mem:audit");
    expect(auditRows).toHaveLength(0);
  });
});

// Delete paths must tear down the BM25 index entry and synchronously
// flush the persisted snapshot. Without this, a deleted memory keeps
// occupying limit-capped search result slots, and an in-memory remove
// would be lost if the process exits before the debounced save fires.
describe("mem::forget search-index cleanup", () => {
  function makeMemory(id: string): Memory {
    return {
      id,
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
      type: "fact",
      title: `title ${id}`,
      content: `content ${id}`,
      concepts: [],
      files: [],
      sessionIds: ["ses_1"],
      strength: 5,
      version: 1,
      isLatest: true,
    };
  }

  beforeEach(() => {
    getSearchIndex().clear();
    setIndexPersistence(null);
  });

  afterEach(() => {
    setIndexPersistence(null);
  });

  it("removes a forgotten memory from the BM25 index", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const mem = makeMemory("mem_a");
    await kv.set("mem:memories", mem.id, mem);
    getSearchIndex().add(memoryToObservation(mem));
    expect(getSearchIndex().has("mem_a")).toBe(true);

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { memoryId: "mem_a" },
    });

    expect(getSearchIndex().has("mem_a")).toBe(false);
  });

  it("removes forgotten observations from the BM25 index", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await kv.set("mem:obs:ses_1", "obs_a", { id: "obs_a" });
    await kv.set("mem:obs:ses_1", "obs_b", { id: "obs_b" });
    getSearchIndex().add(memoryToObservation(makeMemory("obs_a")));
    getSearchIndex().add(memoryToObservation(makeMemory("obs_b")));

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: "ses_1", observationIds: ["obs_a"] },
    });

    expect(getSearchIndex().has("obs_a")).toBe(false);
    expect(getSearchIndex().has("obs_b")).toBe(true);
  });

  it("flushes persistence immediately when a memory is forgotten", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);
    const persistence = { scheduleSave: vi.fn(), save: vi.fn(async () => {}) };
    setIndexPersistence(persistence);

    await kv.set("mem:memories", "mem_a", makeMemory("mem_a"));

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { memoryId: "mem_a" },
    });

    expect(persistence.save).toHaveBeenCalled();
  });
});
