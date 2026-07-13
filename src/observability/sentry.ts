// Optional Sentry error reporting.
//
// Rationale (fork patch): mem::summarize failures — empty_provider_response,
// parse_failed, validation_failed, and thrown provider errors — were only
// written to the structured logger, so they never surfaced in Sentry even
// when the SDK was available. This module wires those failure sites into
// Sentry *without* making Sentry mandatory: it is a hard no-op unless
// SENTRY_DSN is set, so builds, tests, and deploys that don't configure a
// DSN are completely unaffected.
import * as Sentry from "@sentry/node";
import { logger } from "../logger.js";

let enabled = false;

/**
 * Whether Sentry reporting is actually active (SENTRY_DSN was set AND
 * Sentry.init() took effect — see the isInitialized() check in initSentry()
 * below). Exposed so a health check or deploy-verification script can
 * confirm error reporting is live without tailing boot logs.
 */
export function isSentryEnabled(): boolean {
  return enabled;
}

/** Initialize Sentry once at process startup. No-op unless SENTRY_DSN is set. */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      environment:
        process.env.FLY_APP_NAME || process.env.NODE_ENV || "production",
      release: process.env.AGENTMEMORY_COMMIT_SHA || undefined,
    });
    // Sentry.init() silently no-ops on a malformed DSN (invalid host,
    // wrong project id, etc.) rather than throwing — without checking
    // isInitialized() we'd log "initialized" success on a DSN that will
    // drop every event.
    if (!Sentry.isInitialized()) {
      logger.warn("Sentry init did not take effect — check SENTRY_DSN format", {
        environment: process.env.FLY_APP_NAME,
      });
      return;
    }
    enabled = true;
    logger.info("Sentry initialized", { environment: process.env.FLY_APP_NAME });
  } catch (err) {
    // Never let observability wiring take down the server.
    logger.warn("Sentry init skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Flush buffered events before process exit. No-op if never initialized. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch (err) {
    logger.warn("Sentry flush failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Report a handled failure (non-throwing error path) as a warning. */
export function captureFailure(
  code: string,
  ctx: Record<string, unknown>,
): void {
  if (!enabled) return;
  try {
    Sentry.captureMessage(`mem::summarize:${code}`, {
      level: "warning",
      tags: { fn: "mem::summarize", code },
      extra: ctx,
    });
  } catch (err) {
    // Reporting must never throw into the caller, but a swallowed SDK
    // error should still be visible locally instead of vanishing.
    logger.warn("Sentry captureMessage failed", {
      code,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Sentry.captureException auto-serializes err.message/stack into the
// event sent to the third-party SaaS. Call sites are expected to throw
// content-free messages (see src/providers/*.ts), but this is a second,
// defense-in-depth layer: cap whatever message reaches here so a future
// call site that slips up leaks at most a bounded fragment, not an
// unbounded provider response/session-content string.
const MAX_CAPTURED_MESSAGE_LEN = 300;
function toSafeError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error("non_error_thrown");
  const safe = new Error(
    err.message.length > MAX_CAPTURED_MESSAGE_LEN
      ? `${err.message.slice(0, MAX_CAPTURED_MESSAGE_LEN)}… [truncated]`
      : err.message,
  );
  safe.name = err.name;
  // Copied verbatim: V8's default stack-trace header embeds the ORIGINAL
  // (untruncated) message, so in principle this could reintroduce content
  // truncation is meant to bound. Verified against the installed
  // @sentry/node@10.65.0 stack parser (node_modules/@sentry/core's
  // stacktrace builder): it explicitly skips the header line and reads
  // the event's message from err.message (already truncated above), not
  // from the stack string. This is an SDK-internal behavior, not a
  // documented contract -- re-verify if @sentry/node's major version
  // changes.
  safe.stack = err.stack;
  return safe;
}

/** Report a thrown exception with context tags. */
export function captureException(
  err: unknown,
  ctx: Record<string, unknown>,
): void {
  if (!enabled) return;
  try {
    Sentry.captureException(toSafeError(err), {
      tags: { fn: "mem::summarize" },
      extra: ctx,
    });
  } catch (sdkErr) {
    logger.warn("Sentry captureException failed", {
      error: sdkErr instanceof Error ? sdkErr.message : String(sdkErr),
    });
  }
}
