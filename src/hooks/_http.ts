import { createPlaintextBearerAuthGuard } from "../security/plaintext-bearer-auth.js";

const guardPlaintextBearerAuth = createPlaintextBearerAuthGuard((message) =>
  process.stderr.write(`${message}\n`),
);

export function authHeaders(secret: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) h["Authorization"] = `Bearer ${secret}`;
  return h;
}

export function canSendAuthenticatedRequest(baseUrl: string, secret: string): boolean {
  try {
    return guardPlaintextBearerAuth(baseUrl, secret);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return false;
  }
}

export function guardedFetch(
  baseUrl: string,
  path: string,
  secret: string,
  init: RequestInit,
): Promise<Response> | undefined {
  if (!canSendAuthenticatedRequest(baseUrl, secret)) return undefined;
  return fetch(`${baseUrl}${path}`, init);
}
