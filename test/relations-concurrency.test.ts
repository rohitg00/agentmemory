import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    TriggerAction: {
      ...actual.TriggerAction,
      Void: vi.fn(() => ({ type: "void" })),
    },
  };
});

const lockAttempts = vi.hoisted(() => ({ onAttempt: undefined as ((key: string) => void) | undefined }));

vi.mock("../src/state/keyed-mutex.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/state/keyed-mutex.js")>();
  return {
    ...actual,
    withReentrantKeyedLock: <T>(key: string, fn: () => Promise<T>): Promise<T> => {
      lockAttempts.onAttempt?.(key);
      return actual.withReentrantKeyedLock(key, fn);
    },
  };
});

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerRelationsFunction } from "../src/functions/relations.js";
import { registerAutoForgetFunction } from "../src/functions/auto-forget.js";
import type { Memory } from "../src/types.js";

// Clones on read and write so concurrent callers hold independent copies, as with a real KV.
function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      const value = store.get(scope)?.get(key);
      return value === undefined ? null : (structuredClone(value) as T);
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, structuredClone(data));
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values(), (v) => structuredClone(v)) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) return undefined;
      return fn(payload);
    },
  };
}

function makeMemory(id: string): Memory {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    type: "pattern",
    title: `Memory ${id}`,
    content: `Content of ${id}`,
    concepts: [],
    files: [],
    sessionIds: ["ses_1"],
    strength: 5,
    version: 1,
    isLatest: true,
  };
}

describe("mem::relate concurrency", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    lockAttempts.onAttempt = undefined;
    sdk = mockSdk();
    kv = mockKV();
    registerRelationsFunction(sdk as never, kv as never);
    registerAutoForgetFunction(sdk as never, kv as never);
    for (const id of ["mem_a", "mem_b", "mem_c"]) {
      await kv.set("mem:memories", id, makeMemory(id));
    }
  });

  it("keeps both related ids when two relates share a memory", async () => {
    await Promise.all([
      sdk.trigger("mem::relate", { sourceId: "mem_a", targetId: "mem_b", type: "related" }),
      sdk.trigger("mem::relate", { sourceId: "mem_a", targetId: "mem_c", type: "related" }),
    ]);

    const a = await kv.get<Memory>("mem:memories", "mem_a");
    expect(a!.relatedIds).toEqual(expect.arrayContaining(["mem_b", "mem_c"]));
  });

  it("does not mark a memory superseded by a concurrent evolve as latest again", async () => {
    const [, evolved] = (await Promise.all([
      sdk.trigger("mem::relate", { sourceId: "mem_a", targetId: "mem_b", type: "related" }),
      sdk.trigger("mem::evolve", { memoryId: "mem_a", newContent: "Updated content" }),
    ])) as [unknown, { success: boolean; memory: Memory }];

    expect(evolved.success).toBe(true);
    const old = await kv.get<Memory>("mem:memories", "mem_a");
    expect(old!.isLatest).toBe(false);
    expect(old!.relatedIds).toContain("mem_b");
  });

  it("keeps a link added while auto-forget supersedes a contradicted memory", async () => {
    const older = { ...makeMemory("mem_a"), createdAt: "2026-01-01T00:00:00.000Z", concepts: ["deploy"], content: "deploy runs on friday evenings" };
    const newer = { ...makeMemory("mem_b"), concepts: ["deploy"], content: "deploy runs on friday evenings" };
    await kv.set("mem:memories", "mem_a", older);
    await kv.set("mem:memories", "mem_b", newer);

    // Hold relate between its reads and its writes, then let auto-forget run.
    // Without the shared lock auto-forget supersedes mem_a in that window and
    // relate's stale copy marks it latest again.
    const set = kv.set;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let relateRead!: () => void;
    const paused = new Promise<void>((resolve) => (relateRead = resolve));
    kv.set = async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (scope === "mem:relations") {
        relateRead();
        await gate;
      }
      return set(scope, key, data);
    };

    // Auto-forget only asks for the lock after taking its snapshot, so
    // releasing relate at that point guarantees the snapshot is stale.
    let forgetLocking!: () => void;
    const locking = new Promise<void>((resolve) => (forgetLocking = resolve));
    lockAttempts.onAttempt = (key) => {
      if (key === "mem:remember") forgetLocking();
    };

    const relate = sdk.trigger("mem::relate", { sourceId: "mem_a", targetId: "mem_c", type: "related" });
    await paused;
    const forget = sdk.trigger("mem::auto-forget", {});
    await Promise.race([forget, locking]);
    release();
    await Promise.all([relate, forget]);

    const a = await kv.get<Memory>("mem:memories", "mem_a");
    expect(a!.isLatest).toBe(false);
    expect(a!.relatedIds).toContain("mem_c");
  });
});
