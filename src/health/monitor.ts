    const endMark = performance.now();
    const eventLoopLag = endMark - startMark;

    const snapshot: HealthSnapshot = {
      cpuUsage: cpuPercent,
      memoryRss: mem.rss / 1024 / 1024,
      memoryHeapUsed: mem.heapUsed / 1024 / 1024,
      eventLoopLag,
      uptime,
      connectionState,
      timestamp: now,
    };

    const status = evaluateHealth(snapshot);
    
    // Feature: Persistence & State-Aware Alerting
    const lastStatus = await kv.get(KV.LAST_HEALTH_STATUS);
    if (status.isCritical && lastStatus !== "critical") {
      sdk.emit?.("health_alert", { snapshot, status });
    }

    await kv.set(KV.LATEST_HEALTH, snapshot);
    await kv.set(KV.LAST_HEALTH_STATUS, status.level);

    return snapshot;
  }

  const interval = setInterval(collectHealth, 5000);
  return { 
    stop: () => {
      clearInterval(interval);
      sdk.emit?.("monitor_stopped", { at: Date.now() });
    } 
  };
}
    const eventLoopLagMs = performance.now() - startMark;

    let workers: HealthSnapshot["workers"] = [];
    try {
      const result = await sdk.trigger<
        unknown,
        { workers?: HealthSnapshot["workers"] }
      >({ function_id: "engine::workers::list", payload: {} });
      if (result?.workers) workers = result.workers;
    } catch {}

    const KV_PROBE_TIMEOUT = 5000;
    let kvConnectivity: { status: string; latencyMs?: number; error?: string };
    const kvStart = performance.now();
    try {
      await Promise.race([
        (async () => {
          await kv.set(KV.health, "_probe", { ts: Date.now() });
          await kv.get(KV.health, "_probe");
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), KV_PROBE_TIMEOUT),
        ),
      ]);
      kvConnectivity = { status: "ok", latencyMs: Math.round((performance.now() - kvStart) * 100) / 100 };
    } catch {
      kvConnectivity = { status: "error", error: "kv_probe_failed", latencyMs: Math.round((performance.now() - kvStart) * 100) / 100 };
    }

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
        userMicros: currentCpu.user,
        systemMicros: currentCpu.system,
        percent: Math.round(cpuPercent * 100) / 100,
      },
      eventLoopLagMs,
      uptimeSeconds: uptime,
      kvConnectivity,
      status: "healthy",
      alerts: [],
    };

    const evaluated = evaluateHealth(snapshot);
    snapshot.status = evaluated.status;
    snapshot.alerts = evaluated.alerts;
    snapshot.notes = evaluated.notes;

    await kv.set(KV.health, "latest", snapshot).catch(() => {});
    return snapshot;
  }

  collectHealth().catch(() => {});
  const interval = setInterval(() => {
    collectHealth().catch(() => {});
  }, 30_000);
  interval.unref();

  return {
    stop: () => clearInterval(interval),
  };
}

export async function getLatestHealth(
  kv: StateKV,
): Promise<HealthSnapshot | null> {
  return kv.get<HealthSnapshot>(KV.health, "latest");
}
