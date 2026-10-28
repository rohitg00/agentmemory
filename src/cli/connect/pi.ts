import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter } from "./types.js";
import { installNativeBundles, nativeMcpEntry, nativePackageRoot, nativeUserPath, prepareNativeBundle, record } from "./native-install.js";
import { logAlreadyWired, logBackup, logInstalled } from "./util.js";

const agentDir = () => process.env.PI_CODING_AGENT_DIR ? nativeUserPath(process.env.PI_CODING_AGENT_DIR, homedir()) : join(homedir(), ".pi/agent");

const entryHash = (entry: unknown) => createHash("sha256").update(JSON.stringify(entry)).digest("hex");

function readConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Pi configuration is a symbolic link; left ${path} unchanged.`);
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!record(value)) throw new Error(`Invalid Pi configuration; left ${path} unchanged.`);
  return value;
}

function hasPackage(config: Record<string, unknown>, configDir: string, target: string): boolean {
  if (config.packages === undefined) return false;
  if (!Array.isArray(config.packages)) throw new Error("Pi settings.packages must be an array.");
  return config.packages.some(item => {
    const source = typeof item === "string" ? item : record(item) ? item.source : undefined;
    if (typeof source !== "string") throw new Error("Invalid Pi package entry; configuration was preserved.");
    if (/^npm:@agentmemory\/pi(?:@|$)/.test(source)) return true;
    const path = source.startsWith("~") ? nativeUserPath(source, homedir()) : resolve(configDir, source);
    if (path === target) return false;
    const manifest = join(path, "package.json");
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "@agentmemory/pi";
  });
}

export const adapter: ConnectAdapter = {
  name: "pi", displayName: "Pi", category: "native",
  docs: "https://github.com/rohitg00/agentmemory/tree/main/integrations/pi",
  protocolNote: "Installs native recall, capture and skills. Add --with-mcp for the full memory toolset.",
  detect: () => existsSync(agentDir()) || existsSync(join(homedir(), ".pi")),
  async install(opts) {
    try {
      const dir = agentDir();
      const target = join(dir, "agentmemory");
      const configPath = join(dir, "settings.json");
      const config = readConfig(configPath);
      const projectPath = join(process.cwd(), ".pi/settings.json");
      const packaged = hasPackage(config, dir, target);
      const projectConfig = readConfig(projectPath);
      if (!packaged && hasPackage(projectConfig, dirname(projectPath), target)) throw new Error("AgentMemory is configured as a project Pi package. Remove that package entry before installing globally, or keep using the project installation.");
      for (const [settings, base] of [[config, dir], [projectConfig, dirname(projectPath)]] as const) {
        if (!Array.isArray(settings.extensions)) continue;
        for (const entry of settings.extensions) {
          if (typeof entry !== "string") continue;
          const path = entry.startsWith("~") ? nativeUserPath(entry, homedir()) : resolve(base, entry);
          const manifest = join(/\.[cm]?[jt]s$/.test(path) ? dirname(path) : path, "package.json");
          if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "@agentmemory/pi") throw new Error("Remove the explicit AgentMemory extensions entry before connecting; the package already declares its extension.");
        }
      }
      const legacy = join(dir, "extensions/agentmemory");
      if (existsSync(legacy)) throw new Error(`Move the old copied extension at ${legacy} outside Pi's extensions directory before reconnecting, to prevent duplicate capture. Keep it as a backup.`);
      const root = nativePackageRoot();
      const bundle = packaged ? undefined : prepareNativeBundle(join(root, "integrations/pi"), target, "pi-extension", ["package.json", "dist/index.mjs"], opts.force, join(root, "plugin/skills"));
      if (packaged) p.log.info("Using the existing AgentMemory Pi package; no second extension was installed.");
      else {
        const packages = (config.packages ?? []) as unknown[];
        if (!packages.some(item => (typeof item === "string" ? item : record(item) ? item.source : undefined) === target)) config.packages = [...packages, target];
      }
      const text = JSON.stringify(config, null, 2) + "\n";
      const raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : undefined;
      const mcpPath = join(dir, "mcp.json");
      const mcpRaw = existsSync(mcpPath) ? readFileSync(mcpPath, "utf8") : undefined;
      let mcpText = mcpRaw;
      if (opts.withMcp) {
        const mcp = readConfig(mcpPath);
        if (mcp.mcpServers !== undefined && !record(mcp.mcpServers)) throw new Error("Invalid Pi mcpServers configuration; nothing was changed.");
        const servers = (mcp.mcpServers ?? {}) as Record<string, unknown>;
        const managed = servers.agentmemory !== undefined && record(mcp._agentmemoryConnector) && mcp._agentmemoryConnector.entryHash === entryHash(servers.agentmemory);
        if (servers.agentmemory !== undefined && !managed) {
          p.log.info("Preserved the existing AgentMemory MCP server. Project MCP settings apply only to trusted projects.");
        } else {
          const entry = { ...nativeMcpEntry(root), exposure: "direct" };
          mcpText = JSON.stringify({ ...mcp, mcpServers: { ...servers, agentmemory: entry }, _agentmemoryConnector: { entryHash: entryHash(entry) } }, null, 2) + "\n";
        }
      }
      if (opts.dryRun) {
        p.log.info(`[dry-run] Would configure Pi in ${dir}.`);
        return { kind: "installed", mutatedPath: configPath };
      }
      const configChanged = !packaged && (bundle!.changed || text !== raw);
      const mcpChanged = mcpText !== mcpRaw;
      let backupPath: string | undefined;
      if (mcpChanged) {
        backupPath = installNativeBundles([], mcpPath, mcpText!);
      }
      try {
        if (configChanged) backupPath = installNativeBundles([bundle!], configPath, text) ?? backupPath;
      } catch (error) {
        if (mcpChanged) {
          if (mcpRaw === undefined) rmSync(mcpPath, { force: true });
          else installNativeBundles([], mcpPath, mcpRaw);
        }
        throw error;
      }
      if (backupPath) logBackup(backupPath);
      const changed = configChanged || mcpChanged;
      if (changed) logInstalled(this.displayName, dir); else logAlreadyWired(this.displayName, dir);
      p.log.info("Restart Pi or /reload, then /agentmemory-status. Skills appear as /skill:<name>; the wider workflows require MCP. Reconnect after upgrading AgentMemory to refresh bundled runtime paths.");
      return { kind: changed ? "installed" : "already-wired", mutatedPath: configPath, ...(backupPath ? { backupPath } : {}) };
    } catch (error) {
      p.log.warn(error instanceof Error ? error.message : "Pi installation failed.");
      return { kind: "skipped", reason: "native-install-failed" };
    }
  },
};
