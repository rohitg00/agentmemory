import { describe, it, expect } from "vitest";
import { MetricsStore } from "../src/eval/metrics-store.js";
import type { StateKV } from "../src/state/kv.js";

// Only get and set are exercised: MetricsStore.getAll() is the sole caller of
// list(), and nothing here goes through it.
function makeKv(): StateKV {
  const store = new Map<string, unknown>();
  return {
    async get<T>(_scope: string, key: string): Promise<T | null> {
      return (store.get(key) as T) ?? null;
    },
    async set<T>(_scope: string, key: string, value: T): Promise<T> {
      store.set(key, value);
      return value;
    },
  } as unknown as StateKV;
}

describe("MetricsStore under concurrency", () => {
  it("counts every concurrent record on a cold cache", async () => {
    const metrics = new MetricsStore(makeKv());

    await Promise.all([
      ...Array.from({ length: 12 }, () =>
        metrics.record("mem::compress", 100, true),
      ),
      ...Array.from({ length: 8 }, () =>
        metrics.record("mem::compress", 100, false),
      ),
    ]);

    const m = await metrics.get("mem::compress");
    expect(m?.totalCalls).toBe(20);
    expect(m?.successCount).toBe(12);
    expect(m?.failureCount).toBe(8);
  });

  // The production symptom this guards: mem::compress reported an
  // avgLatencyMs of 714,075 ms while measured throughput put real calls at
  // ~21 s. A mean built from a count that never saw most of its samples
  // drifts away from every latency actually observed.
  it("reports the true mean latency under concurrency", async () => {
    const metrics = new MetricsStore(makeKv());
    const latencies = [5, 5, 5, 5, 5, 5, 5, 5, 5, 4000];

    await Promise.all(
      latencies.map((ms) => metrics.record("mem::compress", ms, true)),
    );

    const m = await metrics.get("mem::compress");
    expect(m?.totalCalls).toBe(latencies.length);
    expect(m?.avgLatencyMs).toBeCloseTo(404.5, 5);
  });

  // The unscored call goes first deliberately. Ordered last it lands where a
  // divide-by-totalCalls mistake and the correct divide-by-scored-calls agree,
  // and the case proves nothing.
  it("averages quality only over calls that reported a score", async () => {
    const metrics = new MetricsStore(makeKv());

    await Promise.all([
      metrics.record("mem::compress", 10, false),
      metrics.record("mem::compress", 10, true, 100),
      metrics.record("mem::compress", 10, true, 80),
    ]);

    const m = await metrics.get("mem::compress");
    expect(m?.totalCalls).toBe(3);
    expect(m?.avgQualityScore).toBeCloseTo(90, 5);
  });

  // Guards the cold KV read specifically: this is the only case that fails if
  // the load-from-disk path is dropped. It passes against the unserialized
  // source, so it is not evidence for the concurrency fix.
  it("resumes from persisted totals rather than restarting the mean", async () => {
    const kv = makeKv();
    await kv.set("mem:metrics", "mem::compress", {
      functionId: "mem::compress",
      totalCalls: 100,
      successCount: 100,
      failureCount: 0,
      avgLatencyMs: 20,
      // Zero, not a live-looking score: quality resume is a separate known
      // defect (qualityCallCounts is in-memory, so the first scored call
      // after a restart replaces the persisted average). Seeding a real
      // value here would make this case read as covering that. It does not.
      avgQualityScore: 0,
    });

    // A fresh store stands in for a process restart: the cache is empty and
    // the accumulated totals have to come back off disk.
    const metrics = new MetricsStore(kv);
    await metrics.record("mem::compress", 1020, true);

    const m = await metrics.get("mem::compress");
    expect(m?.totalCalls).toBe(101);
    expect(m?.avgLatencyMs).toBeCloseTo((20 * 100 + 1020) / 101, 5);
  });
});
