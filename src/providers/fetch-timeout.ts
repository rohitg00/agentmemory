import { getEnvVar } from "../config.js";

const DEFAULT_LLM_TIMEOUT_MS = 120_000;

export function getLlmTimeoutMs(): number {
  const raw = getEnvVar("AGENTMEMORY_LLM_TIMEOUT_MS")?.trim();
  if (!raw) return DEFAULT_LLM_TIMEOUT_MS;
  if (!/^\d+$/.test(raw)) return DEFAULT_LLM_TIMEOUT_MS;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LLM_TIMEOUT_MS;
}

export async function fetchWithLlmTimeout(
  providerName: string,
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
): Promise<Response> {
  const timeoutMs = getLlmTimeoutMs();

  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`${providerName} request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}
