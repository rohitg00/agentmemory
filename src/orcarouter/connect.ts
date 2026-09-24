// PKCE connect orchestration.
//
// The viewer GUI is a browser page, so the flow is split in two halves:
//
//   * the *preparation* half (verifier, challenge, state, loopback socket,
//     authorize URL) runs in the backend process, because the CSP forbids the
//     page from reaching `www.orcarouter.ai` and because the verifier must
//     never enter a browser;
//   * the *exchange* half also runs in the backend, and only a masked summary
//     ever travels back to the page.
//
// Both halves are wired to a monotonically increasing generation. Every async
// continuation re-checks that its generation is still current before touching
// credentials or state, so a slow response from attempt 3 cannot surface under
// attempt 4 — including the `finally` blocks, which must not clear the busy
// flag of a newer attempt.

import { type OrcaRouterOrigins, resolveOrigins } from "./origins.js";
import {
  type PkceAttempt,
  OrcaRouterAuthError,
  buildAuthorizeUrl,
  createPkceAttempt,
  exchangeCode,
  openLoopback,
  type LoopbackLogin,
} from "./pkce.js";
import {
  type OrcaRouterCredential,
  maskSecret,
  persistPkceCredential,
} from "./credentials.js";

/** Label shown on the consent screen. */
export const APP_NAME = "agentmemory";

/**
 * Guards the auth round-trip. Comfortably inside the 10 minute code TTL, and
 * short enough that an abandoned browser tab does not leave the UI busy.
 */
export const CONNECT_TIMEOUT_MS = 300_000;

export type ConnectPhase =
  | "idle"
  | "awaiting_browser"
  | "exchanging"
  | "succeeded"
  | "failed";

export interface ConnectStatusView {
  attemptId: string;
  phase: ConnectPhase;
  /** Present while `awaiting_browser`: hand this to the user's browser. */
  authorizeUrl?: string;
  /** Masked key summary after success — never the key. */
  credential?: {
    masked: string;
    userId?: string;
    scope?: string;
    origin: string;
  };
  /** Safe to display; never carries the verifier, code, or key. */
  error?: { kind: string; message: string; retryable: boolean };
  startedAt?: number;
  finishedAt?: number;
}

interface Attempt {
  id: string;
  generation: number;
  phase: ConnectPhase;
  pkce: PkceAttempt;
  origins: OrcaRouterOrigins;
  authorizeUrl?: string;
  receiver?: LoopbackLogin;
  error?: OrcaRouterAuthError;
  credential?: OrcaRouterCredential;
  startedAt: number;
  finishedAt?: number;
  timer?: NodeJS.Timeout;
  controller: AbortController;
  /** Resolves on success, rejects with the terminal auth error. */
  settled: Promise<OrcaRouterCredential>;
  resolveSettled?: (c: OrcaRouterCredential) => void;
  rejectSettled?: (e: OrcaRouterAuthError) => void;
}

let generationCounter = 0;
let active: Attempt | null = null;
const history = new Map<string, ConnectStatusView>();

function nextAttemptId(): string {
  generationCounter += 1;
  return `orca-${Date.now().toString(36)}-${generationCounter}`;
}

/** Test hook: forget every in-flight and completed attempt. */
export function __resetConnectState(): void {
  if (active?.receiver) active.receiver.close();
  if (active?.timer) clearTimeout(active.timer);
  active = null;
  history.clear();
  generationCounter = 0;
}

/** The attempt currently holding the login lock, if any. */
export function currentAttemptId(): string | null {
  return active?.id ?? null;
}

export function isBusy(): boolean {
  if (!active) return false;
  return active.phase === "awaiting_browser" || active.phase === "exchanging";
}

/** A snapshot safe to serialize to the browser. */
export function connectStatus(attemptId?: string): ConnectStatusView | null {
  const attempt = active && (!attemptId || active.id === attemptId) ? active : null;
  if (attempt) return viewOf(attempt);
  if (attemptId) return history.get(attemptId) ?? null;
  return null;
}

function viewOf(attempt: Attempt): ConnectStatusView {
  return {
    attemptId: attempt.id,
    phase: attempt.phase,
    authorizeUrl: attempt.authorizeUrl,
    credential: attempt.credential
      ? {
          masked: maskSecret(attempt.credential.apiKey),
          userId: attempt.credential.userId,
          scope: attempt.credential.scope,
          origin: attempt.credential.origin,
        }
      : undefined,
    error: attempt.error
      ? {
          kind: attempt.error.kind,
          message: attempt.error.message,
          retryable: attempt.error.retryable,
        }
      : undefined,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
  };
}

function remember(attempt: Attempt): ConnectStatusView {
  const view = viewOf(attempt);
  history.set(attempt.id, view);
  // Bound the history so a long-lived server does not accumulate attempts.
  if (history.size > 32) {
    const oldest = history.keys().next().value;
    if (oldest !== undefined) history.delete(oldest);
  }
  return view;
}

/**
 * Release the login lock for an attempt. Every terminal path goes through
 * here: success, denial, exchange error, timeout, explicit cancel, a provider
 * switch, and `pagehide`.
 *
 * Only the attempt that still owns the lock may release it — an older attempt
 * tearing down must not clear a newer attempt's busy state.
 */
export function finishAttempt(
  attemptId: string,
  error?: OrcaRouterAuthError,
): ConnectStatusView | null {
  const attempt = active && active.id === attemptId ? active : null;
  if (!attempt) return history.get(attemptId) ?? null;

  if (attempt.timer) clearTimeout(attempt.timer);
  attempt.controller.abort();
  attempt.receiver?.close();
  attempt.receiver = undefined;

  if (error) {
    attempt.error = error;
    attempt.phase = "failed";
  } else if (attempt.phase !== "succeeded") {
    // Finished without an error and without success means the caller
    // cancelled; surface that rather than leaving the attempt mid-flight.
    attempt.error = new OrcaRouterAuthError(
      "canceled",
      "The OrcaRouter connection was cancelled.",
    );
    attempt.phase = "failed";
  }
  attempt.finishedAt = Date.now();
  const view = remember(attempt);
  active = null;
  return view;
}

export interface StartConnectResult {
  attemptId: string;
  authorizeUrl: string;
  /** Where the code is delivered, for display when the browser does not open. */
  callbackUrl: string;
}

export interface StartConnectOptions {
  appName?: string;
  scope?: string;
  loginHint?: string;
  workspaceHint?: string;
  /** `consent` forces re-approval even for an already-approved app. */
  prompt?: string;
  timeoutMs?: number;
  /** Test seams. */
  origins?: OrcaRouterOrigins;
  fetchImpl?: typeof fetch;
}

/**
 * Begin a PKCE login: bind the loopback receiver, mint a fresh verifier, and
 * return the authorize URL for the caller to open.
 *
 * Starting a new attempt supersedes any attempt still in flight — the older
 * one is cancelled and can no longer mutate state, which is what makes
 * "switch authentication method mid-login" safe.
 */
export async function startConnect(
  opts: StartConnectOptions = {},
): Promise<StartConnectResult> {
  if (active) finishAttempt(active.id);

  const origins = opts.origins ?? resolveOrigins();
  const pkce = createPkceAttempt();
  const attemptId = nextAttemptId();
  const controller = new AbortController();

  let resolveSettled!: (c: OrcaRouterCredential) => void;
  let rejectSettled!: (e: OrcaRouterAuthError) => void;
  const settled = new Promise<OrcaRouterCredential>((res, rej) => {
    resolveSettled = res;
    rejectSettled = rej;
  });
  settled.catch(() => {});

  const receiver = await openLoopback(pkce, {
    timeoutMs: opts.timeoutMs ?? CONNECT_TIMEOUT_MS,
  });

  const attempt: Attempt = {
    id: attemptId,
    generation: generationCounter,
    phase: "awaiting_browser",
    pkce,
    origins,
    receiver,
    startedAt: Date.now(),
    controller,
    settled,
    resolveSettled,
    rejectSettled,
  };

  attempt.authorizeUrl = buildAuthorizeUrl({
    origins,
    attempt: pkce,
    appName: opts.appName ?? APP_NAME,
    callbackUrl: receiver.callbackUrl,
    scope: opts.scope ?? "api",
    loginHint: opts.loginHint,
    workspaceHint: opts.workspaceHint,
    prompt: opts.prompt,
  });

  active = attempt;
  remember(attempt);

  void completeConnect(attempt, opts);

  return {
    attemptId,
    authorizeUrl: attempt.authorizeUrl,
    callbackUrl: receiver.callbackUrl,
  };
}

/**
 * Wait for the redirect, exchange the code, persist the key.
 *
 * Every await is followed by a generation check: if a newer attempt has taken
 * the lock, this one returns without touching credentials or UI state.
 */
async function completeConnect(
  attempt: Attempt,
  opts: StartConnectOptions,
): Promise<void> {
  try {
    const code = await attempt.receiver!.result;
    if (!ownsLock(attempt)) return;

    attempt.phase = "exchanging";
    remember(attempt);

    const result = await exchangeCode({
      origins: attempt.origins,
      code,
      verifier: attempt.pkce.verifier,
      fetchImpl: opts.fetchImpl,
    });
    if (!ownsLock(attempt)) return;

    const credential = persistPkceCredential({
      apiKey: result.key,
      userId: result.userId,
      scope: result.scope,
    });
    if (!ownsLock(attempt)) return;

    attempt.credential = credential;
    attempt.phase = "succeeded";
    attempt.finishedAt = Date.now();
    remember(attempt);
    active = null;
    attempt.resolveSettled?.(credential);
  } catch (err) {
    if (!ownsLock(attempt)) return;
    const authError =
      err instanceof OrcaRouterAuthError
        ? err
        : new OrcaRouterAuthError(
            "network",
            "The OrcaRouter connection could not be completed. Start it again.",
          );
    attempt.error = authError;
    attempt.phase = "failed";
    attempt.finishedAt = Date.now();
    remember(attempt);
    active = null;
    attempt.rejectSettled?.(authError);
  } finally {
    if (attempt.timer) clearTimeout(attempt.timer);
    attempt.receiver?.close();
    attempt.receiver = undefined;
    // Deliberately no UI mutation here. A superseded attempt's `finally` must
    // not clear a newer attempt's busy flag; `pagehide` and `close` handle
    // their own synchronous cleanup for exactly this reason.
  }
}

function ownsLock(attempt: Attempt): boolean {
  return active !== null && active.id === attempt.id;
}

/**
 * Await one attempt's outcome.
 *
 * Rejects with the terminal `OrcaRouterAuthError` for denial, state mismatch,
 * timeout, cancellation, a rejected code, and transport failure alike, so the
 * CLI can report the reason and exit cleanly instead of hanging.
 */
export function waitForConnect(
  attemptId: string,
): Promise<OrcaRouterCredential> {
  const attempt = active && active.id === attemptId ? active : null;
  if (attempt) return attempt.settled;
  // Already finished: replay the recorded outcome rather than hanging on a
  // promise whose attempt is gone.
  const view = history.get(attemptId);
  if (view?.phase === "succeeded" && view.credential) {
    return Promise.resolve({
      apiKey: "",
      origin: "pkce",
      status: "ok",
      generation: 0,
      userId: view.credential.userId,
      scope: view.credential.scope,
    });
  }
  if (view?.error) {
    return Promise.reject(
      new OrcaRouterAuthError(
        view.error.kind as OrcaRouterAuthError["kind"],
        view.error.message,
      ),
    );
  }
  return Promise.reject(
    new OrcaRouterAuthError(
      "canceled",
      "That OrcaRouter connection attempt is no longer active.",
    ),
  );
}

/**
 * The browser is going away (`pagehide`, `beforeunload`) or the page is
 * unmounting.
 *
 * Synchronously releases the lock so a back-forward-cache restore does not
 * come back to a permanently busy UI, and aborts the in-flight exchange so the
 * server stops working on an attempt nobody is waiting for.
 */
export function cancelConnect(attemptId?: string): boolean {
  const target = attemptId ?? active?.id;
  if (!target) return false;
  const view = finishAttempt(target);
  return view !== null;
}
