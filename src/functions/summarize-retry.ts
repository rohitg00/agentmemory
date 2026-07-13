// Retry/backoff/env-config machinery for mem::summarize, split out of
// summarize.ts to keep that file focused on chunk splitting, XML parsing,
// and function registration. Everything here is about HOW MANY times to
// retry, HOW LONG to wait between attempts, and WHAT STATE persists across
// attempts — not about summarizing content itself.
import type { CompressedObservation, SessionSummary } from "../types.js";

// Per-chunk observation budget when a session is too large to fit in one
// LLM call. Default ≈ 50k input tokens per chunk at ~110 tok/obs — fits
// comfortably in 128k-window models. Override via SUMMARIZE_CHUNK_SIZE.
export const CHUNK_SIZE_DEFAULT = 400;
// Concurrent in-flight chunk calls. 6 keeps a 100-chunk session's happy
// path (~8s/call, no retries) comfortably under iii's 180s
// function-invocation timeout while staying inside generous-but-not-
// unlimited provider rate limits (well below OpenAI free tier's 500
// RPM). High-throughput providers (Novita / DeepInfra / DeepSeek)
// typically allow 100+ concurrent — set SUMMARIZE_CHUNK_CONCURRENCY
// higher to cover ~1000+ chunk sessions.
//
// This does NOT bound the worst case on its own: with chunk attempts at
// their MAX_ATTEMPTS_CEILING and backoff between them, a single batch of
// unlucky chunks can take well over a minute, and a long run of bad
// batches could still exceed the 180s timeout before every chunk is
// processed. CHUNK_MAP_PHASE_DEADLINE_MS (enforced via
// ChunkPartialCache.deadlineAt — a single absolute deadline set once and
// shared across every top-level retry attempt, NOT recomputed fresh per
// attempt) is the actual enforcement: it stops starting new batches once
// the map phase is close to that deadline, so the failure mode is a
// graceful partial skip (subject to MAX_SKIP_RATIO below) rather than a
// silent hard timeout with no summary stored at all.
export const CHUNK_CONCURRENCY_DEFAULT = 6;
// Bail on the merged summary if more than this fraction of chunks fail
// to parse — a half-blind narrative is worse than a clean error.
export const MAX_SKIP_RATIO = 0.5;

// Shared env-int parser for the four knobs below: reads `name`, falls back to
// `defaultValue` on missing/non-numeric/non-positive input, and — when `max`
// is given — clamps the result so an operator can't set a retry-count knob
// high enough to blow past the amplification budget the ceiling was chosen
// to protect (see MAX_ATTEMPTS_CEILING below).
export function getEnvInt(name: string, defaultValue: number, max?: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return max !== undefined ? Math.min(n, max) : n;
}

export function getChunkSize(): number {
  return getEnvInt("SUMMARIZE_CHUNK_SIZE", CHUNK_SIZE_DEFAULT);
}

export function getChunkConcurrency(): number {
  return getEnvInt("SUMMARIZE_CHUNK_CONCURRENCY", CHUNK_CONCURRENCY_DEFAULT);
}

// Ceiling for both retry-count knobs below. Top-level attempts and
// per-chunk attempts stack multiplicatively (a chunk can be retried
// getChunkMaxAttempts() times *within* each of getMaxAttempts() top-level
// attempts), so an unbounded env override could amplify load far beyond
// what the concurrency/timeout budget in produceSummaryXml assumes.
export const MAX_ATTEMPTS_CEILING = 5;

// Attempts for the top-level produce-and-parse loop. Default 3 (was a hard 2):
// most counted failures are empty_provider_response / parse_failed from an LLM
// that intermittently returns empty or unparseable structured output, and a
// third roll-of-the-dice recovers a meaningful fraction. Override via
// SUMMARIZE_MAX_ATTEMPTS (clamped to MAX_ATTEMPTS_CEILING).
export const MAX_ATTEMPTS_DEFAULT = 3;
export function getMaxAttempts(): number {
  return getEnvInt("SUMMARIZE_MAX_ATTEMPTS", MAX_ATTEMPTS_DEFAULT, MAX_ATTEMPTS_CEILING);
}

// Attempts for a single chunk call in chunked (large-session) mode. Default 3
// (was a hard 2). Kept as a SEPARATE knob from SUMMARIZE_MAX_ATTEMPTS because
// chunk retries multiply across every chunk AND every concurrency slot, so a
// large session under provider throttling can amplify load fast — tune this
// down (or leave at the skip-ratio-protected default) independently of the
// cheap top-level retry. Override via SUMMARIZE_CHUNK_MAX_ATTEMPTS (clamped
// to MAX_ATTEMPTS_CEILING).
export const CHUNK_MAX_ATTEMPTS_DEFAULT = 3;
export function getChunkMaxAttempts(): number {
  return getEnvInt("SUMMARIZE_CHUNK_MAX_ATTEMPTS", CHUNK_MAX_ATTEMPTS_DEFAULT, MAX_ATTEMPTS_CEILING);
}

// Exponential backoff with jitter between retry attempts (chunk-level and
// top-level). Keeps a chunk/summary retry from hammering an already-failing
// provider immediately, while staying small enough that even
// MAX_ATTEMPTS_CEILING attempts stay well inside iii's 180s invocation
// timeout (index.ts: invocationTimeoutMs).
export const RETRY_BASE_DELAY_MS = 200;
export const RETRY_MAX_DELAY_MS = 2000;
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// attempt is 1-indexed (the attempt that just failed); returns the delay
// before the next attempt, jittered to 50-100% of the exponential value so
// concurrent chunk retries don't all wake up and re-hit the provider at once.
export function backoffDelayMs(attempt: number): number {
  const exp = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  return exp / 2 + Math.random() * (exp / 2);
}

// Soft deadline for the chunk map-phase (a single produceSummaryXml call),
// leaving margin under iii's 180s invocation timeout (index.ts:
// invocationTimeoutMs). With chunk attempts bumped 2->3 (default) and
// backoff between them, a chunk that exhausts every attempt under real
// provider latency can now cost tens of seconds rather than ~16s, and
// that cost is paid per BATCH (Promise.all across concurrency chunks),
// not per chunk — so a long run of bad batches could otherwise blow the
// invocation timeout with no summary stored at all. Stopping new batches
// once the deadline is close turns that into a graceful partial skip
// subject to the existing MAX_SKIP_RATIO bailout, instead of a silent
// hard timeout.
export const CHUNK_MAP_PHASE_DEADLINE_MS = 150_000;

// Cache of chunk-splitting + resolved partials, created once per
// mem::summarize invocation (registerSummarizeFunction) and threaded
// through every top-level retry attempt of produceSummaryXml. Without
// this, each top-level retry re-ran EVERY chunk from scratch — including
// chunks that had already parsed successfully — even though top-level
// retries are only needed because the final reduce/merge step failed to
// parse or returned empty. `partialByIdx[i] === undefined` means "not yet
// attempted"; `null` means "attempted, exhausted retries, gave up";
// anything else is a resolved partial. Only `single` mode (no chunking)
// has nothing to cache, since there the "map" and "reduce" are the same
// one call.
export interface ChunkPartialCache {
  chunks: CompressedObservation[][];
  partialByIdx: Array<SessionSummary | null | undefined>;
  // Absolute deadline (Date.now()-comparable) for the WHOLE invocation's map
  // phase, set once on first use and shared across every top-level retry
  // attempt via this same cache object. Deliberately NOT recomputed as
  // `Date.now() + CHUNK_MAP_PHASE_DEADLINE_MS` on each produceSummaryXml
  // call — that reset the budget on every attempt, so up to
  // MAX_ATTEMPTS_CEILING attempts could each burn close to the full
  // deadline and blow past iii's 180s invocation timeout in aggregate,
  // reproducing the exact silent-hard-timeout failure this deadline exists
  // to prevent.
  deadlineAt: number | undefined;
}
