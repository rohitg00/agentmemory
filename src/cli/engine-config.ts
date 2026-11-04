import { join } from "node:path";

export const ENGINE_DEFAULT_SAVE_INTERVAL_MS = 5000;
export const AGENTMEMORY_STATE_SAVE_INTERVAL_MS = 2000;
export const ENGINE_FLUSH_MARGIN_MS = 1500;

export function engineFlushWaitMs(
  stateBackend: "file" | "redis",
  configTexts: readonly string[],
): number {
  if (stateBackend === "redis") return 0;
  return engineSaveIntervalMs(configTexts) + ENGINE_FLUSH_MARGIN_MS;
}

export function captureDurableAfterMs(
  stateBackend: "file" | "redis",
  configTexts: readonly string[],
): number {
  if (stateBackend === "redis") return ENGINE_FLUSH_MARGIN_MS;
  return engineSaveIntervalMs(configTexts) + ENGINE_FLUSH_MARGIN_MS;
}

export function engineSaveIntervalMs(configTexts: readonly string[], env: NodeJS.ProcessEnv = process.env): number {
  const intervals: number[] = [];
  for (const text of configTexts) {
    const explicit: number[] = [];
    for (const match of text.matchAll(/save_interval_ms:\s*["']?(\d+|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-(\d+))?\})/g)) {
      const raw = match[2] ? env[match[2]] || match[3] : match[1];
      if (raw && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))) explicit.push(Number(raw));
    }
    intervals.push(...explicit);
    const fileStores = text.match(/store_method:\s*file_based/g)?.length ?? 0;
    if (fileStores > explicit.length) intervals.push(ENGINE_DEFAULT_SAVE_INTERVAL_MS);
  }
  return intervals.length > 0 ? Math.max(...intervals) : ENGINE_DEFAULT_SAVE_INTERVAL_MS;
}

export function engineStateConfigPaths(engineCwd: string, runtimePath: string): string[] {
  return [...new Set([
    join(engineCwd, "compose", "worker-compose.yaml"),
    join(engineCwd, "compose", "config", "state.yaml"),
    join(engineCwd, "worker-compose.runtime.yaml"),
    join(engineCwd, "config", "state.yaml"),
    runtimePath,
  ])];
}
