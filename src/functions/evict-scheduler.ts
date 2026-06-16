import type { ISdk } from "iii-sdk";

export const DEFAULT_EVICTION_INTERVAL_MS = 86_400_000;

type TimerHandle = ReturnType<typeof setInterval>;
type LoggerLike = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};
type SetIntervalFn = (
  callback: () => Promise<void>,
  intervalMs: number,
) => TimerHandle;

export function getEvictSweepIntervalMs(
  env: Record<string, string | undefined>,
): number {
  const value = env["EVICTION_INTERVAL_MS"];
  if (!value) return DEFAULT_EVICTION_INTERVAL_MS;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EVICTION_INTERVAL_MS;
}

export function startEvictSweep(
  sdk: Pick<ISdk, "trigger">,
  log: LoggerLike,
  env: Record<string, string | undefined>,
  setIntervalFn: SetIntervalFn = setInterval,
): TimerHandle | null {
  if (env["EVICTION_ENABLED"] === "false") return null;

  const intervalMs = getEvictSweepIntervalMs(env);
  const timer = setIntervalFn(async () => {
    try {
      await sdk.trigger({
        function_id: "mem::evict",
        payload: { dryRun: false },
      });
    } catch (err) {
      log.warn("Eviction sweep failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, intervalMs);

  timer.unref?.();
  return timer;
}
