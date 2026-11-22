import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerRelationsFunction } from "../src/functions/relations.js";
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
      return entries ? (Array.from(entries.values()) as T[]) : [];
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
    sdk = mockSdk();
    kv = mockKV();
    registerRelationsFunction(sdk as never, kv as never);
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
});
