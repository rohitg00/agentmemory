import { getEnvVar } from "../config.js";
import { logger } from "../logger.js";

export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const parsed =
    timeoutMs ??
    Number.parseInt(getEnvVar("AGENTMEMORY_LLM_TIMEOUT_MS") ?? "60000", 10);
  const ms = Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;

  const ctl = new AbortController();
  const signal = init.signal
    ? AbortSignal.any([init.signal, ctl.signal])
    : ctl.signal;
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal }).finally(() => clearTimeout(t));
}

// Shared across every raw-fetch LLM provider (openai, openrouter, minimax).
// Sentry.captureException forwards a thrown error's .message off-host (see
// src/observability/sentry.ts), so provider HTTP error bodies -- which can
// echo a snippet of the request content -- must never be embedded in the
// thrown message. Log the full body locally only, throw a fixed,
// content-free message with just the status code.
export async function throwSafeHttpError(
  providerName: string,
  response: Response,
): Promise<never> {
  const text = await response.text().catch(() => "");
  logger.error(`${providerName} API error response`, {
    status: response.status,
    body: text,
  });
  throw new Error(`${providerName} API error (status ${response.status})`);
}

// Same rationale as throwSafeHttpError, for the "200 OK but unexpected
// response shape" case -- the raw parsed body can itself be (or contain)
// the actual LLM output, so it must stay local-log-only.
export function throwSafeShapeError(providerName: string, data: unknown): never {
  logger.error(`${providerName} returned unexpected response shape`, { data });
  throw new Error(`${providerName} returned unexpected response shape`);
}
