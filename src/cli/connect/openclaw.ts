import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import JSON5 from "json5";
import type { ConnectAdapter } from "./types.js";
import { logAlreadyWired, logBackup, logInstalled } from "./util.js";
import { installNativeBundles, nativeMcpEntry, nativePackageRoot, nativeUserPath, prepareNativeBundle, record } from "./native-install.js";

const paths = () => {
  const home = nativeUserPath(process.env.OPENCLAW_HOME?.trim() || homedir(), homedir());
  const preferred = join(home, ".openclaw");
  const legacy = join(home, ".clawdbot");
  const state = process.env.OPENCLAW_STATE_DIR?.trim()
    ? nativeUserPath(process.env.OPENCLAW_STATE_DIR.trim(), home)
    : !existsSync(preferred) && existsSync(legacy) ? legacy : preferred;
  const config = process.env.OPENCLAW_CONFIG_PATH?.trim()
    ? nativeUserPath(process.env.OPENCLAW_CONFIG_PATH.trim(), home)
    : !existsSync(join(state, "openclaw.json")) && existsSync(join(state, "clawdbot.json")) ? join(state, "clawdbot.json") : join(state, "openclaw.json");
  return { state, config };
};
const stringList = (value: unknown) => value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));

export const adapter: ConnectAdapter = {
  name: "openclaw",
  displayName: "OpenClaw",
  category: "native",
  docs: "https://github.com/rohitg00/agentmemory/tree/main/integrations/openclaw",
  protocolNote: "→ Installs native recall/capture and bundled skills into the active OpenClaw state directory. MCP tools are opt-in with --with-mcp.",
  detect: () => existsSync(paths().config) || existsSync(paths().state),
  async install(opts) {
    const { state, config: configPath } = paths();
    const raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
    let existing: unknown;
    try { existing = raw ? JSON5.parse(raw) : {}; } catch { existing = null; }
    if (!record(existing) || ["mcp", "plugins", "skills"].some((key) => existing[key] !== undefined && !record(existing[key]))) {
      p.log.warn(`OpenClaw config is not a valid JSON/JSON5 object. Left ${configPath} unchanged.`);
      return { kind: "skipped", reason: "invalid-config" };
    }
    const next = { ...existing };
    const mcp = { ...((next.mcp ?? {}) as Record<string, unknown>) };
    if (mcp.servers !== undefined && !record(mcp.servers)) return { kind: "skipped", reason: "invalid-config" };
    const servers = { ...((mcp.servers ?? {}) as Record<string, unknown>) };
    const legacyServers = record(next.mcpServers) ? { ...next.mcpServers } : {};
    const legacy = legacyServers.agentmemory;
    const migrateLegacy = record(legacy) && legacy.command === "npx" && Array.isArray(legacy.args) && legacy.args.includes("@agentmemory/mcp");
    if (next.mcpServers !== undefined && (!migrateLegacy || Object.keys(legacyServers).some((key) => key !== "agentmemory"))) {
      p.log.warn("OpenClaw rejects the legacy mcpServers key. Left the file unchanged; migrate custom servers with OpenClaw's native configuration tools first.");
      return { kind: "skipped", reason: "legacy-config-needs-migration" };
    }
    if (servers.agentmemory !== undefined && !record(servers.agentmemory) && !(opts.force && opts.withMcp)) {
      p.log.warn("OpenClaw's AgentMemory MCP entry is invalid. Repair it or use --force --with-mcp.");
      return { kind: "skipped", reason: "invalid-entry" };
    }
    const plugins = { ...((next.plugins ?? {}) as Record<string, unknown>) };
    const skills = { ...((next.skills ?? {}) as Record<string, unknown>) };
    if (["entries", "slots"].some((key) => plugins[key] !== undefined && !record(plugins[key])) ||
        (skills.load !== undefined && !record(skills.load)) || !stringList(plugins.allow) || !stringList(plugins.deny)) return { kind: "skipped", reason: "invalid-config" };
    const entries = { ...((plugins.entries ?? {}) as Record<string, unknown>) };
    const slots = { ...((plugins.slots ?? {}) as Record<string, unknown>) };
    const load = { ...((skills.load ?? {}) as Record<string, unknown>) };
    if (!stringList(load.extraDirs) || (entries.agentmemory !== undefined && !record(entries.agentmemory)) ||
        (slots.memory !== undefined && typeof slots.memory !== "string")) return { kind: "skipped", reason: "invalid-config" };
    if (slots.memory !== undefined && slots.memory !== "agentmemory" && !opts.force) {
      p.log.warn("OpenClaw already selects another memory plugin. Use --force to select AgentMemory and keep a backup.");
      return { kind: "skipped", reason: "memory-provider-conflict" };
    }
    const entry = { ...((entries.agentmemory ?? {}) as Record<string, unknown>) };
    if (entry.hooks !== undefined && !record(entry.hooks)) return { kind: "skipped", reason: "invalid-config" };
    const hooks = { ...((entry.hooks ?? {}) as Record<string, unknown>) };
    if (plugins.enabled === false || (!opts.force && (entry.enabled === false || hooks.allowConversationAccess === false || (plugins.deny as string[] | undefined)?.includes("agentmemory")))) {
      p.log.warn("OpenClaw plugin execution or AgentMemory conversation access is disabled. Enable it explicitly before connecting, or use --force for AgentMemory's own settings.");
      return { kind: "skipped", reason: "plugin-disabled" };
    }
    try {
      const root = nativePackageRoot();
      const bundles = [
        prepareNativeBundle(join(root, "integrations", "openclaw"), join(state, "extensions", "agentmemory"), "openclaw-plugin", ["plugin.mjs", "openclaw.plugin.json", "package.json"], opts.force, join(root, "plugin", "skills")),
      ];
      if (opts.withMcp || migrateLegacy) {
        p.log.warn("MCP exposes all AgentMemory tools against the configured backend. It does not enforce native profile scope; use it only for a trusted, deliberately shared backend.");
        if (servers.agentmemory === undefined || opts.force) {
          const migrated = migrateLegacy && !opts.force ? { ...legacy } : {};
          const runtime = nativeMcpEntry(root);
          const env = { ...(runtime.env as Record<string, string>), ...(record(migrated.env) ? migrated.env : {}) } as Record<string, unknown>;
          for (const [key, value] of Object.entries(env)) {
            if ((key === "AGENTMEMORY_URL" && value === "${AGENTMEMORY_URL:-http://localhost:3111}") ||
                (key === "AGENTMEMORY_SECRET" && value === "${AGENTMEMORY_SECRET:-}")) delete env[key];
            if (key === "AGENTMEMORY_TOOLS" && value === "${AGENTMEMORY_TOOLS:-all}") env[key] = "all";
          }
          servers.agentmemory = { ...migrated, ...runtime, transport: "stdio", env };
        } else p.log.info("Preserved the existing AgentMemory MCP entry. After moving the installed package, review its settings and reconnect with --with-mcp --force to refresh its runtime path.");
        if (migrateLegacy) delete next.mcpServers;
        next.mcp = { ...mcp, servers };
      }
      entries.agentmemory = { ...entry, enabled: true, hooks: { ...hooks, allowConversationAccess: true } };
      plugins.entries = entries;
      plugins.slots = { ...slots, memory: "agentmemory" };
      if (plugins.allow !== undefined) plugins.allow = [...new Set([...(plugins.allow as string[]), "agentmemory"])];
      if ((plugins.deny as string[] | undefined)?.includes("agentmemory")) plugins.deny = (plugins.deny as string[]).filter((name) => name !== "agentmemory");
      next.plugins = plugins;
      const configText = JSON.stringify(next) === JSON.stringify(existing) ? raw : JSON.stringify(next, null, 2) + "\n";
      if (opts.dryRun) {
        p.log.info(`[dry-run] Would install native plugin and skills, then activate AgentMemory in ${configPath}`);
        return { kind: "installed", mutatedPath: configPath };
      }
      const unchanged = !bundles.some((bundle) => bundle.changed) && configText === raw;
      if (unchanged) { logAlreadyWired(this.displayName, configPath); return { kind: "already-wired", mutatedPath: configPath }; }
      const backupPath = installNativeBundles(bundles, configPath, configText);
      if (backupPath) logBackup(backupPath);
      logInstalled(this.displayName, configPath);
      p.log.info("Start AgentMemory and verify capture and recall in a new OpenClaw session. Skills that call memory tools require --with-mcp; authentication and connectivity are not yet verified.");
      return { kind: "installed", mutatedPath: configPath, ...(backupPath ? { backupPath } : {}) };
    } catch (error) {
      p.log.warn(error instanceof Error ? error.message : "OpenClaw installation failed; configuration was not activated.");
      return { kind: "skipped", reason: "native-install-failed" };
    }
  },
};
