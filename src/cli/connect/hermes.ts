import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { parseDocument } from "yaml";
import type { ConnectAdapter } from "./types.js";
import { installNativeBundles, nativeMcpEntry, nativePackageRoot, nativeUserPath, prepareNativeBundle, record } from "./native-install.js";
import { logAlreadyWired, logBackup, logInstalled } from "./util.js";

const hermesHome = () => {
  const value = process.env.HERMES_HOME?.trim() || join(homedir(), `.hermes${process.env.HERMES_DATA_DIR_SUFFIX ?? ""}`);
  return nativeUserPath(value.replace(/\$(?:\{([^}]+)\}|([A-Za-z_][A-Za-z_0-9]*))/g, (match, braced, plain) => process.env[braced ?? plain] ?? match), homedir());
};
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/hermes";
const stringList = (value: unknown) => value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));

export const adapter: ConnectAdapter = {
  name: "hermes",
  displayName: "Hermes Agent",
  category: "native",
  docs: DOCS,
  protocolNote: "→ Installs the native memory provider and bundled skills into the active Hermes profile. Credentials stay managed by Hermes.",
  detect: () => existsSync(hermesHome()),

  async install(opts) {
    const home = hermesHome();
    const path = join(home, "config.yaml");
    const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
    const doc = parseDocument(raw);
    let existing: unknown;
    try { existing = doc.contents === null ? {} : doc.toJS({ maxAliasCount: 100 }); } catch { existing = null; }
    if (doc.errors.length || !record(existing) ||
        (existing.memory !== undefined && !record(existing.memory)) ||
        (existing.plugins !== undefined && !record(existing.plugins)) ||
        (existing.mcp_servers !== undefined && !record(existing.mcp_servers))) {
      p.log.warn(`Hermes config is not a valid YAML mapping. Left ${path} unchanged.`);
      return { kind: "skipped", reason: "invalid-config" };
    }
    const memory = (existing.memory ?? {}) as Record<string, unknown>;
    const plugins = (existing.plugins ?? {}) as Record<string, unknown>;
    const servers = (existing.mcp_servers ?? {}) as Record<string, unknown>;
    if (!stringList(plugins.enabled) || !stringList(plugins.disabled) ||
        (memory.provider !== undefined && typeof memory.provider !== "string")) {
      p.log.warn(`Hermes provider or plugin settings are invalid. Left ${path} unchanged.`);
      return { kind: "skipped", reason: "invalid-config" };
    }
    if (servers.agentmemory !== undefined && !record(servers.agentmemory) && !(opts.force && opts.withMcp)) {
      p.log.warn("Hermes's AgentMemory MCP entry is invalid. Repair it or use --force --with-mcp.");
      return { kind: "skipped", reason: "invalid-entry" };
    }
    if (memory.provider && memory.provider !== "agentmemory" && !opts.force) {
      p.log.warn("Hermes already selects another memory provider. Use --force to select AgentMemory and keep a backup.");
      return { kind: "skipped", reason: "memory-provider-conflict" };
    }
    if ((plugins.disabled as string[] | undefined)?.includes("agentmemory") && !opts.force) {
      p.log.warn("AgentMemory is disabled in this Hermes profile. Use --force to enable it.");
      return { kind: "skipped", reason: "plugin-disabled" };
    }
    try {
      const root = nativePackageRoot();
      const bundles = [
        prepareNativeBundle(join(root, "integrations", "hermes"), join(home, "plugins", "agentmemory"), "hermes-provider", ["__init__.py", "plugin.yaml"], opts.force),
        prepareNativeBundle(join(root, "plugin", "skills"), join(home, "skills", "agentmemory"), "hermes-skills", ["remember/SKILL.md", "recall/SKILL.md"], opts.force),
      ];
      if (memory.provider !== "agentmemory") doc.setIn(["memory", "provider"], "agentmemory");
      const enabled = (plugins.enabled ?? []) as string[];
      if (!enabled.includes("agentmemory")) doc.setIn(["plugins", "enabled"], [...enabled, "agentmemory"]);
      if ((plugins.disabled as string[] | undefined)?.includes("agentmemory")) doc.setIn(["plugins", "disabled"], (plugins.disabled as string[]).filter((name) => name !== "agentmemory"));
      if (opts.withMcp) {
        p.log.warn("MCP exposes all AgentMemory tools against the configured backend. It does not enforce the native provider's profile scope; enable it only for a trusted, deliberately shared backend.");
        if (servers.agentmemory === undefined || opts.force) {
          const entry = nativeMcpEntry(root);
          entry.env = { ...(entry.env as Record<string, string>), AGENTMEMORY_URL: "${AGENTMEMORY_URL}", AGENTMEMORY_SECRET: "${AGENTMEMORY_SECRET}", AGENTMEMORY_CREDENTIAL_MODE: "explicit" };
          doc.setIn(["mcp_servers", "agentmemory"], entry);
        } else p.log.info("Preserved the existing AgentMemory MCP entry. After moving the installed package, review its settings and reconnect with --with-mcp --force to refresh its runtime path.");
      }
      const configText = doc.toString();
      if (opts.dryRun) {
        p.log.info(`[dry-run] Would install the native provider and skills, then activate AgentMemory in ${path}`);
        return { kind: "installed", mutatedPath: path };
      }
      let backupPath: string | undefined;
      const unchanged = !bundles.some((bundle) => bundle.changed) && configText === raw;
      if (unchanged) logAlreadyWired(this.displayName, path);
      else {
        backupPath = installNativeBundles(bundles, path, configText);
        if (backupPath) logBackup(backupPath);
        logInstalled(this.displayName, path);
      }
      p.log.info("Authentication is not verified. Start AgentMemory, then run `hermes memory setup` in this same HERMES_HOME to set its URL and scoped secret. Verify a save and recall in a new session. Skills needing tools beyond native save, recall and search require the optional --with-mcp connection.");
      return unchanged ? { kind: "already-wired", mutatedPath: path } : { kind: "installed", mutatedPath: path, ...(backupPath ? { backupPath } : {}) };
    } catch (error) {
      p.log.warn(error instanceof Error ? error.message : "Hermes installation failed; configuration was not activated.");
      return { kind: "skipped", reason: "native-install-failed" };
    }
  },
};
