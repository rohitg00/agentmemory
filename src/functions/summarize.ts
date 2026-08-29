import type { ISdk } from "iii-sdk";
import { createHash } from "node:crypto";
import type {
  CompressedObservation,
  SessionSummary,
  MemoryProvider,
  Session,
} from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { withKeyedLock, sessionWriteLockKey } from "../state/keyed-mutex.js";
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

// Per-chunk observation budget when a session is too large to fit in one
// LLM call. Default ≈ 50k input tokens per chunk at ~110 tok/obs — fits
// comfortably in 128k-window models. Override via SUMMARIZE_CHUNK_SIZE.
const CHUNK_SIZE_DEFAULT = 400;
// Concurrent in-flight chunk calls. 6 keeps a 100-chunk session under
// iii's 180s function-invocation timeout at ~8s/call while staying
// inside generous-but-not-unlimited provider rate limits (well below
// OpenAI free tier's 500 RPM). High-throughput providers
// (Novita / DeepInfra / DeepSeek) typically allow 100+ concurrent — set
// SUMMARIZE_CHUNK_CONCURRENCY higher to cover ~1000+ chunk sessions.
const CHUNK_CONCURRENCY_DEFAULT = 6;
// Bail on the merged summary if more than this fraction of chunks fail
// to parse — a half-blind narrative is worse than a clean error.
const MAX_SKIP_RATIO = 0.5;

function getChunkSize(): number {
  const raw = process.env.SUMMARIZE_CHUNK_SIZE;
  if (!raw) return CHUNK_SIZE_DEFAULT;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : CHUNK_SIZE_DEFAULT;
}

function getChunkConcurrency(): number {
  const raw = process.env.SUMMARIZE_CHUNK_CONCURRENCY;
  if (!raw) return CHUNK_CONCURRENCY_DEFAULT;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : CHUNK_CONCURRENCY_DEFAULT;
}

// One chunk call with retry-once. Returns null when both attempts fail —
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
  for (let attempt = 1; attempt <= 2; attempt++) {
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
  }
  return null;
}

// Returns the final summary XML string. For sessions ≤ chunk size, this is
// a single LLM call (legacy behavior). For larger sessions, observations
// are split into chunks processed in parallel batches, each chunk retried
// once on parse failure, persistently-bad chunks skipped, and remaining
// partials merged via a reduce call.
async function produceSummaryXml(
  provider: MemoryProvider,
  kv: StateKV,
  compressed: CompressedObservation[],
  sessionId: string,
  project: string,
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

  const chunks: CompressedObservation[][] = [];
  for (let i = 0; i < compressed.length; i += chunkSize) {
    chunks.push(compressed.slice(i, i + chunkSize));
  }
  const concurrency = getChunkConcurrency();
  logger.info("Summarize chunking session", {
    sessionId,
    chunks: chunks.length,
    chunkSize,
    concurrency,
    totalObservations: compressed.length,
  });

  // Sparse array preserves chunk → index mapping after parallel resolution,
  // so the reduce step sees partials in chronological order even when some
  // were skipped.
  const partialByIdx: Array<SessionSummary | null> = new Array(chunks.length).fill(null);
  for (let batchStart = 0; batchStart < chunks.length; batchStart += concurrency) {
    const batch = chunks.slice(batchStart, batchStart + concurrency);
    await Promise.all(
      batch.map(async (chunk, j) => {
        const idx = batchStart + j;
        // A full chunk is immutable once the session grows past it, so
        // only the trailing chunk misses.
        const chunkKey = chunkFingerprint(chunk);
        const cached = await kv
          .get<CachedChunkSummary>(KV.summaryChunks(sessionId), chunkKey)
          .catch(() => null);
        if (cached) {
          partialByIdx[idx] = cached.partial;
          return;
        }
        const partial = await summarizeChunkWithRetry(
          provider,
          chunk,
          sessionId,
          project,
          idx,
          chunks.length,
        );
        partialByIdx[idx] = partial;
        if (partial) {
          const entry: CachedChunkSummary = { chunkKey, partial };
          await kv
            .set(KV.summaryChunks(sessionId), chunkKey, entry)
            .catch(() => {});
        }
      }),
    );
  }

  // On a live session only the trailing chunk's membership changes turn
  // to turn, so each turn mints a new content-keyed entry and orphans the
  // previous turn's. Nothing else reclaims those - deleteSummaryChunks
  // fires only on a whole-session reclaim or an eviction touch, neither of
  // which happens for an active session - so without this the cache grows
  // by one dead entry per turn forever.
  const liveChunkKeys = new Set(chunks.map((chunk) => chunkFingerprint(chunk)));
  const cachedEntries = await kv
    .list<CachedChunkSummary>(KV.summaryChunks(sessionId))
    .catch(() => []);
  await Promise.all(
    cachedEntries
      .filter((entry) => !liveChunkKeys.has(entry.chunkKey))
      .map((entry) =>
        kv.delete(KV.summaryChunks(sessionId), entry.chunkKey).catch(() => {}),
      ),
  );

  const skipped = partialByIdx.filter((p) => p === null).length;
  const partials = partialByIdx.filter((p): p is SessionSummary => p !== null);

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

// Length-prefixed so concatenation stays unambiguous: without it,
// facts ["a", "bc"] and ["ab", "c"] would hash identically.
function hashField(
  hash: ReturnType<typeof createHash>,
  value: string,
): void {
  hash.update(String(value.length));
  hash.update(":");
  hash.update(value);
}

function hashFieldList(
  hash: ReturnType<typeof createHash>,
  values: string[] | undefined,
): void {
  const list = values ?? [];
  hash.update(String(list.length));
  hash.update(":");
  for (const value of list) hashField(hash, value);
}

// Hashes exactly the fields buildSummaryPrompt renders, so a digest match
// means the LLM would receive a byte-identical prompt. Keep this in sync
// with src/prompts/summary.ts: a field that reaches the prompt without
// reaching this hash is a silent stale-summary bug. `concepts` is
// deliberately absent - buildSummaryPrompt declares it but its template
// never renders it, so hashing it would force re-summarization that
// cannot change the output.
function hashObservationSet(
  hash: ReturnType<typeof createHash>,
  observations: CompressedObservation[],
): void {
  for (const o of observations) {
    hashField(hash, o.id);
    hashField(hash, o.type ?? "");
    hashField(hash, o.title ?? "");
    hashField(hash, o.narrative ?? "");
    hashFieldList(hash, o.facts);
    hashFieldList(hash, o.files);
  }
  hash.update(String(observations.length));
}

// Sorted by id so the digest survives KV list-order churn. The handler
// already sorts before calling this; the sort is repeated here so
// correctness does not depend on caller discipline.
function sourceFingerprint(compressed: CompressedObservation[]): string {
  const sorted = [...compressed].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const hash = createHash("sha256");
  hashObservationSet(hash, sorted);
  return `sfp_${hash.digest("hex").slice(0, 16)}`;
}

// Not sorted, unlike sourceFingerprint: chunk order is positional and
// drives obsRangeStart/obsRangeEnd in the reduce step, so it is part of
// what the key identifies rather than list-order noise to normalize away.
function chunkFingerprint(chunk: CompressedObservation[]): string {
  const hash = createHash("sha256");
  hashObservationSet(hash, chunk);
  return `chk_${hash.digest("hex").slice(0, 16)}`;
}

// The key is stored alongside the value because iii-sdk's IState.list()
// returns values only, leaving deleteSummaryChunks nothing to delete by.
interface CachedChunkSummary {
  chunkKey: string;
  partial: SessionSummary;
}

// Call this wherever a session's observations are reclaimed: whole-session
// delete (mem::forget, stale-session eviction) and once per touched session
// after a per-observation eviction pass. Removing even one observation
// shifts every downstream chunk's membership, so it orphans the session's
// entire chunk cache, not just the entry covering that observation.
export async function deleteSummaryChunks(
  kv: StateKV,
  sessionId: string,
): Promise<void> {
  const entries = await kv
    .list<CachedChunkSummary>(KV.summaryChunks(sessionId))
    .catch(() => []);
  await Promise.all(
    entries.map((entry) =>
      kv.delete(KV.summaryChunks(sessionId), entry.chunkKey).catch(() => {}),
    ),
  );
}

export function registerSummarizeFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
  metricsStore?: MetricsStore,
): void {
  sdk.registerFunction("mem::summarize",
    async (data: { sessionId: string; force?: boolean } | undefined) => {
      const startMs = Date.now();
      if (!data || typeof data.sessionId !== "string" || !data.sessionId.trim()) {
        return { success: false, error: "sessionId is required" };
      }
      const sessionId = data.sessionId.trim();

      // #1203: api::summarize stays publicly reachable, so dropping the
      // hook's duplicate POST does not by itself prevent two concurrent
      // full-history passes over identical input. Serialize per session.
      return withKeyedLock(`mem:summarize:${sessionId}`, async () => {
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
      // kv.list order is not stable (the file_based store is a hash map),
      // and chunk boundaries must be positionally stable across turns or
      // every chunk key changes when the order shifts. generateId's base36
      // timestamp prefix is a fixed 8 chars until 2059, so sorting by id
      // is also sorting chronologically - which is the order the LLM and
      // the reduce step's obsRange labels should see anyway.
      const compressed = observations
        .filter((o) => o.title)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      if (compressed.length === 0) {
        logger.info("No observations to summarize", {
          sessionId,
        });
        return { success: false, error: "no_observations" };
      }

      // The Stop hook fires every assistant turn, so without this every
      // turn re-sends the whole session: quadratic in turn count.
      const fingerprint = sourceFingerprint(compressed);
      const existing = await kv.get<SessionSummary>(KV.summaries, sessionId);
      if (!data.force && existing?.sourceFingerprint === fingerprint) {
        logger.info("Summarize skipped — observations unchanged", {
          sessionId,
          observationCount: compressed.length,
        });
        return { success: true, summary: existing, skipped: "unchanged" };
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
        // produce-and-parse pair in the same 2-attempt loop so a
        // markdown-wrapped or otherwise wrapped response gets a
        // second roll-of-the-dice instead of dropping the summary.
        let summary: SessionSummary | null = null;
        let response = "";
        let mode = "single";
        let chunks = 1;
        for (let attempt = 1; attempt <= 2; attempt++) {
          const produced = await produceSummaryXml(
            provider,
            kv,
            compressed,
            sessionId,
            session.project,
          );
          response = produced.response;
          mode = produced.mode;
          chunks = produced.chunks;
          if (!response || !response.trim()) {
            logger.warn("Empty provider response on summarize", {
              sessionId,
              provider: provider.name,
              mode,
              chunks,
              observationCount: compressed.length,
              attempt,
            });
            continue;
          }
          summary = parseSummaryXml(
            response,
            sessionId,
            session.project,
            compressed.length,
          );
          if (summary) break;
          logger.warn("Failed to parse summary XML", { sessionId, attempt });
        }

        if (!response || !response.trim()) {
          const latencyMs = Date.now() - startMs;
          if (metricsStore) {
            await metricsStore.record("mem::summarize", latencyMs, false);
          }
          return { success: false, error: "empty_provider_response" };
        }

        if (!summary) {
          const latencyMs = Date.now() - startMs;
          if (metricsStore) {
            await metricsStore.record("mem::summarize", latencyMs, false);
          }
          return { success: false, error: "parse_failed" };
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
          return { success: false, error: "validation_failed" };
        }

        const qualityScore = scoreSummary(summaryForValidation);

        summary.sourceFingerprint = fingerprint;
        const wrote = await withKeyedLock(
          sessionWriteLockKey(sessionId),
          async () => {
            // Not redundant with the check on entry: the provider call
            // between them runs for seconds, and a delete can land there.
            if (!(await kv.get<Session>(KV.sessions, sessionId))) {
              await deleteSummaryChunks(kv, sessionId);
              return false;
            }
            await kv.set(KV.summaries, sessionId, summary);
            return true;
          },
        );
        if (!wrote) {
          const latencyMs = Date.now() - startMs;
          if (metricsStore) {
            await metricsStore.record("mem::summarize", latencyMs, false);
          }
          logger.info("Summarize discarded — session deleted mid-run", {
            sessionId,
          });
          return { success: false, error: "session_deleted" };
        }
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
        return { success: false, error: msg };
      }
      });
    },
  );
}
