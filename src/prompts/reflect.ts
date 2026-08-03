export const REFLECT_SYSTEM = `You are a higher-order reasoning engine. Given a cluster of related concepts, facts, lessons, and action outcomes, synthesize cross-cutting insights that span multiple individual memories.

Output format (XML):
<insights>
  <insight evidenceVerdict="supported|refuted|mixed|unverified" confidence="0.0-1.0" title="Short descriptive title">
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
- Treat refuted lessons as negative evidence, never as positive guidance
- Treat contradicted lessons as contested evidence, never as settled guidance
- When negative or contradicted evidence contributes, emit only refuted or mixed evidenceVerdict
- Always emit evidenceVerdict before confidence and title attributes`;

export function buildReflectPrompt(cluster: {
  concepts: string[];
  facts: Array<{ fact: string; confidence: number }>;
  lessons: Array<{
    content: string;
    claim?: string;
    confidence: number;
    evidenceVerdict: "supported" | "refuted" | "mixed" | "unverified";
    contradicted: boolean;
  }>;
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
    const positiveLessons = cluster.lessons.filter(
      (lesson) =>
        lesson.evidenceVerdict !== "refuted" && !lesson.contradicted,
    );
    const negativeLessons = cluster.lessons.filter(
      (lesson) =>
        lesson.evidenceVerdict === "refuted" || lesson.contradicted,
    );
    if (positiveLessons.length > 0) {
      sections.push(
        "\n## Lessons Learned",
        ...positiveLessons.map(
          (lesson) =>
            `- [verdict=${lesson.evidenceVerdict}; confidence=${lesson.confidence}] claim=${lesson.claim ?? "(prose-only)"} | ${lesson.content}`,
        ),
      );
    }
    if (negativeLessons.length > 0) {
      sections.push(
        "\n## Negative or Contradicted Evidence",
        ...negativeLessons.map(
          (lesson) =>
            `- [verdict=${lesson.evidenceVerdict}; contradicted=${lesson.contradicted}; confidence=${lesson.confidence}] claim=${lesson.claim ?? "(prose-only)"} | ${lesson.content}`,
        ),
      );
    }
  }

  if (cluster.crystalNarratives.length > 0) {
    sections.push(
      "\n## Completed Work Summaries",
      ...cluster.crystalNarratives.map((n) => `- ${n}`),
    );
  }

  return `Synthesize higher-order insights from this cluster of related memories:\n\n${sections.join("\n")}`;
}
