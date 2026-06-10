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
import { appendFileSync, readFileSync } from "node:fs";
import { readPrefs, writePrefs } from "./preferences.js";
import { ADAPTERS, resolveAdapter, runAdapter } from "./connect/index.js";
import type { ConnectResult } from "./connect/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Native plugin row — these agents ship an agentmemory plugin or
// first-party integration. Glyphs match SkillKit's published set
// where they overlap; the rest fall back to the generic `◇`.
// Display glyph per agent; the agent set itself comes from connect's
// ADAPTERS (single source of truth) so the picker can never drift from
// what `agentmemory connect` can actually wire (#872). Unknown adapters
// fall back to a neutral glyph.
const AGENT_GLYPH: Record<string, string> = {
  "claude-code": "⟁",
  "copilot-cli": "◈",
  codex: "◎",
  cursor: "◫",
  "gemini-cli": "✦",
  opencode: "⬡",
};

const PROVIDERS: { value: string; label: string; envKey: string | null }[] = [
  { value: "anthropic", label: "Anthropic — claude", envKey: "ANTHROPIC_API_KEY" },
  { value: "openai", label: "OpenAI — gpt", envKey: "OPENAI_API_KEY" },
  { value: "gemini", label: "Google — gemini", envKey: "GEMINI_API_KEY" },
  { value: "openrouter", label: "OpenRouter — multi-model", envKey: "OPENROUTER_API_KEY" },
  { value: "minimax", label: "MiniMax — minimax-m1", envKey: "MINIMAX_API_KEY" },
  { value: "skip", label: "Skip — BM25-only mode (no LLM key)", envKey: null },
];

const PROVIDER_COST_HINTS: Record<string, string> = {
  anthropic: "rough cost: a fast Haiku-class model keeps compress/consolidate at fractions of a cent per session.",
  openai: "rough cost: a mini-class model keeps compress/consolidate at fractions of a cent per session.",
  gemini: "rough cost: a Flash-class model keeps compress/consolidate at fractions of a cent per session.",
  openrouter: "rough cost: pick a small model; spend tracks your chosen model's per-token price.",
  minimax: "rough cost: scales with the MiniMax model price per token.",
};

export function buildAgentOptions(): { value: string; label: string; hint?: string }[] {
  const options = ADAPTERS.map((a) => ({
    value: a.name,
    label: `${AGENT_GLYPH[a.name] ?? "◇"} ${a.displayName}`,
    hint: a.category === "native" ? "native plugin" : "MCP server",
  }));
  return [
    ...options.filter((o) => o.hint === "native plugin"),
    ...options.filter((o) => o.hint === "MCP server"),
  ];
}

export function getInitialAgentValues(
  env: Record<string, string | undefined> = process.env,
): string[] {
  if (env["COPILOT_CLI"] === "1" || env["COPILOT_AGENT_SESSION_ID"]) {
    return ["copilot-cli"];
  }
  return ["claude-code"];
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

function shouldSkipInteractiveOnboarding(): boolean {
  const ci = process.env["CI"];
  return (
    process.stdin.isTTY !== true ||
    process.stdout.isTTY !== true ||
    (ci !== undefined && ci !== "" && ci !== "0" && ci.toLowerCase() !== "false")
  );
}

function writeDefaultOnboardingPrefs(): OnboardingResult {
  writePrefs({
    lastAgent: null,
    lastAgents: [],
    lastProvider: null,
    skipSplash: true,
    firstRunAt: new Date().toISOString(),
  });
  return { agents: [], provider: null };
}

export async function runOnboarding(): Promise<OnboardingResult> {
  if (shouldSkipInteractiveOnboarding()) {
    return writeDefaultOnboardingPrefs();
  }

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
    initialValues: getInitialAgentValues(),
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
        "A memory saved by Claude Code is visible to Copilot + Codex + Cursor instantly.",
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

  if (provider) {
    const hint = PROVIDER_COST_HINTS[provider];
    if (hint) {
      p.log.info(hint);
    }
  }

  const envPath = await seedEnvFile(provider);

  await maybePromptContextInjection(envPath);

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

function enableInjectContextInEnv(envPath: string | null): boolean {
  if (!envPath || !existsSync(envPath)) return false;
  try {
    const current = readFileSync(envPath, "utf-8");
    if (/^\s*AGENTMEMORY_INJECT_CONTEXT\s*=\s*true\b/m.test(current)) {
      return true;
    }
    const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
    appendFileSync(envPath, `${prefix}AGENTMEMORY_INJECT_CONTEXT=true\n`, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

async function maybePromptContextInjection(envPath: string | null): Promise<void> {
  if (readPrefs().injectContextChosen) return;

  const enable = await p.confirm({
    message: "Enable automatic context injection so the agent recalls past sessions without being asked? [y/N]",
    initialValue: false,
  });

  if (p.isCancel(enable)) {
    p.cancel("Setup cancelled. Re-run any time with: agentmemory --reset");
    process.exit(0);
  }

  p.log.info(
    "Cost note: injection spends session tokens proportional to tool-call frequency. Default is off.",
  );

  writePrefs({ injectContextChosen: true });

  if (enable === true) {
    const wrote = enableInjectContextInEnv(envPath);
    if (wrote) {
      p.log.success("Context injection enabled (AGENTMEMORY_INJECT_CONTEXT=true).");
    } else {
      p.log.warn(
        "Could not update ~/.agentmemory/.env. Set AGENTMEMORY_INJECT_CONTEXT=true there to enable it.",
      );
    }
  } else {
    p.log.info("Context injection left off. Set AGENTMEMORY_INJECT_CONTEXT=true later to enable.");
  }
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
