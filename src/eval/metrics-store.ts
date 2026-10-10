import type { FunctionMetrics } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";

/** Cap on the per-function ring buffer of recent call outcomes. */
const RECENT_CALLS_CAP = 50;
/** Window for the recent failure rate surfaced in health output. */
const METRICS_WINDOW_MS = 24 * 60 * 60 * 1000;

export class MetricsStore {
  private cache = new Map<string, FunctionMetrics>();
  private qualityCallCounts = new Map<string, number>();

  constructor(private kv: StateKV) {}

  async record(
    functionId: string,
    latencyMs: number,
    success: boolean,
    qualityScore?: number,
  ): Promise<void> {
    let m = this.cache.get(functionId);
    if (!m) {
      m = (await this.kv.get<FunctionMetrics>(KV.metrics, functionId)) ?? {
        functionId,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        avgLatencyMs: 0,
        avgQualityScore: 0,
      };
    }

    const prev = m.totalCalls;
    const now = Date.now();
    m.totalCalls += 1;
    m.avgLatencyMs = (m.avgLatencyMs * prev + latencyMs) / m.totalCalls;
    if (success) {
      m.successCount += 1;
    } else {
      m.failureCount += 1;
      m.lastFailureAt = now;
    }
    m.recentCalls = [...(m.recentCalls ?? []), { t: now, ok: success }].slice(
      -RECENT_CALLS_CAP,
    );
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
    const now = Date.now();
    return Array.from(merged.values()).map((m) => {
      const recent = (m.recentCalls ?? []).filter(
        (c) => now - c.t <= METRICS_WINDOW_MS,
      );
      const { recentCalls: _ring, ...rest } = m;
      return {
        ...rest,
        recentCallCount: recent.length,
        recentFailureRate: recent.length
          ? recent.filter((c) => !c.ok).length / recent.length
          : 0,
      };
    });
  }
}
