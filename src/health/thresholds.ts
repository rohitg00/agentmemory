import os from "node:os";
import type { HealthSnapshot } from "../types.js";

interface ThresholdConfig {
  eventLoopLagWarnMs: number;
  eventLoopLagCriticalMs: number;
  cpuWarnPercent: number;
  cpuCriticalPercent: number;
  memoryWarnPercent: number;
  memoryCriticalPercent: number;
  memoryRssFloorBytes: number;
  memoryCriticalRssBytes: number;
  // 0 disables the host-free-RAM escape hatch.
  memorySystemFreeFloorRatio: number;
}

const DEFAULTS: ThresholdConfig = {
  eventLoopLagWarnMs: 100,
  eventLoopLagCriticalMs: 500,
  cpuWarnPercent: 80,
  cpuCriticalPercent: 90,
  memoryWarnPercent: 80,
  memoryCriticalPercent: 95,
  memoryRssFloorBytes: 512 * 1024 * 1024,
  memoryCriticalRssBytes: 4096 * 1024 * 1024,
  memorySystemFreeFloorRatio: 0.1,
};

function parseIntEnv(
  name: string,
  fallback: number,
  bounds: { min: number; max?: number },
): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < bounds.min) return fallback;
  if (bounds.max !== undefined && parsed > bounds.max) return fallback;
  return parsed;
}

function parseFloatEnv(
  name: string,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= bounds.min && parsed <= bounds.max
    ? parsed
    : fallback;
}

/**
 * Resolve the env-overridable subset of the threshold config. Out-of-range
 * overrides fall back to the default so a typo cannot silently disable a gate.
 */
export function resolveThresholdConfig(): Partial<ThresholdConfig> {
  const MB = 1024 * 1024;
  return {
    memoryCriticalPercent: parseIntEnv(
      "AGENTMEMORY_MEMORY_CRITICAL_PERCENT",
      DEFAULTS.memoryCriticalPercent,
      { min: 0, max: 100 },
    ),
    memoryWarnPercent: parseIntEnv(
      "AGENTMEMORY_MEMORY_WARN_PERCENT",
      DEFAULTS.memoryWarnPercent,
      { min: 0, max: 100 },
    ),
    memoryRssFloorBytes:
      parseIntEnv(
        "AGENTMEMORY_MEMORY_RSS_FLOOR_MB",
        DEFAULTS.memoryRssFloorBytes / MB,
        { min: 0 },
      ) * MB,
    memoryCriticalRssBytes:
      parseIntEnv(
        "AGENTMEMORY_MEMORY_CRITICAL_RSS_MB",
        DEFAULTS.memoryCriticalRssBytes / MB,
        { min: 0 },
      ) * MB,
    memorySystemFreeFloorRatio: parseFloatEnv(
      "AGENTMEMORY_MEMORY_SYSTEM_FREE_FLOOR_RATIO",
      DEFAULTS.memorySystemFreeFloorRatio,
      { min: 0, max: 1 },
    ),
  };
}

// A busy Node process keeps its heap near-full by design, so a high heap ratio
// alone is not memory pressure. Require a real signal: absolute RSS over a high
// ceiling, or the host itself low on free RAM.
function isUnderRealMemoryPressure(
  rssBytes: number,
  cfg: ThresholdConfig,
): boolean {
  const rssAboveCritical = rssBytes >= cfg.memoryCriticalRssBytes;
  const totalRam = os.totalmem();
  const systemFreeRatio = totalRam > 0 ? os.freemem() / totalRam : 1;
  const hostLowOnFreeRam =
    cfg.memorySystemFreeFloorRatio > 0 &&
    systemFreeRatio < cfg.memorySystemFreeFloorRatio;
  return rssAboveCritical || hostLowOnFreeRam;
}

export function evaluateHealth(
  snapshot: HealthSnapshot,
  config: Partial<ThresholdConfig> = {},
): { status: "healthy" | "degraded" | "critical"; alerts: string[]; notes: string[] } {
  const cfg = { ...DEFAULTS, ...config };
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

  if (
    memPercent > cfg.memoryCriticalPercent &&
    rssAboveFloor &&
    isUnderRealMemoryPressure(rss, cfg)
  ) {
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
