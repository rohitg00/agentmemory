import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import { backupFile, logAlreadyWired, logBackup, logInstalled } from "./util.js";

const NL = "\n";

// DeepSeek Harness (dsh) adapter.
//
// DSH has no native hooks; it consumes agentmemory through its MCP client
// plugin (@deepseek-ai/dsh-mcp-client, stdio transport) and loads per-session
// instructions from $DSH_HOME/AGENTS.md. This adapter:
//   1. appends the mcp-agentmemory entry to the profile's cordis.patch.yml
//      (HMR hot-reloads the config, no restart needed),
//   2. writes ~/.dsh/skills/agentmemory-sync/SKILL.md so the skill registry
//      (scans <dshHome>/skills) exposes a memory-sync skill,
//   3. (runAdapter) writes the memory-usage guideline block into
//      ~/.dsh/AGENTS.md via guidelines.ts.
// The L3 cordis plugin (@agentmemory/dsh) is installed separately:
//   dsh plugin --profile web add @agentmemory/dsh

function dshHome(): string {
  // Aligns with guidelines.ts (which uses os.homedir() for the dsh guideline
  // target); DSH_HOME is an explicit override for unusual setups.
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function profilesDir(): string {
  return join(dshHome(), "profiles");
}

function defaultProfile(): string {
  return process.env["AGENTMEMORY_DSH_PROFILE"]?.trim() || "web";
}

function profileDir(profile: string): string {
  return join(profilesDir(), profile);
}

function patchPath(profile: string): string {
  return join(profileDir(profile), "cordis.patch.yml");
}

const MCP_ENTRY_MARKER = "# ── agentmemory (installed by 'agentmemory connect dsh') ──";

// Remove the previously installed agentmemory block (marker comment + its
// insert entry) so --force re-installs cleanly instead of appending a
// duplicate. Also removes a user-configured `- id: mcp-agentmemory` entry
// that lacks the marker, so --force never leaves two entries with the same
// server id. Content outside the removed spans (user's own entries) survives.
function stripInstalledBlock(content: string): string {
  let out = content;
  const idx = out.indexOf(MCP_ENTRY_MARKER);
  if (idx !== -1) {
    const lineStart = out.lastIndexOf("\n", idx) + 1;
    const tail = out.slice(lineStart);
    // The block's own "- insert:" line, then any following top-level entry.
    const first = tail.search(/^- /m);
    const rest = first === -1 ? "" : tail.slice(first + 1);
    const second = rest.search(/^- /m);
    const end = second === -1 ? out.length : lineStart + first + 1 + second;
    out = out.slice(0, lineStart) + out.slice(end);
  }
  const entry = out.indexOf("- id: mcp-agentmemory");
  if (entry !== -1) {
    const lineStart = out.lastIndexOf("\n", entry) + 1;
    const insertPos = out.lastIndexOf("\n- insert:", lineStart);
    const blockStart = insertPos === -1 ? lineStart : insertPos + 1;
    const tail = out.slice(lineStart);
    const nextTop = tail.search(/^- /m);
    const end = nextTop === -1 ? out.length : lineStart + nextTop;
    out = out.slice(0, blockStart) + out.slice(end);
  }
  return out;
}

const MCP_ENTRY = [
  "# ── agentmemory (installed by 'agentmemory connect dsh') ──",
  "- insert:",
  "    - id: mcp-agentmemory",
  "      name: '@deepseek-ai/dsh-mcp-client'",
  "      config:",
  "        transport: stdio",
  "        serverName: agentmemory",
  "        command: npx",
  "        args: ['-y', '@agentmemory/mcp']",
  "        env:",
  "          AGENTMEMORY_URL: http://localhost:3111",
  "          # AGENTMEMORY_SECRET: '<match the daemon .env>'",
  "        toolCallTimeoutMs: 60000",
  "        failOnStartupError: false",
  "",
].join(NL);

const SKILL_MD = [
  "---",
  "name: agentmemory-sync",
  "description: Sync with the agentmemory long-term memory at task start/end. Use when starting a new task, recalling past work, finishing a task, needing cross-session context, or reviewing what was done.",
  "---",
  "# agentmemory memory sync",
  "",
  "1. At task start: call mcp__agentmemory__memory_recall with the task keywords + project path, format=compact, to bring relevant history into context.",
  "2. During the task: when you learn something durable (decision/fix/preference/convention), call memory_save immediately (type=fact, concepts: 2-5 keywords).",
  "3. At task end: call memory_save with a short outcome summary (type=insight), and confirm the session is registered via memory_sessions.",
  "4. For large handoffs: call memory_smart_search with expandIds for graph-diffusion recall, or use memory_lesson_save/memory_lesson_recall for lessons.",
  "",
].join(NL);

export const adapter: ConnectAdapter = {
  name: "dsh",
  displayName: "DeepSeek Harness (dsh)",
  category: "mcp",
  docs: "https://github.com/deepseek-ai/deepseek-harness",
  protocolNote:
    "Using MCP via the profile's cordis.patch.yml (@deepseek-ai/dsh-mcp-client, stdio). For full auto-capture, also install the cordis plugin: dsh plugin --profile <profile> add @agentmemory/dsh",

  detect(): boolean {
    return existsSync(dshHome());
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const profile = defaultProfile();
    const patch = patchPath(profile);
    const profileExists = existsSync(profileDir(profile));

    if (!profileExists) {
      p.log.warn(
        "dsh profile '" + profile + "' not found under " + profilesDir() + ". Set AGENTMEMORY_DSH_PROFILE to a profile that exists.",
      );
      return { kind: "stub", reason: "profile '" + profile + "' not found (set AGENTMEMORY_DSH_PROFILE)" };
    }

    const existing = existsSync(patch) ? readFileSync(patch, "utf8") : "";
    const alreadyHas = existing.includes("- id: mcp-agentmemory");
    const ensureSkill = (force: boolean): void => {
      // Skill for the DSH skill registry (<dshHome>/skills). Never clobber a
      // user-customized copy unless --force (and keep a backup when replacing).
      const skillDir = join(dshHome(), "skills", "agentmemory-sync");
      const skillPath = join(skillDir, "SKILL.md");
      if (existsSync(skillPath) && !force) {
        p.log.info("  skill exists (skipped; --force to overwrite)");
        return;
      }
      if (existsSync(skillPath)) {
        const skillBackup = backupFile(skillPath, this.name, "md");
        logBackup(skillBackup);
      }
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(skillPath, SKILL_MD, "utf8");
    };

    if (alreadyHas && !opts.force) {
      logAlreadyWired(this.displayName, patch);
      ensureSkill(false);
      return { kind: "already-wired", mutatedPath: patch };
    }

    if (opts.dryRun) {
      p.log.info("[dry-run] Would " + (alreadyHas ? "replace" : "append") + " mcp-agentmemory entry in " + patch);
      return { kind: "installed", mutatedPath: patch };
    }

    let backupPath: string | undefined;
    if (existsSync(patch)) {
      backupPath = backupFile(patch, this.name, "yml");
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(patch), { recursive: true });
    }

    // Append, never rewrite: the patch layer carries the user's own
    // commented entries and other MCP servers. --force replaces only the
    // previously installed agentmemory block.
    const base = alreadyHas ? stripInstalledBlock(existing) : existing;
    const joiner = base.length === 0 || base.endsWith("\n") ? "" : "\n";
    const next = base + joiner + NL + MCP_ENTRY;
    writeFileSync(patch, next, "utf8");

    ensureSkill(opts.force);

    logInstalled(this.displayName, patch);
    p.log.message(
      "  full auto-capture: dsh plugin --profile " + profile + " add @agentmemory/dsh",
    );
    return {
      kind: "installed",
      mutatedPath: patch,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};
