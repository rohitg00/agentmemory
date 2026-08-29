import { describe, expect, it, vi } from "vitest";
import { cpus } from "node:os";
import { normalizeCpuPercent, registerHealthMonitor } from "../src/health/monitor.js";
import { KV } from "../src/state/schema.js";
import type { HealthSnapshot } from "../src/types.js";

// #1235: fix a deterministic core count for the producer-wiring test below,
// independent of how many cores the machine running the suite actually has.
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    cpus: () =>
      Array.from({ length: 8 }, () => ({
        model: "mock",
        speed: 0,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      })),
  };
});

describe("normalizeCpuPercent", () => {
  it("divides single-core percent by the core count (#1235)", () => {
    expect(normalizeCpuPercent(244, 16)).toBeCloseTo(15.25, 2);
  });

  it("clamps a zero or bogus core count to 1 rather than dividing by zero", () => {
    expect(normalizeCpuPercent(50, 0)).toBe(50);
  });

  it("uses the real core count by default", () => {
    expect(normalizeCpuPercent(cpus().length * 100)).toBeCloseTo(100, 2);
  });
});

// #1235: mock KV mirrors test/index-persistence.test.ts's Map-backed mock,
// enough surface for StateKV's get/set, cast past the class's private field
// with `as never` the same way that file does.
function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
  };
}

function mockSdk() {
  return {
    trigger: async () => ({ workers: [] }),
  };
}

async function waitForSnapshot(
  kv: ReturnType<typeof mockKV>,
): Promise<HealthSnapshot> {
  for (let i = 0; i < 50; i++) {
    const snapshot = await kv.get<HealthSnapshot>(KV.health, "latest");
    if (snapshot) return snapshot;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("collectHealth did not persist a snapshot in time");
}

describe("registerHealthMonitor producer wiring (#1235)", () => {
  it("persists a machine-relative cpu.percent with the divisor it used", async () => {
    // Pin process.cpuUsage() and Date.now() so the single-core cpu delta
    // and elapsed time collectHealth computes are exact, not host-dependent.
    // Call order inside registerHealthMonitor/collectHealth (verified by
    // reading src/health/monitor.ts): cpuUsage() for prevCpuUsage, then
    // Date.now() for prevCpuTime, both synchronously before collectHealth()
    // is invoked; then collectHealth's own cpuUsage()/Date.now() calls,
    // still before its first await. So the queued values below land as:
    // prev = {user:0}, current = {user:5_000_000}, elapsed = 1000ms.
    const cpuUsageSpy = vi
      .spyOn(process, "cpuUsage")
      .mockReturnValueOnce({ user: 0, system: 0 } as NodeJS.CpuUsage)
      .mockReturnValueOnce({ user: 5_000_000, system: 0 } as NodeJS.CpuUsage);
    const dateNowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(1_000_000)
      .mockReturnValueOnce(1_001_000);

    const kv = mockKV();
    const sdk = mockSdk();
    const { stop } = registerHealthMonitor(sdk as never, kv as never);

    try {
      const snapshot = await waitForSnapshot(kv);

      // 5_000_000us / 1000 / 1000ms * 100 = 500% single-core. If
      // normalizeCpuPercent were bypassed (cpuPercent = singleCoreCpuPercent
      // directly), this would read 500, not 62.5 -- this assertion fails
      // under that regression.
      expect(snapshot.cpu.cores).toBe(8);
      expect(snapshot.cpu.percent).toBeCloseTo(62.5, 2);
    } finally {
      stop();
      cpuUsageSpy.mockRestore();
      dateNowSpy.mockRestore();
    }
  });
});
