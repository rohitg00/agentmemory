import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import { backupFile, logAlreadyWired, logBackup, logInstalled } from "./util.js";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "./codex-hooks.js";

// DeepSeek Harness loads plugins through layered cordis patch files; the
// home-level $DSH_HOME/cordis.patch.yml is the machine-local layer shared
// by every profile, so appended rows wire agentmemory everywhere.
//
// Two rows:
//   1. @deepseek-ai/dsh-mcp-client — registers the MCP tools on ctx.tools
//      as mcp__agentmemory__<tool>.
//   2. (--with-hooks) @deepseek-ai/dsh-hooks-claude-code — Harness's
//      first-party Claude Code hook bridge. It runs agentmemory's bundled
//      hook scripts (Claude Code payload shape) on the harness's own
//      interception points, giving full auto-capture: SessionStart,
//      UserPromptSubmit, PreToolUse, PostToolUse, Stop. Unsupported
//      events in the manifest (PreCompact) are parsed-and-skipped by the
//      bridge.
// Source: packages/mcp/mcp-client/README.md,
// packages/hooks/hooks-claude-code/README.md, and
// docs/user/develop/basic/publish.md in deepseek-ai/deepseek-harness.

function dshHome(): string {
  return process.env["DSH_HOME"] || join(homedir(), ".dsh");
}

// Harness env blocks are plain strings with no shell interpolation, so the
// URL is written literally instead of the ${VAR:-default} template the
// JSON-config agents get.
const MCP_BLOCK = `- insert:
    - id: agentmemory
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: agentmemory
        command: npx
        args: ['-y', '@agentmemory/mcp']
        env:
          AGENTMEMORY_URL: http://localhost:3111
`;

const MCP_MARKER = "serverName: agentmemory";
const HOOKS_MARKER = "id: agentmemory-hooks";

function hooksBlock(hooksConfigPath: string): string {
  return `- insert:
    - id: agentmemory-hooks
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        configPath: ${JSON.stringify(hooksConfigPath)}
`;
}

// Drop the managed block containing `marker`: from the nearest preceding
// top-level "- " line through the line before the next top-level "- ".
function stripBlock(content: string, marker: string): string {
  if (!content.includes(marker)) return content;
  const lines = content.split("\n");
  const markerIdx = lines.findIndex((l) => l.includes(marker));
  let start = markerIdx;
  while (start > 0 && !lines[start].startsWith("- ")) start--;
  let end = markerIdx + 1;
  while (end < lines.length && !lines[end].startsWith("- ")) end++;
  return lines
    .slice(0, start)
    .concat(lines.slice(end))
    .join("\n")
    .replace(/\n+$/, "\n");
}

function appendBlock(content: string, block: string): string {
  const base = content.replace(/\n+$/, "\n");
  return base.trim() ? `${base}\n${block}` : block;
}

function writeAtomic(path: string, content: string): void {
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, path);
}

function installHooksFile(home: string): string {
  const hooksPath = join(home, "agentmemory.hooks.json");
  const pluginRoot = findPluginRoot();
  const existing = existsSync(hooksPath)
    ? (JSON.parse(readFileSync(hooksPath, "utf-8")) as HookManifest)
    : null;
  const merged = buildMergedHooks(existing, pluginRoot, "hooks.codex.json");
  writeAtomic(hooksPath, `${JSON.stringify(merged, null, 2)}\n`);
  return hooksPath;
}

export const adapter: ConnectAdapter = {
  name: "dsh",
  displayName: "DeepSeek Harness",
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via $DSH_HOME/cordis.patch.yml (the home-level patch layer every profile loads). Tools appear as mcp__agentmemory__*. Pass --with-hooks to also wire auto-capture through Harness's Claude Code hook bridge.",
  category: "native",
  detect(): boolean {
    return existsSync(dshHome());
  },
  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const home = dshHome();
    const configPath = join(home, "cordis.patch.yml");
    const existing = existsSync(configPath)
      ? readFileSync(configPath, "utf-8")
      : "";

    const wantHooks = opts.withHooks === true;
    const hasMcp = existing.includes(MCP_MARKER);
    const hasHooks = existing.includes(HOOKS_MARKER);

    if (hasMcp && (!wantHooks || hasHooks) && !opts.force) {
      logAlreadyWired(this.displayName, configPath);
      return { kind: "already-wired", mutatedPath: configPath };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would append the agentmemory mcp-client row${wantHooks ? " and the hooks-claude-code row" : ""} to ${configPath}`,
      );
      return { kind: "installed", mutatedPath: configPath };
    }

    let backupPath: string | undefined;
    if (existsSync(configPath)) {
      backupPath = backupFile(configPath, this.name, "yml");
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(configPath), { recursive: true });
    }

    let next = stripBlock(existing, MCP_MARKER);
    next = appendBlock(next, MCP_BLOCK);

    if (wantHooks) {
      const hooksPath = installHooksFile(home);
      next = stripBlock(next, HOOKS_MARKER);
      next = appendBlock(next, hooksBlock(hooksPath));
      p.log.info(`Hook manifest: ${hooksPath}`);
    }

    writeAtomic(configPath, next);

    const written = readFileSync(configPath, "utf-8");
    if (!written.includes(MCP_MARKER) || (wantHooks && !written.includes(HOOKS_MARKER))) {
      p.log.error(
        `Verification failed: ${configPath} did not contain the agentmemory rows after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled(this.displayName, configPath);
    return { kind: "installed", mutatedPath: configPath, backupPath };
  },
};
