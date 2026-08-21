import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateHealth,
  thresholdOverridesFromEnv,
} from "../src/health/thresholds.js";
import type { HealthSnapshot } from "../src/types.js";

function snap(over: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    connectionState: "connected",
    workers: [],
    memory: { heapUsed: 0, heapTotal: 1, rss: 0, external: 0 },
    cpu: { userMicros: 0, systemMicros: 0, percent: 0 },
    eventLoopLagMs: 0,
    uptimeSeconds: 1,
    kvConnectivity: { status: "ok", latencyMs: 1 },
    status: "healthy",
    alerts: [],
    ...over,
  };
}

describe("thresholdOverridesFromEnv", () => {
  it("returns no overrides when no env vars are set", () => {
    expect(thresholdOverridesFromEnv({})).toEqual({});
  });

  it("parses every supported variable", () => {
    const overrides = thresholdOverridesFromEnv({
      AGENTMEMORY_HEALTH_EVENTLOOP_WARN_MS: "200",
      AGENTMEMORY_HEALTH_EVENTLOOP_CRITICAL_MS: "900",
      AGENTMEMORY_HEALTH_CPU_WARN_PCT: "70",
      AGENTMEMORY_HEALTH_CPU_CRITICAL_PCT: "85",
      AGENTMEMORY_HEALTH_MEM_WARN_PCT: "75",
      AGENTMEMORY_HEALTH_MEM_CRITICAL_PCT: "92",
      AGENTMEMORY_HEALTH_MEM_RSS_FLOOR_MB: "1024",
    });
    expect(overrides).toEqual({
      eventLoopLagWarnMs: 200,
      eventLoopLagCriticalMs: 900,
      cpuWarnPercent: 70,
      cpuCriticalPercent: 85,
      memoryWarnPercent: 75,
      memoryCriticalPercent: 92,
      memoryRssFloorBytes: 1024 * 1024 * 1024,
    });
  });

  it("ignores missing, empty, non-numeric, and non-positive values", () => {
    const overrides = thresholdOverridesFromEnv({
      AGENTMEMORY_HEALTH_CPU_WARN_PCT: "",
      AGENTMEMORY_HEALTH_CPU_CRITICAL_PCT: "not-a-number",
      AGENTMEMORY_HEALTH_MEM_WARN_PCT: "0",
      AGENTMEMORY_HEALTH_MEM_CRITICAL_PCT: "-5",
    });
    expect(overrides).toEqual({});
  });
});

describe("evaluateHealth env threshold overrides", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("applies env thresholds when evaluating", () => {
    vi.stubEnv("AGENTMEMORY_HEALTH_CPU_CRITICAL_PCT", "50");
    const s = snap({ cpu: { userMicros: 0, systemMicros: 0, percent: 60 } });
    const { status, alerts } = evaluateHealth(s);
    expect(status).toBe("critical");
    expect(alerts.some((a) => a.startsWith("cpu_critical_"))).toBe(true);
  });

  it("caller-supplied config wins over env", () => {
    vi.stubEnv("AGENTMEMORY_HEALTH_CPU_CRITICAL_PCT", "50");
    const s = snap({ cpu: { userMicros: 0, systemMicros: 0, percent: 60 } });
    const { status } = evaluateHealth(s, { cpuCriticalPercent: 90 });
    expect(status).toBe("healthy");
  });

  it("invalid env values fall back to defaults", () => {
    vi.stubEnv("AGENTMEMORY_HEALTH_CPU_CRITICAL_PCT", "bogus");
    const s = snap({ cpu: { userMicros: 0, systemMicros: 0, percent: 95 } });
    const { status } = evaluateHealth(s);
    expect(status).toBe("critical");
  });
});
