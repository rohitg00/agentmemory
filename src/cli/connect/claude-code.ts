import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

const CLAUDE_DIR = join(homedir(), ".claude");
const CLAUDE_JSON = join(homedir(), ".claude.json");

type ClaudeMcpEntry = typeof AGENTMEMORY_MCP_BLOCK;
type ClaudeConfig = {
  mcpServers?: Record<string, ClaudeMcpEntry>;
  [key: string]: unknown;
};

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["command"] !== "npx") return false;
  const args = Array.isArray(e["args"]) ? (e["args"] as string[]) : [];
  return args.includes("@agentmemory/mcp");
}

export const adapter: ConnectAdapter = {
  name: "claude-code",
  displayName: "Claude Code",
  docs: "https://github.com/rohitg00/agentmemory#claude-code-one-block-paste-it",
  protocolNote:
    "→ Using MCP. Hooks are also available — see docs/claude-code.md.",

  detect(): boolean {
    return existsSync(CLAUDE_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const existing = readJsonSafe<ClaudeConfig>(CLAUDE_JSON);
    const next: ClaudeConfig = existing ? { ...existing } : {};
    const servers: Record<string, ClaudeMcpEntry> = {
      ...((next.mcpServers as Record<string, ClaudeMcpEntry>) ?? {}),
    };

    const alreadyHas = entryMatches(servers["agentmemory"]);
    if (alreadyHas && !opts.force) {
      logAlreadyWired("Claude Code", CLAUDE_JSON);
      return { kind: "already-wired", mutatedPath: CLAUDE_JSON };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} mcpServers.agentmemory in ${CLAUDE_JSON}`,
      );
      return { kind: "installed", mutatedPath: CLAUDE_JSON };
    }

    let backupPath: string | undefined;
    if (existsSync(CLAUDE_JSON)) {
      backupPath = backupFile(CLAUDE_JSON, "claude-code");
      logBackup(backupPath);
    } else {
      mkdirSync(CLAUDE_DIR, { recursive: true });
      writeFileSync(CLAUDE_JSON, "{}\n", "utf-8");
    }

    servers["agentmemory"] = AGENTMEMORY_MCP_BLOCK;
    next.mcpServers = servers;
    writeJsonAtomic(CLAUDE_JSON, next);

    const verify = readJsonSafe<ClaudeConfig>(CLAUDE_JSON);
    if (!entryMatches(verify?.mcpServers?.["agentmemory"])) {
      p.log.error(
        `Verification failed: ${CLAUDE_JSON} did not contain mcpServers.agentmemory after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("Claude Code", CLAUDE_JSON);
    p.log.info(
      "Restart Claude Code (or run `/mcp` inside a session) to pick up the new server.",
    );
    return { kind: "installed", mutatedPath: CLAUDE_JSON, backupPath };
  },
};
