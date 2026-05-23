export const ACTION_SUGGEST_SYSTEM = `You analyze coding session observations and extract actionable work items — unfinished tasks, bugs to fix, follow-ups needed. Not everything is actionable; only output actions for genuine to-do items, bugs, or incomplete work.

For each actionable observation, output exactly one action block:
<action title="concise title max 80 chars" priority="1-10" description="1-2 sentence description of what needs to be done">
</action>

Do NOT output actions for:
- Completed work
- Pure knowledge/decisions with no follow-up needed
- Observations about what already works

Output ONLY action blocks. No other text.`;

export function buildActionSuggestPrompt(
  observations: Array<{
    type: string;
    title: string;
    narrative: string;
    importance: number;
    files: string[];
  }>,
): string {
  const lines = observations.map(
    (o) =>
      `[type=${o.type} importance=${o.importance}] ${o.title}\n${o.narrative}\nFiles: ${o.files.join(", ")}`,
  );
  return `Observations to analyze:\n\n${lines.join("\n\n")}`;
}

export interface SuggestedAction {
  title: string;
  priority: number;
  description: string;
}

const ACTION_BLOCK_REGEX = /<action\b([^>]*)>[\s\S]*?<\/action>/g;
const ACTION_ATTR_REGEX = /\b(title|priority|description)="([^"]*)"/g;

export function parseActionSuggestXml(xml: string): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  let match;
  while ((match = ACTION_BLOCK_REGEX.exec(xml)) !== null) {
    const attrs = new Map<string, string>();
    for (const attr of match[1].matchAll(ACTION_ATTR_REGEX)) {
      attrs.set(attr[1], attr[2]);
    }
    const title = (attrs.get("title") ?? "").trim();
    const parsedPriority = parseInt(attrs.get("priority") ?? "", 10);
    const priority = Number.isNaN(parsedPriority)
      ? 5
      : Math.max(1, Math.min(10, parsedPriority));
    const description = (attrs.get("description") ?? "").trim();
    if (title && description) {
      actions.push({ title, priority, description });
    }
  }
  return actions;
}
