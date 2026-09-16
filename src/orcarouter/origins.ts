// OrcaRouter origin policy.
//
// Authentication and inference live on two different public origins. This is
// the single most common integration mistake: `https://api.orcarouter.ai/v1`
// is the relay, `https://www.orcarouter.ai` is the auth host, and its auth
// endpoints sit at `/api/v1/auth/...` (so `https://api.orcarouter.ai/v1/auth/
// keys` is a 404, not a routing bug). Never derive one origin from the other
// by swapping a hostname or blindly appending `/v1` — read them from here.
//
// Self-hosted deployments may collapse both onto one origin, so the shared
// `ORCA_BASE_URL` acts as a fallback for each half, while the explicit
// `ORCA_AUTH_BASE_URL` / `ORCA_API_BASE_URL` overrides take precedence.
//
// Remote origins must be HTTPS. Plain HTTP is permitted only for loopback
// hosts, which is what makes a local fake auth server usable in tests without
// weakening the policy for anything reachable off-box.

import { getEnvVar } from "../config.js";

export const DEFAULT_AUTH_BASE_URL = "https://www.orcarouter.ai";
export const DEFAULT_API_BASE_URL = "https://api.orcarouter.ai";

/** Consent screen. Not an API — the browser is sent here. */
export const AUTHORIZE_PATH = "/auth";
/** Code-for-key exchange. Lives on the AUTH origin, under `/api/v1/auth`. */
export const EXCHANGE_PATH = "/api/v1/auth/keys";

/** Public console page where a user revokes every key issued to this app. */
export const AUTHORIZED_APPS_URL =
  "https://www.orcarouter.ai/console/authorized-apps";
/** Public dashboard where a user mints/copies an API key by hand. */
export const API_KEYS_URL = "https://www.orcarouter.ai/console/api-keys";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.trim().toLowerCase());
}

/**
 * Validate one configured origin. Returns the normalised origin (no trailing
 * slash, no path) or throws with an actionable message.
 */
export function normalizeOrigin(raw: string, envName: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${envName} is not a valid URL: ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `${envName} must use https:// (or http:// for loopback only), got ${url.protocol}`,
    );
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error(
      `${envName} uses plain http:// for non-loopback host ${url.hostname}. ` +
        `Refusing to send credentials over an unencrypted connection — use https:// (http:// is allowed only for localhost/127.0.0.1/[::1]).`,
    );
  }
  return url.origin;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export interface OrcaRouterOrigins {
  /** Origin for the browser consent screen and the code→key exchange. */
  authBaseUrl: string;
  /** Origin for inference and model discovery (the `/v1` relay). */
  apiBaseUrl: string;
}

/**
 * Resolve the auth and inference origins from the environment.
 *
 * Precedence per half: explicit override → shared `ORCA_BASE_URL` → public
 * default. The shared base is a real fallback for single-origin self-hosted
 * installs, not a synonym for either default.
 */
export function resolveOrigins(
  env: (key: string) => string | undefined = getEnvVar,
): OrcaRouterOrigins {
  const sharedRaw = trimTrailingSlash(env("ORCA_BASE_URL")?.trim() || "");
  const authRaw = trimTrailingSlash(env("ORCA_AUTH_BASE_URL")?.trim() || "");
  const apiRaw = trimTrailingSlash(env("ORCA_API_BASE_URL")?.trim() || "");

  const authBaseUrl = authRaw
    ? normalizeOrigin(authRaw, "ORCA_AUTH_BASE_URL")
    : sharedRaw
      ? normalizeOrigin(sharedRaw, "ORCA_BASE_URL")
      : DEFAULT_AUTH_BASE_URL;

  const apiBaseUrl = apiRaw
    ? normalizeOrigin(apiRaw, "ORCA_API_BASE_URL")
    : sharedRaw
      ? normalizeOrigin(sharedRaw, "ORCA_BASE_URL")
      : DEFAULT_API_BASE_URL;

  return { authBaseUrl, apiBaseUrl };
}

/** OpenAI-compatible inference root, e.g. `https://api.orcarouter.ai/v1`. */
export function inferenceBaseUrl(origins: OrcaRouterOrigins): string {
  return `${origins.apiBaseUrl}/v1`;
}

export function chatCompletionsUrl(origins: OrcaRouterOrigins): string {
  return `${inferenceBaseUrl(origins)}/chat/completions`;
}

export function modelsUrl(origins: OrcaRouterOrigins): string {
  return `${inferenceBaseUrl(origins)}/models`;
}

export function embeddingsUrl(origins: OrcaRouterOrigins): string {
  return `${inferenceBaseUrl(origins)}/embeddings`;
}

export function authorizeUrl(origins: OrcaRouterOrigins): string {
  return `${origins.authBaseUrl}${AUTHORIZE_PATH}`;
}

export function exchangeUrl(origins: OrcaRouterOrigins): string {
  return `${origins.authBaseUrl}${EXCHANGE_PATH}`;
}
