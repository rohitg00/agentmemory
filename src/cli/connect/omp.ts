import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { Document, parseDocument } from "yaml";
import type { ConnectAdapter } from "./types.js";
import { installNativeBundles, nativeMcpEntry, nativePackageRoot, nativeUserPath, prepareNativeBundle, record } from "./native-install.js";
import { logAlreadyWired, logBackup, logInstalled } from "./util.js";

export function ompPaths() {
  const root = join(homedir(), process.env.PI_CONFIG_DIR || ".omp");
  const profile = (process.env.OMP_PROFILE ?? process.env.PI_PROFILE ?? "").trim();
  if (profile && profile !== "default" && (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profile) || profile.endsWith(".") || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i.test(profile))) {
    throw new Error("Invalid OMP profile; use the same valid OMP_PROFILE as Oh My Pi.");
  }
  const configRoot = profile && profile !== "default" ? join(root, "profiles", profile) : root;
  const agent = configRoot !== root ? join(configRoot, "agent") : process.env.PI_CODING_AGENT_DIR ? resolve(process.env.PI_CODING_AGENT_DIR) : join(root, "agent");
  return { root: configRoot, agent, profile: profile && profile !== "default" ? profile : undefined };
}

export const adapter: ConnectAdapter = {
  name: "omp",
  displayName: "Oh My Pi",
  category: "native",
  docs: "https://github.com/rohitg00/agentmemory/tree/main/integrations/omp",
  protocolNote: "Installs native recall, capture and skills. Add --with-mcp for the full memory toolset.",
  detect: () => { try { const paths = ompPaths(); return existsSync(paths.agent) || existsSync(paths.root); } catch { return false; } },
  async install(opts) {
    try {
      const paths = ompPaths();
      const target = join(paths.agent, "agentmemory");
      const config = join(paths.agent, existsSync(join(paths.agent, "config.yml")) || !existsSync(join(paths.agent, "config.yaml")) ? "config.yml" : "config.yaml");
      const raw = existsSync(config) ? readFileSync(config, "utf8") : "";
      const legacy = join(paths.agent, "settings.json");
      const doc = !existsSync(config) && existsSync(legacy) ? new Document(JSON.parse(readFileSync(legacy, "utf8"))) : parseDocument(raw);
      const existing = doc.contents === null ? {} : doc.toJS({ maxAliasCount: 100 });
      if (doc.errors.length || !record(existing) || (existing.extensions !== undefined && (!Array.isArray(existing.extensions) || !existing.extensions.every(item => typeof item === "string")))) {
        throw new Error(`Invalid OMP configuration; left ${config} unchanged.`);
      }
      const extensions = (existing.extensions ?? []) as string[];
      const oldRoots = [
        ...extensions.map(value => nativeUserPath(value, homedir())).filter(value => value !== target),
        join(paths.root, "plugins/node_modules/agentmemory-omp-extension"),
        join(paths.agent, "plugins/node_modules/agentmemory-omp-extension"),
        join(process.cwd(), ".omp/plugins/node_modules/agentmemory-omp-extension"),
        join(paths.agent, "extensions/agentmemory"),
      ];
      if (process.platform === "linux") {
        const dataRoot = join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "omp");
        oldRoots.push(join(dataRoot, ...(paths.profile ? ["profiles", paths.profile] : []), "plugins/node_modules/agentmemory-omp-extension"));
      }
      for (const old of oldRoots) {
        const manifest = join(old, "package.json");
        if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "agentmemory-omp-extension") {
          throw new Error(`Another OMP AgentMemory extension exists at ${old}. Uninstall it with 'omp plugin uninstall agentmemory-omp-extension' or remove its extensions entry before reconnecting, to prevent duplicate capture.`);
        }
      }
      const root = nativePackageRoot();
      const mcpPath = join(target, ".mcp.json");
      const extra: Record<string, string> = {};
      if (existsSync(mcpPath)) extra[".mcp.json"] = readFileSync(mcpPath, "utf8");
      let userOwnsMcp = false;
      if (opts.withMcp || existsSync(mcpPath)) {
        const nativeMcpPath = join(paths.agent, "mcp.json");
        const nativeMcp = existsSync(nativeMcpPath) ? JSON.parse(readFileSync(nativeMcpPath, "utf8")) : {};
        userOwnsMcp = nativeMcp.mcpServers?.agentmemory !== undefined;
        if (userOwnsMcp) {
          delete extra[".mcp.json"];
          p.log.info("Preserved the existing AgentMemory MCP server in OMP's mcp.json.");
        } else if (opts.withMcp) extra[".mcp.json"] = JSON.stringify({ mcpServers: { agentmemory: nativeMcpEntry(root) } }, null, 2) + "\n";
      }
      const bundle = prepareNativeBundle(join(root, "integrations/omp"), target, "omp-extension", ["package.json", "dist/index.mjs"], opts.force, join(root, "plugin/skills"), extra);
      if (userOwnsMcp && existsSync(mcpPath) && !bundle.previous[".mcp.json"] && JSON.parse(readFileSync(mcpPath, "utf8")).mcpServers?.agentmemory !== undefined) throw new Error(`Unmanaged ${mcpPath} conflicts with OMP's mcp.json. Remove the duplicate AgentMemory configuration before reconnecting.`);
      if (!extensions.includes(target)) doc.set("extensions", [...extensions, target]);
      const text = doc.toString();
      if (opts.dryRun) {
        p.log.info(`[dry-run] Would install OMP's extension and skills into ${target}, then register it in ${config}.`);
        return { kind: "installed", mutatedPath: config };
      }
      const unchanged = !bundle.changed && text === raw;
      const backupPath = unchanged ? undefined : installNativeBundles([bundle], config, text);
      if (backupPath) logBackup(backupPath);
      if (unchanged) logAlreadyWired(this.displayName, config); else logInstalled(this.displayName, config);
      p.log.info("Restart OMP and run /agentmemory-status. Native save/search work without MCP; the other bundled skills require --with-mcp. Project extensions arrays override this user setting: include the installed directory there when overriding extensions.");
      return unchanged ? { kind: "already-wired", mutatedPath: config } : { kind: "installed", mutatedPath: config, ...(backupPath ? { backupPath } : {}) };
    } catch (error) {
      p.log.warn(error instanceof Error ? error.message : "OMP installation failed.");
      return { kind: "skipped", reason: "native-install-failed" };
    }
  },
};
