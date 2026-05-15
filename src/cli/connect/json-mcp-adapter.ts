import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
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

export type JsonMcpAdapterConfig = {
  name: string;
  displayName: string;
  detectDir: string;
  configPath: string;
  docs?: string;
  protocolNote?: string;
};

type McpEntry = typeof AGENTMEMORY_MCP_BLOCK;
type McpConfig = {
  mcpServers?: Record<string, McpEntry>;
  [key: string]: unknown;
};

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["command"] !== "npx") return false;
  const args = Array.isArray(e["args"]) ? (e["args"] as string[]) : [];
  return args.includes("@agentmemory/mcp");
}

export function createJsonMcpAdapter(
  config: JsonMcpAdapterConfig,
): ConnectAdapter {
  return {
    name: config.name,
    displayName: config.displayName,
    ...(config.docs !== undefined && { docs: config.docs }),
    ...(config.protocolNote !== undefined && {
      protocolNote: config.protocolNote,
    }),

    detect(): boolean {
      return existsSync(config.detectDir);
    },

    async install(opts: ConnectOptions): Promise<ConnectResult> {
      const existing = readJsonSafe<McpConfig>(config.configPath);
      const next: McpConfig = existing ? { ...existing } : {};
      const servers: Record<string, McpEntry> = {
        ...((next.mcpServers as Record<string, McpEntry>) ?? {}),
      };

      const alreadyHas = entryMatches(servers["agentmemory"]);
      if (alreadyHas && !opts.force) {
        logAlreadyWired(config.displayName, config.configPath);
        return { kind: "already-wired", mutatedPath: config.configPath };
      }

      if (opts.dryRun) {
        p.log.info(
          `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} mcpServers.agentmemory in ${config.configPath}`,
        );
        return { kind: "installed", mutatedPath: config.configPath };
      }

      let backupPath: string | undefined;
      if (existsSync(config.configPath)) {
        backupPath = backupFile(config.configPath, config.name);
        logBackup(backupPath);
      } else {
        mkdirSync(dirname(config.configPath), { recursive: true });
      }

      servers["agentmemory"] = AGENTMEMORY_MCP_BLOCK;
      next.mcpServers = servers;
      writeJsonAtomic(config.configPath, next);

      const verify = readJsonSafe<McpConfig>(config.configPath);
      if (!entryMatches(verify?.mcpServers?.["agentmemory"])) {
        p.log.error(
          `Verification failed: ${config.configPath} did not contain mcpServers.agentmemory after write.`,
        );
        return { kind: "skipped", reason: "verification-failed" };
      }

      logInstalled(config.displayName, config.configPath);
      return {
        kind: "installed",
        mutatedPath: config.configPath,
        ...(backupPath !== undefined && { backupPath }),
      };
    },
  };
}
