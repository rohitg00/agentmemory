import { describe, expect, it, vi } from "vitest";
import { MetricsStore } from "../src/eval/metrics-store.js";
import { KV } from "../src/state/schema.js";
import type { FunctionMetrics } from "../src/types.js";

describe("MetricsStore", () => {
  it("records latency, success, failure, and quality averages", async () => {
    const saved: FunctionMetrics[] = [];
    const kv = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(async (_scope: string, _key: string, value: FunctionMetrics) => {
        saved.push({ ...value });
        return value;
      }),
      list: vi.fn(),
    };
    const store = new MetricsStore(kv as any);

    await store.record("mem::x", 100, true, 80);
    await store.record("mem::x", 300, false, 100);

    expect(await store.get("mem::x")).toEqual({
      functionId: "mem::x",
      totalCalls: 2,
      successCount: 1,
      failureCount: 1,
      avgLatencyMs: 200,
      avgQualityScore: 90,
    });
    expect(kv.get).toHaveBeenCalledOnce();
    expect(saved).toHaveLength(2);
  });

  it("falls back to persisted metrics and ignores write/list failures", async () => {
    const persisted = {
      functionId: "mem::persisted",
      totalCalls: 2,
      successCount: 2,
      failureCount: 0,
      avgLatencyMs: 50,
      avgQualityScore: 0,
    };
    const kv = {
      get: vi.fn().mockResolvedValue(persisted),
      set: vi.fn().mockRejectedValue(new Error("disk full")),
      list: vi.fn().mockRejectedValue(new Error("offline")),
    };
    const store = new MetricsStore(kv as any);

    await store.record("mem::persisted", 80, true);

    expect(await store.get("mem::persisted")).toMatchObject({
      totalCalls: 3,
      successCount: 3,
      avgLatencyMs: 60,
    });
    await expect(store.getAll()).resolves.toEqual([
      expect.objectContaining({ functionId: "mem::persisted" }),
    ]);
  });

  it("merges persisted metrics with cached values, preferring cache", async () => {
    const kv = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([
        { functionId: "mem::cached", totalCalls: 1 },
        { functionId: "mem::other", totalCalls: 4 },
      ]),
    };
    const store = new MetricsStore(kv as any);

    await store.record("mem::cached", 10, true);

    await expect(store.getAll()).resolves.toEqual([
      expect.objectContaining({ functionId: "mem::cached", totalCalls: 1, successCount: 1 }),
      expect.objectContaining({ functionId: "mem::other", totalCalls: 4 }),
    ]);
    expect(kv.list).toHaveBeenCalledWith(KV.metrics);
  });

  it("reads through to kv when a metric is not cached", async () => {
    const persisted = {
      functionId: "mem::cold",
      totalCalls: 1,
      successCount: 1,
      failureCount: 0,
      avgLatencyMs: 42,
      avgQualityScore: 0,
    };
    const kv = {
      get: vi.fn().mockResolvedValue(persisted),
      set: vi.fn(),
      list: vi.fn(),
    };
    const store = new MetricsStore(kv as any);

    await expect(store.get("mem::cold")).resolves.toBe(persisted);
    expect(kv.get).toHaveBeenCalledWith(KV.metrics, "mem::cold");
  });
});
