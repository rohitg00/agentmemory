import { timingSafeEqual, createHmac, randomBytes } from "node:crypto";

const hmacKey = randomBytes(32);
export const VIEWER_NONCE_PLACEHOLDER = "__AGENTMEMORY_VIEWER_NONCE__";

export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createViewerNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function buildViewerCsp(nonce: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'none'",
    `script-src 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    "style-src 'unsafe-inline'",
    "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*",
    "img-src 'self'",
    "font-src 'self'",
  ].join("; ");
}
