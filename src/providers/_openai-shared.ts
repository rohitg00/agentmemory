// Shared transport helpers for the OpenAI-compatible LLM + embedding
// providers. Both surfaces (chat completions, embeddings) speak the
// same wire shape on the standard OpenAI path, the same alternate
// shape on Azure OpenAI (api-key header + api-version query param,
// deployment carried in the URL with no /v1/ prefix). The two
// provider classes used to duplicate this transport boilerplate
// (#199, #371); collapsing it here keeps Azure detection consistent
// across both surfaces and shaves ~40 LOC.

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";
export const DEFAULT_AZURE_API_VERSION = "2024-08-01-preview";

// Azure resource URLs land at <resource>.openai.azure.com. The
// documented opt-in shape is
//   OPENAI_BASE_URL=https://<resource>.openai.azure.com/openai/deployments/<deployment>
// so we detect on the hostname suffix alone.
export function detectAzure(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.hostname.endsWith(".openai.azure.com");
  } catch {
    return false;
  }
}

// Azure carries the deployment in the URL path; the OpenAI-shape
// /v1/ prefix is not appended. The api-version query param is
// mandatory — without it Azure returns a 400.
//
// Use the URL API to compose the result instead of string-concat: a
// baseUrl that already carries query parameters (e.g. a corporate
// proxy passing through diagnostics tokens) would otherwise have the
// route path interpolated into the query string, producing a
// malformed URL. searchParams.set also encodes the api-version
// correctly without needing manual encodeURIComponent.
function azureUrl(baseUrl: string, path: string, apiVersion: string): string {
  const url = new URL(baseUrl);
  // Join pathnames, normalising the slash boundary between the
  // existing deployment path and the route path.
  const existing = url.pathname.replace(/\/+$/, "");
  const route = path.startsWith("/") ? path : `/${path}`;
  url.pathname = `${existing}${route}`;
  url.searchParams.set("api-version", apiVersion);
  return url.toString();
}

export function buildChatUrl(
  baseUrl: string,
  isAzure: boolean,
  azureApiVersion: string,
): string {
  if (isAzure) return azureUrl(baseUrl, "/chat/completions", azureApiVersion);
  return `${baseUrl}/v1/chat/completions`;
}

export function buildEmbeddingUrl(
  baseUrl: string,
  isAzure: boolean,
  azureApiVersion: string,
): string {
  if (isAzure) return azureUrl(baseUrl, "/embeddings", azureApiVersion);
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
