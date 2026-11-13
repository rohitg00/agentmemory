import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import { buildMergedHooks, findPluginRoot, type HookManifest } from "./codex-hooks.js";
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

const ZCODE_DIR = join(homedir(), ".zcode");
const CONFIG_PATH = join(ZCODE_DIR, "cli", "config.json");
const SUPPORTED_EVENTS = new Set([
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest",
  "PostToolUse", "PostToolUseFailure", "Stop",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validHooks(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return false;
  if (value.events === undefined) return true;
  if (!isRecord(value.events)) return false;
  return Object.entries(value.events).every(([event, entries]) =>
    SUPPORTED_EVENTS.has(event) && Array.isArray(entries) && entries.every(entry =>
      isRecord(entry) &&
      (entry.matcher === undefined || typeof entry.matcher === "string") &&
      Array.isArray(entry.hooks) && entry.hooks.length > 0 && entry.hooks.every(hook =>
        isRecord(hook) &&
        (hook.type === "command" || hook.type === "process") &&
        typeof hook.command === "string" && hook.command.length > 0 &&
        (hook.args === undefined || (Array.isArray(hook.args) && hook.args.every(arg => typeof arg === "string"))),
      ),
    ),
  );
}

function skipped(reason: string, message: string): ConnectResult {
  p.log.warn(message);
  return { kind: "skipped", reason };
}

export const adapter: ConnectAdapter = {
  name: "zcode",
  displayName: "ZCode",
  category: "native",
  autoCapture: "with-hooks",
  docs: "https://github.com/rohitg00/agentmemory/blob/main/docs/plugins/zcode-local.md",
  protocolNote: "MCP tools by default; --with-hooks adds ZCode's six supported capture hooks. Choose either config hooks or the ZCode plugin for capture.",

  detect(): boolean {
    return existsSync(ZCODE_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const present = existsSync(CONFIG_PATH);
    const loaded = present ? readJsonSafe(CONFIG_PATH) : {};
    if (!isRecord(loaded) ||
      (loaded.mcp !== undefined && !isRecord(loaded.mcp)) ||
      (isRecord(loaded.mcp) && loaded.mcp.servers !== undefined && !isRecord(loaded.mcp.servers)) ||
      !validHooks(loaded.hooks)) {
      return skipped("invalid-config", `ZCode config is invalid; leaving ${CONFIG_PATH} unchanged.`);
    }

    const mcp = isRecord(loaded.mcp) ? loaded.mcp : {};
    const servers = isRecord(mcp.servers) ? mcp.servers : {};
    const current = servers.agentmemory;
    const matches = isAgentmemoryMcpEntry(current) &&
      isRecord(current) && (current.type === undefined || current.type === "stdio");
    if (current !== undefined && !matches && !opts.force) {
      return skipped("mcp-conflict", "ZCode already has a different agentmemory MCP entry. Use --force to replace it.");
    }
    if (isRecord(current) && current.enabled === false && !opts.force) {
      return skipped("mcp-disabled", "ZCode's agentmemory MCP entry is disabled. Use --force to enable it.");
    }
    const hooks = isRecord(loaded.hooks) ? loaded.hooks : {};
    if (opts.withHooks && hooks.enabled === false && !opts.force) {
      return skipped("hooks-disabled", "ZCode hooks are explicitly disabled. Use --force with --with-hooks to enable them.");
    }

    // Native MCP env is passed literally: inherit AGENTMEMORY_* from the host
    // rather than storing another client's shell-style interpolation strings.
    const entry = matches && !opts.force ? current : {
      type: "stdio",
      command: AGENTMEMORY_MCP_BLOCK.command,
      args: [...AGENTMEMORY_MCP_BLOCK.args],
    };
    const next: Record<string, unknown> = { ...loaded, mcp: { ...mcp, servers: { ...servers, agentmemory: entry } } };
    if (opts.withHooks) {
      const merged = buildMergedHooks(
        { hooks: (hooks.events ?? {}) as HookManifest["hooks"] },
        findPluginRoot(),
        "hooks.zcode.json",
      );
      next.hooks = { ...hooks, enabled: true, events: merged.hooks };
    }
    const hookState = opts.withHooks ? { hooks: "installed" as const } : {};
    if (!opts.force && JSON.stringify(next) === JSON.stringify(loaded)) {
      logAlreadyWired("ZCode", CONFIG_PATH);
      return { kind: "already-wired", mutatedPath: CONFIG_PATH, ...hookState };
    }
    if (opts.dryRun) {
      p.log.info(`[dry-run] Would wire ZCode MCP${opts.withHooks ? " and hooks" : ""} in ${CONFIG_PATH}`);
      return { kind: "installed", mutatedPath: CONFIG_PATH, ...hookState };
    }

    const backupPath = present ? backupFile(CONFIG_PATH, "zcode") : undefined;
    if (backupPath) logBackup(backupPath);
    writeJsonAtomic(CONFIG_PATH, next);
    if (JSON.stringify(readJsonSafe(CONFIG_PATH)) !== JSON.stringify(next)) {
      return skipped("verification-failed", `ZCode config verification failed: ${CONFIG_PATH}`);
    }
    logInstalled("ZCode", CONFIG_PATH);
    return { kind: "installed", mutatedPath: CONFIG_PATH, ...(backupPath && { backupPath }), ...hookState };
  },
};
