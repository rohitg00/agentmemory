import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config.js")>()),
  isConsolidationEnabled: () => false,
}));

const imageReleases: Array<{ path: string; lockHeld: boolean }> = [];
const imageFailures = new Set<string>();
vi.mock("../src/functions/image-refs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/functions/image-refs.js")>();
  const decrementImageRef = vi.fn(async (_kv: unknown, _sdk: unknown, path: string) => {
    const { isKeyedLockHeld } = await import("../src/state/keyed-mutex.js");
    imageReleases.push({ path, lockHeld: isKeyedLockHeld("mem:remember") });
    if (imageFailures.has(path)) throw new Error("image ref write failed");
  });
  const releaseImageRef = vi.fn(async (kv: unknown, sdk: unknown, ownerId: string, path: string) => {
    try {
      await decrementImageRef(kv, sdk, path);
    } catch (err) {
      const { logger } = await import("../src/logger.js");
      logger.warn("Image reference release failed after delete", { ownerId, imageRef: path, error: String(err) });
    }
  });
  return { ...actual, decrementImageRef, releaseImageRef };
});

import { registerGovernanceFunction } from "../src/functions/governance.js";
import { registerRelationsFunction } from "../src/functions/relations.js";
import { registerEvictFunction } from "../src/functions/evict.js";
import { registerAutoForgetFunction } from "../src/functions/auto-forget.js";
import { registerRetentionFunctions } from "../src/functions/retention.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { KV } from "../src/state/schema.js";
import { getSearchIndex } from "../src/functions/search.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import type { Memory, RetentionScore } from "../src/types.js";

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

  it("auto-forget releases the image of the record it deleted, outside the remember lock", async () => {
    imageReleases.length = 0;
    const kv = mockKV();
    const sdk = mockSdk();
    registerAutoForgetFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_img", makeMemory("mem_img", { forgetAfter: "2020-01-01T00:00:00Z", imageRef: "old.png" }));

    let release!: () => void;
    let reached!: () => void;
    const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    const holder = withKeyedLock("mem:remember", async () => {
      reached();
      await releasePromise;
      const current = await kv.get<Memory>(KV.memories, "mem_img");
      await kv.set(KV.memories, "mem_img", { ...current!, imageRef: "new.png" });
    });
    await reachedPromise;
    const run = sdk.trigger("mem::auto-forget", {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await holder;
    await run;

    expect(await kv.get(KV.memories, "mem_img")).toBeNull();
    expect(imageReleases).toEqual([{ path: "new.png", lockHeld: false }]);
  });

  it("evict releases the image of the record it deleted, not the pre-lock snapshot", async () => {
    imageReleases.length = 0;
    const kv = mockKV();
    const sdk = mockSdk();
    registerEvictFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_ev", makeMemory("mem_ev", { forgetAfter: "2020-01-01T00:00:00Z", imageRef: "old.png" }));

    let release!: () => void;
    let reached!: () => void;
    const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    const holder = withKeyedLock("mem:remember", async () => {
      reached();
      await releasePromise;
      const current = await kv.get<Memory>(KV.memories, "mem_ev");
      await kv.set(KV.memories, "mem_ev", { ...current!, imageRef: "new.png" });
    });
    await reachedPromise;
    const run = sdk.trigger("mem::evict", {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await holder;
    await run;

    expect(await kv.get(KV.memories, "mem_ev")).toBeNull();
    expect(imageReleases).toEqual([{ path: "new.png", lockHeld: false }]);
  });
});

function score(memoryId: string, value: number): RetentionScore {
  return {
    memoryId,
    source: "episodic",
    score: value,
    salience: value,
    temporalDecay: 1,
    reinforcementBoost: 0,
    lastAccessed: "2026-01-01T00:00:00Z",
    accessCount: 0,
  };
}

describe("retention eviction holds the remember lock", () => {
  it("waits for the lock holder and the memory stays deleted", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerRetentionFunctions(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_ret", makeMemory("mem_ret"));
    await kv.set(KV.retentionScores, "mem_ret", score("mem_ret", 0.01));

    const holder = await holdRememberLockAndRewrite(kv, "mem_ret");
    const evict = sdk.trigger("mem::retention-evict", { threshold: 0.5 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await kv.get(KV.memories, "mem_ret")).not.toBeNull();

    holder.release();
    await holder.done;
    const result = (await evict) as { evicted: number };

    expect(result.evicted).toBe(1);
    expect(await kv.get(KV.memories, "mem_ret")).toBeNull();
  });

  it("drops the score of a memory deleted while eviction waited so it cannot hold a slot", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerRetentionFunctions(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a"));
    await kv.set(KV.memories, "mem_b", makeMemory("mem_b"));
    await kv.set(KV.retentionScores, "mem_a", score("mem_a", 0.01));
    await kv.set(KV.retentionScores, "mem_b", score("mem_b", 0.02));

    const done = withKeyedLock("mem:remember", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await kv.delete(KV.memories, "mem_a");
    });
    const first = (await sdk.trigger("mem::retention-evict", { threshold: 0.5, maxEvict: 1 })) as { evicted: number };
    await done;

    expect(first.evicted).toBe(0);
    expect(await kv.get(KV.retentionScores, "mem_a")).toBeNull();

    const second = (await sdk.trigger("mem::retention-evict", { threshold: 0.5, maxEvict: 1 })) as { evicted: number };
    expect(second.evicted).toBe(1);
    expect(await kv.get(KV.memories, "mem_b")).toBeNull();
  });

  it("keeps the score when the memory still lives in the other scope", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerRetentionFunctions(sdk as never, kv as never);
    await kv.set(KV.semantic, "mem_s", makeMemory("mem_s"));
    await kv.set(KV.retentionScores, "mem_s", { ...score("mem_s", 0.01), source: undefined });

    const done = withKeyedLock("mem:remember", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await kv.delete(KV.semantic, "mem_s");
      await kv.set(KV.memories, "mem_s", makeMemory("mem_s"));
    });
    await sdk.trigger("mem::retention-evict", { threshold: 0.5, maxEvict: 1 });
    await done;

    expect(await kv.get(KV.retentionScores, "mem_s")).not.toBeNull();
  });

  it("finishes cleanup and continues the sweep when an image release fails", async () => {
    imageFailures.clear();
    imageFailures.add("broken.png");
    const kv = mockKV();
    const sdk = mockSdk();
    registerRetentionFunctions(sdk as never, kv as never);
    const broken = makeMemory("mem_img_a", { imageRef: "broken.png" });
    const next = makeMemory("mem_img_b");
    for (const mem of [broken, next]) {
      await kv.set(KV.memories, mem.id, mem);
      getSearchIndex().add(memoryToObservation(mem), "memory");
    }
    await kv.set(KV.retentionScores, "mem_img_a", score("mem_img_a", 0.01));
    await kv.set(KV.retentionScores, "mem_img_b", score("mem_img_b", 0.02));

    const result = (await sdk.trigger("mem::retention-evict", { threshold: 0.5 })) as { evicted: number };
    imageFailures.clear();

    expect(result.evicted).toBe(2);
    for (const id of ["mem_img_a", "mem_img_b"]) {
      expect(await kv.get(KV.memories, id)).toBeNull();
      expect(await kv.get(KV.retentionScores, id)).toBeNull();
      expect(getSearchIndex().has(id)).toBe(false);
    }
  });

  it("records an audit entry when it removes orphan scores and evicts nothing", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerRetentionFunctions(sdk as never, kv as never);
    await kv.set(KV.retentionScores, "mem_orphan", score("mem_orphan", 0.01));

    const result = (await sdk.trigger("mem::retention-evict", { threshold: 0.5 })) as { evicted: number };

    expect(result.evicted).toBe(0);
    expect(await kv.get(KV.retentionScores, "mem_orphan")).toBeNull();
    const audits = [...kv.store.entries()]
      .filter(([scope]) => scope.startsWith("mem:audit"))
      .flatMap(([, rows]) => [...rows.values()]) as Array<{ functionId: string; targetIds: string[]; details?: Record<string, unknown> }>;
    expect(audits).toContainEqual(expect.objectContaining({
      functionId: "mem::retention-evict",
      targetIds: ["mem_orphan"],
      details: expect.objectContaining({ resource: "retention_score", removed: 1 }),
    }));
  });
});
