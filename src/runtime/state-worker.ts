import type { IIIClient, ObserverHandle } from "iii-sdk";
import { logger } from "../logger.js";
import type { Bindings } from "./bindings.js";

export interface StateWorkerReadiness {
  ready: boolean;
  waitedMs: number;
  attempts: number;
  error?: string;
}

export const stateWorkerStatus: { ready: boolean; waitedMs: number; lastReturnAt?: string } = {
  ready: false,
  waitedMs: 0,
};

interface SdkLike {
  trigger: (input: { function_id: string; payload: unknown; timeoutMs?: number }) => Promise<unknown>;
  observe?: (source: unknown, target: string, options?: Record<string, unknown>) => ObserverHandle;
  registerFunction?: (id: string, handler: (payload: unknown) => unknown) => unknown;
}

const RETRYABLE = /function_not_found|timeout|not.ready|unavailable|connection/i;

function probeTimeoutMs(): number {
  const raw = process.env.AGENTMEMORY_STATE_READY_TIMEOUT_MS;
  if (raw === undefined) return 60_000;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 600_000) return 60_000;
  return parsed;
}

async function probeOnce(sdk: SdkLike, timeoutMs: number): Promise<void> {
  await sdk.trigger({
    function_id: "state::get",
    payload: { scope: "mem:config", key: "__agentmemory_state_probe__" },
    timeoutMs,
  });
}

export async function waitForStateWorker(
  sdk: IIIClient,
  opts: { timeoutMs?: number } = {},
): Promise<StateWorkerReadiness> {
  const started = Date.now();
  const budget = Math.min(opts.timeoutMs ?? probeTimeoutMs(), 600_000);
  const perProbe = Math.min(2000, budget);
  let attempts = 0;
  let lastError = "unknown";
  while (Date.now() - started < budget) {
    attempts++;
    try {
      await probeOnce(sdk as unknown as SdkLike, perProbe);
      const waitedMs = Date.now() - started;
      logger.info("State worker ready", { waitedMs, attempts });
      stateWorkerStatus.ready = true;
      stateWorkerStatus.waitedMs = waitedMs;
      return { ready: true, waitedMs, attempts };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      if (code && !RETRYABLE.test(code) && !RETRYABLE.test(lastError)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const waitedMs = Date.now() - started;
  logger.warn("State worker not ready before first boot read; continuing and re-arming", { waitedMs, attempts, error: lastError });
  stateWorkerStatus.ready = false;
  stateWorkerStatus.waitedMs = waitedMs;
  return { ready: false, waitedMs, attempts, error: lastError };
}

export interface StateWorkerReturnState {
  lastReturnAt?: string;
  probeReady: boolean;
}

export function onStateWorkerReturn(
  sdk: IIIClient,
  bindings: Bindings,
  cb: () => void | Promise<void>,
): { state: StateWorkerReturnState; probeTick: () => Promise<void>; stop: () => void } {
  const client = sdk as unknown as SdkLike;
  const state: StateWorkerReturnState = { probeReady: stateWorkerStatus.ready };
  let inFlight: Promise<void> | null = null;
  let queued = false;
  let lastFireAt = 0;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRetry = (delayMs: number) => {
    if (retryTimer || stopped) return;
    retryTimer = setTimeout(() => { retryTimer = null; fire(); }, delayMs);
    retryTimer.unref();
  };
  const fire = () => {
    if (stopped || inFlight) { if (!stopped) queued = true; return; }
    const now = Date.now();
    if (now - lastFireAt < 1000) { queued = true; scheduleRetry(1000 - (now - lastFireAt)); return; }
    lastFireAt = now;
    inFlight = Promise.resolve(cb()).then(() => {
      inFlight = null;
      if (queued) { queued = false; fire(); }
    }, () => { inFlight = null; });
  };
  for (const handle of bindings.stateHandles) {
    let wasPending = handle.state === "pending" || handle.state === "suspended";
    handle.onStateChange((next) => {
      if (next === "active" && wasPending) {
        state.lastReturnAt = new Date().toISOString();
        stateWorkerStatus.lastReturnAt = state.lastReturnAt;
        logger.info("State worker observer active again; running re-arm", { observerId: handle.id });
        fire();
      }
      wasPending = next === "pending" || next === "suspended";
    });
  }
  if (typeof client.observe === "function" && bindings.modes.state === "observe") {
    client.registerFunction?.("runtime::on-workers-changed", async (payload: unknown) => {
      if ((payload as { event?: string })?.event !== "worker_connected") return { handled: false };
      try {
        await probeOnce(client, 2000);
        state.lastReturnAt = new Date().toISOString();
        stateWorkerStatus.lastReturnAt = state.lastReturnAt;
        logger.info("State worker reconnected; running re-arm");
        fire();
      } catch {}
      return { handled: true };
    });
    client.observe(
      { function_id: "engine::on-workers-changed", capture: ["input"], deliver: "input" },
      "runtime::on-workers-changed",
      { id: "agentmemory:runtime:workers-changed" },
    );
  }
  const probeTick = async () => {
    if (bindings.modes.state === "observe" || stopped) return;
    try {
      await probeOnce(client, 2000);
      if (!state.probeReady) {
        state.probeReady = true;
        state.lastReturnAt = new Date().toISOString();
        stateWorkerStatus.lastReturnAt = state.lastReturnAt;
        logger.info("State worker reachable again; running re-arm");
        fire();
      }
    } catch {
      state.probeReady = false;
    }
  };
  return {
    state,
    probeTick,
    stop: () => {
      stopped = true;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    },
  };
}
