import { existsSync, mkdirSync } from "node:fs";
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
} from "./util.js";

// OpenCode does not use the standard `mcpServers` block. Its config is a
// top-level `mcp` key whose entries carry `type`, `command` as an array,
// and `enabled` (docs: README "OpenCode (MCP only)"). So it needs its own
// adapter rather than createJsonMcpAdapter.

function configPath(): string {
  return join(homedir(), ".config", "opencode", "opencode.json");
}

function detectDir(): string {
  return join(homedir(), ".config", "opencode");
}

// No `environment` block: OpenCode does not expand shell-style
// `${VAR:-default}` values, and writing them literally would override the
// user's real shell AGENTMEMORY_URL with an unexpanded string. The stdio
// child inherits the shell environment (an exported AGENTMEMORY_URL /
// AGENTMEMORY_SECRET still reaches the server), and the @agentmemory/mcp
// shim defaults unset vars (URL -> localhost:3111, no secret, all tools).
const OPENCODE_ENTRY = {
  type: "local",
  command: ["npx", "-y", "@agentmemory/mcp"],
  enabled: true,
};

type OpencodeConfig = Record<string, unknown>;
type McpEntry = Record<string, unknown>;

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const command = (entry as McpEntry)["command"];
  return Array.isArray(command) && command.includes("@agentmemory/mcp");
}

export const adapter: ConnectAdapter = {
  name: "opencode",
  displayName: "OpenCode",
  category: "mcp",
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "Using MCP via ~/.config/opencode/opencode.json (top-level `mcp` key). For full auto-capture, also install the bundled plugin in plugin/opencode/.",

  detect(): boolean {
    return existsSync(detectDir());
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const path = configPath();
    const existing = readJsonSafe<OpencodeConfig>(path);
    const next: OpencodeConfig = existing ? { ...existing } : {};
    const existingMcp = next["mcp"];
    const mcp: Record<string, McpEntry> =
      existingMcp &&
      typeof existingMcp === "object" &&
      !Array.isArray(existingMcp)
        ? { ...(existingMcp as Record<string, McpEntry>) }
        : {};

    const alreadyHas = entryMatches(mcp["agentmemory"]);
    if (alreadyHas && !opts.force) {
      logAlreadyWired(this.displayName, path);
      return { kind: "already-wired", mutatedPath: path };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} mcp.agentmemory in ${path}`,
      );
      return { kind: "installed", mutatedPath: path };
    }

    let backupPath: string | undefined;
    if (existsSync(path)) {
      backupPath = backupFile(path, this.name);
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(path), { recursive: true });
    }

    mcp["agentmemory"] = { ...OPENCODE_ENTRY };
    next["mcp"] = mcp;
    writeJsonAtomic(path, next);

    const verify = readJsonSafe<OpencodeConfig>(path);
    const verifyMcp = verify?.["mcp"] as Record<string, McpEntry> | undefined;
    if (!entryMatches(verifyMcp?.["agentmemory"])) {
      p.log.error(
        `Verification failed: ${path} did not contain mcp.agentmemory after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled(this.displayName, path);
    return {
      kind: "installed",
      mutatedPath: path,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};
