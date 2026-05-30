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
  // Absolute RSS ceiling for the critical gate. Heap fullness alone says
  // nothing about real pressure (a steady-state Node process keeps its heap
  // ~full by design), so memory_critical also requires RSS at or above this
  // absolute figure - not just above the existing "is this a real workload"
  // floor. Default is intentionally high so an 850MB process on a multi-GB
  // box is never flagged on RSS alone.
  memoryCriticalRssBytes: number;
  // System-wide free-memory escape hatch. When the OS still has at least this
  // fraction of total RAM free, the box is not under memory pressure and the
  // critical gate is suppressed regardless of per-process heap/RSS. Set to 0
  // to disable the system-memory check entirely.
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

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Resolve the env-overridable subset of the threshold config. Callers may pass
 * an explicit `config` (which wins over env, which wins over DEFAULTS).
 */
export function resolveThresholdConfig(): Partial<ThresholdConfig> {
  return {
    memoryCriticalPercent: parseIntEnv(
      "AGENTMEMORY_MEMORY_CRITICAL_PERCENT",
      DEFAULTS.memoryCriticalPercent,
    ),
    memoryWarnPercent: parseIntEnv(
      "AGENTMEMORY_MEMORY_WARN_PERCENT",
      DEFAULTS.memoryWarnPercent,
    ),
    memoryRssFloorBytes:
      parseIntEnv(
        "AGENTMEMORY_MEMORY_RSS_FLOOR_MB",
        DEFAULTS.memoryRssFloorBytes / (1024 * 1024),
      ) *
      1024 *
      1024,
    // The real-pressure gate is the most deployment-specific knob (a small
    // cgroup-limited container can never reach a 4GB RSS ceiling), so expose
    // both of its bounds to env overrides like the percent/floor knobs above.
    memoryCriticalRssBytes:
      parseIntEnv(
        "AGENTMEMORY_MEMORY_CRITICAL_RSS_MB",
        DEFAULTS.memoryCriticalRssBytes / (1024 * 1024),
      ) *
      1024 *
      1024,
    memorySystemFreeFloorRatio: parseFloatEnv(
      "AGENTMEMORY_MEMORY_SYSTEM_FREE_FLOOR_RATIO",
      DEFAULTS.memorySystemFreeFloorRatio,
    ),
  };
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

  // Real-pressure gate. A busy Node process keeps its heap near-full by design,
  // so a high heap ratio (even with RSS above the "real workload" floor) is not
  // by itself evidence of trouble. We only escalate to critical when there is a
  // genuine memory-pressure signal: either this process's absolute RSS has
  // crossed a high ceiling, or the host as a whole has run low on free RAM.
  const sysTotal = os.totalmem();
  const sysFree = os.freemem();
  const systemLowOnMemory =
    cfg.memorySystemFreeFloorRatio > 0 &&
    sysTotal > 0 &&
    sysFree / sysTotal < cfg.memorySystemFreeFloorRatio;
  const rssAboveCritical = rss >= cfg.memoryCriticalRssBytes;
  const underRealPressure = rssAboveCritical || systemLowOnMemory;

  if (memPercent > cfg.memoryCriticalPercent && rssAboveFloor && underRealPressure) {
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
