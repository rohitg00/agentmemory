import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";

type McpEntry = {
  type: string;
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
};

type KiloConfig = {
  mcp?: Record<string, McpEntry>;
  [key: string]: unknown;
};

// Env values use ${VAR} expansion so the wired MCP entry inherits
// AGENTMEMORY_URL / AGENTMEMORY_SECRET from the user's shell.
const AGENTMEMORY_MCP_BLOCK: McpEntry = {
  type: "local",
  command: ["npx", "-y", "@agentmemory/mcp"],
  environment: {
    AGENTMEMORY_URL: "${AGENTMEMORY_URL}",
    AGENTMEMORY_SECRET: "${AGENTMEMORY_SECRET}",
  },
  enabled: true,
};

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  const cmd = Array.isArray(e["command"]) ? (e["command"] as string[]) : [];
  return cmd.some((c) => c.includes("@agentmemory/mcp"));
}

const configDir = join(homedir(), ".config", "kilo");
const configFiles = ["kilo.jsonc", "kilo.json", "opencode.jsonc", "opencode.json"];

function findConfigFile(): string | null {
  for (const file of configFiles) {
    const fullPath = join(configDir, file);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

export const adapter: ConnectAdapter = {
  name: "kilo",
  displayName: "Kilo",
  docs: "https://github.com/rohitg00/agentmemory/tree/main/integrations/kilo",
  protocolNote: "→ Using MCP. Kilo implements memory hooks natively in its codebase.",

  detect(): boolean {
    return existsSync(configDir) || findConfigFile() !== null;
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const configPath = findConfigFile() ?? join(configDir, "kilo.json");
    const existing = readJsonSafe<KiloConfig>(configPath);
    const next: KiloConfig = existing ? { ...existing } : {};
    const mcp: Record<string, McpEntry> = {
      ...((next.mcp as Record<string, McpEntry>) ?? {}),
    };

    const alreadyHas = entryMatches(mcp["agentmemory"]);
    if (alreadyHas && !opts.force) {
      logAlreadyWired("Kilo", configPath);
      return { kind: "already-wired", mutatedPath: configPath };
    }

    if (opts.dryRun) {
      console.log(
        `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} mcp.agentmemory in ${configPath}`,
      );
      return { kind: "installed", mutatedPath: configPath };
    }

    let backupPath: string | undefined;
    if (existsSync(configPath)) {
      backupPath = backupFile(configPath, "kilo");
      logBackup(backupPath);
    }

    mcp["agentmemory"] = AGENTMEMORY_MCP_BLOCK;
    next.mcp = mcp;
    writeJsonAtomic(configPath, next);

    const verify = readJsonSafe<KiloConfig>(configPath);
    if (!entryMatches(verify?.mcp?.["agentmemory"])) {
      console.error(
        `Verification failed: ${configPath} did not contain mcp.agentmemory after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("Kilo", configPath);
    return {
      kind: "installed",
      mutatedPath: configPath,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};
