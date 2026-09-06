export const REFLECT_SYSTEM = `You are a higher-order reasoning engine. Given a cluster of related concepts, facts, lessons, and action outcomes, synthesize cross-cutting insights that span multiple individual memories.

Output format (XML):
<insights>
  <insight confidence="0.0-1.0" title="Short descriptive title">
    The higher-order observation or principle. Should be actionable and non-obvious — something that only becomes visible when viewing multiple memories together.
  </insight>
</insights>

Rules:
- Identify patterns, principles, or strategies that span 2+ source items
- Confidence reflects how well-supported the insight is across sources
- Title should be a concise label (under 60 chars)
- Content should be the actual observation (1-3 sentences)
- Prefer actionable insights over abstract summaries
- Skip insights that merely restate a single source item
- Always emit confidence attribute before title attribute`;

export const MAX_REFLECT_PROMPT_CHARS = 12000;

export function buildReflectPrompt(cluster: {
  concepts: string[];
  facts: Array<{ fact: string; confidence: number }>;
  lessons: Array<{ content: string; confidence: number }>;
  crystalNarratives: string[];
}): string {
  const sections: string[] = [];

  sections.push(`## Concept Cluster: ${cluster.concepts.join(", ")}`);

  if (cluster.facts.length > 0) {
    sections.push(
      "\n## Known Facts",
      ...cluster.facts.map(
        (f) => `- [confidence=${f.confidence}] ${f.fact}`,
      ),
    );
  }

  if (cluster.lessons.length > 0) {
    sections.push(
      "\n## Lessons Learned",
      ...cluster.lessons.map(
        (l) => `- [confidence=${l.confidence}] ${l.content}`,
      ),
    );
  }

  if (cluster.crystalNarratives.length > 0) {
    sections.push(
      "\n## Completed Work Summaries",
      ...cluster.crystalNarratives.map((n) => `- ${n}`),
    );
  }

  const prompt = `Synthesize higher-order insights from this cluster of related memories:\n\n${sections.join("\n")}`;

  if (prompt.length > MAX_REFLECT_PROMPT_CHARS) {
    const note = "\n\n[... truncated due to size limit]";
    return prompt.slice(0, MAX_REFLECT_PROMPT_CHARS - note.length) + note;
  }

  return prompt;
}
