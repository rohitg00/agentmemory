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
    const { status, alerts } = evaluateHealth(s);
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
    const loose = evaluateHealth(s, { memoryRssFloorBytes: 10 * 1024 * 1024 });
    expect(loose.status).toBe("critical");
    const strict = evaluateHealth(s, { memoryRssFloorBytes: 1024 * 1024 * 1024 });
    expect(strict.status).toBe("healthy");
  });
});

describe("evaluateHealth memory severity — denominator", () => {
  const LIMIT_6192MB = 6192 * 1024 * 1024;

  it("stays healthy when a busy process fills its committed heap but sits far below the V8 limit", () => {
    // Captured from a live deployment: this process reported
    // memory_critical_97% while using 6% of the heap it may grow to.
    const s = snap({
      memory: {
        heapUsed: 390_771_624,
        heapTotal: 404_930_560,
        rss: 584_327_168,
        external: 6_566_392,
        heapSizeLimit: LIMIT_6192MB,
      },
    });

    const { status, alerts } = evaluateHealth(s);

    expect(status).toBe("healthy");
    expect(alerts.find((a) => a.startsWith("memory_critical_"))).toBeUndefined();
    expect(alerts.find((a) => a.startsWith("memory_warn_"))).toBeUndefined();
  });

  it("reports the percentage against the limit, not against the committed heap", () => {
    const s = snap({
      memory: {
        heapUsed: 390_771_624,
        heapTotal: 404_930_560,
        rss: 584_327_168,
        external: 0,
        heapSizeLimit: LIMIT_6192MB,
      },
    });

    // Widen the band so the alert fires as a warn either way and the rendered
    // percentage is the only thing under test.
    const { alerts } = evaluateHealth(s, {
      memoryWarnPercent: 1,
      memoryCriticalPercent: 99,
    });
    const warn = alerts.find((a) => a.startsWith("memory_warn_"));

    // 390771624 / 6492782592 = 6%, not 390771624 / 404930560 = 97%.
    expect(warn).toBe("memory_warn_6%_rss557mb");
  });

  it("still goes critical when the heap genuinely approaches the V8 limit", () => {
    const s = snap({
      memory: {
        heapUsed: 6_200_000_000,
        heapTotal: 6_300_000_000,
        rss: 6_800_000_000,
        external: 0,
        heapSizeLimit: LIMIT_6192MB,
      },
    });

    const { status, alerts } = evaluateHealth(s);

    expect(status).toBe("critical");
    expect(alerts.some((a) => a.startsWith("memory_critical_"))).toBe(true);
  });

  it("falls back to the committed heap when heapSizeLimit is absent", () => {
    const s = snap({
      memory: {
        heapUsed: 970 * 1024 * 1024,
        heapTotal: 1000 * 1024 * 1024,
        rss: 1100 * 1024 * 1024,
        external: 0,
      },
    });

    expect(evaluateHealth(s).status).toBe("critical");
  });
});
