import type { IIIClient } from 'iii-sdk'
import type { IndexPersistenceStatus } from "../state/index-persistence.js";
import type { CompressedObservation, Memory, SearchResult, Session } from '../types.js'
import { KV } from '../state/schema.js'
import { StateKV } from '../state/kv.js'
import { getSearchResultLayer, isSearchLayer, matchesSearchLayer, type SearchLayer, type SearchResultLayer } from "../state/search-layer.js";
import { SearchIndex } from '../state/search-index.js'
import { VectorIndex } from '../state/vector-index.js'
import type { EmbeddingProvider } from '../types.js'
import { memoryToObservation } from '../state/memory-utils.js'
import { buildRecallResponse, type RecallFormat } from "./recall-response.js";
import { recordAccessBatch } from './access-tracker.js'
import { logger } from "../logger.js";
import { withoutObservationSource } from "./observation-source.js";
import {
  getAgentId,
  getVectorBackfillMax,
  isAgentScopeIsolated,
  isVectorBackfillAllEnabled,
} from "../config.js";

let index: SearchIndex | null = null
let vectorIndex: VectorIndex | null = null
let currentEmbeddingProvider: EmbeddingProvider | null = null

// Hybrid ranking hook for mem::search. Wired by index.ts once the
// hybrid searcher exists (it is constructed after this module's
// registration runs). When set and the vector index has entries,
// mem::search ranks candidates through the full BM25+vector+graph
// fusion instead of BM25 alone — previously only mem::smart-search got
// hybrid ranking while the primary recall surface stayed keyword-only.
type HybridRanker = (
  query: string,
  limit: number,
  targetLayer?: SearchLayer,
) => Promise<Array<{ observation: CompressedObservation; sessionId: string; combinedScore: number; layer?: SearchResultLayer }>>
let hybridRanker: HybridRanker | null = null

export function setHybridRanker(fn: HybridRanker | null): void {
  hybridRanker = fn
}

// Dedupes the lazy cold-start rebuild kicked off from the mem::search
// request path. A full rebuildIndex walks every observation across every
// session, so N concurrent queries against an empty index would each
// launch their own rebuild and saturate the engine invocation pool. The
// first query with an empty index starts one rebuild and shares its
// promise; concurrent queries await the same rebuild instead of spawning
// duplicates. The boot-time rebuild in index.ts is unaffected.
let rebuildPromise: Promise<number> | null = null

let memoryIndexReady = false
export function isMemoryIndexReady(): boolean {
  return memoryIndexReady
}

let bm25RebuildIncomplete = false
export function isBm25RebuildIncomplete(): boolean {
  return bm25RebuildIncomplete
}

let keywordRebuildPending = false
let keywordRebuildsRunning = 0
let keywordRebuildEpoch = 0
export function getKeywordRebuildEpoch(): number {
  return keywordRebuildEpoch
}
export function markKeywordRebuildPending(): void {
  keywordRebuildPending = true
}
export function isKeywordRebuildInProgress(): boolean {
  return keywordRebuildPending || keywordRebuildsRunning > 0
}

let pendingVectorBackfill = 0
export type VectorBackfillState = "idle" | "running" | "paused" | "waiting-for-opt-in"
let vectorBackfillState: VectorBackfillState = "idle"
export function getVectorBackfillState(): VectorBackfillState {
  return vectorBackfillState
}
export function setVectorBackfillState(state: VectorBackfillState): void {
  vectorBackfillState = state
}
export function getPendingVectorBackfillCount(): number {
  return pendingVectorBackfill
}
export function setPendingVectorBackfillCount(n: number): void {
  pendingVectorBackfill = Math.max(0, n)
}

export function getSearchIndex(): SearchIndex {
  if (!index) index = new SearchIndex()
  return index
}

export function setVectorIndex(idx: VectorIndex | null): void {
  vectorIndex = idx
}

export function getVectorIndex(): VectorIndex | null {
  return vectorIndex
}

export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  currentEmbeddingProvider = provider
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  return currentEmbeddingProvider
}

const RANK_FUSION_K = 60

export async function rankMemoryIds(
  query: string,
  limit: number,
): Promise<{ ids: string[]; mode: "hybrid" | "keyword" }> {
  const fetchLimit = Math.max(limit * 4, 50)
  const keyword = getSearchIndex()
    .search(query, fetchLimit, "memory")
  let semantic: Array<{ obsId: string }> = []
  if (vectorIndex && vectorIndex.size > 0 && currentEmbeddingProvider) {
    try {
      const embedding = await currentEmbeddingProvider.embed(query)
      semantic = vectorIndex
        .search(embedding, fetchLimit, "memory", (id) => getSearchIndex().layerOf(id))
    } catch (err) {
      logger.warn("memory vector ranking failed, using keyword ranking", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  const scores = new Map<string, number>()
  const addRanks = (hits: Array<{ obsId: string }>) => {
    hits.forEach((hit, rank) => {
      scores.set(hit.obsId, (scores.get(hit.obsId) ?? 0) + 1 / (RANK_FUSION_K + rank + 1))
    })
  }
  addRanks(keyword)
  addRanks(semantic)
  const ids = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
  return { ids, mode: semantic.length > 0 ? "hybrid" : "keyword" }
}

export function vectorIndexRemove(id: string): void {
  vectorIndex?.remove(id);
}

// Persistence sync hook. Without this, index removals only live in
// memory; a crash/SIGKILL before graceful shutdown reloads a stale
// snapshot at boot and the deleted entry resurrects in the index.
// Wired by src/index.ts after IndexPersistence is constructed; no-op
// until then so unit tests that exercise the delete paths in
// isolation don't need to wire persistence.
type IndexPersistenceHook = {
  scheduleSave: () => void;
  save: () => Promise<void>;
  status?: () => IndexPersistenceStatus;
};

let indexPersistence: IndexPersistenceHook | null = null;

export function setIndexPersistence(p: IndexPersistenceHook | null): void {
  indexPersistence = p;
}

export function getIndexPersistenceStatus(): IndexPersistenceStatus | null {
  return indexPersistence?.status?.() ?? null;
}

export function scheduleIndexSave(): void {
  indexPersistence?.scheduleSave();
}

// Synchronous flush variant for delete paths. The debounced
// scheduleSave is fine for adds (chatty), but a hard process exit
// inside the 5s debounce window would lose deletes and resurrect
// removed entries on next boot. Deletes are infrequent enough that
// awaiting a single write per operation is acceptable. save() catches
// its own errors via IndexPersistence.logFailure, so this resolves
// even when persistence fails — callers must not treat a failed
// flush as a fatal error on the delete itself (the KV delete already
// committed before this is invoked).
export async function flushIndexSave(): Promise<void> {
  await indexPersistence?.save();
}

// Hard cap on embedding input length. Most providers cap input around
// 8k tokens (~32k chars at ~4 chars/token). Truncate defensively so a
// huge memory.content can't 400 the embed call or blow context budget
// on a single doc. 16k chars ≈ 4k tokens, safely under every provider.
const EMBED_MAX_CHARS = 16_000

export function clipEmbedInput(text: string): string {
  if (text.length <= EMBED_MAX_CHARS) return text
  return text.slice(0, EMBED_MAX_CHARS)
}

export async function vectorIndexAddGuarded(
  id: string,
  sessionId: string,
  text: string,
  context: { kind: "memory" | "observation" | "synthetic"; logId: string },
  commit?: (embedding: Float32Array) => Promise<boolean> | boolean,
): Promise<boolean> {
  const vi = vectorIndex
  const ep = currentEmbeddingProvider
  if (!vi || !ep) return false
  let embedding: Float32Array
  try {
    embedding = await ep.embed(clipEmbedInput(text))
  } catch (err) {
    logger.warn("vector-index add: embed failed — skipping", {
      kind: context.kind,
      id: context.logId,
      provider: ep.name,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
  if (embedding.length !== ep.dimensions) {
    logger.warn("vector-index add: dimension mismatch — skipping", {
      kind: context.kind,
      id: context.logId,
      provider: ep.name,
      expected: ep.dimensions,
      received: embedding.length,
    })
    return false
  }
  if (commit) {
    try {
      const committed = await commit(embedding)
      if (committed) scheduleIndexSave()
      return committed
    } catch (err) {
      logger.warn("vector-index add: commit failed — skipping", {
        kind: context.kind,
        id: context.logId,
        provider: ep.name,
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }
  vi.add(id, sessionId, embedding)
  scheduleIndexSave()
  return true
}

// Batched variant: calls EmbeddingProvider.embedBatch ONCE for the whole
// batch, then writes each resulting vector. Use this for bulk paths
// (rebuildIndex, future bulk-add APIs) where per-item serial awaits
// dominate wallclock. A batch of N has roughly the latency of a single
// embed (network + GPU setup amortized), so backfilling a 500k-obs
// corpus drops from days to hours on a per-batch endpoint like vLLM.
//
// Per-item failure shape:
//   - whole-batch network/provider error → all skipped, single warn line
//   - per-item dimension mismatch → that item skipped, others continue
export async function vectorIndexAddBatchGuarded(
  items: Array<{
    id: string
    sessionId: string
    text: string
    context: { kind: "memory" | "observation" | "synthetic"; logId: string }
  }>,
): Promise<{ ok: number; fail: number }> {
  const vi = vectorIndex
  const ep = currentEmbeddingProvider
  if (!vi || !ep || items.length === 0) return { ok: 0, fail: 0 }

  let embeddings: Float32Array[]
  try {
    embeddings = await ep.embedBatch(items.map((i) => clipEmbedInput(i.text)))
  } catch (err) {
    logger.warn("vector-index add batch: embed failed — skipping batch", {
      batchSize: items.length,
      provider: ep.name,
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: 0, fail: items.length }
  }

  if (embeddings.length !== items.length) {
    logger.warn(
      "vector-index add batch: provider returned wrong length — skipping batch",
      {
        batchSize: items.length,
        returned: embeddings.length,
        provider: ep.name,
      },
    )
    return { ok: 0, fail: items.length }
  }

  let ok = 0
  let fail = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const embedding = embeddings[i]
    if (embedding.length !== ep.dimensions) {
      logger.warn("vector-index add batch: dimension mismatch — skipping item", {
        kind: item.context.kind,
        id: item.context.logId,
        provider: ep.name,
        expected: ep.dimensions,
        received: embedding.length,
      })
      fail++
      continue
    }
    try {
      vi.add(item.id, item.sessionId, embedding)
      ok++
    } catch (err) {
      logger.warn("vector-index add batch: index write failed — skipping item", {
        kind: item.context.kind,
        id: item.context.logId,
        error: err instanceof Error ? err.message : String(err),
      })
      fail++
    }
  }
  return { ok, fail }
}

// Embed-batch size for rebuild. Each item is one /v1/embeddings call's
// `input` array element; the provider sees the whole batch as one HTTP
// round-trip. 32 fits comfortably under typical per-request token budgets
// (32 × ~110 tok/item ≈ 3.5k tokens) and gets close to per-call
// throughput for GPU-backed endpoints (vLLM, Triton, etc.). Override via
// REBUILD_EMBED_BATCH_SIZE for endpoints that prefer smaller/larger
// batches. Set to 1 to fall back to the legacy per-item path.
const DEFAULT_REBUILD_EMBED_BATCH = 32

function getRebuildEmbedBatchSize(): number {
  const raw = process.env.REBUILD_EMBED_BATCH_SIZE
  if (!raw) return DEFAULT_REBUILD_EMBED_BATCH
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REBUILD_EMBED_BATCH
}

// Shared BM25 + batched-vector indexing for a set of records. The full
// rebuild and every import path (export-import, jsonl replay) funnel
// through this so they index identically and none can silently skip the
// vector side. It does NOT clear the index — callers that rebuild clear
// first; importers add. When no embedding provider is configured it skips
// the vector enqueue entirely, so a keyless install never allocates embed
// jobs it would immediately discard.
export async function indexRecords(
  observations: CompressedObservation[],
  memories: Memory[],
): Promise<number> {
  const idx = getSearchIndex()
  const vectorEnabled = Boolean(vectorIndex && currentEmbeddingProvider)
  const batchSize = getRebuildEmbedBatchSize()
  type EmbedJob = {
    id: string
    sessionId: string
    text: string
    context: { kind: "memory" | "observation" | "synthetic"; logId: string }
  }
  const pending: EmbedJob[] = []
  const flush = async (): Promise<void> => {
    if (pending.length === 0) return
    await vectorIndexAddBatchGuarded(pending)
    pending.length = 0
  }
  const enqueue = async (job: EmbedJob): Promise<void> => {
    if (!vectorEnabled) return
    pending.push(job)
    if (pending.length >= batchSize) await flush()
  }

  let count = 0
  for (const memory of memories) {
    if (memory.isLatest === false) continue
    if (!memory.title || !memory.content) continue
    idx.add(memoryToObservation(memory), "memory")
    await enqueue({
      id: memory.id,
      sessionId: memory.sessionIds?.[0] ?? 'memory',
      text: memory.title + ' ' + memory.content,
      context: { kind: "memory", logId: memory.id },
    })
    count++
  }
  for (const obs of observations) {
    if (!obs.title || !obs.narrative) continue
    idx.add(obs)
    await enqueue({
      id: obs.id,
      sessionId: obs.sessionId,
      text: obs.title + ' ' + obs.narrative,
      context: { kind: "observation", logId: obs.id },
    })
    count++
  }
  await flush()
  if (count > 0) scheduleIndexSave()
  return count
}

export async function findUnindexedObservations(
  kv: StateKV,
): Promise<{ sessions: number; missing: CompressedObservation[] }> {
  const idx = getSearchIndex()
  const sessions = await kv.list<Session>(KV.sessions)
  const indexed = idx.observationCountsBySession()
  const missing: CompressedObservation[] = []
  for (const session of sessions) {
    const known = session.observationCount ?? 0
    if (known > 0 && known <= (indexed.get(session.id) ?? 0)) continue
    const observations = await kv.list<CompressedObservation>(KV.observations(session.id))
    for (const obs of observations) {
      if (!obs.title || !obs.narrative || idx.has(obs.id)) continue
      missing.push(obs)
    }
  }
  return { sessions: sessions.length, missing }
}

export async function reconcileIndex(kv: StateKV): Promise<number> {
  const idx = getSearchIndex()
  const { missing } = await findUnindexedObservations(kv)
  const stillMissing = missing.filter((obs) => !idx.has(obs.id))
  if (stillMissing.length === 0) return 0
  return indexRecords(stillMissing, [])
}

export async function rebuildIndex(kv: StateKV): Promise<number> {
  const idx = getSearchIndex()
  idx.clear()
  memoryIndexReady = false

  // BM25 clear above wipes stale doc entries; the vector index has the
  // symmetric concern — memories/observations deleted between runs
  // would leave orphan embeddings here forever. Clear both before the
  // repopulation loops run, so BM25 and vector stay in sync.
  vectorIndex?.clear()

  // Memories live in their own KV scope outside per-session observation
  // scopes, so they need a separate walk. Without this, mem::remember
  // entries vanish from BM25 on every restart even after the live-write
  // fix in remember.ts.
  let memories: Memory[] = []
  let memoriesLoaded = false
  try {
    memories = await kv.list<Memory>(KV.memories)
    memoriesLoaded = true
  } catch (err) {
    logger.warn('rebuildIndex: failed to load memories', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const sessions = await kv.list<Session>(KV.sessions)
  const failedSessions: string[] = []
  // Index each session chunk as it loads instead of accumulating every
  // observation first, so peak memory stays bounded to one chunk.
  let indexed = 0
  for (let batch = 0; batch < sessions.length; batch += 10) {
    const chunk = sessions.slice(batch, batch + 10)
    const results = await Promise.all(
      chunk.map(async (s) => {
        try {
          return await kv.list<CompressedObservation>(KV.observations(s.id))
        } catch {
          failedSessions.push(s.id)
          return [] as CompressedObservation[]
        }
      })
    )
    const chunkObs = results.flat()
    if (chunkObs.length > 0) {
      indexed += await indexRecords(chunkObs, [])
    }
  }
  if (failedSessions.length > 0) {
    logger.warn('rebuildIndex: failed to load observations for sessions', { failedSessions })
  }

  indexed += await indexRecords([], memories)
  if (memoriesLoaded) memoryIndexReady = true
  return indexed
}

export type VectorBackfillJob = {
  id: string
  sessionId: string
  text: string
  context: { kind: "memory" | "observation" | "synthetic"; logId: string }
}

const SESSIONS_LIST_RETRY_ATTEMPTS = 3
const SESSIONS_LIST_RETRY_BASE_MS = 250

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function listSessionsWithRetry(kv: StateKV): Promise<Session[] | null> {
  let lastErr: unknown
  for (let attempt = 0; attempt < SESSIONS_LIST_RETRY_ATTEMPTS; attempt++) {
    try {
      return await kv.list<Session>(KV.sessions)
    } catch (err) {
      lastErr = err
      if (attempt < SESSIONS_LIST_RETRY_ATTEMPTS - 1) {
        await delay(SESSIONS_LIST_RETRY_BASE_MS * (attempt + 1))
      }
    }
  }
  logger.warn('rebuildKeywordIndex: failed to load sessions after retries', {
    attempts: SESSIONS_LIST_RETRY_ATTEMPTS,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
  })
  return null
}

type KeywordRebuildResult = { documents: number; vectorJobs: VectorBackfillJob[]; fullBackfillPending: number }

export async function rebuildKeywordIndex(
  kv: StateKV,
  vectorBackfillSince?: string | null,
): Promise<KeywordRebuildResult> {
  keywordRebuildsRunning++
  try {
    return await runKeywordRebuild(kv, vectorBackfillSince)
  } finally {
    keywordRebuildsRunning--
    keywordRebuildPending = false
    keywordRebuildEpoch++
  }
}

async function runKeywordRebuild(
  kv: StateKV,
  vectorBackfillSince?: string | null,
): Promise<KeywordRebuildResult> {
  const idx = getSearchIndex()
  idx.clear()
  memoryIndexReady = false
  bm25RebuildIncomplete = false
  const vi = vectorIndex
  const backfillEligible = Boolean(vi && currentEmbeddingProvider) && vectorBackfillSince !== undefined
  const wholeStoreBackfill = vectorBackfillSince === null
  const backfillGated = backfillEligible && wholeStoreBackfill && !isVectorBackfillAllEnabled()
  const backfillActive = backfillEligible && !backfillGated
  const cutoff = typeof vectorBackfillSince === 'string' ? Date.parse(vectorBackfillSince) : Number.NaN
  const backfillCap = backfillActive ? getVectorBackfillMax() : 0
  const vectorJobs: VectorBackfillJob[] = []
  let fullBackfillPending = 0
  const consider = (
    id: string,
    sessionId: string,
    text: string,
    timestamp: string | undefined,
    kind: "memory" | "observation",
  ): void => {
    if (!backfillEligible || vi?.has(id)) return
    if (!Number.isNaN(cutoff) && !(Date.parse(timestamp ?? '') > cutoff)) return
    if (backfillGated) {
      fullBackfillPending++
      return
    }
    if (!backfillActive || (wholeStoreBackfill && vectorJobs.length >= backfillCap)) return
    vectorJobs.push({ id, sessionId, text, context: { kind, logId: id } })
  }

  let documents = 0
  let memoriesLoaded = false
  try {
    const memories = await kv.list<Memory>(KV.memories)
    memoriesLoaded = true
    for (const memory of memories) {
      if (memory.isLatest === false) continue
      if (!memory.title || !memory.content) continue
      idx.add(memoryToObservation(memory), "memory")
      consider(memory.id, memory.sessionIds?.[0] ?? 'memory', memory.title + ' ' + memory.content, memory.createdAt, "memory")
      documents++
    }
  } catch (err) {
    logger.warn('rebuildKeywordIndex: failed to load memories', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const sessions = await listSessionsWithRetry(kv)
  if (sessions === null) {
    bm25RebuildIncomplete = true
    if (memoriesLoaded) memoryIndexReady = true
    return { documents, vectorJobs, fullBackfillPending }
  }
  const failedSessions: string[] = []
  for (let batch = 0; batch < sessions.length; batch += 10) {
    const chunk = sessions.slice(batch, batch + 10)
    const results = await Promise.all(
      chunk.map(async (s) => {
        try {
          return await kv.list<CompressedObservation>(KV.observations(s.id))
        } catch {
          failedSessions.push(s.id)
          return [] as CompressedObservation[]
        }
      })
    )
    for (const obs of results.flat()) {
      if (!obs.title || !obs.narrative) continue
      idx.add(obs)
      consider(obs.id, obs.sessionId, obs.title + ' ' + obs.narrative, obs.timestamp, "observation")
      documents++
    }
  }
  if (failedSessions.length > 0) {
    bm25RebuildIncomplete = true
    logger.warn('rebuildKeywordIndex: failed to load observations for sessions', { failedSessions })
  }
  if (memoriesLoaded) memoryIndexReady = true
  return { documents, vectorJobs, fullBackfillPending }
}

const BACKFILL_SAVE_EVERY_BATCHES = 10
const VECTOR_BACKLOG_PAUSE_MS = 1000

async function embedBackfillJobs(
  jobs: VectorBackfillJob[],
  remainingAfter: number,
): Promise<{ ok: number; fail: number }> {
  const batchSize = getRebuildEmbedBatchSize()
  let ok = 0
  let fail = 0
  let batchesSinceSave = 0
  setPendingVectorBackfillCount(remainingAfter + jobs.length)
  for (let offset = 0; offset < jobs.length; offset += batchSize) {
    const result = await vectorIndexAddBatchGuarded(jobs.slice(offset, offset + batchSize))
    ok += result.ok
    fail += result.fail
    setPendingVectorBackfillCount(remainingAfter + jobs.length - Math.min(jobs.length, offset + batchSize))
    batchesSinceSave++
    if (batchesSinceSave >= BACKFILL_SAVE_EVERY_BATCHES) {
      await flushIndexSave()
      batchesSinceSave = 0
    }
  }
  if (ok > 0) await flushIndexSave()
  return { ok, fail }
}

export async function backfillVectors(jobs: VectorBackfillJob[]): Promise<number> {
  return (await embedBackfillJobs(jobs, 0)).ok
}

export type VectorBacklogResult = { added: number; failed: number; remaining: number; complete: boolean }

export async function backfillVectorBacklog(
  jobs: VectorBackfillJob[],
  options: { batchSize?: number; pauseMs?: number } = {},
): Promise<VectorBacklogResult> {
  const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : getVectorBackfillMax()
  const pauseMs = options.pauseMs ?? VECTOR_BACKLOG_PAUSE_MS
  let added = 0
  let failed = 0
  for (let offset = 0; offset < jobs.length; offset += batchSize) {
    if (offset > 0 && pauseMs > 0) await delay(pauseMs)
    const after = Math.max(0, jobs.length - offset - batchSize)
    const batch = jobs.slice(offset, offset + batchSize).filter((job) => !vectorIndex?.has(job.id))
    if (batch.length === 0) {
      setPendingVectorBackfillCount(after)
      continue
    }
    const result = await embedBackfillJobs(batch, after)
    added += result.ok
    failed += result.fail
    if (result.ok === 0) {
      setPendingVectorBackfillCount(jobs.length - offset)
      return { added, failed, remaining: jobs.length - offset, complete: false }
    }
  }
  setPendingVectorBackfillCount(failed)
  return { added, failed, remaining: failed, complete: failed === 0 }
}

export function registerSearchFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction(
    'mem::search',
    async (data: {
      query: string
      limit?: number
      project?: string
      cwd?: string
      format?: string
      token_budget?: number
      targetLayer?: SearchLayer
      agentId?: string
    }) => {
      const idx = getSearchIndex()

      // Input validation / normalization.
      if (typeof data?.query !== 'string' || !data.query.trim()) {
        throw new Error('mem::search: query must be a non-empty string')
      }
      const query = data.query.trim()
      if (data.targetLayer !== undefined && !isSearchLayer(data.targetLayer)) {
        throw new Error("mem::search: targetLayer must be one of 'all', 'memory', or 'observation'")
      }
      const targetLayer = data.targetLayer ?? 'all'
      const MAX_LIMIT = 100
      let effectiveLimit = 20
      if (data.limit !== undefined) {
        if (!Number.isInteger(data.limit) || data.limit < 1) {
          throw new Error('mem::search: limit must be a positive integer')
        }
        effectiveLimit = Math.min(data.limit, MAX_LIMIT)
      }
      const projectFilter = typeof data.project === 'string' && data.project.trim().length > 0 ? data.project.trim() : undefined
      const cwdFilter = typeof data.cwd === 'string' && data.cwd.trim().length > 0 ? data.cwd.trim() : undefined
      const isolated = isAgentScopeIsolated();
      const explicitAgentId =
        typeof data.agentId === "string" && data.agentId.trim().length > 0
          ? data.agentId.trim()
          : undefined;
      const wildcardAgent = explicitAgentId === "*";
      const envAgentId = isolated ? getAgentId() : undefined;
      const filterAgentId = wildcardAgent
        ? undefined
        : explicitAgentId ?? envAgentId;
      if (
        isolated &&
        !wildcardAgent &&
        !explicitAgentId &&
        !envAgentId
      ) {
        throw new Error(
          "mem::search: AGENTMEMORY_AGENT_SCOPE=isolated is set but no " +
            "agent id is available (env AGENT_ID unset and no explicit " +
            "agentId in the call). Refusing to read cross-agent rows. " +
            'Pass agentId: "*" to opt in to a wildcard read.',
        );
      }
      const format = typeof data.format === 'string' ? data.format : 'full'
      if (!['full', 'compact', 'narrative'].includes(format)) {
        throw new Error("mem::search: format must be one of 'full', 'compact', or 'narrative'")
      }
      let tokenBudget: number | undefined
      if (data.token_budget !== undefined) {
        if (!Number.isInteger(data.token_budget) || data.token_budget < 1) {
          throw new Error('mem::search: token_budget must be a positive integer')
        }
        tokenBudget = data.token_budget
      }

      if (idx.size === 0) {
        // Share one rebuild across concurrent cold-start queries so they
        // don't each walk the whole corpus and saturate the pool.
        if (!rebuildPromise) {
          rebuildPromise = rebuildKeywordIndex(kv)
            .then((result) => {
              logger.info('Search index rebuilt', { entries: result.documents })
              return result.documents
            })
            .catch((err) => {
              logger.warn('Index rebuild failed', {
                error: err instanceof Error ? err.message : String(err),
              })
              return 0
            })
            .finally(() => {
              rebuildPromise = null
            })
        }
        await rebuildPromise
      }

      // When filtering by project/cwd, over-fetch from the index so the
      // post-filter still has a chance of returning `effectiveLimit` results.
      // Over-fetch whenever ANY post-index filter is active. agentId
      // is dropped after the observation/memory is loaded (BM25 index
      // doesn't carry it), so without the over-fetch isolated-mode
      // queries return underfilled pages when same-agent matches
      // rank lower than cross-agent ones in the hybrid score.
      const filtering = !!(projectFilter || cwdFilter || filterAgentId)
      const fetchLimit = filtering ? Math.max(effectiveLimit * 10, 100) : effectiveLimit
      // Hybrid results carry the observation the ranker already loaded,
      // so the load pass below doesn't refetch every record it just
      // enriched.
      let results: Array<{
        obsId: string
        sessionId: string
        score: number
        observation?: CompressedObservation
        layer?: SearchResultLayer
      }>
      if (hybridRanker && vectorIndex && vectorIndex.size > 0) {
        try {
          const hybrid = await hybridRanker(query, fetchLimit, targetLayer)
          results = hybrid.map((r) => ({
            obsId: r.observation.id,
            sessionId: r.sessionId,
            score: r.combinedScore,
            observation: r.observation,
            layer: r.layer,
          }))
        } catch (err) {
          logger.warn("hybrid ranking failed, falling back to keyword search", {
            error: err instanceof Error ? err.message : String(err),
          })
          results = idx.search(query, fetchLimit, targetLayer)
        }
      } else {
        results = idx.search(query, fetchLimit, targetLayer)
      }

      // Resolve session -> project/cwd once per sessionId we touch.
      const sessionCache = new Map<string, Session | null>()
      const loadSession = async (sessionId: string): Promise<Session | null> => {
        if (sessionCache.has(sessionId)) return sessionCache.get(sessionId)!
        const s = await kv.get<Session>(KV.sessions, sessionId)
        sessionCache.set(sessionId, s ?? null)
        return s ?? null
      }

      const memoryProjectCache = new Map<string, string | null>()
      const loadMemoryProject = async (obsId: string): Promise<string | null> => {
        if (memoryProjectCache.has(obsId)) return memoryProjectCache.get(obsId)!
        const mem = await kv.get<Memory>(KV.memories, obsId)
        const proj = mem?.project ?? null
        memoryProjectCache.set(obsId, proj)
        return proj
      }

      // First pass: filter by session (sequential — benefits from session cache).
      // Memory entries with a synthetic sessionId take a secondary KV.memories
      // path so project filtering works correctly for them too.
      //
      // When agentId filtering is active we can't cap at effectiveLimit
      // here — the second pass (post-load) is what drops cross-agent
      // rows, and capping early would underfill the result page. Use
      // fetchLimit as the upper bound in that case; the final
      // truncation lives at the end of the second pass.
      const earlyCap = filterAgentId ? fetchLimit : effectiveLimit
      const candidates: typeof results = []
      for (const r of results) {
        if (candidates.length >= earlyCap) break
        const layer = r.layer ?? idx.layerOf(r.obsId) ?? getSearchResultLayer(r.obsId, r.sessionId)
        if (!matchesSearchLayer(r.obsId, r.sessionId, targetLayer, layer)) continue
        if (filtering) {
          const memoryProject = projectFilter && layer === "memory"
            ? await loadMemoryProject(r.obsId)
            : null
          if (projectFilter && memoryProject !== null && memoryProject !== projectFilter) continue
          const session = await loadSession(r.sessionId)
          if (session) {
            if (projectFilter && memoryProject === null && session.project !== projectFilter) continue
            if (cwdFilter && session.cwd !== cwdFilter) continue
          }
        }
        candidates.push(r)
      }

      const obsResults = await Promise.all(
        candidates.map(async (r) => {
          if (r.observation) return { observation: r.observation, layer: r.layer ?? idx.layerOf(r.obsId) ?? getSearchResultLayer(r.obsId, r.sessionId) }
          const obs = await kv
            .get<CompressedObservation>(KV.observations(r.sessionId), r.obsId)
            .catch(() => null)
          if (obs) return { observation: obs, layer: "observation" as const }
          const mem = await kv
            .get<Memory>(KV.memories, r.obsId)
            .catch(() => null)
          return mem ? { observation: memoryToObservation(mem), layer: "memory" as const } : null
        })
      )
      const enriched: SearchResult[] = []
      for (let i = 0; i < candidates.length; i++) {
        const resolved = obsResults[i]
        if (!resolved) continue
        const obs = resolved.observation
        if (!matchesSearchLayer(obs.id, obs.sessionId, targetLayer, resolved.layer)) continue
        if (filterAgentId !== undefined && obs.agentId !== filterAgentId) continue
        if (enriched.length >= effectiveLimit) break
        enriched.push({
          observation: withoutObservationSource(obs),
          layer: resolved.layer,
          score: candidates[i].score,
          sessionId: candidates[i].sessionId,
        })
      }

      const response = buildRecallResponse(enriched, format as RecallFormat, tokenBudget)
      void recordAccessBatch(
        kv,
        enriched.slice(0, response.results.length).map((result) => result.observation.id),
      )

      logger.info('Search completed', {
        query,
        results: response.results.length,
        hasProjectFilter: !!projectFilter,
        hasCwdFilter: !!cwdFilter,
      })
      return response
    }
  )
}
