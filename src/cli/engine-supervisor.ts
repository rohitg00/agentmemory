export const ENGINE_RESTART_MAX_ATTEMPTS = 3;
export const ENGINE_RESTART_WINDOW_MS = 10 * 60 * 1000;
export const ENGINE_RESTART_DELAYS_MS = [1000, 5000, 15000] as const;

export type EngineExitClassification = "expected" | "unexpected";

export type EngineRestartDecision =
  | {
      action: "restart";
      attempt: number;
      delayMs: number;
      recentExits: number[];
      maxAttempts: number;
      windowMs: number;
    }
  | {
      action: "exhausted";
      recentExits: number[];
      maxAttempts: number;
      windowMs: number;
    };

export function classifyEngineExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): EngineExitClassification {
  if (code === 0) return "expected";
  if (signal === "SIGTERM" || signal === "SIGINT") return "expected";
  return "unexpected";
}

export function formatEngineExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  return `code=${code ?? "null"} signal=${signal ?? "null"}`;
}

export function planEngineRestart(
  recentExits: readonly number[],
  nowMs: number,
  options: {
    maxAttempts?: number;
    windowMs?: number;
    delaysMs?: readonly number[];
  } = {},
): EngineRestartDecision {
  const maxAttempts = options.maxAttempts ?? ENGINE_RESTART_MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? ENGINE_RESTART_WINDOW_MS;
  const delaysMs = options.delaysMs ?? ENGINE_RESTART_DELAYS_MS;
  const windowStart = nowMs - windowMs;
  const pruned = recentExits.filter((timestamp) => timestamp >= windowStart);

  if (pruned.length >= maxAttempts) {
    return {
      action: "exhausted",
      recentExits: pruned,
      maxAttempts,
      windowMs,
    };
  }

  const attempt = pruned.length + 1;
  return {
    action: "restart",
    attempt,
    delayMs: delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0,
    recentExits: [...pruned, nowMs],
    maxAttempts,
    windowMs,
  };
}
