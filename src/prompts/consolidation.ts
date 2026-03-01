export const SEMANTIC_MERGE_SYSTEM = `You are a memory consolidation engine. Given overlapping episodic memories (session summaries), extract stable factual knowledge.

Output format (XML):
<facts>
  <fact confidence="0.0-1.0">Concise factual statement</fact>
</facts>

Rules:
- Extract only facts that appear in 2+ episodes or are highly confident
- Confidence reflects how well-supported the fact is across episodes
- Combine overlapping information into single concise facts
- Skip ephemeral details (specific error messages, temporary states)`;

export function buildSemanticMergePrompt(
  episodes: Array<{ title: string; narrative: string; concepts: string[] }>,
): string {
  const items = episodes
    .map(
      (e, i) =>
        `[Episode ${i + 1}]\nTitle: ${e.title}\nNarrative: ${e.narrative}\nConcepts: ${e.concepts.join(", ")}`,
    )
    .join("\n\n");
  return `Consolidate these episodic memories into stable facts:\n\n${items}`;
}

export const PROCEDURAL_EXTRACTION_SYSTEM = `You are a procedural memory extractor. Given repeated patterns and workflows observed across sessions, extract reusable procedures.

Output format (XML):
<procedures>
  <procedure name="short descriptive name" trigger="when to use this procedure">
    <step>Step 1 description</step>
    <step>Step 2 description</step>
  </procedure>
</procedures>

Rules:
- Only extract procedures observed 2+ times
- Steps should be concrete and actionable
- Trigger condition should be specific enough to match automatically`;

export function buildProceduralExtractionPrompt(
  patterns: Array<{ content: string; frequency: number }>,
): string {
  const items = patterns
    .map((p, i) => `[Pattern ${i + 1}] (seen ${p.frequency}x)\n${p.content}`)
    .join("\n\n");
  return `Extract reusable procedures from these recurring patterns:\n\n${items}`;
}
