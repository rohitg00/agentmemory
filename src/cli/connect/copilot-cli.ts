import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  AGENTMEMORY_COPILOT_MCP_BLOCK,
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";

const COPILOT_DIR = process.env["COPILOT_HOME"] || join(homedir(), ".copilot");
const COPILOT_MCP_JSON = join(COPILOT_DIR, "mcp-config.json");

type CopilotMcpEntry = typeof AGENTMEMORY_COPILOT_MCP_BLOCK;
type CopilotConfig = {
  mcpServers?: Record<string, CopilotMcpEntry>;
  [key: string]: unknown;
};

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  return JSON.stringify(entry) === JSON.stringify(AGENTMEMORY_COPILOT_MCP_BLOCK);
}

export const adapter: ConnectAdapter = {
  name: "copilot-cli",
  displayName: "GitHub Copilot CLI",
  category: "native",
  docs: "https://github.com/rohitg00/agentmemory#github-copilot-cli",
  protocolNote:
    "→ Using MCP. Install the plugin too for full hooks/skills coverage.",

  detect(): boolean {
    return existsSync(COPILOT_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const existing = readJsonSafe<CopilotConfig>(COPILOT_MCP_JSON);
    const next: CopilotConfig = existing ? { ...existing } : {};
    const servers: Record<string, CopilotMcpEntry> = {
      ...((next.mcpServers as Record<string, CopilotMcpEntry>) ?? {}),
    };

    const alreadyHas = entryMatches(servers["agentmemory"]);
    if (alreadyHas && !opts.force) {
      logAlreadyWired("GitHub Copilot CLI", COPILOT_MCP_JSON);
      return { kind: "already-wired", mutatedPath: COPILOT_MCP_JSON };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} mcpServers.agentmemory in ${COPILOT_MCP_JSON}`,
      );
      return { kind: "installed", mutatedPath: COPILOT_MCP_JSON };
    }

    let backupPath: string | undefined;
    if (existsSync(COPILOT_MCP_JSON)) {
      backupPath = backupFile(COPILOT_MCP_JSON, "copilot-cli");
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(COPILOT_MCP_JSON), { recursive: true });
    }

    servers["agentmemory"] = AGENTMEMORY_COPILOT_MCP_BLOCK;
    next.mcpServers = servers;
    writeJsonAtomic(COPILOT_MCP_JSON, next);

    const verify = readJsonSafe<CopilotConfig>(COPILOT_MCP_JSON);
    if (!entryMatches(verify?.mcpServers?.["agentmemory"])) {
      p.log.error(
        `Verification failed: ${COPILOT_MCP_JSON} did not contain mcpServers.agentmemory after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("GitHub Copilot CLI", COPILOT_MCP_JSON);
    p.log.info(
      "Copilot picks up MCP servers on next launch or after `/mcp`. Install the plugin too for full hooks/skills.",
    );
    return {
      kind: "installed",
      mutatedPath: COPILOT_MCP_JSON,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};
