import type { FunctionMetrics } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";

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
