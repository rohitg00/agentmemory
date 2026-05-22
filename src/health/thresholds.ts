import { getHeapStatistics } from "node:v8";
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

export function evaluateHealth(
  snapshot: HealthSnapshot,
  config: Partial<ThresholdConfig> = {},
): {
  status: "healthy" | "degraded" | "critical";
  alerts: string[];
  notes: string[];
} {
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

  // Compute memPercent against the actual V8 heap ceiling (--max-old-space-size or v8's
  // heap_size_limit), not heapTotal which V8 grows lazily — heapUsed/heapTotal hits 95%+
  // even when there's 5x headroom remaining, firing spurious memory_heap_tight notes.
  // Fallback to heapTotal preserves prior behavior when no cap is set.
  let heapCapBytes = 0;
  const argMatch = (process.execArgv || []).find(
    (a) => typeof a === "string" && a.startsWith("--max-old-space-size="),
  );
  if (argMatch)
    heapCapBytes = (parseInt(argMatch.split("=")[1], 10) || 0) * 1024 * 1024;
  if (!heapCapBytes) {
    const envMatch = (process.env.NODE_OPTIONS || "").match(
      /--max-old-space-size=(\d+)/,
    );
    if (envMatch) heapCapBytes = (parseInt(envMatch[1], 10) || 0) * 1024 * 1024;
  }
  if (!heapCapBytes) {
    try {
      heapCapBytes = getHeapStatistics().heap_size_limit || 0;
    } catch {
      // not available — fall through to heapTotal
    }
  }
  const heapCeiling =
    heapCapBytes > 0 ? heapCapBytes : snapshot.memory.heapTotal;
  const memPercent =
    heapCeiling > 0 ? (snapshot.memory.heapUsed / heapCeiling) * 100 : 0;
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
