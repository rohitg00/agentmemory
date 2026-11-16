import { describe, expect, it, vi } from "vitest";
import { availableParallelism } from "node:os";
import { cpuCoreCount, normalizeCpuPercent, registerHealthMonitor } from "../src/health/monitor.js";
import { KV } from "../src/state/schema.js";
import type { HealthSnapshot } from "../src/types.js";

const coreCount = vi.hoisted(() => ({ value: 8 }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    availableParallelism: () => coreCount.value,
  };
});

describe("normalizeCpuPercent", () => {
  it("divides single-core percent by the core count", () => {
    expect(normalizeCpuPercent(244, 16)).toBeCloseTo(15.25, 2);
  });

  it("clamps a zero or bogus core count to 1 rather than dividing by zero", () => {
    expect(normalizeCpuPercent(50, 0)).toBe(50);
  });

  it("uses the available parallelism by default", () => {
    expect(normalizeCpuPercent(availableParallelism() * 100)).toBeCloseTo(100, 2);
  });
});

describe("cpuCoreCount", () => {
  it("reports the available parallelism", () => {
    expect(cpuCoreCount()).toBe(8);
  });

  it("clamps a zero parallelism to 1", () => {
    coreCount.value = 0;
    try {
      expect(cpuCoreCount()).toBe(1);
    } finally {
      coreCount.value = 8;
    }
  });
});

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
    getConnectionState: () => "connected" as const,
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

describe("registerHealthMonitor producer wiring", () => {
  it("persists a machine-relative cpu.percent with the divisor it used", async () => {
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

      expect(snapshot.cpu.cores).toBe(8);
      expect(snapshot.cpu.percent).toBeCloseTo(62.5, 2);
    } finally {
      stop();
      cpuUsageSpy.mockRestore();
      dateNowSpy.mockRestore();
    }
  });
});
