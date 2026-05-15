// First-run interactive onboarding flow.
//
// Wakes up only when `isFirstRun()` is true (preferences are missing or
// have never recorded a `firstRunAt`) or when the user passes
// `--reset`. The flow asks for:
//
//   1. Which agents will be wired to agentmemory (multi-select). Each
//      option carries a small glyph that we reuse in /status output so
//      the user recognises them later. The label mirrors README row 1
//      (native plugins) and row 2 (MCP-only).
//   2. Which LLM provider to use for compress / consolidate / graph.
//      "skip — BM25-only mode" is a real first-class option; lots of
//      users want agentmemory purely as a hybrid keyword + vector
//      memory layer without granting LLM API keys.
//
// We then write `~/.agentmemory/preferences.json` and seed
// `~/.agentmemory/.env` with a commented-out `*_API_KEY=` line for the
// chosen provider. This matches the existing `agentmemory init` flow
// closely so users who skip onboarding still get the same file via
// `agentmemory init`.

import { copyFile, mkdir } from "node:fs/promises";
import { constants as fsConstants, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { writePrefs } from "./preferences.js";
import { resolveAdapter, runAdapter } from "./connect/index.js";
import type { ConnectResult } from "./connect/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Native plugin row — these agents ship an agentmemory plugin or
// first-party integration. Glyphs match SkillKit's published set
// where they overlap; the rest fall back to the generic `◇`.
const NATIVE_AGENTS: { value: string; label: string; glyph: string }[] = [
  { value: "claude-code", label: "Claude Code", glyph: "⟁" },
  { value: "codex", label: "Codex", glyph: "◎" },
  { value: "openhuman", label: "OpenHuman", glyph: "◇" },
  { value: "openclaw", label: "OpenClaw", glyph: "◇" },
  { value: "hermes", label: "Hermes", glyph: "◇" },
  { value: "pi", label: "Pi", glyph: "◇" },
  { value: "cursor", label: "Cursor", glyph: "◫" },
  { value: "gemini-cli", label: "Gemini CLI", glyph: "✦" },
];

// MCP-only row — these agents use the MCP server we ship rather than
// a native plugin.
const MCP_AGENTS: { value: string; label: string; glyph: string }[] = [
  { value: "opencode", label: "OpenCode", glyph: "⬡" },
  { value: "cline", label: "Cline", glyph: "◇" },
  { value: "goose", label: "Goose", glyph: "◇" },
  { value: "kilo", label: "Kilo", glyph: "◇" },
  { value: "aider", label: "Aider", glyph: "◇" },
  { value: "claude-desktop", label: "Claude Desktop", glyph: "⟁" },
  { value: "windsurf", label: "Windsurf", glyph: "◇" },
  { value: "roo", label: "Roo", glyph: "◇" },
];

const PROVIDERS: { value: string; label: string; envKey: string | null }[] = [
  { value: "anthropic", label: "Anthropic — claude", envKey: "ANTHROPIC_API_KEY" },
  { value: "openai", label: "OpenAI — gpt", envKey: "OPENAI_API_KEY" },
  { value: "gemini", label: "Google — gemini", envKey: "GEMINI_API_KEY" },
  { value: "openrouter", label: "OpenRouter — multi-model", envKey: "OPENROUTER_API_KEY" },
  { value: "minimax", label: "MiniMax — minimax-m1", envKey: "MINIMAX_API_KEY" },
  { value: "skip", label: "Skip — BM25-only mode (no LLM key)", envKey: null },
];

function buildAgentOptions(): { value: string; label: string; hint?: string }[] {
  return [
    ...NATIVE_AGENTS.map((a) => ({
      value: a.value,
      label: `${a.glyph} ${a.label}`,
      hint: "native plugin",
    })),
    ...MCP_AGENTS.map((a) => ({
      value: a.value,
      label: `${a.glyph} ${a.label}`,
      hint: "MCP server",
    })),
  ];
}

// Mirror src/cli.ts findEnvExample so onboarding ships the same .env
// skeleton whether called directly or via `agentmemory init`. We
// duplicate (rather than import) so the onboarding module doesn't
// pull cli.ts's top-level side effects into the test runner.
function findEnvExample(): string | null {
  const candidates = [
    join(__dirname, "..", "..", ".env.example"),
    join(__dirname, "..", ".env.example"),
    join(__dirname, ".env.example"),
    join(process.cwd(), ".env.example"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

async function seedEnvFile(provider: string | null): Promise<string | null> {
  const target = join(homedir(), ".agentmemory", ".env");
  const dir = dirname(target);
  await mkdir(dir, { recursive: true });

  const template = findEnvExample();
  if (template && !existsSync(target)) {
    try {
      await copyFile(template, target, fsConstants.COPYFILE_EXCL);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") {
        return null;
      }
    }
  } else if (!template && !existsSync(target)) {
    // Fall back to a minimal skeleton so users always get a `.env` to
    // edit. This matches the shape of the bundled `.env.example`
    // without forcing us to keep two copies in sync.
    const lines = [
      "# agentmemory environment — uncomment what you need",
      "# AGENTMEMORY_URL=http://localhost:3111",
      "",
    ];
    const envKey = PROVIDERS.find((x) => x.value === provider)?.envKey;
    if (envKey) {
      lines.push(`# ${envKey}=`);
    }
    writeFileSync(target, lines.join("\n"), { mode: 0o600 });
  }

  return target;
}

export interface OnboardingResult {
  agents: string[];
  provider: string | null;
}

export async function runOnboarding(): Promise<OnboardingResult> {
  p.note(
    [
      "Welcome to agentmemory.",
      "",
      "Persistent memory for your AI coding agents. We'll pick which",
      "agents to wire up and which provider (if any) handles compression",
      "and consolidation. Either step can be changed later in ~/.agentmemory/.env.",
    ].join("\n"),
    "first-run setup",
  );

  const agentsPicked = await p.multiselect<string>({
    message: "Which agents will use agentmemory? (space to toggle, enter to confirm)",
    options: buildAgentOptions(),
    required: false,
    initialValues: ["claude-code"],
  });
  if (p.isCancel(agentsPicked)) {
    p.cancel("Setup cancelled. Re-run any time with: agentmemory --reset");
    process.exit(0);
  }

  const pickedAgentsList = (agentsPicked as string[]) ?? [];
  if (pickedAgentsList.length > 0) {
    p.note(
      [
        "━ how this works ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "All selected agents share the same memory at :3111.",
        "A memory saved by Claude Code is visible to Codex + Cursor instantly.",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      ].join("\n"),
    );
  }

  const providerPicked = await p.select<string>({
    message: "Which LLM provider should agentmemory use for compress/consolidate?",
    options: PROVIDERS.map(({ value, label }) => ({ value, label })),
    initialValue: "anthropic",
  });
  if (p.isCancel(providerPicked)) {
    p.cancel("Setup cancelled. Re-run any time with: agentmemory --reset");
    process.exit(0);
  }

  const provider = providerPicked === "skip" ? null : providerPicked;
  const agents = (agentsPicked as string[]) ?? [];

  const envPath = await seedEnvFile(provider);

  writePrefs({
    lastAgent: agents[0] ?? null,
    lastAgents: agents,
    lastProvider: provider,
    skipSplash: true,
    firstRunAt: new Date().toISOString(),
  });

  const prefsLocation = join(homedir(), ".agentmemory", "preferences.json");
  const lines = [`✓ Saved preferences to ${prefsLocation}`];
  if (envPath) {
    lines.push(`✓ Wrote ${envPath} (edit to add your API key)`);
  } else {
    lines.push(`! Could not write ~/.agentmemory/.env — run \`agentmemory init\` after this completes.`);
  }
  if (provider) {
    const envKey = PROVIDERS.find((x) => x.value === provider)?.envKey;
    if (envKey) {
      lines.push(`  Uncomment ${envKey}= in that file to enable ${provider}.`);
    }
  } else {
    lines.push("  No provider chosen — agentmemory will run in BM25-only mode.");
  }
  p.note(lines.join("\n"), "ready");

  if (agents.length > 0) {
    await wireSelectedAgents(agents);
  }

  return { agents, provider };
}

async function wireSelectedAgents(agents: string[]): Promise<void> {
  p.note("Wire selected agents now?", "next step");
  const confirmed = await p.confirm({
    message: "Run `agentmemory connect <agent>` for each selected agent now? [Y/n]",
    initialValue: true,
  });

  if (p.isCancel(confirmed) || confirmed === false) {
    const cmds = agents.map((a) => `  agentmemory connect ${a}`);
    p.note(["Wire later with:", ...cmds].join("\n"), "later");
    return;
  }

  const wired: string[] = [];
  const manual: { name: string; docs?: string }[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const name of agents) {
    const adapter = resolveAdapter(name);
    if (!adapter) {
      failed.push({ name, reason: "no adapter available" });
      p.log.warn(`Wiring ${name}… no adapter available (skipped).`);
      continue;
    }
    p.log.step(`Wiring ${name}...`);
    let result: ConnectResult;
    try {
      result = await runAdapter(adapter, { dryRun: false, force: false });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failed.push({ name, reason });
      p.log.error(`${name}: ${reason}`);
      continue;
    }
    switch (result.kind) {
      case "installed":
      case "already-wired":
        wired.push(name);
        break;
      case "stub":
        manual.push({ name, docs: adapter.docs });
        break;
      case "skipped":
        failed.push({ name, reason: result.reason });
        break;
    }
  }

  const summary: string[] = [];
  if (wired.length > 0) {
    summary.push(`Wired: ${wired.join(", ")}.`);
  }
  if (manual.length > 0 || failed.length > 0) {
    const parts: string[] = [];
    for (const m of manual) {
      parts.push(`${m.name} (manual install required${m.docs ? ` — see ${m.docs}` : ""})`);
    }
    for (const f of failed) {
      parts.push(`${f.name} (${f.reason})`);
    }
    summary.push(`Skipped/failed: ${parts.join(", ")}.`);
  }
  if (summary.length === 0) {
    summary.push("No agents were wired.");
  }
  p.note(summary.join("\n"), "wire summary");
}
