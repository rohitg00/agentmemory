import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  AGENTMEMORY_MCP_BLOCK,
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";

// Continue.dev writes its config as ~/.continue/config.json (or .yaml).
// Schema diverges from Claude Code: `mcpServers` is an ARRAY of named
// entries, not an object keyed by name. We target the JSON form so we
// don't need a YAML dependency; users on YAML config can convert with
// `continue config migrate` or wire manually.
// Source: github.com/continuedev/continue/blob/main/docs/customize/deep-dives/mcp.mdx
const CONTINUE_DIR = join(homedir(), ".continue");
const CONFIG_PATH = join(CONTINUE_DIR, "config.json");

type ContinueEntry = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type ContinueConfig = {
  mcpServers?: ContinueEntry[];
  [key: string]: unknown;
};

function buildEntry(): ContinueEntry {
  return {
    name: "agentmemory",
    command: AGENTMEMORY_MCP_BLOCK.command,
    args: [...AGENTMEMORY_MCP_BLOCK.args],
    env: { ...AGENTMEMORY_MCP_BLOCK.env },
  };
}

function entryIsAgentmemory(entry: ContinueEntry | undefined): boolean {
  if (!entry) return false;
  return entry.name === "agentmemory" && entry.args.includes("@agentmemory/mcp");
}

export const adapter: ConnectAdapter = {
  name: "continue",
  displayName: "Continue",
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.continue/config.json (array form). YAML config users: add the same block under `mcpServers:` in config.yaml.",

  detect(): boolean {
    return existsSync(CONTINUE_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const existing = readJsonSafe<ContinueConfig>(CONFIG_PATH);
    const next: ContinueConfig = existing ? { ...existing } : {};
    const servers = Array.isArray(next.mcpServers)
      ? [...next.mcpServers]
      : [];

    const idx = servers.findIndex((s) => s?.name === "agentmemory");
    const alreadyHas = idx >= 0 && entryIsAgentmemory(servers[idx]);
    if (alreadyHas && !opts.force) {
      logAlreadyWired("Continue", CONFIG_PATH);
      return { kind: "already-wired", mutatedPath: CONFIG_PATH };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} mcpServers[agentmemory] in ${CONFIG_PATH}`,
      );
      return { kind: "installed", mutatedPath: CONFIG_PATH };
    }

    let backupPath: string | undefined;
    if (existsSync(CONFIG_PATH)) {
      backupPath = backupFile(CONFIG_PATH, "continue");
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    }

    const entry = buildEntry();
    if (idx >= 0) servers[idx] = entry;
    else servers.push(entry);
    next.mcpServers = servers;
    writeJsonAtomic(CONFIG_PATH, next);

    const verify = readJsonSafe<ContinueConfig>(CONFIG_PATH);
    const verifyEntry = verify?.mcpServers?.find(
      (s) => s?.name === "agentmemory",
    );
    if (!entryIsAgentmemory(verifyEntry)) {
      p.log.error(
        `Verification failed: ${CONFIG_PATH} did not contain mcpServers[agentmemory] after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("Continue", CONFIG_PATH);
    return {
      kind: "installed",
      mutatedPath: CONFIG_PATH,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};
