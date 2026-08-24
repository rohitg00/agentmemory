import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";
import type { ConnectOptions, ConnectResult } from "./types.js";
import { findPluginRoot } from "./codex-hooks.js";
import {
  buildMergedKlaatcodeHooks,
  type KlaatcodeHooksConfig,
} from "./klaatcode-hooks.js";
import {
  backupFile,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";

function klaatDir(): string {
  const override = process.env["KLAATAI_DIR"];
  if (override && override.trim()) return override;
  return join(homedir(), ".klaatai");
}

const KLAAT_DIR = klaatDir();
const KLAAT_MCP = join(KLAAT_DIR, "mcp.json");
const KLAAT_HOOKS = join(KLAAT_DIR, "hooks.json");

export const adapter = createJsonMcpAdapter({
  name: "klaatcode",
  displayName: "Klaat Code",
  detectDir: KLAAT_DIR,
  configPath: KLAAT_MCP,
  wrapperKey: "servers",
  category: "native",
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.klaatai/mcp.json (key: servers). Pass --with-hooks for native auto-capture.",
  installHooks: installKlaatcodeHooks,
});

function installKlaatcodeHooks(opts: ConnectOptions): ConnectResult {
  let pluginRoot: string;
  try {
    pluginRoot = findPluginRoot();
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const existing = readJsonSafe<KlaatcodeHooksConfig>(KLAAT_HOOKS);
  const merged = buildMergedKlaatcodeHooks(
    existing,
    pluginRoot,
    "hooks.klaatcode.json",
  );

  if (opts.dryRun) {
    p.log.info(
      `[dry-run] Would write ${Object.keys(merged).length} hook event(s) into ${KLAAT_HOOKS}`,
    );
    return { kind: "installed", mutatedPath: KLAAT_HOOKS };
  }

  let backupPath: string | undefined;
  if (existsSync(KLAAT_HOOKS)) {
    backupPath = backupFile(KLAAT_HOOKS, "klaatcode-hooks", "json");
    logBackup(backupPath);
  } else {
    mkdirSync(KLAAT_DIR, { recursive: true });
  }

  writeJsonAtomic(KLAAT_HOOKS, merged);

  logInstalled("Klaat Code hooks", KLAAT_HOOKS);
  p.log.info(
    "Verify with `/hooks` inside klaatcode. Hooks fire in the interactive TUI only — headless (`klaatai run`) and ACP sessions are not captured. Re-run `agentmemory connect klaatcode --with-hooks` after upgrading agentmemory so the plugin paths stay current.",
  );

  return {
    kind: "installed",
    mutatedPath: KLAAT_HOOKS,
    ...(backupPath !== undefined && { backupPath }),
  };
}
