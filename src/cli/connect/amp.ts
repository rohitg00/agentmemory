import { existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

// Amp settings live under:
//   macOS/Linux: ~/.config/amp/settings.json
//   Windows:     %APPDATA%\amp\settings.json
// Amp plugins live under:
//   system:  ~/.config/amp/plugins/  (or %APPDATA%\amp\plugins\ on Windows)
//   project: .amp/plugins/
//
// The MCP wrapper key in settings.json is "amp.mcpServers" (not the
// standard "mcpServers" used by Claude Code / Cursor / etc).

function ampConfigDir(): string {
  if (process.platform === "win32") {
    const appdata =
      process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming");
    return join(appdata, "amp");
  }
  return join(homedir(), ".config", "amp");
}

const CONFIG_PATH = join(ampConfigDir(), "settings.json");
const DETECT_DIR = ampConfigDir();
const PLUGINS_DIR = join(ampConfigDir(), "plugins");
const PLUGIN_FILE = join(PLUGINS_DIR, "agentmemory.ts");

// Amp uses "amp.mcpServers" as the wrapper key (not "mcpServers").
const WRAPPER_KEY = "amp.mcpServers";

type AmpMcpEntry = typeof AGENTMEMORY_MCP_BLOCK;
type AmpConfig = Record<string, unknown>;

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["command"] !== "npx") return false;
  const args = Array.isArray(e["args"]) ? (e["args"] as string[]) : [];
  return args.includes("@agentmemory/mcp");
}

// Walk upward from this file to find the bundled plugin source at
// integrations/amp/agentmemory.ts. The published package includes
// integrations/ alongside plugin/ (see "files" in package.json).
function findPluginSource(): string {
  let dir = dirname(new URL(import.meta.url).pathname.replace(/^\//, ""));
  for (let i = 0; i < 15; i++) {
    const candidate = join(dir, "integrations", "amp", "agentmemory.ts");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not locate integrations/amp/agentmemory.ts — is the package installed correctly?",
  );
}

export const adapter: ConnectAdapter = {
  name: "amp",
  displayName: "Amp (Sourcegraph)",
  category: "native",
  docs: "https://github.com/rohitg00/agentmemory/tree/main/integrations/amp",
  protocolNote:
    "Using MCP via amp.mcpServers in settings.json + native plugin for auto-capture hooks. Run `agentmemory connect amp --with-hooks` to install both.",

  detect(): boolean {
    // Detect Amp config dir OR an .amp/ directory in the current project.
    return existsSync(DETECT_DIR) || existsSync(".amp");
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const existing = readJsonSafe<AmpConfig>(CONFIG_PATH);
    const next: AmpConfig = existing ? { ...existing } : {};
    const servers: Record<string, AmpMcpEntry> = {
      ...((next[WRAPPER_KEY] as Record<string, AmpMcpEntry>) ?? {}),
    };

    const alreadyHas = entryMatches(servers["agentmemory"]);
    if (alreadyHas && !opts.force && !opts.withHooks) {
      logAlreadyWired(this.displayName, CONFIG_PATH);
      return { kind: "already-wired", mutatedPath: CONFIG_PATH };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} ${WRAPPER_KEY}.agentmemory in ${CONFIG_PATH}`,
      );
      if (opts.withHooks) {
        p.log.info(`[dry-run] Would also copy plugin to ${PLUGIN_FILE}`);
      }
      return { kind: "installed", mutatedPath: CONFIG_PATH };
    }

    let backupPath: string | undefined;
    if (existsSync(CONFIG_PATH)) {
      backupPath = backupFile(CONFIG_PATH, this.name);
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    }

    // Write MCP config (always, even with --with-hooks)
    if (!alreadyHas || opts.force) {
      servers["agentmemory"] = AGENTMEMORY_MCP_BLOCK;
      next[WRAPPER_KEY] = servers;
      writeJsonAtomic(CONFIG_PATH, next);

      const verify = readJsonSafe<AmpConfig>(CONFIG_PATH);
      const verifyServers = verify?.[WRAPPER_KEY] as
        | Record<string, AmpMcpEntry>
        | undefined;
      if (!entryMatches(verifyServers?.["agentmemory"])) {
        p.log.error(
          `Verification failed: ${CONFIG_PATH} did not contain ${WRAPPER_KEY}.agentmemory after write.`,
        );
        return { kind: "skipped", reason: "verification-failed" };
      }

      logInstalled(this.displayName, CONFIG_PATH);
    }

    // Install the plugin file when --with-hooks is passed
    if (opts.withHooks) {
      let pluginSource: string;
      try {
        pluginSource = findPluginSource();
      } catch (err) {
        p.log.warn(
          `Plugin file not installed: ${err instanceof Error ? err.message : String(err)}. MCP wiring still applied.`,
        );
        return {
          kind: "installed",
          mutatedPath: CONFIG_PATH,
          ...(backupPath !== undefined && { backupPath }),
        };
      }

      mkdirSync(PLUGINS_DIR, { recursive: true });

      // Only copy if the source is different from what's already there
      let shouldCopy = true;
      if (existsSync(PLUGIN_FILE) && !opts.force) {
        try {
          const srcStat = statSync(pluginSource);
          const dstStat = statSync(PLUGIN_FILE);
          if (srcStat.size === dstStat.size && srcStat.mtimeMs <= dstStat.mtimeMs) {
            shouldCopy = false;
          }
        } catch {}
      }

      if (shouldCopy) {
        copyFileSync(pluginSource, PLUGIN_FILE);
        logInstalled("agentmemory plugin (auto-capture)", PLUGIN_FILE);
        p.log.info(
          "Run `plugins: reload` from the Amp command palette (Ctrl+O) to activate.",
        );
      } else {
        p.log.info(`Plugin already up to date at ${PLUGIN_FILE}`);
      }
    }

    p.log.info(
      "Restart Amp (or run `plugins: reload` from the command palette) to pick up agentmemory.",
    );

    return {
      kind: "installed",
      mutatedPath: CONFIG_PATH,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};