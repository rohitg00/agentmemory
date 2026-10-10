import { existsSync, mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";
import type { ConnectOptions, ConnectResult } from "./types.js";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "./codex-hooks.js";
import {
  backupFile,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";

function devinDir(): string {
  if (platform() === "win32") {
    const appData = process.env["APPDATA"];
    if (appData) return join(appData, "devin");
  }
  const xdg = process.env["XDG_CONFIG_HOME"];
  return xdg ? join(xdg, "devin") : join(homedir(), ".config", "devin");
}

const DEVIN_DIR = devinDir();
const DEVIN_CONFIG = join(DEVIN_DIR, "config.json");

export const adapter = createJsonMcpAdapter({
  name: "devin",
  displayName: "Devin CLI",
  detectDir: DEVIN_DIR,
  configPath: DEVIN_CONFIG,
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via the user config. Devin CLI migrates mcpServers into mcp_config.json on newer builds. Pass --with-hooks for native auto-capture.",
  installHooks: installDevinHooks,
});

function installDevinHooks(opts: ConnectOptions): ConnectResult {
  let pluginRoot: string;
  try {
    pluginRoot = findPluginRoot();
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const existing = readJsonSafe<Record<string, unknown>>(DEVIN_CONFIG) ?? {};
  const existingHooks = existing["hooks"]
    ? ({ hooks: existing["hooks"] } as HookManifest)
    : null;
  const merged = buildMergedHooks(existingHooks, pluginRoot, "hooks.devin.json");
  const next = { ...existing, hooks: merged.hooks };

  if (opts.dryRun) {
    p.log.info(
      `[dry-run] Would write ${Object.keys(merged.hooks).length} hook event(s) into ${DEVIN_CONFIG}`,
    );
    return { kind: "installed", mutatedPath: DEVIN_CONFIG };
  }

  let backupPath: string | undefined;
  if (existsSync(DEVIN_CONFIG)) {
    backupPath = backupFile(DEVIN_CONFIG, "devin-hooks", "json");
    logBackup(backupPath);
  } else {
    mkdirSync(DEVIN_DIR, { recursive: true });
  }

  writeJsonAtomic(DEVIN_CONFIG, next);

  logInstalled("Devin CLI hooks", DEVIN_CONFIG);
  p.log.info(
    "Verify with `/hooks` inside devin. Re-run `agentmemory connect devin --with-hooks` after upgrading agentmemory so the plugin paths stay current.",
  );

  return {
    kind: "installed",
    mutatedPath: DEVIN_CONFIG,
    ...(backupPath !== undefined && { backupPath }),
  };
}
