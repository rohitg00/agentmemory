import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config.js")>()),
  isConsolidationEnabled: () => false,
}));

import { registerGovernanceFunction } from "../src/functions/governance.js";
import { registerRelationsFunction } from "../src/functions/relations.js";
import { registerEvictFunction } from "../src/functions/evict.js";
import { registerAutoForgetFunction } from "../src/functions/auto-forget.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { KV } from "../src/state/schema.js";
import type { Memory } from "../src/types.js";

type Gate = { scope: string; key: string; reached: () => void; release: Promise<void> };

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  let gate: Gate | null = null;
  return {
    store,
    gateNextSet(scope: string, key: string) {
      let reached!: () => void;
      let release!: () => void;
      const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
      const releasePromise = new Promise<void>((resolve) => { release = resolve; });
      gate = { scope, key, reached, release: releasePromise };
      return { reached: reachedPromise, release };
    },
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (gate && gate.scope === scope && gate.key === key) {
        const current = gate;
        gate = null;
        current.reached();
        await current.release;
      }
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
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) return { success: true };
      return fn(payload);
    },
  };
}

function makeMemory(id: string, overrides: Partial<Memory> = {}): Memory {
  return {
    id,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    type: "fact",
    title: `Memory ${id}`,
    content: `Content for ${id}`,
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 5,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

async function holdRememberLockAndRewrite(kv: ReturnType<typeof mockKV>, id: string) {
  let reached!: () => void;
  let release!: () => void;
  const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  const done = withKeyedLock("mem:remember", async () => {
    const current = await kv.get<Memory>(KV.memories, id);
    reached();
    await releasePromise;
    if (current) await kv.set(KV.memories, id, { ...current, isLatest: false });
  });
  await reachedPromise;
  return { release, done };
}

describe("memory delete paths hold the remember lock", () => {
  it("governance delete waits for an in-flight evolve and the memory stays deleted", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerGovernanceFunction(sdk as never, kv as never);
    registerRelationsFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_x", makeMemory("mem_x"));

    const gate = kv.gateNextSet(KV.memories, "mem_x");
    const evolve = sdk.trigger("mem::evolve", { memoryId: "mem_x", newContent: "updated content" });
    await gate.reached;

    const deletion = sdk.trigger("mem::governance-delete", { memoryIds: ["mem_x"] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await kv.get(KV.memories, "mem_x")).not.toBeNull();

    gate.release();
    await evolve;
    const result = (await deletion) as { deleted: number };

    expect(result.deleted).toBe(1);
    expect(await kv.get(KV.memories, "mem_x")).toBeNull();
  });

  it("evict TTL delete waits for the lock holder and does not get undone", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerEvictFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_ttl", makeMemory("mem_ttl", { forgetAfter: "2020-01-01T00:00:00Z" }));

    const holder = await holdRememberLockAndRewrite(kv, "mem_ttl");
    const evict = sdk.trigger("mem::evict", {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await kv.get(KV.memories, "mem_ttl")).not.toBeNull();

    holder.release();
    await holder.done;
    const result = (await evict) as { expiredMemories: number };

    expect(result.expiredMemories).toBe(1);
    expect(await kv.get(KV.memories, "mem_ttl")).toBeNull();
  });

  it("evict skips a memory that another writer already deleted", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerEvictFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_gone", makeMemory("mem_gone", { forgetAfter: "2020-01-01T00:00:00Z" }));

    const done = withKeyedLock("mem:remember", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await kv.delete(KV.memories, "mem_gone");
    });
    const result = (await sdk.trigger("mem::evict", {})) as { expiredMemories: number };
    await done;

    expect(result.expiredMemories).toBe(0);
  });

  it("auto-forget TTL delete waits for the lock holder and does not get undone", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerAutoForgetFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_af", makeMemory("mem_af", { forgetAfter: "2020-01-01T00:00:00Z" }));

    const holder = await holdRememberLockAndRewrite(kv, "mem_af");
    const run = sdk.trigger("mem::auto-forget", {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await kv.get(KV.memories, "mem_af")).not.toBeNull();

    holder.release();
    await holder.done;
    const result = (await run) as { ttlExpired: string[] };

    expect(result.ttlExpired).toEqual(["mem_af"]);
    expect(await kv.get(KV.memories, "mem_af")).toBeNull();
  });
});
