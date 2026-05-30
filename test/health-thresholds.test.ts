import { describe, expect, it } from "vitest";
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

describe("evaluateHealth memory severity", () => {
  it("stays healthy when heap fills a tiny steady-state process (issue #158)", () => {
    const s = snap({
      memory: {
        heapUsed: 45 * 1024 * 1024,
        heapTotal: 46 * 1024 * 1024,
        rss: 120 * 1024 * 1024,
        external: 0,
      },
    });
    const { status, alerts, notes } = evaluateHealth(s);
    expect(status).toBe("healthy");
    expect(alerts.find((a) => a.startsWith("memory_critical_"))).toBeUndefined();
    expect(alerts.find((a) => a.startsWith("memory_warn_"))).toBeUndefined();
    expect(alerts.find((a) => a.startsWith("memory_heap_tight_"))).toBeUndefined();
    expect(notes.find((n) => n.startsWith("memory_heap_tight_"))).toBeDefined();
  });

  it("goes critical when heap ratio is high AND RSS is above the floor", () => {
    const s = snap({
      memory: {
        heapUsed: 970 * 1024 * 1024,
        heapTotal: 1000 * 1024 * 1024,
        rss: 1100 * 1024 * 1024,
        external: 0,
      },
    });
    // memory_critical now also requires a real-pressure signal (absolute RSS
    // ceiling or low system-free RAM), not heap fullness alone. Supply a low
    // absolute-RSS ceiling so the 1100MB RSS trips it deterministically.
    const { status, alerts } = evaluateHealth(s, {
      memoryCriticalRssBytes: 1024 * 1024 * 1024,
    });
    expect(status).toBe("critical");
    expect(alerts.some((a) => a.startsWith("memory_critical_"))).toBe(true);
  });

  it("records heap_tight in the warn band when RSS is below the floor", () => {
    const s = snap({
      memory: {
        heapUsed: 85 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        rss: 50 * 1024 * 1024,
        external: 0,
      },
    });
    const { status, alerts, notes } = evaluateHealth(s);
    expect(status).toBe("healthy");
    expect(notes.some((n) => n.startsWith("memory_heap_tight_"))).toBe(true);
    expect(alerts.some((a) => a.startsWith("memory_heap_tight_"))).toBe(false);
    expect(alerts.some((a) => a.startsWith("memory_warn_"))).toBe(false);
    expect(alerts.some((a) => a.startsWith("memory_critical_"))).toBe(false);
  });

  it("goes degraded when heap is above warn AND RSS is above the floor", () => {
    const s = snap({
      memory: {
        heapUsed: 850 * 1024 * 1024,
        heapTotal: 1000 * 1024 * 1024,
        rss: 900 * 1024 * 1024,
        external: 0,
      },
    });
    const { status, alerts } = evaluateHealth(s, { memoryRssFloorBytes: 800 * 1024 * 1024 });
    expect(status).toBe("degraded");
    expect(alerts.some((a) => a.startsWith("memory_warn_"))).toBe(true);
  });

  it("respects caller-supplied memoryRssFloorBytes", () => {
    const s = snap({
      memory: {
        heapUsed: 98,
        heapTotal: 100,
        rss: 50 * 1024 * 1024,
        external: 0,
      },
    });
    // A low RSS floor makes RSS "above floor"; pair it with a low absolute-RSS
    // ceiling so the real-pressure gate also trips and the result is critical.
    const loose = evaluateHealth(s, {
      memoryRssFloorBytes: 10 * 1024 * 1024,
      memoryCriticalRssBytes: 10 * 1024 * 1024,
    });
    expect(loose.status).toBe("critical");
    // A high RSS floor keeps RSS below the floor, so it never reaches critical.
    const strict = evaluateHealth(s, { memoryRssFloorBytes: 1024 * 1024 * 1024 });
    expect(strict.status).toBe("healthy");
  });
});
