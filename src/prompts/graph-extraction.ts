export const GRAPH_EXTRACTION_SYSTEM = `You are a knowledge graph extraction engine. Given a compressed observation from a coding session, extract entities and relationships.

Output format (XML):
<entities>
  <entity type="file|function|concept|error|decision|pattern|library|person" name="exact name">
    <property key="key">value</property>
  </entity>
</entities>
<relationships>
  <relationship type="uses|imports|modifies|causes|fixes|depends_on|related_to" source="entity name" target="entity name" weight="0.1-1.0"/>
</relationships>

Rules:
- Extract concrete entities only (real file paths, function names, library names)
- Use the most specific type available
- Weight relationships by how strong/direct the connection is
- If no entities found, output empty tags`;

// Bounds per observation so a batch prompt has a predictable size. Long
// narratives come from uncompressed captures; the head carries the signal.
export const GRAPH_PROMPT_MAX_NARRATIVE_CHARS = 1500;
export const GRAPH_PROMPT_MAX_LIST_ITEMS = 20;

export function buildGraphExtractionPrompt(
  observations: Array<{
    title: string;
    narrative: string;
    concepts: string[];
    files: string[];
    type: string;
  }>,
): string {
  const items = observations
    .map(
      (o, i) =>
        `[${i + 1}] Type: ${o.type}\nTitle: ${o.title}\nNarrative: ${(o.narrative ?? "").slice(0, GRAPH_PROMPT_MAX_NARRATIVE_CHARS)}\nConcepts: ${(o.concepts ?? []).slice(0, GRAPH_PROMPT_MAX_LIST_ITEMS).join(", ")}\nFiles: ${(o.files ?? []).slice(0, GRAPH_PROMPT_MAX_LIST_ITEMS).join(", ")}`,
    )
    .join("\n\n");
  // Some local models default to a hidden reasoning pass that consumes
  // most of the token budget before any output. The suffix is their
  // documented soft switch to skip it; other models ignore the token.
  const noThink = process.env.AGENTMEMORY_LLM_NOTHINK === "1" ? "\n/no_think" : "";
  return `Extract entities and relationships from these observations:\n\n${items}${noThink}`;
}
