// OAuth 2.0 + PKCE against OrcaRouter, Flow A (loopback redirect).
//
// Flow A is the right fit here because both surfaces this repo ships — the
// local viewer GUI and the `agentmemory` CLI — run on the same machine as the
// user's browser, so the backend can bind an ephemeral 127.0.0.1 port and
// receive the redirect code directly. Nothing has to be pre-registered: the
// port is picked at connect time and handed to the consent screen in
// `callback_url`.
//
// S256 is always sent, never `plain`. Even on Flow A the consent screen offers
// "show me a code", which puts the code in human hands; a `plain` challenge
// would then have travelled to the user's browser and back inside the
// authorize URL. The verifier is generated here, from the crypto RNG, and
// never leaves this process until the exchange.
//
// The exchange returns a durable `sk-orca-…` API key belonging to the user —
// not an access/refresh pair. See credentials.ts for the lifecycle.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { timingSafeCompare } from "../auth.js";
import {
  type OrcaRouterOrigins,
  authorizeUrl,
  exchangeUrl,
} from "./origins.js";

/** Bytes of entropy behind each verifier. 32 bytes → 43 base64url chars. */
const VERIFIER_BYTES = 32;
/** Bytes of entropy behind the CSRF `state` value. */
const STATE_BYTES = 16;

/** Auth codes are single-use with a 10 minute TTL; stay inside that window. */
export const DEFAULT_AUTHORIZE_TIMEOUT_MS = 300_000;
/** Exchange is a single small POST — a tight bound keeps the UI responsive. */
export const DEFAULT_EXCHANGE_TIMEOUT_MS = 30_000;

/** Upper bound on any auth response body we are willing to parse. */
const MAX_AUTH_RESPONSE_BYTES = 64 * 1024;

export type PkceErrorKind =
  | "denied"
  | "state_mismatch"
  | "timeout"
  | "canceled"
  | "code_rejected"
  | "method_rejected"
  | "rate_limited"
  | "scope_insufficient"
  | "redirect_rejected"
  | "network"
  | "malformed_response";

/**
 * Terminal-by-design auth failure. `kind` is what callers branch on; `message`
 * is safe to show a user and safe to log — it never carries the verifier, the
 * code, or any part of the returned key.
 */
export class OrcaRouterAuthError extends Error {
  readonly kind: PkceErrorKind;
  readonly status?: number;

  constructor(kind: PkceErrorKind, message: string, status?: number) {
    super(message);
    this.name = "OrcaRouterAuthError";
    this.kind = kind;
    this.status = status;
  }

  /** True when retrying the whole connect flow can plausibly succeed. */
  get retryable(): boolean {
    return this.kind === "network" || this.kind === "rate_limited";
  }
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export interface PkceAttempt {
  /** Secret. Never logged, never placed in a URL — only in the exchange body. */
  verifier: string;
  /** Safe to put on the authorize URL: this is a one-way hash of verifier. */
  challenge: string;
  /** Opaque CSRF token, echoed back by the consent screen. */
  state: string;
}

/**
 * A fresh verifier/challenge/state triple. Every authorization attempt gets
 * its own — reusing one across attempts (or deriving it from a timestamp,
 * username, or fixed salt) would let anyone who saw one authorize URL redeem a
 * later code.
 */
export function createPkceAttempt(): PkceAttempt {
  const verifier = b64url(randomBytes(VERIFIER_BYTES));
  return {
    verifier,
    challenge: challengeFor(verifier),
    state: b64url(randomBytes(STATE_BYTES)),
  };
}

/** `base64url(sha256(verifier))`, unpadded — the S256 challenge. */
export function challengeFor(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

export interface AuthorizeUrlOptions {
  origins: OrcaRouterOrigins;
  attempt: PkceAttempt;
  appName: string;
  /** `http://127.0.0.1:<port>/<path>` for Flow A, or the literal `oob`. */
  callbackUrl: string;
  scope?: string;
  loginHint?: string;
  workspaceHint?: string;
  /** `consent` forces re-approval even when the user approved before. */
  prompt?: string;
}

/**
 * Build the consent-screen URL. Carries the challenge and the opaque state —
 * never the verifier.
 */
export function buildAuthorizeUrl(opts: AuthorizeUrlOptions): string {
  const url = new URL(authorizeUrl(opts.origins));
  url.searchParams.set("callback_url", opts.callbackUrl);
  url.searchParams.set("code_challenge", opts.attempt.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", opts.attempt.state);
  url.searchParams.set("app_name", opts.appName);
  if (opts.scope) url.searchParams.set("scope", opts.scope);
  if (opts.loginHint) url.searchParams.set("login_hint", opts.loginHint);
  if (opts.workspaceHint)
    url.searchParams.set("workspace_hint", opts.workspaceHint);
  if (opts.prompt) url.searchParams.set("prompt", opts.prompt);
  return url.toString();
}

/** Result of a successful code→key exchange. */
export interface ExchangeResult {
  /** The durable OrcaRouter API key. Never log this. */
  key: string;
  userId: string;
  /** Scope that was *granted*, which may be narrower than what was asked for. */
  scope: string;
}

/** Scope this integration needs to run inference. */
export const REQUIRED_SCOPE = "api";

interface ExchangeResponseBody {
  key?: unknown;
  user_id?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
}

/**
 * Exchange an auth code for a durable API key.
 *
 * The verifier is sent in the POST body — never as a query parameter, which
 * would land it in browser history and proxy logs.
 */
export async function exchangeCode(opts: {
  origins: OrcaRouterOrigins;
  code: string;
  verifier: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ExchangeResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_EXCHANGE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await doFetch(exchangeUrl(opts.origins), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: opts.code,
        code_verifier: opts.verifier,
        code_challenge_method: "S256",
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Never surface the underlying error: a fetch failure message can carry
    // the request URL, and some runtimes echo the body.
    if (err instanceof Error && err.name === "AbortError") {
      throw new OrcaRouterAuthError(
        "network",
        "Timed out waiting for OrcaRouter to exchange the authorization code.",
      );
    }
    throw new OrcaRouterAuthError(
      "network",
      "Could not reach OrcaRouter to exchange the authorization code. Check your network connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await readBounded(res, MAX_AUTH_RESPONSE_BYTES);
  let body: ExchangeResponseBody = {};
  try {
    body = text ? (JSON.parse(text) as ExchangeResponseBody) : {};
  } catch {
    body = {};
  }

  if (!res.ok) throw exchangeError(res.status, body);

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const scope = typeof body.scope === "string" ? body.scope.trim() : "";
  const userId =
    typeof body.user_id === "string"
      ? body.user_id
      : typeof body.user_id === "number"
        ? String(body.user_id)
        : "";

  if (!key) {
    throw new OrcaRouterAuthError(
      "malformed_response",
      "OrcaRouter returned a successful response without an API key.",
      res.status,
    );
  }

  // The response reports the scope that was *granted*, not the one requested.
  // A workspace role can narrow it, so read it back instead of assuming.
  if (scope && scope !== REQUIRED_SCOPE) {
    throw new OrcaRouterAuthError(
      "scope_insufficient",
      `OrcaRouter granted scope "${scope}" but this integration needs "${REQUIRED_SCOPE}". ` +
        `Ask a workspace owner to grant the "${REQUIRED_SCOPE}" scope, then connect again.`,
      res.status,
    );
  }

  return { key, userId, scope: scope || REQUIRED_SCOPE };
}

function exchangeError(status: number, body: ExchangeResponseBody): OrcaRouterAuthError {
  const detail =
    typeof body.error_description === "string"
      ? body.error_description
      : typeof body.error === "string"
        ? body.error
        : "";
  const suffix = detail ? ` (${detail})` : "";

  switch (status) {
    case 400:
      // Raised when code_challenge_method is unrecognised or differs from the
      // one sent at authorize time — the downgrade defence firing.
      return new OrcaRouterAuthError(
        "method_rejected",
        `OrcaRouter rejected the PKCE challenge method${suffix}. Start the connection again.`,
        status,
      );
    case 403:
      // Unknown, expired, or already-used code — or the verifier does not
      // match the stored challenge. Never retried in place: a reused code is
      // gone for good.
      return new OrcaRouterAuthError(
        "code_rejected",
        `OrcaRouter rejected the authorization code — it may have expired (codes last 10 minutes) or already been used${suffix}. Start the connection again.`,
        status,
      );
    case 429:
      return new OrcaRouterAuthError(
        "rate_limited",
        `OrcaRouter is rate-limiting key issuance (at most 10 PKCE keys per user per 24 hours)${suffix}. Reuse the stored key, or try again later.`,
        status,
      );
    default:
      return new OrcaRouterAuthError(
        "malformed_response",
        `OrcaRouter rejected the authorization code (HTTP ${status})${suffix}.`,
        status,
      );
  }
}

async function readBounded(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
  } catch {
    // A truncated body still yields whatever arrived — the caller validates.
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

export interface LoopbackReceiver {
  port: number;
  /** Resolves with the auth code, or rejects with an OrcaRouterAuthError. */
  result: Promise<string>;
  /** Idempotent. Releases the socket and rejects a still-pending result. */
  close: () => void;
}

const CLOSE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>OrcaRouter</title></head><body style="font-family:system-ui,sans-serif;padding:2rem">
<h1 style="font-size:1.1rem">Connected to OrcaRouter</h1>
<p>You can close this tab and return to agentmemory.</p></body></html>`;

const FAIL_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>OrcaRouter</title></head><body style="font-family:system-ui,sans-serif;padding:2rem">
<h1 style="font-size:1.1rem">Authorization was not completed</h1>
<p>You can close this tab and return to agentmemory for details.</p></body></html>`;

/**
 * Bind an ephemeral loopback port and wait for the consent screen to redirect
 * back to it.
 *
 * The listener is up before the authorize URL is built, so the port in
 * `callback_url` is always the port that is actually accepting.
 */
export function startLoopbackReceiver(opts: {
  /** The `state` this receiver will accept. Compared in constant time. */
  state: string;
  timeoutMs?: number;
  callbackPath?: string;
}): Promise<LoopbackReceiver> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_AUTHORIZE_TIMEOUT_MS;
  const callbackPath = opts.callbackPath ?? "/cb";
  const expectedState = opts.state;

  return new Promise<LoopbackReceiver>((ready, notReady) => {
    let settle!: (code: string) => void;
    let fail!: (err: Error) => void;
    let done = false;
    const result = new Promise<string>((res, rej) => {
      settle = res;
      fail = rej;
    });
    // A caller that never awaits (e.g. the attempt was superseded and the
    // receiver torn down) must not produce an unhandled rejection.
    result.catch(() => {});

    const close = (): void =>
      finish(
        new OrcaRouterAuthError(
          "canceled",
          "The authorization attempt was cancelled.",
        ),
      );

    const finish = (err: Error | null, code?: string): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        server.close();
      } catch {
        /* already closed */
      }
      if (err) fail(err);
      else settle(code!);
    };

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== callbackPath) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
        return;
      }

      // Compare state BEFORE touching the code. This is the only thing
      // standing between this socket and a code that some other page dropped
      // on it.
      const returnedState = url.searchParams.get("state") ?? "";
      const stateOk =
        returnedState.length > 0 && timingSafeCompare(returnedState, expectedState);

      const err = url.searchParams.get("error");
      const denyPage = Boolean(err) || !stateOk;
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(denyPage ? FAIL_PAGE : CLOSE_PAGE);

      if (!stateOk) {
        finish(
          new OrcaRouterAuthError(
            "state_mismatch",
            "The authorization response did not match this request's state value. " +
              "The connection was refused, and no credentials were stored. Start again.",
          ),
        );
        return;
      }
      if (err) {
        finish(
          err === "access_denied"
            ? new OrcaRouterAuthError(
                "denied",
                "Authorization was denied in the browser. No credentials were stored.",
              )
            : new OrcaRouterAuthError(
                "redirect_rejected",
                `OrcaRouter returned an authorization error: ${err}.`,
              ),
        );
        return;
      }

      const code = url.searchParams.get("code") ?? "";
      if (!code) {
        finish(
          new OrcaRouterAuthError(
            "malformed_response",
            "The authorization redirect did not include a code.",
          ),
        );
        return;
      }
      finish(null, code);
    });

    const timer = setTimeout(() => {
      finish(
        new OrcaRouterAuthError(
          "timeout",
          "Timed out waiting for authorization in the browser. Start the connection again when you are ready.",
        ),
      );
    }, timeoutMs);
    // Do not hold the event loop open purely for the auth window.
    timer.unref?.();

    server.on("error", (err) => {
      notReady(err);
      finish(err);
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port =
        addr && typeof addr === "object" && "port" in addr ? addr.port : 0;
      if (!port) {
        notReady(new Error("could not bind a loopback port for the redirect"));
        return;
      }
      ready({ port, result, close });
    });
  });
}

/** Loopback callback URL used as `callback_url` on the authorize request. */
export function loopbackCallbackUrl(
  port: number,
  callbackPath = "/cb",
): string {
  return `http://127.0.0.1:${port}${callbackPath}`;
}

export interface LoopbackLogin extends LoopbackReceiver {
  /** Ready to paste into `buildAuthorizeUrl({ callbackUrl })`. */
  callbackUrl: string;
}

/**
 * Bind the loopback receiver for a specific PKCE attempt: the port is known
 * before the authorize URL is built, and the state the socket will accept is
 * the attempt's state — one call, so they cannot drift apart.
 */
export async function openLoopback(
  attempt: PkceAttempt,
  opts?: { timeoutMs?: number; callbackPath?: string },
): Promise<LoopbackLogin> {
  const callbackPath = opts?.callbackPath ?? "/cb";
  const receiver = await startLoopbackReceiver({
    state: attempt.state,
    timeoutMs: opts?.timeoutMs,
    callbackPath,
  });
  return {
    ...receiver,
    callbackUrl: loopbackCallbackUrl(receiver.port, callbackPath),
  };
}

/**
 * Flow B: the consent screen displays the code and the user pastes it in.
 * `code_challenge_method=S256` is mandatory here — the endpoint answers 400 for
 * anything weaker.
 */
export const OUT_OF_BAND_CALLBACK = "oob";
