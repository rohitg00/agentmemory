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
  // Integration style for onboarding grouping. Defaults to "mcp" since a
  // JSON MCP config writer is MCP-only by construction; hosts that also
  // ship hooks (e.g. OpenClaw) pass "native".
  category?: "native" | "mcp";
  // Wrapper key under which servers live. Default "mcpServers".
  // Zed uses "context_servers"; otherwise same shape.
  wrapperKey?: string;
  // Extra fields merged into the agentmemory entry. Droid requires
  // type: "stdio"; other hosts ignore unknown fields.
  extraEntryFields?: Record<string, unknown>;
  // Invoked when `--with-hooks` is passed, independent of whether the MCP
  // entry was freshly installed or already wired (mirrors the Claude Code /
  // Codex adapters, issue #508 pattern) — hosts that ship a native hook
  // config alongside MCP (e.g. Droid's `~/.factory/hooks.json`) pass this
  // to install/refresh their hook manifest.
  installHooks?: (opts: ConnectOptions) => ConnectResult;
};

type McpEntry = typeof AGENTMEMORY_MCP_BLOCK;
type McpConfig = Record<string, unknown>;

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
  const wrapperKey = config.wrapperKey ?? "mcpServers";
  return {
    name: config.name,
    displayName: config.displayName,
    category: config.category ?? "mcp",
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
        ...((next[wrapperKey] as Record<string, McpEntry>) ?? {}),
      };

      const alreadyHas = entryMatches(servers["agentmemory"]);
      if (alreadyHas && !opts.force) {
        logAlreadyWired(config.displayName, config.configPath);
        if (opts.withHooks && config.installHooks) {
          const hookResult = config.installHooks(opts);
          if (hookResult.kind === "skipped") {
            p.log.warn(
              `${config.displayName} hooks skipped: ${hookResult.reason}.`,
            );
          }
        }
        return { kind: "already-wired", mutatedPath: config.configPath };
      }

      if (opts.dryRun) {
        p.log.info(
          `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} ${wrapperKey}.agentmemory in ${config.configPath}`,
        );
        if (opts.withHooks && config.installHooks) {
          const hookResult = config.installHooks(opts);
          if (hookResult.kind === "skipped") {
            p.log.warn(
              `${config.displayName} hooks skipped: ${hookResult.reason}.`,
            );
          }
        }
        return { kind: "installed", mutatedPath: config.configPath };
      }

      let backupPath: string | undefined;
      if (existsSync(config.configPath)) {
        backupPath = backupFile(config.configPath, config.name);
        logBackup(backupPath);
      } else {
        mkdirSync(dirname(config.configPath), { recursive: true });
      }

      servers["agentmemory"] = {
        ...AGENTMEMORY_MCP_BLOCK,
        ...(config.extraEntryFields ?? {}),
      };
      next[wrapperKey] = servers;
      writeJsonAtomic(config.configPath, next);

      const verify = readJsonSafe<McpConfig>(config.configPath);
      const verifyServers = verify?.[wrapperKey] as
        | Record<string, McpEntry>
        | undefined;
      if (!entryMatches(verifyServers?.["agentmemory"])) {
        p.log.error(
          `Verification failed: ${config.configPath} did not contain ${wrapperKey}.agentmemory after write.`,
        );
        return { kind: "skipped", reason: "verification-failed" };
      }

      logInstalled(config.displayName, config.configPath);

      if (opts.withHooks && config.installHooks) {
        const hookResult = config.installHooks(opts);
        if (hookResult.kind === "skipped") {
          p.log.warn(
            `${config.displayName} hooks skipped: ${hookResult.reason}. MCP wiring still applied.`,
          );
        }
      }

      return {
        kind: "installed",
        mutatedPath: config.configPath,
        ...(backupPath !== undefined && { backupPath }),
      };
    },
  };
}
