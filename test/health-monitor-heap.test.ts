import { describe, expect, it } from "vitest";
import { getHeapStatistics } from "node:v8";
import { registerHealthMonitor } from "../src/health/monitor.js";
import { KV } from "../src/state/schema.js";
import type { HealthSnapshot } from "../src/types.js";

// Map-backed mock KV mirrors test/index-persistence.test.ts's, enough
// surface for StateKV's get/set, cast past the class's private field with
// `as never` the same way that file does.
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

describe("registerHealthMonitor producer wiring (#1223)", () => {
  it("persists memory.heapLimit from getHeapStatistics().heap_size_limit", async () => {
    const kv = mockKV();
    const { stop } = registerHealthMonitor(mockSdk() as never, kv as never);

    try {
      const snapshot = await waitForSnapshot(kv);

      // The one assertion pinning collectHealth's producer wiring for
      // heapLimit - the hard ceiling thresholds.ts measures the memory
      // ratio against instead of heapTotal (V8's current allocation, not
      // its cap). Deleting `heapLimit: getHeapStatistics().heap_size_limit`
      // from src/health/monitor.ts leaves this undefined with an otherwise
      // green suite.
      expect(snapshot.memory.heapLimit).toBe(
        getHeapStatistics().heap_size_limit,
      );
    } finally {
      stop();
    }
  });
});
