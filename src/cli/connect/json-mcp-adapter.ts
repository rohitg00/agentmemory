import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as p from "@clack/prompts";
import type { AutoCapture, ConnectAdapter, ConnectOptions, ConnectResult, HookState } from "./types.js";
import { hookState } from "./capture-notice.js";
import {
  AGENTMEMORY_MCP_BLOCK,
  backupFile,
  isAgentmemoryMcpEntry,
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
  autoCapture?: AutoCapture;
  // Wrapper key under which servers live. Default "mcpServers".
  // Zed uses "context_servers"; otherwise same shape.
  wrapperKey?: string;
  // Extra fields merged into the agentmemory entry. Droid requires
  // type: "stdio"; other hosts ignore unknown fields.
  extraEntryFields?: Record<string, unknown>;
  installHooks?: (opts: ConnectOptions) => ConnectResult;
};

type McpEntry = typeof AGENTMEMORY_MCP_BLOCK;
type McpConfig = Record<string, unknown>;

const entryMatches = isAgentmemoryMcpEntry;

export function createJsonMcpAdapter(
  config: JsonMcpAdapterConfig,
): ConnectAdapter {
  const wrapperKey = config.wrapperKey ?? "mcpServers";
  const runHooks = (opts: ConnectOptions, suffix: string): HookState | undefined => {
    if (!opts.withHooks || !config.installHooks) return undefined;
    const hookResult = config.installHooks(opts);
    if (hookResult.kind === "skipped") {
      p.log.warn(`${config.displayName} hooks skipped: ${hookResult.reason}.${suffix}`);
    }
    return hookState(hookResult);
  };
  const autoCapture: AutoCapture | undefined =
    config.autoCapture ?? (config.installHooks ? "with-hooks" : undefined);
  return {
    name: config.name,
    displayName: config.displayName,
    category: config.category ?? "mcp",
    ...(autoCapture !== undefined && { autoCapture }),
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
        const hooks = runHooks(opts, "");
        return { kind: "already-wired", mutatedPath: config.configPath, ...(hooks && { hooks }) };
      }

      if (opts.dryRun) {
        p.log.info(
          `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} ${wrapperKey}.agentmemory in ${config.configPath}`,
        );
        const hooks = runHooks(opts, "");
        return { kind: "installed", mutatedPath: config.configPath, ...(hooks && { hooks }) };
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

      const hooks = runHooks(opts, " MCP wiring still applied.");

      return {
        kind: "installed",
        mutatedPath: config.configPath,
        ...(backupPath !== undefined && { backupPath }),
        ...(hooks && { hooks }),
      };
    },
  };
}
