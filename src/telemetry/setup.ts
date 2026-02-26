interface OtelConfig {
  serviceName: string;
  serviceVersion: string;
  metricsExportIntervalMs: number;
}

export const OTEL_CONFIG: OtelConfig = {
  serviceName: "agentmemory",
  serviceVersion: "0.3.0",
  metricsExportIntervalMs: 30_000,
};

interface Counter {
  add: (n: number) => void;
}
interface Histogram {
  record: (v: number) => void;
}

interface Counters {
  observationsTotal: Counter;
  compressionSuccess: Counter;
  compressionFailure: Counter;
  searchTotal: Counter;
  dedupSkipped: Counter;
  evictionTotal: Counter;
  circuitBreakerOpen: Counter;
  embeddingSuccess: Counter;
  embeddingFailure: Counter;
  vectorSearchTotal: Counter;
  autoForgetTotal: Counter;
  profileGenerated: Counter;
}

interface Histograms {
  compressionLatency: Histogram;
  searchLatency: Histogram;
  contextTokens: Histogram;
  qualityScore: Histogram;
  embeddingLatency: Histogram;
  vectorSearchLatency: Histogram;
}

type Meter = {
  createCounter: (name: string) => Counter;
  createHistogram: (name: string) => Histogram;
};

let counters: Counters | null = null;
let histograms: Histograms | null = null;

const NOOP_COUNTER: Counter = { add: () => {} };
const NOOP_HISTOGRAM: Histogram = { record: () => {} };

const COUNTER_NAMES: Array<[keyof Counters, string]> = [
  ["observationsTotal", "observations.total"],
  ["compressionSuccess", "compression.success"],
  ["compressionFailure", "compression.failure"],
  ["searchTotal", "search.total"],
  ["dedupSkipped", "dedup.skipped"],
  ["evictionTotal", "eviction.total"],
  ["circuitBreakerOpen", "circuit_breaker.open"],
  ["embeddingSuccess", "embedding.success"],
  ["embeddingFailure", "embedding.failure"],
  ["vectorSearchTotal", "vector_search.total"],
  ["autoForgetTotal", "auto_forget.total"],
  ["profileGenerated", "profile.generated"],
];

const HISTOGRAM_NAMES: Array<[keyof Histograms, string]> = [
  ["compressionLatency", "compression.latency_ms"],
  ["searchLatency", "search.latency_ms"],
  ["contextTokens", "context.tokens"],
  ["qualityScore", "quality.score"],
  ["embeddingLatency", "embedding.latency_ms"],
  ["vectorSearchLatency", "vector_search.latency_ms"],
];

export function initMetrics(getMeter?: (name: string) => Meter): {
  counters: Counters;
  histograms: Histograms;
} {
  const meter = getMeter?.("agentmemory");

  counters = Object.fromEntries(
    COUNTER_NAMES.map(([key, name]) => [
      key,
      meter ? meter.createCounter(name) : NOOP_COUNTER,
    ]),
  ) as unknown as Counters;

  histograms = Object.fromEntries(
    HISTOGRAM_NAMES.map(([key, name]) => [
      key,
      meter ? meter.createHistogram(name) : NOOP_HISTOGRAM,
    ]),
  ) as unknown as Histograms;

  return { counters, histograms };
}

export function getCounters(): Counters {
  if (!counters) initMetrics();
  return counters!;
}

export function getHistograms(): Histograms {
  if (!histograms) initMetrics();
  return histograms!;
}
