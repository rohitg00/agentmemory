import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";
import type { ConnectOptions, ConnectResult } from "./types.js";
import {
  buildMergedAntigravityHooks,
  type AntigravityHookManifest,
} from "./antigravity-hooks.js";
import { findPluginRoot } from "./codex-hooks.js";
import {
  backupFile,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";

// Antigravity ships two products that do NOT share configuration:
//
//   • the IDE, wired by `antigravity.ts` via the app-support directory
//     (~/Library/Application Support/Antigravity/User/mcp_config.json);
//   • the `agy` CLI, wired here, which reads its customizations out of
//     ~/.gemini/ — MCP servers from ~/.gemini/config/mcp_config.json and
//     hooks from ~/.gemini/config/hooks.json, with per-workspace overrides
//     in <repo>/.agents/hooks.json.
//
// Detection keys off ~/.gemini/antigravity-cli/, which only the CLI
// creates — ~/.gemini/ alone would also match a Gemini CLI install.
//
// Unlike Claude Code, Codex and Droid, Antigravity's hooks.json is a map of
// *named* hook bundles and exposes only five events, so `--with-hooks`
// uses the dedicated merge engine in antigravity-hooks.ts and routes every
// event through the bridge in plugin/scripts/antigravity-bridge.mjs.
// Sources: antigravity.google/docs/hooks, antigravity.google/docs/cli/using
const GEMINI_DIR = join(homedir(), ".gemini");
const ANTIGRAVITY_CLI_DIR = join(GEMINI_DIR, "antigravity-cli");
const CUSTOMIZATION_DIR = join(GEMINI_DIR, "config");
const ANTIGRAVITY_CLI_HOOKS = join(CUSTOMIZATION_DIR, "hooks.json");

export const adapter = createJsonMcpAdapter({
  name: "antigravity-cli",
  displayName: "Antigravity CLI (agy)",
  detectDir: ANTIGRAVITY_CLI_DIR,
  configPath: join(CUSTOMIZATION_DIR, "mcp_config.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.gemini/config/mcp_config.json (the agy CLI, not the Antigravity IDE — that one is `connect antigravity`). The `/mcp` slash command inside agy lists configured servers. Pass --with-hooks to also install the native ~/.gemini/config/hooks.json auto-capture hooks.",
  installHooks: installAntigravityCliHooks,
});

/**
 * Merge the bundled `plugin/hooks/hooks.antigravity.json` into
 * `~/.gemini/config/hooks.json`. Idempotent in the same way as the Codex
 * and Droid installers: re-running replaces only the hook bundle
 * agentmemory owns and leaves user-authored bundles alone.
 */
function installAntigravityCliHooks(opts: ConnectOptions): ConnectResult {
  let pluginRoot: string;
  try {
    pluginRoot = findPluginRoot();
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const existing = readJsonSafe<AntigravityHookManifest>(ANTIGRAVITY_CLI_HOOKS);
  const merged = buildMergedAntigravityHooks(existing, pluginRoot);

  if (opts.dryRun) {
    p.log.info(
      `[dry-run] Would ${existing ? "merge" : "create"} ${ANTIGRAVITY_CLI_HOOKS} with ${Object.keys(merged).length} hook bundle(s)`,
    );
    return { kind: "installed", mutatedPath: ANTIGRAVITY_CLI_HOOKS };
  }

  let backupPath: string | undefined;
  if (existsSync(ANTIGRAVITY_CLI_HOOKS)) {
    backupPath = backupFile(ANTIGRAVITY_CLI_HOOKS, "antigravity-cli-hooks", "json");
    logBackup(backupPath);
  } else {
    mkdirSync(CUSTOMIZATION_DIR, { recursive: true });
  }

  writeJsonAtomic(ANTIGRAVITY_CLI_HOOKS, merged);

  logInstalled("Antigravity CLI hooks", ANTIGRAVITY_CLI_HOOKS);
  p.log.info(
    "User-scope hooks reference absolute paths under the bundled plugin/ dir. Re-run `agentmemory connect antigravity-cli --with-hooks` after upgrading agentmemory to refresh them.",
  );

  return {
    kind: "installed",
    mutatedPath: ANTIGRAVITY_CLI_HOOKS,
    ...(backupPath !== undefined && { backupPath }),
  };
}
