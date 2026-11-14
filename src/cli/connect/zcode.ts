import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, fchmodSync, fchownSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import { buildMergedHooks, findPluginRoot, type HookManifest } from "./codex-hooks.js";
import {
  AGENTMEMORY_MCP_BLOCK,
  ensureBackupsDir,
  isAgentmemoryMcpEntry,
  logAlreadyWired,
  logBackup,
  logInstalled,
  readJsonSafe,
  timestampSlug,
} from "./util.js";

const ZCODE_DIR = join(homedir(), ".zcode");
const CONFIG_PATH = join(ZCODE_DIR, "cli", "config.json");
const HOOK_OWNER = "agentmemory:zcode:v1";
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

function mergeZCodeHooks(existing: HookManifest["hooks"], pluginRoot: string): HookManifest | null {
  const fresh = buildMergedHooks(null, pluginRoot, "hooks.zcode.json");
  const out: HookManifest = { hooks: {} };
  const seen = new Set<string>();
  const normalized = (path: string) => path.replace(/\\/g, "/");

  for (const [event, entries] of Object.entries(existing)) {
    const kept: typeof entries = [];
    for (const entry of entries) {
      const hooks: typeof entry.hooks = [];
      for (const handler of entry.hooks) {
        const script = handler.args?.[0];
        const role = handler.type === "process" && typeof script === "string" && isAbsolute(script)
          ? fresh.hooks[event]?.flatMap(item => item.hooks).find(expected =>
            expected.type === handler.type && expected.command === handler.command &&
            typeof expected.args?.[0] === "string" &&
            normalized(script).endsWith("/scripts/" + basename(expected.args[0])),
          )
          : undefined;
        const owner = handler.agentmemoryOwner;
        const currentInvocation = role && typeof script === "string" &&
          normalized(script) === normalized(role.args![0]);
        if (owner === HOOK_OWNER || (owner === undefined && currentInvocation)) {
          if (!role || seen.has(event)) return null;
          seen.add(event);
          hooks.push({ ...handler, command: role.command, args: [role.args![0], ...handler.args!.slice(1)], agentmemoryOwner: HOOK_OWNER });
        } else {
          const unknownOwner = typeof owner === "string" && owner.startsWith("agentmemory:zcode:");
          const ambiguousLegacy = owner === undefined && role && typeof script === "string" &&
            normalized(script).endsWith("/plugin/scripts/" + basename(role.args![0]));
          if (unknownOwner || ambiguousLegacy) return null;
          hooks.push(handler);
        }
      }
      if (hooks.length > 0) kept.push({ ...entry, hooks });
    }
    if (kept.length > 0) out.hooks[event] = kept;
  }

  for (const [event, entries] of Object.entries(fresh.hooks)) {
    if (seen.has(event)) continue;
    const marked = entries.map(entry => ({ ...entry, hooks: entry.hooks.map(handler => ({ ...handler, agentmemoryOwner: HOOK_OWNER })) }));
    out.hooks[event] = [...(out.hooks[event] ?? []), ...marked];
  }
  return out;
}

function skipped(reason: string, message: string): ConnectResult {
  p.log.warn(message);
  return { kind: "skipped", reason };
}

function backupConfig(): string {
  const contents = readFileSync(CONFIG_PATH);
  const directory = ensureBackupsDir();
  const target = join(directory, `zcode-${timestampSlug()}-${randomUUID()}.json`);
  if (process.platform !== "darwin") {
    writeFileSync(target, contents, { flag: "wx", mode: 0o600 });
    return target;
  }
  const staging = mkdtempSync(join(directory, ".zcode-backup-"));
  try {
    retainMetadata("chmod", ["-N", staging]);
    const temporary = join(staging, "config.json");
    writeFileSync(temporary, contents, { flag: "wx", mode: 0o600 });
    renameSync(temporary, target);
    return target;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function retainMetadata(command: string, args: string[], input?: string): string {
  const result = spawnSync(command, args, { encoding: "utf8", input, timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.stderr.trim()) {
    throw new Error("Could not preserve ZCode config access permissions: " + result.stderr.trim());
  }
  return result.stdout;
}

function writeConfigAtomic(value: Record<string, unknown>): string | undefined {
  const original = existsSync(CONFIG_PATH) ? statSync(CONFIG_PATH) : undefined;
  const mode = original ? original.mode & 0o777 : 0o600;
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  const staging = mkdtempSync(join(dirname(CONFIG_PATH), ".agentmemory-zcode-"));
  const temporary = join(staging, "config.json");
  try {
    if (process.platform === "darwin") retainMetadata("chmod", ["-N", staging]);
    const fd = openSync(temporary, "wx", 0o600);
    try {
      if (original && process.platform !== "win32") {
        fchownSync(fd, original.uid, original.gid);
        if (process.platform === "linux") {
          // Applying the complete original ACL also removes named readers
          // inherited from the directory when the source has no such ACL.
          const acl = retainMetadata("getfacl", ["--access", "--omit-header", "--absolute-names", "--numeric", "--", CONFIG_PATH]);
          if (!acl.trim()) throw new Error("ZCode config access ACL could not be read.");
          retainMetadata("setfacl", ["--set-file=-", "--", temporary], acl);
        } else {
          // The staging directory remains private while cp restores ACLs
          // after copying contents and applying the source mode.
          retainMetadata("cp", [process.platform === "darwin" ? "-pN" : "-p", CONFIG_PATH, temporary]);
        }
      }
      ftruncateSync(fd, 0);
      writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
      fchmodSync(fd, mode);
    } finally {
      closeSync(fd);
    }
    const backupPath = original ? backupConfig() : undefined;
    renameSync(temporary, CONFIG_PATH);
    return backupPath;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

async function acquireConfigLock(): Promise<(() => void) | undefined> {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  const directory = CONFIG_PATH + ".lock";
  const token = `${process.pid}-${randomUUID()}`;
  const owner = join(directory, `owner-${token}.json`);
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const remaining = 8000 - (Date.now() - started);
      if (remaining <= 0) return undefined;
      await new Promise(resolve => setTimeout(resolve, Math.min(50, remaining)));
      continue;
    }
    const release = () => {
      rmSync(owner, { force: true });
      try { rmdirSync(directory); } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
      }
    };
    try {
      const original = statSync(directory);
      writeFileSync(owner, JSON.stringify({ pid: process.pid, createdAt: Date.now(), token }) + "\n", { flag: "wx", mode: 0o600 });
      const current = statSync(directory);
      const owners = readdirSync(directory).filter(name => name.startsWith("owner-") && name.endsWith(".json"));
      if (original.dev !== current.dev || original.ino !== current.ino || owners.length !== 1 || owners[0] !== `owner-${token}.json`) {
        throw new Error("ZCode configuration lock ownership changed during acquisition.");
      }
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }
}

function installZCode(opts: ConnectOptions): ConnectResult {
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
  if (isRecord(current) && (current.enable === false || current.enabled === false) && !opts.force) {
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
    const merged = mergeZCodeHooks((hooks.events ?? {}) as HookManifest["hooks"], findPluginRoot());
    if (!merged) {
      return skipped("hook-ownership", "ZCode has capture hooks whose AgentMemory ownership is unclear. Leaving the config unchanged; remove only the old capture hooks you recognize before reconnecting.");
    }
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

  const backupPath = writeConfigAtomic(next);
  if (backupPath) logBackup(backupPath);
  if (JSON.stringify(readJsonSafe(CONFIG_PATH)) !== JSON.stringify(next)) {
    return skipped("verification-failed", `ZCode config verification failed: ${CONFIG_PATH}`);
  }
  logInstalled("ZCode", CONFIG_PATH);
  return { kind: "installed", mutatedPath: CONFIG_PATH, ...(backupPath && { backupPath }), ...hookState };
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
    const release = opts.dryRun ? undefined : await acquireConfigLock();
    if (!opts.dryRun && !release) {
      return skipped("config-locked", "ZCode configuration is locked by another writer. Leaving it unchanged; retry after the native writer finishes.");
    }
    try {
      return installZCode(opts);
    } finally {
      release?.();
    }
  },
};
