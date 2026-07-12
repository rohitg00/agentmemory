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
    enabled = true;
    logger.info("Sentry initialized", { environment: process.env.FLY_APP_NAME });
  } catch (err) {
    // Never let observability wiring take down the server.
    logger.warn("Sentry init skipped", {
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
  } catch {
    /* swallow — reporting must never throw into the caller */
  }
}

/** Report a thrown exception with context tags. */
export function captureException(
  err: unknown,
  ctx: Record<string, unknown>,
): void {
  if (!enabled) return;
  try {
    Sentry.captureException(err, {
      tags: { fn: "mem::summarize" },
      extra: ctx,
    });
  } catch {
    /* swallow */
  }
}
