import type { ISdk } from 'iii-sdk'
import { getContext } from 'iii-sdk'
import type { CompressedObservation, SessionSummary, MemoryProvider, Session } from '../types.js'
import { KV } from '../state/schema.js'
import { StateKV } from '../state/kv.js'
import { SUMMARY_SYSTEM, buildSummaryPrompt } from '../prompts/summary.js'
import { getXmlTag, getXmlChildren } from '../prompts/xml.js'

function parseSummaryXml(xml: string, sessionId: string, project: string, obsCount: number): SessionSummary | null {
  const title = getXmlTag(xml, 'title')
  if (!title) return null

  return {
    sessionId,
    project,
    createdAt: new Date().toISOString(),
    title,
    narrative: getXmlTag(xml, 'narrative'),
    keyDecisions: getXmlChildren(xml, 'decisions', 'decision'),
    filesModified: getXmlChildren(xml, 'files', 'file'),
    concepts: getXmlChildren(xml, 'concepts', 'concept'),
    observationCount: obsCount,
  }
}

export function registerSummarizeFunction(sdk: ISdk, kv: StateKV, provider: MemoryProvider): void {
  sdk.registerFunction(
    { id: 'mem::summarize', description: 'Generate end-of-session summary' },
    async (data: { sessionId: string }) => {
      const ctx = getContext()

      const session = await kv.get<Session>(KV.sessions, data.sessionId)
      if (!session) {
        ctx.logger.warn('Session not found for summarize', { sessionId: data.sessionId })
        return { success: false, error: 'session_not_found' }
      }

      const observations = await kv.list<CompressedObservation>(KV.observations(data.sessionId))
      const compressed = observations.filter((o) => o.title)

      if (compressed.length === 0) {
        ctx.logger.info('No observations to summarize', { sessionId: data.sessionId })
        return { success: false, error: 'no_observations' }
      }

      try {
        const prompt = buildSummaryPrompt(compressed)
        const response = await provider.summarize(SUMMARY_SYSTEM, prompt)
        const summary = parseSummaryXml(response, data.sessionId, session.project, compressed.length)

        if (!summary) {
          ctx.logger.warn('Failed to parse summary XML', { sessionId: data.sessionId })
          return { success: false, error: 'parse_failed' }
        }

        await kv.set(KV.summaries, data.sessionId, summary)

        ctx.logger.info('Session summarized', {
          sessionId: data.sessionId,
          title: summary.title,
          decisions: summary.keyDecisions.length,
        })

        return { success: true, summary }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.logger.error('Summarize failed', { sessionId: data.sessionId, error: msg })
        return { success: false, error: msg }
      }
    }
  )
}
