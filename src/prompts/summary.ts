export const SUMMARY_SYSTEM = `You are a session summarizer for an AI coding agent's memory system. Given all compressed observations from a coding session, produce a concise session summary.

Output EXACTLY this XML format with no additional text:

<summary>
  <title>Short session title (max 100 chars)</title>
  <narrative>3-5 sentence narrative of what was accomplished</narrative>
  <decisions>
    <decision>Key technical decision made</decision>
  </decisions>
  <files>
    <file>path/to/modified/file</file>
  </files>
  <concepts>
    <concept>key concept from session</concept>
  </concepts>
  <durableCandidates>
    <candidate>
      <type>pattern|preference|architecture|bug|workflow|fact</type>
      <title>Stable memory title</title>
      <content>Durable fact or convention worth keeping across sessions</content>
      <concepts>
        <concept>searchable concept</concept>
      </concepts>
      <files>
        <file>path/to/file</file>
      </files>
      <sourceObservationIds>
        <id>obs_123</id>
      </sourceObservationIds>
      <confidence>0.70</confidence>
      <promotionReason>Why this may deserve explicit promote later</promotionReason>
    </candidate>
  </durableCandidates>
</summary>

Rules:
- Focus on outcomes, not individual tool calls
- Highlight decisions and their rationale
- List all files that were created or modified
- Concepts should be searchable terms for future context retrieval
- Durable candidates are only cross-session facts, decisions, conventions, workflows, or bugs likely worth keeping
- Do not emit low-value, ephemeral, or purely session-local notes
- Emit only candidates with confidence >= 0.55
- Use exact source observation ids from the prompt when available
- If a candidate has no reliable source observation id, leave <sourceObservationIds> empty and keep confidence <= 0.60`

export function buildSummaryPrompt(observations: Array<{
  id: string
  type: string
  title: string
  facts: string[]
  narrative: string
  files: string[]
  concepts: string[]
}>): string {
  const lines = observations.map((obs, i) => {
    const facts = obs.facts.map((f) => `  - ${f}`).join('\n')
    return `[${i + 1}] ${obs.type}: ${obs.title}\nObservation ID: ${obs.id}\n${obs.narrative}\nFacts:\n${facts}\nFiles: ${obs.files.join(', ')}\nConcepts: ${obs.concepts.join(', ')}`
  })
  return `Session observations (${observations.length} total):\n\n${lines.join('\n\n---\n\n')}`
}

export const REDUCE_SYSTEM = `You are merging multiple partial summaries of the SAME coding session into one final session summary. The partials are chronological chunks of one continuous session — not separate sessions.

Output EXACTLY this XML format with no additional text:

<summary>
  <title>Short session title (max 100 chars)</title>
  <narrative>3-5 sentence narrative covering the whole session</narrative>
  <decisions>
    <decision>Key technical decision made</decision>
  </decisions>
  <files>
    <file>path/to/modified/file</file>
  </files>
  <concepts>
    <concept>key concept from session</concept>
  </concepts>
  <durableCandidates>
    <candidate>
      <type>pattern|preference|architecture|bug|workflow|fact</type>
      <title>Stable memory title</title>
      <content>Durable fact or convention worth keeping across sessions</content>
      <concepts>
        <concept>searchable concept</concept>
      </concepts>
      <files>
        <file>path/to/file</file>
      </files>
      <sourceObservationIds>
        <id>obs_123</id>
      </sourceObservationIds>
      <confidence>0.70</confidence>
      <promotionReason>Why this may deserve explicit promote later</promotionReason>
    </candidate>
  </durableCandidates>
</summary>

Rules:
- Synthesize a single narrative that reflects the whole arc, not a chunk-by-chunk recap
- Preserve every distinct decision across chunks
- Union (deduplicate) all files and concepts
- Title should capture the session's overall outcome
- Merge durable candidates by meaning, keep only the best ones, and preserve exact observation ids
- Emit only durable candidates that still clear confidence >= 0.55 after merging`

export function buildReducePrompt(partials: Array<{
  title: string
  narrative: string
  keyDecisions: string[]
  filesModified: string[]
  concepts: string[]
  durableCandidates?: Array<{
    type: string
    title: string
    content: string
    confidence: number
    sourceObservationIds: string[]
    promotionReason?: string
  }>
  obsRangeStart: number
  obsRangeEnd: number
}>): string {
  const sections = partials.map((p, i) => {
    const decisions = p.keyDecisions.map((d) => `  - ${d}`).join('\n')
    const files = p.filesModified.map((f) => `  - ${f}`).join('\n')
    const concepts = p.concepts.join(', ')
    const durableCandidates = (p.durableCandidates ?? []).map((candidate) =>
      `  - [${candidate.type}] ${candidate.title} | confidence=${candidate.confidence.toFixed(2)} | sources=${candidate.sourceObservationIds.join(', ') || '<none>'} | content=${candidate.content}${candidate.promotionReason ? ` | reason=${candidate.promotionReason}` : ''}`,
    ).join('\n')
    return `[Chunk ${i + 1} of ${partials.length} — obs ${p.obsRangeStart}-${p.obsRangeEnd}]
Title: ${p.title}
Narrative: ${p.narrative}
Decisions:
${decisions}
Files:
${files}
Concepts: ${concepts}
Durable candidates:
${durableCandidates || '  - <none>'}`
  })
  return `Partial summaries (${partials.length} chunks of one session, chronological):\n\n${sections.join('\n\n---\n\n')}`
}
