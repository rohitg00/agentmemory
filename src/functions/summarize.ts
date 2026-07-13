import type { ISdk } from "iii-sdk";
import type {
  CompressedObservation,
  SessionSummary,
  MemoryProvider,
  Session,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import {
  SUMMARY_SYSTEM,
  buildSummaryPrompt,
  REDUCE_SYSTEM,
  buildReducePrompt,
} from "../prompts/summary.js";
import { getXmlTag, getXmlChildren } from "../prompts/xml.js";
import { SummaryOutputSchema } from "../eval/schemas.js";
import { validateOutput } from "../eval/validator.js";
import { scoreSummary } from "../eval/quality.js";
import type { MetricsStore } from "../eval/metrics-store.js";
import { safeAudit } from "./audit.js";
import { logger } from "../logger.js";
import {
  captureFailure,
  captureException as captureSummarizeException,
} from "../observability/sentry.js";

// Per-chunk observation budget when a session is too large to fit in one
// LLM call. Default ≈ 50k input tokens per chunk at ~110 tok/obs — fits
// comfortably in 128k-window models. Override via SUMMARIZE_CHUNK_SIZE.
const CHUNK_SIZE_DEFAULT = 400;
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
// processed. CHUNK_MAP_PHASE_DEADLINE_MS (in produceSummaryXml, enforced
// via ChunkPartialCache.deadlineAt — a single absolute deadline set once
// and shared across every top-level retry attempt, NOT recomputed fresh
// per attempt) is the actual enforcement: it stops starting new batches
// once the map phase is close to that deadline, so the failure mode is a
// graceful partial skip (subject to MAX_SKIP_RATIO below) rather than a
// silent hard timeout with no summary stored at all.
const CHUNK_CONCURRENCY_DEFAULT = 6;
// Bail on the merged summary if more than this fraction of chunks fail
// to parse — a half-blind narrative is worse than a clean error.
const MAX_SKIP_RATIO = 0.5;

// Shared env-int parser for the four knobs below: reads `name`, falls back to
// `defaultValue` on missing/non-numeric/non-positive input, and — when `max`
// is given — clamps the result so an operator can't set a retry-count knob
// high enough to blow past the amplification budget the ceiling was chosen
// to protect (see MAX_ATTEMPTS_CEILING below).
function getEnvInt(name: string, defaultValue: number, max?: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return max !== undefined ? Math.min(n, max) : n;
}

function getChunkSize(): number {
  return getEnvInt("SUMMARIZE_CHUNK_SIZE", CHUNK_SIZE_DEFAULT);
}

function getChunkConcurrency(): number {
  return getEnvInt("SUMMARIZE_CHUNK_CONCURRENCY", CHUNK_CONCURRENCY_DEFAULT);
}

// Ceiling for both retry-count knobs below. Top-level attempts and
// per-chunk attempts stack multiplicatively (a chunk can be retried
// getChunkMaxAttempts() times *within* each of getMaxAttempts() top-level
// attempts), so an unbounded env override could amplify load far beyond
// what the concurrency/timeout budget in produceSummaryXml assumes.
const MAX_ATTEMPTS_CEILING = 5;

// Attempts for the top-level produce-and-parse loop. Default 3 (was a hard 2):
// most counted failures are empty_provider_response / parse_failed from an LLM
// that intermittently returns empty or unparseable structured output, and a
// third roll-of-the-dice recovers a meaningful fraction. Override via
// SUMMARIZE_MAX_ATTEMPTS (clamped to MAX_ATTEMPTS_CEILING).
const MAX_ATTEMPTS_DEFAULT = 3;
function getMaxAttempts(): number {
  return getEnvInt("SUMMARIZE_MAX_ATTEMPTS", MAX_ATTEMPTS_DEFAULT, MAX_ATTEMPTS_CEILING);
}

// Attempts for a single chunk call in chunked (large-session) mode. Default 3
// (was a hard 2). Kept as a SEPARATE knob from SUMMARIZE_MAX_ATTEMPTS because
// chunk retries multiply across every chunk AND every concurrency slot, so a
// large session under provider throttling can amplify load fast — tune this
// down (or leave at the skip-ratio-protected default) independently of the
// cheap top-level retry. Override via SUMMARIZE_CHUNK_MAX_ATTEMPTS (clamped
// to MAX_ATTEMPTS_CEILING).
const CHUNK_MAX_ATTEMPTS_DEFAULT = 3;
function getChunkMaxAttempts(): number {
  return getEnvInt("SUMMARIZE_CHUNK_MAX_ATTEMPTS", CHUNK_MAX_ATTEMPTS_DEFAULT, MAX_ATTEMPTS_CEILING);
}

// Exponential backoff with jitter between retry attempts (chunk-level and
// top-level). Keeps a chunk/summary retry from hammering an already-failing
// provider immediately, while staying small enough that even
// MAX_ATTEMPTS_CEILING attempts stay well inside iii's 180s invocation
// timeout (index.ts: invocationTimeoutMs).
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 2000;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// attempt is 1-indexed (the attempt that just failed); returns the delay
// before the next attempt, jittered to 50-100% of the exponential value so
// concurrent chunk retries don't all wake up and re-hit the provider at once.
function backoffDelayMs(attempt: number): number {
  const exp = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  return exp / 2 + Math.random() * (exp / 2);
}

// One chunk call, retried up to getChunkMaxAttempts() times (default 3).
// Returns null when all attempts fail —
// whether by parse failure, provider 4xx (content rejected by upstream
// filters), or transient network/5xx errors that didn't recover on retry.
// All failure modes are equivalent at this layer: the chunk is unusable,
// skip it and let the caller decide via the skip-ratio bailout whether
// the overall summary is still trustworthy. Errors that affect every
// chunk (auth, model down) will trip the bailout naturally.
async function summarizeChunkWithRetry(
  provider: MemoryProvider,
  chunk: CompressedObservation[],
  sessionId: string,
  project: string,
  idx: number,
  total: number,
): Promise<SessionSummary | null> {
  const maxAttempts = getChunkMaxAttempts();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const xml = await provider.summarize(
        SUMMARY_SYSTEM,
        buildSummaryPrompt(chunk),
      );
      const parsed = parseSummaryXml(xml, sessionId, project, chunk.length);
      if (parsed) return parsed;
      logger.warn("Summarize chunk parse failed", {
        sessionId,
        chunk: `${idx + 1}/${total}`,
        attempt,
      });
    } catch (err) {
      logger.warn("Summarize chunk LLM call failed", {
        sessionId,
        chunk: `${idx + 1}/${total}`,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (attempt < maxAttempts) {
      await sleep(backoffDelayMs(attempt));
    }
  }
  return null;
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
// subject to the existing MAX_SKIP_RATIO bailout below, instead of a
// silent hard timeout.
const CHUNK_MAP_PHASE_DEADLINE_MS = 150_000;

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
interface ChunkPartialCache {
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

// Returns the final summary XML string. For sessions ≤ chunk size, this is
// a single LLM call (legacy behavior). For larger sessions, observations
// are split into chunks processed in parallel batches, each chunk retried
// with backoff on parse/call failure, persistently-bad chunks skipped, and
// remaining partials merged via a reduce call. `cache` persists resolved
// chunk partials across top-level retry attempts (see ChunkPartialCache).
async function produceSummaryXml(
  provider: MemoryProvider,
  compressed: CompressedObservation[],
  sessionId: string,
  project: string,
  cache: ChunkPartialCache,
): Promise<{
  response: string;
  mode: "single" | "chunked";
  chunks: number;
  skipped?: number;
}> {
  const chunkSize = getChunkSize();
  if (compressed.length <= chunkSize) {
    const response = await provider.summarize(
      SUMMARY_SYSTEM,
      buildSummaryPrompt(compressed),
    );
    return { response, mode: "single", chunks: 1 };
  }

  if (cache.chunks.length === 0) {
    for (let i = 0; i < compressed.length; i += chunkSize) {
      cache.chunks.push(compressed.slice(i, i + chunkSize));
    }
    // Sparse array preserves chunk → index mapping after parallel
    // resolution, so the reduce step sees partials in chronological
    // order even when some were skipped. `undefined` = not yet attempted.
    cache.partialByIdx = new Array(cache.chunks.length).fill(undefined);
  }
  const { chunks, partialByIdx } = cache;
  const concurrency = getChunkConcurrency();

  const pendingIdx = partialByIdx
    .map((p, idx) => (p === undefined ? idx : -1))
    .filter((idx) => idx >= 0);

  if (pendingIdx.length > 0) {
    logger.info("Summarize chunking session", {
      sessionId,
      chunks: chunks.length,
      chunkSize,
      concurrency,
      totalObservations: compressed.length,
      pendingChunks: pendingIdx.length,
    });

    if (cache.deadlineAt === undefined) {
      cache.deadlineAt = Date.now() + CHUNK_MAP_PHASE_DEADLINE_MS;
    }
    for (let batchStart = 0; batchStart < pendingIdx.length; batchStart += concurrency) {
      if (Date.now() > cache.deadlineAt) {
        logger.warn("Summarize chunk map-phase deadline reached, skipping remaining chunks", {
          sessionId,
          remaining: pendingIdx.length - batchStart,
          total: chunks.length,
        });
        break; // remaining stay `undefined` -> counted as skipped below
      }
      const batchIdx = pendingIdx.slice(batchStart, batchStart + concurrency);
      await Promise.all(
        batchIdx.map(async (idx) => {
          partialByIdx[idx] = await summarizeChunkWithRetry(
            provider,
            chunks[idx],
            sessionId,
            project,
            idx,
            chunks.length,
          );
        }),
      );
    }
  }

  // `== null` catches both `null` (exhausted retries) and `undefined`
  // (deadline-skipped, never attempted) — both count as unusable.
  const skipped = partialByIdx.filter((p) => p == null).length;
  const partials = partialByIdx.filter((p): p is SessionSummary => p != null);

  if (skipped > Math.floor(chunks.length * MAX_SKIP_RATIO)) {
    throw new Error(
      `too_many_chunks_skipped: ${skipped}/${chunks.length} chunks failed to parse after retry`,
    );
  }
  if (skipped > 0) {
    logger.warn("Summarize chunks partially skipped", {
      sessionId,
      skipped,
      total: chunks.length,
    });
  }

  const reduceInput = partials.map((p) => {
    const originalIdx = partialByIdx.indexOf(p);
    return {
      title: p.title,
      narrative: p.narrative,
      keyDecisions: p.keyDecisions,
      filesModified: p.filesModified,
      concepts: p.concepts,
      obsRangeStart: originalIdx * chunkSize + 1,
      obsRangeEnd: Math.min((originalIdx + 1) * chunkSize, compressed.length),
    };
  });
  const response = await provider.summarize(
    REDUCE_SYSTEM,
    buildReducePrompt(reduceInput),
  );
  return { response, mode: "chunked", chunks: chunks.length, skipped };
}

// #783: many LLMs (DeepSeek, GPT variants, some Anthropic responses)
// wrap structured XML in markdown code fences or add conversational
// text before/after. Strip those wrappers before the tag regex so a
// well-formed summary doesn't get silently dropped as parse_failed.
function stripXmlWrappers(raw: string): string {
  if (!raw) return "";
  let cleaned = raw.trim();
  // ```xml ... ``` or ``` ... ``` fences (anywhere in the payload).
  cleaned = cleaned.replace(/```\s*xml\s*\n?/gi, "");
  cleaned = cleaned.replace(/```/g, "");
  cleaned = cleaned.trim();
  // If preamble / postamble surrounds the XML root, peel it off.
  const rootMatch = cleaned.match(
    /(<[a-zA-Z_][a-zA-Z0-9_-]*>[\s\S]*<\/[a-zA-Z_][a-zA-Z0-9_-]*>)/,
  );
  if (rootMatch && rootMatch[1]) return rootMatch[1].trim();
  return cleaned;
}

function parseSummaryXml(
  xml: string,
  sessionId: string,
  project: string,
  obsCount: number,
): SessionSummary | null {
  const cleaned = stripXmlWrappers(xml);
  const title = getXmlTag(cleaned, "title");
  if (!title) return null;

  return {
    sessionId,
    project,
    createdAt: new Date().toISOString(),
    title,
    narrative: getXmlTag(cleaned, "narrative"),
    keyDecisions: getXmlChildren(cleaned, "decisions", "decision"),
    filesModified: getXmlChildren(cleaned, "files", "file"),
    concepts: getXmlChildren(cleaned, "concepts", "concept"),
    observationCount: obsCount,
  };
}

export function registerSummarizeFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
  metricsStore?: MetricsStore,
): void {
  sdk.registerFunction("mem::summarize", 
    async (data: { sessionId: string } | undefined) => {
      const startMs = Date.now();
      if (!data || typeof data.sessionId !== "string" || !data.sessionId.trim()) {
        return { success: false, error: "sessionId is required" };
      }
      const sessionId = data.sessionId.trim();

      const session = await kv.get<Session>(KV.sessions, sessionId);
      if (!session) {
        logger.warn("Session not found for summarize", {
          sessionId,
        });
        return { success: false, error: "session_not_found" };
      }

      const observations = await kv.list<CompressedObservation>(
        KV.observations(sessionId),
      );
      const compressed = observations.filter((o) => o.title);

      if (compressed.length === 0) {
        logger.info("No observations to summarize", {
          sessionId,
        });
        return { success: false, error: "no_observations" };
      }

      if (provider.name === "noop") {
        logger.info("Summarize skipped — no LLM provider configured", {
          sessionId,
        });
        return {
          success: false,
          error: "no_provider",
          reason:
            "No LLM provider key set; Summarize is a no-op. Set ANTHROPIC_API_KEY (or GEMINI/OPENROUTER/MINIMAX) in ~/.agentmemory/.env to enable.",
        };
      }

      try {
        // #783: chunk-level produceSummaryXml retries internally, but
        // the final merge used to parse once and bail. Wrap the
        // produce-and-parse pair in a retry loop (getMaxAttempts(), was
        // hard-coded 2) so a markdown-wrapped or otherwise wrapped
        // response gets another roll-of-the-dice instead of dropping the
        // summary. `chunkCache` persists resolved chunk partials across
        // attempts so a retry only re-runs the failed reduce/merge step,
        // not every chunk from scratch (see ChunkPartialCache).
        let summary: SessionSummary | null = null;
        let response = "";
        let mode = "single";
        let chunks = 1;
        // Per-attempt outcome tracking (not just the final attempt's
        // state) so failure classification below reflects what actually
        // happened across the whole retry loop, not whichever attempt
        // happened to run last.
        let sawEmptyResponse = false;
        let sawParseFailure = false;
        const chunkCache: ChunkPartialCache = { chunks: [], partialByIdx: [], deadlineAt: undefined };
        const maxAttempts = getMaxAttempts();
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const produced = await produceSummaryXml(
            provider,
            compressed,
            sessionId,
            session.project,
            chunkCache,
          );
          response = produced.response;
          mode = produced.mode;
          chunks = produced.chunks;
          if (!response || !response.trim()) {
            sawEmptyResponse = true;
            logger.warn("Empty provider response on summarize", {
              sessionId,
              provider: provider.name,
              mode,
              chunks,
              observationCount: compressed.length,
              attempt,
            });
            if (attempt < maxAttempts) await sleep(backoffDelayMs(attempt));
            continue;
          }
          summary = parseSummaryXml(
            response,
            sessionId,
            session.project,
            compressed.length,
          );
          if (summary) break;
          sawParseFailure = true;
          logger.warn("Failed to parse summary XML", { sessionId, attempt });
          if (attempt < maxAttempts) await sleep(backoffDelayMs(attempt));
        }

        if (!summary) {
          const latencyMs = Date.now() - startMs;
          if (metricsStore) {
            await metricsStore.record("mem::summarize", latencyMs, false);
          }
          // Prefer parse_failed when both occurred across attempts: a
          // response that came back non-empty but unparseable is more
          // diagnostic than a later attempt's empty response, and
          // classifying on only the last attempt's state (the pre-fix
          // behavior) could silently misattribute a real parse issue as
          // "no response at all" whenever the final retry happened to
          // return empty.
          const failureCode = sawParseFailure ? "parse_failed" : "empty_provider_response";
          captureFailure(failureCode, {
            sessionId,
            provider: provider.name,
            mode,
            chunks,
            observationCount: compressed.length,
            attempts: maxAttempts,
            sawEmptyResponse,
            sawParseFailure,
            latencyMs,
          });
          return { success: false, error: failureCode };
        }

        const summaryForValidation = {
          title: summary.title,
          narrative: summary.narrative,
          keyDecisions: summary.keyDecisions,
          filesModified: summary.filesModified,
          concepts: summary.concepts,
        };
        const validation = validateOutput(
          SummaryOutputSchema,
          summaryForValidation,
          "mem::summarize",
        );

        if (!validation.valid) {
          const latencyMs = Date.now() - startMs;
          if (metricsStore) {
            await metricsStore.record("mem::summarize", latencyMs, false);
          }
          logger.warn("Summary validation failed", {
            sessionId,
            errors: validation.result.errors,
          });
          // Forward only the field path (e.g. "title", "keyDecisions.0"),
          // not the free-text Zod message — today's SummaryOutputSchema
          // only has structural constraints so the messages happen to be
          // content-free, but that's incidental to the schema, not
          // guaranteed by this call site. A future schema field (an enum,
          // a .refine() with a value-echoing template) could start
          // leaking real content through an unchanged capture call.
          const errorPaths = validation.result.errors.map((e) => e.split(":")[0]);
          captureFailure("validation_failed", {
            sessionId,
            provider: provider.name,
            mode,
            observationCount: compressed.length,
            errorPaths,
            errorCount: validation.result.errors.length,
            latencyMs,
          });
          return { success: false, error: "validation_failed" };
        }

        const qualityScore = scoreSummary(summaryForValidation);

        await kv.set(KV.summaries, sessionId, summary);
        await safeAudit(kv, "compress", "mem::summarize", [sessionId], {
          title: summary.title,
          observationCount: compressed.length,
        });

        const latencyMs = Date.now() - startMs;
        if (metricsStore) {
          await metricsStore.record(
            "mem::summarize",
            latencyMs,
            true,
            qualityScore,
          );
        }

        logger.info("Session summarized", {
          sessionId,
          title: summary.title,
          decisions: summary.keyDecisions.length,
          qualityScore,
          valid: validation.valid,
        });

        return { success: true, summary, qualityScore };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const latencyMs = Date.now() - startMs;
        if (metricsStore) {
          await metricsStore.record("mem::summarize", latencyMs, false);
        }
        logger.error("Summarize failed", {
          sessionId,
          error: msg,
        });
        captureSummarizeException(err, {
          sessionId,
          provider: provider.name,
          observationCount: compressed.length,
          latencyMs,
        });
        return { success: false, error: msg };
      }
    },
  );
}
