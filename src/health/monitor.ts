import type { ISdk } from "iii-sdk";
import type { HealthSnapshot } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { evaluateHealth } from "./thresholds.js";

let connectionState = "connected";

export function registerHealthMonitor(
  sdk: ISdk,
  kv: StateKV,
): { stop: () => void } {
  if (typeof sdk.on === "function") {
    sdk.on("connection_state", (state: string) => {
      connectionState = state;
    });
  }

  async function collectHealth(): Promise<HealthSnapshot> {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();

    const startMark = performance.now();
    await new Promise((resolve) => setImmediate(resolve));
    const eventLoopLagMs = performance.now() - startMark;

    let workers: HealthSnapshot["workers"] = [];
    try {
      const result = await sdk.trigger<unknown, { workers?: HealthSnapshot["workers"] }>(
        "engine::workers::list",
        {},
      );
      if (result?.workers) workers = result.workers;
    } catch {}

    const snapshot: HealthSnapshot = {
      connectionState,
      workers,
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      },
      cpu: {
        userMicros: cpu.user,
        systemMicros: cpu.system,
        percent: 0,
      },
      eventLoopLagMs,
      uptimeSeconds: uptime,
      status: "healthy",
      alerts: [],
    };

    const evaluated = evaluateHealth(snapshot);
    snapshot.status = evaluated.status;
    snapshot.alerts = evaluated.alerts;

    await kv.set(KV.health, "latest", snapshot).catch(() => {});
    return snapshot;
  }

  collectHealth().catch(() => {});
  const interval = setInterval(() => {
    collectHealth().catch(() => {});
  }, 30_000);

  return {
    stop: () => clearInterval(interval),
  };
}

export async function getLatestHealth(kv: StateKV): Promise<HealthSnapshot | null> {
  return kv.get<HealthSnapshot>(KV.health, "latest");
}
