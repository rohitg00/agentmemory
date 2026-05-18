// Shared transport helpers for the OpenAI-compatible LLM + embedding
// providers. Both surfaces (chat completions, embeddings) speak the
// same wire shape on the standard OpenAI path. Azure OpenAI ships
// two URL styles and we support both:
//
//   - Legacy/stable: `/openai/deployments/<deployment>/chat/completions`
//     with mandatory `api-version=<date>` query param. The deployment
//     name lives in the URL path. Required api-version moves with
//     every Azure date-stamped revision; we keep the
//     `OPENAI_API_VERSION` env knob + `DEFAULT_AZURE_API_VERSION`
//     fallback so existing configs don't break on upgrade.
//
//   - v1 (GA Apr-2025): `/openai/v1/chat/completions`. No
//     api-version query param, no `/deployments/` segment. Deployment
//     name is passed in the request body as `model`. This matches
//     the OpenAI wire shape one-for-one which is the whole point of
//     v1 — drop-in compatibility.
//
// Auto-detection runs off the URL shape, not a flag: if the path
// already carries `/deployments/`, we route through the legacy
// builder; otherwise v1. Users opt into v1 by stripping the
// `/openai/deployments/<deployment>` suffix from their
// OPENAI_BASE_URL (or never adding it). See azureStyleOf().

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";

// Default api-version for the legacy Azure URL pattern. Only used
// when the configured base URL carries `/deployments/` AND
// OPENAI_API_VERSION is unset. The v1 path ignores this entirely.
export const DEFAULT_AZURE_API_VERSION = "2024-08-01-preview";

type AzureStyle = "legacy" | "v1";

// Azure resource URLs land at <resource>.openai.azure.com.
export function detectAzure(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.hostname.endsWith(".openai.azure.com");
  } catch {
    return false;
  }
}

// Pick the Azure URL style off the base URL's path shape. We only
// consult this when detectAzure(baseUrl) has already returned true.
function azureStyleOf(baseUrl: string): AzureStyle {
  try {
    const u = new URL(baseUrl);
    // `/openai/deployments/<deployment>` (with or without a trailing
    // segment) signals the legacy URL pattern. Anything else — a
    // bare resource host, an `/openai/v1` prefix, an empty path —
    // routes through v1.
    if (/\/openai\/deployments\//.test(u.pathname)) return "legacy";
    return "v1";
  } catch {
    return "v1";
  }
}

// Legacy Azure: append the route to the existing deployment path,
// set api-version via searchParams. URL-API composition keeps any
// pre-existing query params on the base URL intact.
function legacyAzureUrl(
  baseUrl: string,
  path: string,
  apiVersion: string,
): string {
  const url = new URL(baseUrl);
  const existing = url.pathname.replace(/\/+$/, "");
  const route = path.startsWith("/") ? path : `/${path}`;
  url.pathname = `${existing}${route}`;
  url.searchParams.set("api-version", apiVersion);
  return url.toString();
}

// v1 Azure: route through `/openai/v1/<path>`. Preserve any existing
// query params on the base URL (corporate proxy, diagnostics tokens)
// but never append api-version — v1 doesn't accept it.
function v1AzureUrl(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  const route = path.startsWith("/") ? path.slice(1) : path;
  // Strip any trailing `/openai`, `/openai/`, or `/openai/v1` so a
  // user who configures OPENAI_BASE_URL with a partial prefix still
  // gets a single, correct path.
  const base = url.pathname.replace(/\/?openai(?:\/v1)?\/?$/, "");
  url.pathname = `${base.replace(/\/+$/, "")}/openai/v1/${route}`;
  return url.toString();
}

export function buildChatUrl(
  baseUrl: string,
  isAzure: boolean,
  azureApiVersion: string,
): string {
  if (isAzure) {
    return azureStyleOf(baseUrl) === "legacy"
      ? legacyAzureUrl(baseUrl, "/chat/completions", azureApiVersion)
      : v1AzureUrl(baseUrl, "/chat/completions");
  }
  return `${baseUrl}/v1/chat/completions`;
}

export function buildEmbeddingUrl(
  baseUrl: string,
  isAzure: boolean,
  azureApiVersion: string,
): string {
  if (isAzure) {
    return azureStyleOf(baseUrl) === "legacy"
      ? legacyAzureUrl(baseUrl, "/embeddings", azureApiVersion)
      : v1AzureUrl(baseUrl, "/embeddings");
  }
  return `${baseUrl}/v1/embeddings`;
}

// Azure key-auth uses `api-key: <KEY>`; standard OpenAI-compatible
// endpoints use `Authorization: Bearer <KEY>`. Azure also accepts
// Bearer when AAD-auth is configured upstream, but the api-key path
// is the default and what our config block documents.
export function buildAuthHeaders(
  apiKey: string,
  isAzure: boolean,
): Record<string, string> {
  if (isAzure) {
    return {
      "Content-Type": "application/json",
      "api-key": apiKey,
    };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function normalizeBaseUrl(raw: string | undefined): string {
  return (raw || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, "");
}
