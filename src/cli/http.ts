import {
  plaintextBearerAuthMessage,
  usesPlaintextBearerAuth,
} from "../security/plaintext-bearer-auth.js";

type Env = Record<string, string | undefined>;

export type JsonRequestHeadersResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; message: string };

export function buildJsonRequestHeaders(
  url: string,
  env: Env = process.env,
): JsonRequestHeadersResult {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = env["AGENTMEMORY_SECRET"];
  if (!secret) return { ok: true, headers };
  if (usesPlaintextBearerAuth(url, secret)) {
    return { ok: false, message: plaintextBearerAuthMessage(url) };
  }
  headers["Authorization"] = `Bearer ${secret}`;
  return { ok: true, headers };
}
