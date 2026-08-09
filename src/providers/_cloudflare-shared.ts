// Shared transport for the Cloudflare Workers AI LLM + embedding providers.
// Both surfaces speak the OpenAI-compatible wire shape on the same host and
// differ only in the trailing route, so endpoint construction, auth headers
// and AI Gateway selection live here rather than being mirrored in two files.
// Mirrors the _openai-shared.ts split.

import { getEnvVar } from "../config.js";

const ACCOUNTS_BASE = "https://api.cloudflare.com/client/v4/accounts";

export const CLOUDFLARE_DEFAULT_CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
export const CLOUDFLARE_DEFAULT_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

/**
 * Resolve a Workers AI endpoint: the operator's full-URL override if set,
 * otherwise the account-scoped default.
 *
 * `overrideVar` is threaded through so the error names the knob that surface
 * actually reads (CLOUDFLARE_AI_BASE_URL vs CLOUDFLARE_EMBEDDING_BASE_URL)
 * instead of a generic one the operator may not have.
 */
export function resolveEndpoint(
  route: "chat/completions" | "embeddings",
  overrideVar: string,
  surface: string,
): string {
  const override = getEnvVar(overrideVar);
  if (override) return override;

  const accountId = getEnvVar("CLOUDFLARE_ACCOUNT_ID");
  if (!accountId) {
    throw new Error(
      `CLOUDFLARE_ACCOUNT_ID or ${overrideVar} is required for the cloudflare ${surface} provider`,
    );
  }
  return `${ACCOUNTS_BASE}/${accountId}/ai/v1/${route}`;
}

export function resolveGatewayId(): string | undefined {
  return getEnvVar("CLOUDFLARE_AI_GATEWAY_ID") || undefined;
}

/**
 * Strict positive-integer parse: the whole string must be digits.
 *
 * parseInt() would accept "1024abc" as 1024 and "10.5" as 10. For a dimension
 * count that silently produces vectors withDimensionGuard rejects on every
 * embed, so a typo has to fail at parse time, not at first use.
 */
export function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Auth + content headers, plus AI Gateway selection.
 *
 * The default endpoint already routes through the account's default gateway,
 * so logging/caching/rate limiting apply with no config. Cloudflare pins a
 * *named* gateway by the cf-aig-gateway-id header, not by a different URL.
 */
export function buildHeaders(
  apiKey: string,
  gatewayId?: string,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(gatewayId ? { "cf-aig-gateway-id": gatewayId } : {}),
  };
}
