import type { ISdk } from 'iii-sdk'
import type { CompactSearchResult, CompressedObservation, SearchResult, Session } from '../types.js'
import { KV } from '../state/schema.js'
import { StateKV } from '../state/kv.js'
import { SearchIndex } from '../state/search-index.js'
import { recordAccessBatch } from './access-tracker.js'
import { logger } from "../logger.js";

let index: SearchIndex | null = null

export function getSearchIndex(): SearchIndex {
  if (!index) index = new SearchIndex()
  return index
}

export async function rebuildIndex(kv: StateKV): Promise<number> {
  const idx = getSearchIndex()
  idx.clear()

  const sessions = await kv.list<Session>(KV.sessions)
  if (!sessions.length) return 0

  let count = 0
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

      // Second pass: load observations in parallel.
      const obsResults = await Promise.all(
        candidates.map((r) =>
          kv.get<CompressedObservation>(KV.observations(r.sessionId), r.obsId)
        )
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
