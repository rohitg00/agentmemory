import { describe, it, expect, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }),
}));

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

describe("access-tracker", () => {
  it("getAccessLog returns empty log for unknown id", async () => {
    const { getAccessLog } = await import(
      "../src/functions/access-tracker.js"
    );
    const kv = mockKV();
    const log = await getAccessLog(kv as never, "mem_xyz");
    expect(log).toEqual({ memoryId: "mem_xyz", count: 0, lastAt: "", recent: [] });
  });

  it("recordAccess increments count and lastAt", async () => {
    const { recordAccess, getAccessLog } = await import(
      "../src/functions/access-tracker.js"
    );
    const kv = mockKV();
    await recordAccess(kv as never, "mem_a", 1_000_000);
    await recordAccess(kv as never, "mem_a", 2_000_000);
    await recordAccess(kv as never, "mem_a", 3_000_000);

    const log = await getAccessLog(kv as never, "mem_a");
    expect(log.count).toBe(3);
    expect(log.recent).toEqual([1_000_000, 2_000_000, 3_000_000]);
    expect(log.lastAt).toBe(new Date(3_000_000).toISOString());
  });

  it("recent[] is bounded to last 20 entries", async () => {
    const { recordAccess, getAccessLog } = await import(
      "../src/functions/access-tracker.js"
    );
    const kv = mockKV();
    for (let i = 1; i <= 50; i++) {
      await recordAccess(kv as never, "mem_b", i * 1000);
    }
    const log = await getAccessLog(kv as never, "mem_b");
    expect(log.count).toBe(50);
    expect(log.recent.length).toBe(20);
    // Should be the LAST 20: 31_000..50_000
    expect(log.recent[0]).toBe(31_000);
    expect(log.recent[19]).toBe(50_000);
  });

  it("recordAccessBatch deduplicates and writes once per id", async () => {
    const { recordAccessBatch, getAccessLog } = await import(
      "../src/functions/access-tracker.js"
    );
    const kv = mockKV();
    await recordAccessBatch(
      kv as never,
      ["mem_a", "mem_b", "mem_a", "mem_b", "mem_c"],
      5_000_000,
    );
    expect((await getAccessLog(kv as never, "mem_a")).count).toBe(1);
    expect((await getAccessLog(kv as never, "mem_b")).count).toBe(1);
    expect((await getAccessLog(kv as never, "mem_c")).count).toBe(1);
  });

  it("recordAccess swallows kv.set errors (must not break reads)", async () => {
    const { recordAccess } = await import(
      "../src/functions/access-tracker.js"
    );
    const kv = mockKV();
    kv.set = (async () => {
      throw new Error("boom");
    }) as never;
    await expect(recordAccess(kv as never, "mem_a")).resolves.toBeUndefined();
  });

  it("concurrent recordAccess calls do not lose increments (keyed mutex)", async () => {
    const { recordAccess, getAccessLog } = await import(
      "../src/functions/access-tracker.js"
    );
    const kv = mockKV();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        recordAccess(kv as never, "mem_race", i * 100),
      ),
    );
    const log = await getAccessLog(kv as never, "mem_race");
    expect(log.count).toBe(25);
  });

  it("recordAccessBatch: a single failing id does not block siblings", async () => {
    const { recordAccessBatch, getAccessLog } = await import(
      "../src/functions/access-tracker.js"
    );
    const kv = mockKV();
    const realSet = kv.set.bind(kv);
    kv.set = (async (scope: string, key: string, val: unknown) => {
      if (key === "mem_slow") throw new Error("write failed");
      return realSet(scope, key, val);
    }) as never;

    await recordAccessBatch(
      kv as never,
      ["mem_slow", "mem_fast_a", "mem_fast_b"],
      1_000_000,
    );
    expect((await getAccessLog(kv as never, "mem_fast_a")).count).toBe(1);
    expect((await getAccessLog(kv as never, "mem_fast_b")).count).toBe(1);
    expect((await getAccessLog(kv as never, "mem_slow")).count).toBe(0);
  });

  it("ignores empty / falsy memory ids", async () => {
    const { recordAccess, recordAccessBatch } = await import(
      "../src/functions/access-tracker.js"
    );
    const kv = mockKV();
    await recordAccess(kv as never, "");
    await recordAccessBatch(kv as never, ["", "mem_x", ""]);
    expect(kv.store.get("mem:access")?.has("")).toBeFalsy();
    expect(kv.store.get("mem:access")?.get("mem_x")).toBeTruthy();
  });
});
