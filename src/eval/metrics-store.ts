import type { FunctionMetrics } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { KV } from "../state/schema.js";

export class MetricsStore {
  private cache = new Map<string, FunctionMetrics>();
  private qualityCallCounts = new Map<string, number>();

  constructor(private kv: StateKV) {}

  // record() reads a function's counters, mutates them, then writes back, and
  // the read awaits kv.get() whenever the cache is cold. Concurrent callers
  // interleaved in that gap, all started from the same totals, and overwrote
  // each other — so N calls landed as one and avgLatencyMs was divided by a
  // count that never saw them. Serializing per functionId keeps the existing
  // incremental mean correct without changing the persisted shape.
  record(
    functionId: string,
    latencyMs: number,
    success: boolean,
    qualityScore?: number,
  ): Promise<void> {
    return withKeyedLock(`mem:metrics:${functionId}`, () =>
      this.apply(functionId, latencyMs, success, qualityScore),
    );
  }

  private async apply(
    functionId: string,
    latencyMs: number,
    success: boolean,
    qualityScore?: number,
  ): Promise<void> {
    let m = this.cache.get(functionId);
    if (!m) {
      // Guarded like the set below and the list in getAll(). Unguarded, a
      // state::get timeout rejects record(), and compress.ts records again
      // from its own catch block — that second call rejects too, so the
      // handler escapes before it can log or return {success:false}.
      // summarize.ts has the same shape but is invoked result-expecting, so
      // the escape rejects event::session::stopped.
      m = (await this.kv
        .get<FunctionMetrics>(KV.metrics, functionId)
        .catch(() => null)) ?? {
        functionId,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        avgLatencyMs: 0,
        avgQualityScore: 0,
      };
    }

    const prev = m.totalCalls;
    m.totalCalls += 1;
    m.avgLatencyMs = (m.avgLatencyMs * prev + latencyMs) / m.totalCalls;
    if (success) {
      m.successCount += 1;
    } else {
      m.failureCount += 1;
    }
    if (qualityScore !== undefined) {
      const prevQualityCalls = this.qualityCallCounts.get(functionId) || 0;
      m.avgQualityScore =
        (m.avgQualityScore * prevQualityCalls + qualityScore) /
        (prevQualityCalls + 1);
      this.qualityCallCounts.set(functionId, prevQualityCalls + 1);
    }

    this.cache.set(functionId, m);
    await this.kv.set(KV.metrics, functionId, m).catch(() => {});
  }

  async get(functionId: string): Promise<FunctionMetrics | null> {
    return (
      this.cache.get(functionId) ??
      (await this.kv.get<FunctionMetrics>(KV.metrics, functionId))
    );
  }

  async getAll(): Promise<FunctionMetrics[]> {
    const kvMetrics = await this.kv
      .list<FunctionMetrics>(KV.metrics)
      .catch(() => []);
    const merged = new Map<string, FunctionMetrics>();
    for (const m of kvMetrics) merged.set(m.functionId, m);
    for (const [id, m] of this.cache) merged.set(id, m);
    return Array.from(merged.values());
  }
}
