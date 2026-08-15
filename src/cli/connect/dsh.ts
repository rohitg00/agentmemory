import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
  writeTextAtomic,
} from "./util.js";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "./codex-hooks.js";

// Rows land in the home-level cordis.patch.yml, the patch layer every
// Harness profile loads; the hooks row reuses the bundled Claude Code
// hook scripts through Harness's own bridge plugin.

function dshHome(): string {
  return process.env["DSH_HOME"] || join(homedir(), ".dsh");
}

// Harness env values are literal strings; no ${VAR:-default} interpolation.
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

// Drop the managed top-level block containing `marker`.
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

function installHooksFile(home: string): string {
  const hooksPath = join(home, "agentmemory.hooks.json");
  const pluginRoot = findPluginRoot();
  const existing = readJsonSafe<HookManifest>(hooksPath);
  const merged = buildMergedHooks(existing, pluginRoot, "hooks.codex.json");
  writeJsonAtomic(hooksPath, merged);
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

    writeTextAtomic(configPath, next);

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
