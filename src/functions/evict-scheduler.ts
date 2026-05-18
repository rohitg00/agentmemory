import type { ISdk } from "iii-sdk";

const DEFAULT_EVICTION_INTERVAL_MS = 86_400_000;

type TimerHandle = ReturnType<typeof setInterval>;
type SetIntervalFn = (
  callback: () => Promise<void>,
  intervalMs: number,
) => TimerHandle;

function parseIntervalMs(value: string | undefined): number {
  if (!value) return DEFAULT_EVICTION_INTERVAL_MS;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EVICTION_INTERVAL_MS;
}

export function getEvictSweepIntervalMs(
  env: Record<string, string | undefined> = process.env,
): number {
  return parseIntervalMs(env["EVICTION_INTERVAL_MS"]);
}

export function startEvictSweep(
  sdk: Pick<ISdk, "trigger">,
  env: Record<string, string | undefined> = process.env,
  setIntervalFn: SetIntervalFn = setInterval,
): TimerHandle | null {
  if (env["EVICTION_ENABLED"] === "false") return null;

  const intervalMs = getEvictSweepIntervalMs(env);
  const timer = setIntervalFn(async () => {
    try {
      await sdk.trigger({
        function_id: "mem::evict",
        payload: {},
      });
    } catch {}
  }, intervalMs);

  timer.unref?.();
  return timer;
}
