import { getEnvVar } from "../config.js";
import { buildProxyFetch } from "./_proxy.js";

// Proxy fetch cached by proxy URL. Re-evaluated when the URL changes so
// test teardowns (delete process.env.HTTPS_PROXY) take effect on the next call.
// Caching preserves the same https.Agent across requests → TCP connection reuse.
let _cachedProxyUrl: string | null = null;
let _cachedProxyFetch: ReturnType<typeof buildProxyFetch> = undefined;

function getAutoProxy(): ReturnType<typeof buildProxyFetch> {
  const url =
    process.env["HTTPS_PROXY"] ??
    process.env["https_proxy"] ??
    process.env["HTTP_PROXY"] ??
    process.env["http_proxy"] ??
    null;
  if (url !== _cachedProxyUrl) {
    _cachedProxyUrl = url;
    _cachedProxyFetch = url ? buildProxyFetch("fetch") : undefined;
  }
  return _cachedProxyFetch;
}

/**
 * Wraps fetch with a timeout and optional proxy-aware fetch function.
 * Auto-detects HTTPS_PROXY/HTTP_PROXY env vars when fetchFn is not provided.
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchFn?: (url: string, init: any) => Promise<Response>,
): Promise<Response> {
  const parsed =
    timeoutMs ??
    Number.parseInt(getEnvVar("AGENTMEMORY_LLM_TIMEOUT_MS") ?? "60000", 10);
  const ms = Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;

  const fn = fetchFn ?? getAutoProxy() ?? fetch;
  const ctl = new AbortController();
  const signal = init.signal
    ? AbortSignal.any([init.signal, ctl.signal])
    : ctl.signal;
  const t = setTimeout(() => ctl.abort(), ms);
  return fn(url, { ...init, signal }).finally(() => clearTimeout(t));
}
