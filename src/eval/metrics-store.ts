import type { FunctionMetrics } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";

export class MetricsStore {
  private cache = new Map<string, FunctionMetrics>();

  constructor(private kv: StateKV) {}

  async record(
    functionId: string,
    latencyMs: number,
    success: boolean,
    qualityScore?: number,
  ): Promise<void> {
    let m = this.cache.get(functionId);
    if (!m) {
      m = await this.kv.get<FunctionMetrics>(KV.metrics, functionId) ?? {
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
      m.avgQualityScore = (m.avgQualityScore * prev + qualityScore) / m.totalCalls;
    }

    this.cache.set(functionId, m);
    await this.kv.set(KV.metrics, functionId, m).catch(() => {});
  }

  async get(functionId: string): Promise<FunctionMetrics | null> {
    return this.cache.get(functionId) ??
      await this.kv.get<FunctionMetrics>(KV.metrics, functionId);
  }

  async getAll(): Promise<FunctionMetrics[]> {
    if (this.cache.size > 0) return Array.from(this.cache.values());
    return this.kv.list<FunctionMetrics>(KV.metrics).catch(() => []);
  }
}
