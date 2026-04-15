import type { ISdk } from 'iii-sdk'
import type { CompressedObservation, SearchResult, Session } from '../types.js'
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
    async (data: { query: string; limit?: number; project?: string; cwd?: string }) => {
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

      // Avoid logging raw cwd/project (host paths). Log only that filters were active.
      logger.info('Search completed', {
        query,
        results: enriched.length,
        hasProjectFilter: !!projectFilter,
        hasCwdFilter: !!cwdFilter,
      })
      return { results: enriched }
    }
  )
}
