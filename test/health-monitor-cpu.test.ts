import { describe, expect, it, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  sdk: { trigger: vi.fn() },
  kv: { get: vi.fn(), set: vi.fn(), list: vi.fn() },
}));

import { computeProcessCpuPercent } from "../src/health/monitor.js";
import { evaluateHealth } from "../src/health/thresholds.js";
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

describe("computeProcessCpuPercent (issue #1235)", () => {
  it("normalizes single-core-scale deltas by core count", () => {
    // One fully busy core over 1s of wall time on a 16-core host.
    const percent = computeProcessCpuPercent(1_000_000, 0, 1000, 16);
    expect(percent).toBeCloseTo(6.25, 5);
  });

  it("reaches 100 only when every core is saturated", () => {
    // 16 cores busy over 1s on a 16-core host.
    const percent = computeProcessCpuPercent(16_000_000, 0, 1000, 16);
    expect(percent).toBeCloseTo(100, 5);
  });

  it("preserves single-core-host behaviour", () => {
    // One core busy on a single-core host is still 100%.
    const percent = computeProcessCpuPercent(1_000_000, 0, 1000, 1);
    expect(percent).toBeCloseTo(100, 5);
  });

  it("returns 0 for non-positive elapsed time or core count", () => {
    expect(computeProcessCpuPercent(1_000_000, 0, 0, 16)).toBe(0);
    expect(computeProcessCpuPercent(1_000_000, 0, -5, 16)).toBe(0);
    expect(computeProcessCpuPercent(1_000_000, 0, 1000, 0)).toBe(0);
  });
});

describe("evaluateHealth cpu severity on multi-core hosts (issue #1235)", () => {
  it("stays healthy when the process uses about one of sixteen cores", () => {
    const percent = computeProcessCpuPercent(1_160_000, 0, 1000, 16);
    const { status, alerts } = evaluateHealth(snap({ cpu: { userMicros: 0, systemMicros: 0, percent } }));
    expect(status).toBe("healthy");
    expect(alerts.find((a) => a.startsWith("cpu_"))).toBeUndefined();
  });

  it("goes critical only near full machine saturation", () => {
    const percent = computeProcessCpuPercent(15_000_000, 0, 1000, 16);
    expect(percent).toBeGreaterThan(90);
    const { status, alerts } = evaluateHealth(snap({ cpu: { userMicros: 0, systemMicros: 0, percent } }));
    expect(status).toBe("critical");
    expect(alerts.some((a) => a.startsWith("cpu_critical_"))).toBe(true);
  });
});
