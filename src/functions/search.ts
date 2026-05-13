import type { ISdk } from 'iii-sdk'
import type { CompactSearchResult, CompressedObservation, Memory, SearchResult, Session } from '../types.js'
import { KV } from '../state/schema.js'
import { StateKV } from '../state/kv.js'
import { SearchIndex } from '../state/search-index.js'
import { VectorIndex } from '../state/vector-index.js'
import type { EmbeddingProvider } from '../types.js'
import { memoryToObservation } from '../state/memory-utils.js'
import { recordAccessBatch } from './access-tracker.js'
import { logger } from "../logger.js";

let index: SearchIndex | null = null
let vectorIndex: VectorIndex | null = null
let currentEmbeddingProvider: EmbeddingProvider | null = null

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

// Hard cap on embedding input length. Most providers cap input around
// 8k tokens (~32k chars at ~4 chars/token). Truncate defensively so a
// huge memory.content can't 400 the embed call or blow context budget
// on a single doc. 16k chars ≈ 4k tokens, safely under every provider.
const EMBED_MAX_CHARS = 16_000

export function clipEmbedInput(text: string): string {
  if (text.length <= EMBED_MAX_CHARS) return text
  return text.slice(0, EMBED_MAX_CHARS)
}

// Single guarded vector-index write. Returns true on success. Logs and
// no-ops on:
//   - dimension mismatch (mis-configured provider would silently corrupt
//     the index per #248 otherwise — guarded at persistence load there;
//     this is the symmetric guard at the write site)
//   - embed throwing (network, rate limit, provider down)
// Always soft-fails so a downed embedder doesn't break the upstream save.
export async function vectorIndexAddGuarded(
  id: string,
  sessionId: string,
  text: string,
  context: { kind: "memory" | "observation" | "synthetic"; logId: string },
): Promise<boolean> {
  const vi = vectorIndex
  const ep = currentEmbeddingProvider
  if (!vi || !ep) return false
  try {
    const embedding = await ep.embed(clipEmbedInput(text))
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
    vi.add(id, sessionId, embedding)
    return true
  } catch (err) {
    logger.warn("vector-index add: embed failed — skipping", {
      kind: context.kind,
      id: context.logId,
      provider: ep.name,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

export async function rebuildIndex(kv: StateKV): Promise<number> {
  const idx = getSearchIndex()
  idx.clear()

  // BM25 clear above wipes stale doc entries; the vector index has the
  // symmetric concern — memories/observations deleted between runs
  // would leave orphan embeddings here forever. Clear both before the
  // repopulation loops run, so BM25 and vector stay in sync.
  vectorIndex?.clear()

  let count = 0

  // Memories live in their own KV scope outside per-session observation
  // scopes, so they need a separate walk. Without this, mem::remember
  // entries vanish from BM25 on every restart even after the live-write
  // fix in remember.ts (#257).
  try {
    const memories = await kv.list<Memory>(KV.memories)
    for (const memory of memories) {
      if (memory.isLatest === false) continue
      if (!memory.title || !memory.content) continue
      idx.add(memoryToObservation(memory))
      await vectorIndexAddGuarded(
        memory.id,
        memory.sessionIds[0] ?? 'memory',
        memory.title + ' ' + memory.content,
        { kind: "memory", logId: memory.id },
      )
      count++
    }
  } catch (err) {
    logger.warn('rebuildIndex: failed to load memories', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const sessions = await kv.list<Session>(KV.sessions)
  if (!sessions.length) return count

  const obsPerSession: CompressedObservation[][] = []
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
    obsPerSession.push(...results)
  }
  if (failedSessions.length > 0) {
    logger.warn('rebuildIndex: failed to load observations for sessions', { failedSessions })
  }
  for (const observations of obsPerSession) {
    for (const obs of observations) {
      if (obs.title && obs.narrative) {
        idx.add(obs)
        await vectorIndexAddGuarded(
          obs.id,
          obs.sessionId,
          obs.title + ' ' + obs.narrative,
          { kind: "observation", logId: obs.id },
        )
        count++
      }
    }
  }
  return count
}

export function registerSearchFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    'mem::search',
    async (data: {
      query: string
      limit?: number
      project?: string
      cwd?: string
      format?: string
      token_budget?: number
    }) => {
      const idx = getSearchIndex()

      // Input validation / normalization.
      if (typeof data?.query !== 'string' || !data.query.trim()) {
        throw new Error('mem::search: query must be a non-empty string')
      }
      const query = data.query.trim()
      const MAX_LIMIT = 100
      let effectiveLimit = 20
      if (data.limit !== undefined) {
        if (!Number.isInteger(data.limit) || data.limit < 1) {
          throw new Error('mem::search: limit must be a positive integer')
        }
        effectiveLimit = Math.min(data.limit, MAX_LIMIT)
      }
      const projectFilter = typeof data.project === 'string' && data.project.length > 0 ? data.project : undefined
      const cwdFilter = typeof data.cwd === 'string' && data.cwd.length > 0 ? data.cwd : undefined
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
        const count = await rebuildIndex(kv)
        logger.info('Search index rebuilt', { entries: count })
      }

      // When filtering by project/cwd, over-fetch from the index so the
      // post-filter still has a chance of returning `effectiveLimit` results.
      const filtering = !!(projectFilter || cwdFilter)
      const fetchLimit = filtering ? Math.max(effectiveLimit * 10, 100) : effectiveLimit
      const results = idx.search(query, fetchLimit)

      // Resolve session -> project/cwd once per sessionId we touch.
      const sessionCache = new Map<string, Session | null>()
      const loadSession = async (sessionId: string): Promise<Session | null> => {
        if (sessionCache.has(sessionId)) return sessionCache.get(sessionId)!
        const s = await kv.get<Session>(KV.sessions, sessionId)
        sessionCache.set(sessionId, s ?? null)
        return s ?? null
      }

      // First pass: filter by session (sequential — benefits from session cache).
      const candidates: typeof results = []
      for (const r of results) {
        if (candidates.length >= effectiveLimit) break
        if (filtering) {
          const s = await loadSession(r.sessionId)
          if (!s) continue
          if (projectFilter && s.project !== projectFilter) continue
          if (cwdFilter && s.cwd !== cwdFilter) continue
        }
        candidates.push(r)
      }

      // Second pass: load observations in parallel. Fall back to
      // KV.memories when the observation lookup misses — entries indexed
      // via mem::remember live in the memories scope under a synthetic
      // sessionId, so the observation key never exists (#265).
      const obsResults = await Promise.all(
        candidates.map(async (r) => {
          const obs = await kv
            .get<CompressedObservation>(KV.observations(r.sessionId), r.obsId)
            .catch(() => null)
          if (obs) return obs
          const mem = await kv
            .get<Memory>(KV.memories, r.obsId)
            .catch(() => null)
          return mem ? memoryToObservation(mem) : null
        })
      )
      const enriched: SearchResult[] = []
      for (let i = 0; i < candidates.length; i++) {
        const obs = obsResults[i]
        if (obs) {
          enriched.push({
            observation: obs,
            score: candidates[i].score,
            sessionId: candidates[i].sessionId,
          })
        }
      }

      void recordAccessBatch(
        kv,
        enriched.map((r) => r.observation.id),
      )

      const estimateTokens = (value: unknown): number =>
        Math.max(1, Math.ceil(JSON.stringify(value).length / 3))

      const applyTokenBudget = <T>(items: T[]): {
        items: T[]
        used: number
        truncated: boolean
      } => {
        if (!tokenBudget) return { items, used: items.reduce((sum, item) => sum + estimateTokens(item), 0), truncated: false }
        const selected: T[] = []
        let used = 0
        for (const item of items) {
          const itemTokens = estimateTokens(item)
          if (used + itemTokens > tokenBudget) {
            return { items: selected, used, truncated: selected.length < items.length }
          }
          selected.push(item)
          used += itemTokens
        }
        return { items: selected, used, truncated: false }
      }

      if (format === 'compact') {
        const compactResults: CompactSearchResult[] = enriched.map((r) => ({
          obsId: r.observation.id,
          sessionId: r.sessionId,
          title: r.observation.title,
          type: r.observation.type,
          score: r.score,
          timestamp: r.observation.timestamp,
        }))
        const packed = applyTokenBudget(compactResults)
        return {
          format,
          results: packed.items,
          tokens_used: packed.used,
          tokens_budget: tokenBudget,
          truncated: packed.truncated,
        }
      }

      if (format === 'narrative') {
        const narrativeResults = enriched.map((r) => ({
          obsId: r.observation.id,
          sessionId: r.sessionId,
          title: r.observation.title,
          narrative: r.observation.narrative,
          score: r.score,
          timestamp: r.observation.timestamp,
        }))
        const packed = applyTokenBudget(narrativeResults)
        const text = packed.items
          .map((r, index) => `${index + 1}. ${r.title}\n${r.narrative}`)
          .join('\n\n')
        return {
          format,
          results: packed.items,
          text,
          tokens_used: packed.used,
          tokens_budget: tokenBudget,
          truncated: packed.truncated,
        }
      }

      const packed = applyTokenBudget(enriched)

      // Avoid logging raw cwd/project (host paths). Log only that filters were active.
      logger.info('Search completed', {
        query,
        results: packed.items.length,
        hasProjectFilter: !!projectFilter,
        hasCwdFilter: !!cwdFilter,
      })
      return {
        format,
        results: packed.items,
        tokens_used: packed.used,
        tokens_budget: tokenBudget,
        truncated: packed.truncated,
      }
    }
  )
}
