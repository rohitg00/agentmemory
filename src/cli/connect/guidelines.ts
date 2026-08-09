import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Activating memory for agents that have no auto-capture hooks: write a short
// "use the memory tools" guideline into each agent's native rules mechanism so
// the agent proactively calls memory_recall / memory_save. Paths + formats are
// verified against each agent's OFFICIAL docs (cited per entry below). Claude
// Code / Codex are omitted here: they already auto-capture via lifecycle hooks.

const START = "<!-- agentmemory:start -->";
const END = "<!-- agentmemory:end -->";

const GUIDELINE_BODY = `## Agent memory (agentmemory)

You have persistent long-term memory via the agentmemory MCP server. Tools: \`memory_recall\`, \`memory_smart_search\`, \`memory_save\`, \`memory_sessions\`.

- At the START of a task, call \`memory_recall\` (or \`memory_smart_search\`) with the task context to load relevant past decisions, fixes, and preferences before asking the user to repeat anything.
- When you learn something durable (a decision, a fix, a gotcha, a user preference, a project convention), call \`memory_save\` to persist it.
- Prefer recalling over re-deriving, and save concise reusable facts rather than transcripts.`;

// "block"    -> upsert a marked block inside a shared instructions file
// "mdc"      -> Cursor project rule: dedicated .mdc with alwaysApply frontmatter
// "steering" -> Kiro steering file: dedicated .md with inclusion:always frontmatter
// "rule"     -> dedicated always-on markdown rule file (own file, safe to own)
type GuidelineFormat = "block" | "mdc" | "steering" | "rule";

type GuidelineTarget = {
  // Preferred user-global rules file (absolute). Omitted when the agent has no
  // clean global rules FILE (UI-only or project-scoped), forcing the project
  // fallback. Global is preferred so memory activates across all repos.
  globalPath?: string;
  // Project fallback, relative to cwd.
  projectPath: string;
  format: GuidelineFormat;
  scope: "global" | "project";
  source: string; // official doc URL the path/format was verified against
};

export function guidelineTargets(
  home: string = homedir(),
): Record<string, GuidelineTarget> {
  return {
    // No global rules FILE (User Rules are UI-only) -> project .cursor/rules/*.mdc
    cursor: {
      projectPath: join(".cursor", "rules", "agentmemory.mdc"),
      format: "mdc",
      scope: "project",
      source: "https://cursor.com/docs/rules",
    },
    // Cline's global rules dir is a non-standard ~/Documents path; the dedicated
    // project rule (no frontmatter = always active) is the verified stable form.
    cline: {
      projectPath: join(".clinerules", "agentmemory.md"),
      format: "rule",
      scope: "project",
      source: "https://docs.cline.bot/customization/cline-rules",
    },
    // Continue does not auto-read AGENTS.md; rules live in .continue/rules/*.md.
    continue: {
      projectPath: join(".continue", "rules", "00-agentmemory.md"),
      format: "rule",
      scope: "project",
      source: "https://docs.continue.dev/customize/deep-dives/rules",
    },
    zed: {
      globalPath: join(home, ".config", "zed", "AGENTS.md"),
      projectPath: "AGENTS.md",
      format: "block",
      scope: "global",
      source: "https://zed.dev/docs/ai/instructions",
    },
    // Warp global Rules are UI-managed (no file path) -> project AGENTS.md.
    warp: {
      projectPath: "AGENTS.md",
      format: "block",
      scope: "project",
      source: "https://docs.warp.dev/agent-platform/capabilities/rules",
    },
    kiro: {
      globalPath: join(home, ".kiro", "steering", "agentmemory.md"),
      projectPath: join(".kiro", "steering", "agentmemory.md"),
      format: "steering",
      scope: "global",
      source: "https://kiro.dev/docs/steering",
    },
    "gemini-cli": {
      globalPath: join(home, ".gemini", "GEMINI.md"),
      projectPath: "GEMINI.md",
      format: "block",
      scope: "global",
      source: "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md",
    },
    qwen: {
      globalPath: join(home, ".qwen", "QWEN.md"),
      projectPath: "QWEN.md",
      format: "block",
      scope: "global",
      source: "https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md",
    },
    opencode: {
      globalPath: join(home, ".config", "opencode", "AGENTS.md"),
      projectPath: "AGENTS.md",
      format: "block",
      scope: "global",
      source: "https://opencode.ai/docs/rules",
    },
    droid: {
      globalPath: join(home, ".factory", "AGENTS.md"),
      projectPath: "AGENTS.md",
      format: "block",
      scope: "global",
      source: "https://docs.factory.ai/cli/configuration/agents-md",
    },
    // Antigravity does NOT read AGENTS.md; global rules live in ~/.gemini/GEMINI.md.
    antigravity: {
      globalPath: join(home, ".gemini", "GEMINI.md"),
      projectPath: join(".agents", "rules", "agentmemory.md"),
      format: "block",
      scope: "global",
      source: "https://antigravity.google/docs/rules-workflows",
    },
    // The agy CLI reads the same ~/.gemini/GEMINI.md as the IDE.
    "antigravity-cli": {
      globalPath: join(home, ".gemini", "GEMINI.md"),
      projectPath: join(".agents", "rules", "agentmemory.md"),
      format: "block",
      scope: "global",
      source: "https://antigravity.google/docs/rules-workflows",
    },
    "copilot-cli": {
      globalPath: join(home, ".copilot", "copilot-instructions.md"),
      projectPath: join(".github", "copilot-instructions.md"),
      format: "block",
      scope: "global",
      source:
        "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions",
    },
  };
}

function renderDedicated(format: GuidelineFormat): string {
  if (format === "mdc") {
    return `---\ndescription: agentmemory long-term memory usage\nalwaysApply: true\n---\n\n${GUIDELINE_BODY}\n`;
  }
  if (format === "steering") {
    return `---\ninclusion: always\n---\n\n${GUIDELINE_BODY}\n`;
  }
  // plain dedicated rule (Cline / Continue)
  return `${GUIDELINE_BODY}\n`;
}

// Insert or replace the marked block in a shared instructions file, preserving
// any surrounding user content. Idempotent: re-running updates only our block.
function upsertBlock(existing: string): string {
  const block = `${START}\n${GUIDELINE_BODY}\n${END}`;
  const startIdx = existing.indexOf(START);
  const endIdx = existing.indexOf(END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return (
      existing.slice(0, startIdx) + block + existing.slice(endIdx + END.length)
    );
  }
  // Malformed marker state: a lone or reversed marker. Appending here would
  // let a later run pair the orphan marker with the appended block's twin and
  // cut the user's content between them. Leave the file untouched.
  if (startIdx !== -1 || endIdx !== -1) {
    return existing;
  }
  const sep = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const lead = existing.length === 0 ? "" : "\n";
  return `${existing}${sep}${lead}${block}\n`;
}

export type GuidelineResult =
  | { kind: "written"; path: string; scope: string; source: string }
  | { kind: "unchanged"; path: string; scope: string }
  | { kind: "would-write"; path: string; scope: string }
  | { kind: "no-target" };

export function writeGuideline(
  agentName: string,
  opts: { cwd: string; home?: string; dryRun?: boolean } = { cwd: process.cwd() },
): GuidelineResult {
  const home = opts.home ?? homedir();
  const target = guidelineTargets(home)[agentName];
  if (!target) return { kind: "no-target" };

  const path = target.globalPath ?? join(opts.cwd, target.projectPath);
  const dedicated = target.format !== "block";

  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const next = dedicated ? renderDedicated(target.format) : upsertBlock(existing);

  if (existing === next) {
    return { kind: "unchanged", path, scope: target.scope };
  }
  if (opts.dryRun) {
    return { kind: "would-write", path, scope: target.scope };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next, "utf8");
  return { kind: "written", path, scope: target.scope, source: target.source };
}
