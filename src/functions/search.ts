import type { ISdk } from 'iii-sdk'
import { getContext } from 'iii-sdk'
import type { CompressedObservation, SearchResult, Session } from '../types.js'
import { KV } from '../state/schema.js'
import { StateKV } from '../state/kv.js'
import { SearchIndex } from '../state/search-index.js'

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
  for (const session of sessions) {
    const observations = await kv.list<CompressedObservation>(KV.observations(session.id))
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
    { id: 'mem::search', description: 'Search observations by keyword' },
    async (data: { query: string; limit?: number }) => {
      const ctx = getContext()
      const idx = getSearchIndex()

      if (idx.size === 0) {
        const count = await rebuildIndex(kv)
        ctx.logger.info('Search index rebuilt', { entries: count })
      }

      const results = idx.search(data.query, data.limit || 20)

      const enriched: SearchResult[] = []
      for (const r of results) {
        const obs = await kv.get<CompressedObservation>(KV.observations(r.sessionId), r.obsId)
        if (obs) {
          enriched.push({ observation: obs, score: r.score, sessionId: r.sessionId })
        }
      }

      ctx.logger.info('Search completed', { query: data.query, results: enriched.length })
      return { results: enriched }
    }
  )
}
