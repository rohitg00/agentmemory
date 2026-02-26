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

interface Counters {
  observationsTotal: { add: (n: number) => void };
  compressionSuccess: { add: (n: number) => void };
  compressionFailure: { add: (n: number) => void };
  searchTotal: { add: (n: number) => void };
  dedupSkipped: { add: (n: number) => void };
  evictionTotal: { add: (n: number) => void };
  circuitBreakerOpen: { add: (n: number) => void };
}

interface Histograms {
  compressionLatency: { record: (v: number) => void };
  searchLatency: { record: (v: number) => void };
  contextTokens: { record: (v: number) => void };
  qualityScore: { record: (v: number) => void };
}

let counters: Counters | null = null;
let histograms: Histograms | null = null;

function noopCounter() {
  return { add: () => {} };
}

function noopHistogram() {
  return { record: () => {} };
}

export function initMetrics(getMeter?: (name: string) => {
  createCounter: (name: string) => { add: (n: number) => void };
  createHistogram: (name: string) => { record: (v: number) => void };
}): { counters: Counters; histograms: Histograms } {
  if (getMeter) {
    const meter = getMeter("agentmemory");
    counters = {
      observationsTotal: meter.createCounter("observations.total"),
      compressionSuccess: meter.createCounter("compression.success"),
      compressionFailure: meter.createCounter("compression.failure"),
      searchTotal: meter.createCounter("search.total"),
      dedupSkipped: meter.createCounter("dedup.skipped"),
      evictionTotal: meter.createCounter("eviction.total"),
      circuitBreakerOpen: meter.createCounter("circuit_breaker.open"),
    };
    histograms = {
      compressionLatency: meter.createHistogram("compression.latency_ms"),
      searchLatency: meter.createHistogram("search.latency_ms"),
      contextTokens: meter.createHistogram("context.tokens"),
      qualityScore: meter.createHistogram("quality.score"),
    };
  } else {
    counters = {
      observationsTotal: noopCounter(),
      compressionSuccess: noopCounter(),
      compressionFailure: noopCounter(),
      searchTotal: noopCounter(),
      dedupSkipped: noopCounter(),
      evictionTotal: noopCounter(),
      circuitBreakerOpen: noopCounter(),
    };
    histograms = {
      compressionLatency: noopHistogram(),
      searchLatency: noopHistogram(),
      contextTokens: noopHistogram(),
      qualityScore: noopHistogram(),
    };
  }
  return { counters, histograms };
}

export function getCounters(): Counters {
  if (!counters) {
    const { counters: c } = initMetrics();
    return c;
  }
  return counters;
}

export function getHistograms(): Histograms {
  if (!histograms) {
    const { histograms: h } = initMetrics();
    return h;
  }
  return histograms;
}
