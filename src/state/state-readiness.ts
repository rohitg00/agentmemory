import type { IIIClient } from "iii-sdk";
import { KV } from "./schema.js";

const STATE_READY_TIMEOUT_MS = 15_000;
const STATE_READY_INTERVAL_MS = 100;
const PROBE_TIMEOUT_MS = 2_000;
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

/**
 * Worker Compose reports a state worker as ready when its process starts, but
 * the engine registers `state::get`/`state::list` a fraction of a second
 * later. Boot reads that run in that window fail with `function_not_found`
 * and are not retried: the vector checkpoint never loads, the keyword index
 * skips sessions, and capture recovery stops. Wait for both functions before
 * the first boot read; missing functions and probe timeouts are retried, while
 * other errors return without blocking startup. Each probe carries its own
 * timeout, bounded by the time left before the readiness deadline, so a state
 * worker that accepts the call but never answers cannot hold boot for the
 * worker's 180 s invocation budget.
 */
export async function waitForStateReady(
  sdk: TriggerClient,
  options: WaitOptions = {},
): Promise<StateReadiness> {
  const scope = options.scope ?? KV.config;
  const timeoutMs = options.timeoutMs ?? STATE_READY_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? STATE_READY_INTERVAL_MS;
  const now = options.now ?? Date.now;
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
      // timeoutMs is the SDK's per-invocation timeout. It rejects and releases
      // the invocation, so a stalled state call cannot outlive the deadline.
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
      return { ready: true, waitedMs: now() - startedAt, attempts };
    } catch (error) {
      lastError = errorMessage(error);
      if (!isRetryableProbeError(error)) {
        return {
          ready: false,
          waitedMs: now() - startedAt,
          attempts,
          error: lastError,
        };
      }
    }

    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) {
      return { ready: false, waitedMs: elapsed, attempts, error: lastError };
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}

/**
 * A failed readiness wait means the one-shot boot recovery would read an empty
 * state, skip keyword sessions, and report Ready. Fail instead so a supervised
 * worker restarts with the state worker registered.
 */
export function assertStateReady(readiness: StateReadiness): void {
  if (!readiness.ready) {
    throw new Error(
      `State worker did not become ready within ${readiness.waitedMs}ms: ${readiness.error ?? "timeout"}`,
    );
  }
}
