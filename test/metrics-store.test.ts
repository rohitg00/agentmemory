import { describe, it, expect } from "vitest";
import { MetricsStore } from "../src/eval/metrics-store.js";
import type { StateKV } from "../src/state/kv.js";
import type { FunctionMetrics } from "../src/types.js";

function fakeKv(store = new Map<string, FunctionMetrics>()): StateKV {
  return {
    get: async <T>(_scope: string, key: string) =>
      (store.get(key) as T) ?? null,
    set: async <T>(_scope: string, key: string, value: T) => {
      store.set(key, value as FunctionMetrics);
      return value;
    },
    update: async () => {
      throw new Error("not implemented");
    },
    delete: async (_scope: string, key: string) => {
      store.delete(key);
    },
    list: async () => Array.from(store.values()),
  } as unknown as StateKV;
}

describe("MetricsStore", () => {
  it("records lastFailureAt only on failures", async () => {
    const store = new MetricsStore(fakeKv());
    await store.record("f", 10, true);
    expect((await store.get("f"))?.lastFailureAt).toBeUndefined();
    await store.record("f", 10, false);
    const m = await store.get("f");
    expect(m?.failureCount).toBe(1);
    expect(typeof m?.lastFailureAt).toBe("number");
  });

  it("caps the recent-calls ring buffer", async () => {
    const store = new MetricsStore(fakeKv());
    for (let i = 0; i < 60; i++) await store.record("f", 1, true);
    const m = await store.get("f");
    expect(m?.recentCalls?.length).toBe(50);
  });

  it("getAll ignores failures older than the 24h window", async () => {
    // Simulate a counter polluted by a long-fixed bug: 256 old failures,
    // one outcome ring entry outside the window.
    const kvStore = new Map<string, FunctionMetrics>([
      [
        "f",
        {
          functionId: "f",
          totalCalls: 500,
          successCount: 244,
          failureCount: 256,
          avgLatencyMs: 1,
          avgQualityScore: 100,
          recentCalls: [{ t: Date.now() - 48 * 60 * 60 * 1000, ok: false }],
        },
      ],
    ]);
    const store = new MetricsStore(fakeKv(kvStore));
    await store.record("f", 1, true);
    const f = (await store.getAll()).find((m) => m.functionId === "f");
    expect(f?.failureCount).toBe(256); // cumulative history kept
    expect(f?.recentCallCount).toBe(1); // only the fresh call
    expect(f?.recentFailureRate).toBe(0); // stale failures excluded
    expect(f?.recentCalls).toBeUndefined(); // ring not exposed in health
  });

  it("getAll reports a live rate for mixed recent outcomes", async () => {
    const store = new MetricsStore(fakeKv());
    await store.record("g", 1, true);
    await store.record("g", 1, false);
    const g = (await store.getAll()).find((m) => m.functionId === "g");
    expect(g?.recentFailureRate).toBe(0.5);
    expect(g?.failureCount).toBe(1);
  });
});