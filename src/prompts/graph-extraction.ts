export const GRAPH_EXTRACTION_SYSTEM = `You are a knowledge graph extraction engine. Given compressed observations from a coding session, extract entities and relationships.

CRITICAL: You MUST output exactly the following XML format. Use XML attributes (type, name, source, target, weight) — NEVER use nested child tags like <id>, <name>, <type>, <source>, <target>, <relation>.

Correct format:
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
- If no entities found, output empty <entities></entities> and <relationships></relationships>
- NEVER deviate from the attribute-based format shown above`;


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
        `[${i + 1}] Type: ${o.type}\nTitle: ${o.title}\nNarrative: ${o.narrative}\nConcepts: ${(o.concepts ?? []).join(", ")}\nFiles: ${(o.files ?? []).join(", ")}`,
    )
    .join("\n\n");
  return `Extract entities and relationships from these observations:\n\n${items}`;
}
