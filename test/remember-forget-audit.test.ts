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

  // #1063/#978: KV.graphExtractMarks is introduced by mem::graph-extract's
  // change-detection gate and must be reclaimed wherever a session's
  // KV.observations/KV.summaries are already reclaimed - otherwise the
  // per-session mark outlives the session it belongs to.
  it("clears the graph-extract change-detection marks when an entire session is forgotten (#1063, #978)", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await kv.set("mem:sessions", "sess_1", { id: "sess_1" });
    await kv.set("mem:summaries", "sess_1", { id: "sess_1" });
    await kv.set("mem:obs:sess_1", "obs_a", { id: "obs_a" });
    await kv.set("mem:graph:extract-marks:sess_1", "current", {
      fingerprint: "gfx_aaaaaaaaaaaaaaaa",
      llm: true,
      at: Date.now(),
    });

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: "sess_1" },
    });

    const remaining = await kv.list("mem:graph:extract-marks:sess_1");
    expect(remaining).toHaveLength(0);
  });

  // The explicit-observationIds branch deletes some of a session's
  // observations while the session itself survives, so it never reaches
  // the whole-session branch covered above - it needs its own flush, or
  // the mark outlives the observation set it was computed over.
  it("reclaims the graph-extract mark when specific observationIds are forgotten", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await kv.set("mem:sessions", "sess_2", { id: "sess_2" });
    await kv.set("mem:obs:sess_2", "obs_a", { id: "obs_a" });
    await kv.set("mem:obs:sess_2", "obs_b", { id: "obs_b" });
    await kv.set("mem:graph:extract-marks:sess_2", "current", {
      fingerprint: "gfx_aaaaaaaaaaaaaaaa",
      llm: true,
      at: Date.now(),
    });

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: "sess_2", observationIds: ["obs_a"] },
    });

    // The session and its remaining observation survive - only the mark
    // invalidated by the partial delete is reclaimed.
    expect(await kv.get("mem:sessions", "sess_2")).not.toBeNull();
    expect(await kv.get("mem:obs:sess_2", "obs_b")).not.toBeNull();
    expect(await kv.list("mem:graph:extract-marks:sess_2")).toHaveLength(0);
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

  // Regression coverage for issue #1120: mem::forget must not report a
  // deletion for ids it never touches (e.g. lesson ids live in KV.lessons,
  // not KV.memories).
  it("returns deleted: 0 for a nonexistent memoryId (lesson id)", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const deleteSpy = vi.spyOn(kv, "delete");
    const result = await sdk.trigger({
      function_id: "mem::forget",
      payload: { memoryId: "lsn_4f9cb07017a7c8ac" },
    });

    expect(result).toEqual({ success: true, deleted: 0 });
    // No-op path must not touch the memories keyspace or search index.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(getSearchIndex().has("lsn_4f9cb07017a7c8ac")).toBe(false);
  });

  it("emits no audit row when memoryId does not exist", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { memoryId: "lsn_4f9cb07017a7c8ac" },
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
