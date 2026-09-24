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

// ~3K tokens: fits a small local context window alongside the response.
const DEFAULT_REFLECT_PROMPT_CHARS = 12000;
const MIN_REFLECT_PROMPT_CHARS = 2000;
// Keeps one oversized item from starving the rest of the cluster.
const MAX_ITEM_CHARS = 800;

const PROMPT_PREAMBLE =
  "Synthesize higher-order insights from this cluster of related memories:\n\n";

export function getReflectPromptChars(): number {
  const n = parseInt(process.env.AGENTMEMORY_REFLECT_PROMPT_CHARS ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_REFLECT_PROMPT_CHARS;
  return Math.max(MIN_REFLECT_PROMPT_CHARS, n);
}

function truncateItem(text: string): string {
  return text.length > MAX_ITEM_CHARS
    ? `${text.slice(0, MAX_ITEM_CHARS)}…`
    : text;
}

export function buildReflectPrompt(cluster: {
  concepts: string[];
  facts: Array<{ fact: string; confidence: number }>;
  lessons: Array<{ content: string; confidence: number }>;
  crystalNarratives: string[];
}): string {
  // A high-degree cluster can match hundreds of lessons. Providers reject an
  // over-length prompt instead of truncating it, and repeated rejections trip
  // the circuit breaker for every remaining cluster, so spend a fixed budget
  // on the highest-confidence evidence first.
  const header = `## Concept Cluster: ${cluster.concepts.join(", ")}`;
  const sections: string[] = [header];
  let budget = getReflectPromptChars() - PROMPT_PREAMBLE.length - header.length;

  const addSection = (heading: string, lines: string[]): void => {
    const kept: string[] = [];
    let remaining = budget - heading.length - 1;
    for (const line of lines) {
      if (line.length + 1 > remaining) break;
      kept.push(line);
      remaining -= line.length + 1;
    }
    if (kept.length === 0) return;
    sections.push(heading, ...kept);
    budget = remaining;
  };

  addSection(
    "\n## Known Facts",
    [...cluster.facts]
      .sort((a, b) => b.confidence - a.confidence)
      .map((f) => `- [confidence=${f.confidence}] ${truncateItem(f.fact)}`),
  );

  addSection(
    "\n## Lessons Learned",
    [...cluster.lessons]
      .sort((a, b) => b.confidence - a.confidence)
      .map((l) => `- [confidence=${l.confidence}] ${truncateItem(l.content)}`),
  );

  addSection(
    "\n## Completed Work Summaries",
    cluster.crystalNarratives.map((n) => `- ${truncateItem(n)}`),
  );

  return `${PROMPT_PREAMBLE}${sections.join("\n")}`;
}
