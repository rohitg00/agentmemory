import type { HealthSnapshot } from "../types.js";

interface ThresholdConfig {
  eventLoopLagWarnMs: number;
  eventLoopLagCriticalMs: number;
  cpuWarnPercent: number;
  cpuCriticalPercent: number;
  memoryWarnPercent: number;
  memoryCriticalPercent: number;
  memoryRssFloorBytes: number;
}

const DEFAULTS: ThresholdConfig = {
  eventLoopLagWarnMs: 100,
  eventLoopLagCriticalMs: 500,
  cpuWarnPercent: 80,
  cpuCriticalPercent: 90,
  memoryWarnPercent: 80,
  memoryCriticalPercent: 95,
  memoryRssFloorBytes: 512 * 1024 * 1024,
};

/**
 * Environment variable overrides for every threshold. Percent values are
 * plain numbers (e.g. "90"); the RSS floor is expressed in MiB.
 */
const ENV_VARS: Record<keyof ThresholdConfig, string> = {
  eventLoopLagWarnMs: "AGENTMEMORY_HEALTH_EVENTLOOP_WARN_MS",
  eventLoopLagCriticalMs: "AGENTMEMORY_HEALTH_EVENTLOOP_CRITICAL_MS",
  cpuWarnPercent: "AGENTMEMORY_HEALTH_CPU_WARN_PCT",
  cpuCriticalPercent: "AGENTMEMORY_HEALTH_CPU_CRITICAL_PCT",
  memoryWarnPercent: "AGENTMEMORY_HEALTH_MEM_WARN_PCT",
  memoryCriticalPercent: "AGENTMEMORY_HEALTH_MEM_CRITICAL_PCT",
  memoryRssFloorBytes: "AGENTMEMORY_HEALTH_MEM_RSS_FLOOR_MB",
};

/** Parse a positive finite number, ignoring missing/invalid values. */
function parseThreshold(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Threshold overrides from the environment. Invalid values are ignored so a
 * typo can never disable or break health evaluation.
 */
export function thresholdOverridesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<ThresholdConfig> {
  const overrides: Partial<ThresholdConfig> = {};
  for (const key of Object.keys(ENV_VARS) as (keyof ThresholdConfig)[]) {
    const parsed = parseThreshold(env[ENV_VARS[key]]);
    if (parsed === undefined) continue;
    overrides[key] =
      key === "memoryRssFloorBytes" ? parsed * 1024 * 1024 : parsed;
  }
  return overrides;
}

export function evaluateHealth(
  snapshot: HealthSnapshot,
  config: Partial<ThresholdConfig> = {},
): { status: "healthy" | "degraded" | "critical"; alerts: string[]; notes: string[] } {
  // Precedence: defaults < environment < caller-supplied config.
  const cfg = { ...DEFAULTS, ...thresholdOverridesFromEnv(), ...config };
  const alerts: string[] = [];
  const notes: string[] = [];
  let critical = false;
  let degraded = false;

  if (
    snapshot.connectionState === "disconnected" ||
    snapshot.connectionState === "failed"
  ) {
    alerts.push(`connection_${snapshot.connectionState}`);
    critical = true;
  } else if (snapshot.connectionState === "reconnecting") {
    alerts.push("connection_reconnecting");
    degraded = true;
  }

  if (snapshot.eventLoopLagMs > cfg.eventLoopLagCriticalMs) {
    alerts.push(
      `event_loop_lag_critical_${Math.round(snapshot.eventLoopLagMs)}ms`,
    );
    critical = true;
  } else if (snapshot.eventLoopLagMs > cfg.eventLoopLagWarnMs) {
    alerts.push(`event_loop_lag_warn_${Math.round(snapshot.eventLoopLagMs)}ms`);
    degraded = true;
  }

  if (snapshot.cpu.percent > cfg.cpuCriticalPercent) {
    alerts.push(`cpu_critical_${Math.round(snapshot.cpu.percent)}%`);
    critical = true;
  } else if (snapshot.cpu.percent > cfg.cpuWarnPercent) {
    alerts.push(`cpu_warn_${Math.round(snapshot.cpu.percent)}%`);
    degraded = true;
  }

  const memPercent =
    snapshot.memory.heapTotal > 0
      ? (snapshot.memory.heapUsed / snapshot.memory.heapTotal) * 100
      : 0;
  const rss = snapshot.memory.rss ?? 0;
  const rssAboveFloor = rss >= cfg.memoryRssFloorBytes;
  const memMb = Math.round(rss / (1024 * 1024));
  if (memPercent > cfg.memoryCriticalPercent && rssAboveFloor) {
    alerts.push(`memory_critical_${Math.round(memPercent)}%_rss${memMb}mb`);
    critical = true;
  } else if (memPercent > cfg.memoryWarnPercent && rssAboveFloor) {
    alerts.push(`memory_warn_${Math.round(memPercent)}%_rss${memMb}mb`);
    degraded = true;
  } else if (memPercent > cfg.memoryWarnPercent) {
    notes.push(`memory_heap_tight_${Math.round(memPercent)}%_rss${memMb}mb`);
  }

  const status = critical ? "critical" : degraded ? "degraded" : "healthy";
  return { status, alerts, notes };
}
