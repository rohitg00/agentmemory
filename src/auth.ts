import { timingSafeEqual, createHmac, randomBytes } from "node:crypto";

const hmacKey = randomBytes(32);
export const VIEWER_NONCE_PLACEHOLDER = "__AGENTMEMORY_VIEWER_NONCE__";

export function timingSafeCompare(a: string, b: string): boolean {
  const hmacA = createHmac("sha256", hmacKey).update(a).digest();
  const hmacB = createHmac("sha256", hmacKey).update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
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

type HeaderValue = string | string[] | undefined;
export type RequestHeaders = Record<string, HeaderValue> | undefined | null;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readHeader(headers: RequestHeaders, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) return value[0];
    return value;
  }
  return undefined;
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

export function parseOriginList(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);
}

export function loopbackOrigins(ports: Array<number | null | undefined>): string[] {
  const out: string[] = [];
  for (const port of ports) {
    if (typeof port !== "number" || !Number.isInteger(port) || port <= 0) continue;
    out.push(
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      `http://[::1]:${port}`,
    );
  }
  return out;
}

export function configuredAllowedOrigins(
  ports: Array<number | null | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  return new Set([
    ...loopbackOrigins(ports),
    ...parseOriginList(env["VIEWER_ALLOWED_ORIGINS"]),
  ]);
}

export function isJsonContentType(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const [mediaType, ...params] = value.split(";");
  if (mediaType.trim().toLowerCase() !== "application/json") return false;
  return params.every((param) => {
    const trimmed = param.trim();
    if (!trimmed) return true;
    const eq = trimmed.indexOf("=");
    return eq > 0 && trimmed.slice(0, eq).trim().toLowerCase() === "charset";
  });
}

function hasRequestBody(headers: RequestHeaders): boolean {
  if (readHeader(headers, "content-type") !== undefined) return true;
  if (readHeader(headers, "transfer-encoding") !== undefined) return true;
  const length = readHeader(headers, "content-length");
  if (length === undefined) return false;
  const n = Number(length);
  return !Number.isFinite(n) || n > 0;
}

export interface RequestGuardInput {
  method: string | undefined;
  headers: RequestHeaders;
  allowedOrigins: Set<string>;
  sameOriginHost?: string;
}

export interface RequestGuardRejection {
  status_code: 403 | 415;
  body: { error: string };
}

export function checkRequestGuard(input: RequestGuardInput): RequestGuardRejection | null {
  const method = (input.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return null;

  const origin = readHeader(input.headers, "origin");
  if (origin !== undefined && origin.trim() !== "") {
    const normalized = normalizeOrigin(origin);
    const host = input.sameOriginHost?.trim().toLowerCase();
    const sameOrigin =
      !!host && (normalized === `http://${host}` || normalized === `https://${host}`);
    if (!sameOrigin && !input.allowedOrigins.has(normalized)) {
      return { status_code: 403, body: { error: "origin not allowed" } };
    }
  }

  if (hasRequestBody(input.headers) && !isJsonContentType(readHeader(input.headers, "content-type"))) {
    return {
      status_code: 415,
      body: { error: "content-type must be application/json" },
    };
  }
  return null;
}
