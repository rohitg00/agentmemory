import type { IIIClient } from "iii-sdk";
import { KV } from "./schema.js";

const STATE_READY_TIMEOUT_MS = 120_000;
const STATE_READY_INTERVAL_MS = 100;
const PROBE_TIMEOUT_MS = 10_000;
const READINESS_PROBE_KEY = "__agentmemory_state_readiness__";

export type StateReadiness = {
  ready: boolean;
  waitedMs: number;
  attempts: number;
  error?: string;
};

type TriggerClient = Pick<IIIClient, "trigger">;

type WaitOptions = {
  scope?: string;
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onWaiting?: (error: string) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableProbeError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (
    code === "function_not_found" ||
    code === "invocation_timeout" ||
    code === "timeout"
  ) {
    return true;
  }
  return /Function state::(?:get|list) not found|timed out|timeout|ETIMEDOUT/i.test(
    errorMessage(error),
  );
}

export async function waitForStateReady(
  sdk: TriggerClient,
  options: WaitOptions = {},
): Promise<StateReadiness> {
  const scope = options.scope ?? KV.config;
  const timeoutMs = options.timeoutMs ?? STATE_READY_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? STATE_READY_INTERVAL_MS;
  const now = options.now ?? (() => performance.now());
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const startedAt = now();
  let attempts = 0;
  let lastError: string | undefined;
  const probeTimeoutMs = () =>
    Math.min(PROBE_TIMEOUT_MS, Math.max(1, timeoutMs - (now() - startedAt)));

  for (;;) {
    attempts += 1;
    try {
      await sdk.trigger({
        function_id: "state::list",
        payload: { scope },
        timeoutMs: probeTimeoutMs(),
      });
      await sdk.trigger({
        function_id: "state::get",
        payload: { scope, key: READINESS_PROBE_KEY },
        timeoutMs: probeTimeoutMs(),
      });
      return { ready: true, waitedMs: Math.round(now() - startedAt), attempts };
    } catch (error) {
      lastError = errorMessage(error);
      if (!isRetryableProbeError(error)) {
        return {
          ready: false,
          waitedMs: Math.round(now() - startedAt),
          attempts,
          error: lastError,
        };
      }
      if (attempts === 1) options.onWaiting?.(lastError);
    }

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) {
      return { ready: false, waitedMs: Math.round(elapsed), attempts, error: lastError };
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}

export function assertStateReady(readiness: StateReadiness): void {
  if (!readiness.ready) {
    throw new Error(
      `State worker did not become ready within ${readiness.waitedMs}ms: ${readiness.error ?? "timeout"}`,
    );
  }
}
