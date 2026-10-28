import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { createJsonMcpAdapter } from "./json-mcp-adapter.js";
import type { ConnectOptions, ConnectResult } from "./types.js";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "./codex-hooks.js";
import { backupFile, logBackup, logInstalled, readJsonSafe, writeJsonAtomic } from "./util.js";

// Factory.ai's Droid CLI stores MCP server config at ~/.factory/mcp.json
// with the canonical `mcpServers` wrapper. Project-scoped overrides live
// at <repo>/.factory/mcp.json. Each entry adds an optional `type` field
// ("stdio" | "http") and `disabled` boolean — agentmemory's stdio block
// works against the same shape without needing the explicit type tag.
// Source: docs.factory.ai/cli/configuration/mcp
//
// Droid also ships a native, first-party hooks system (SessionStart,
// SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse) configured via
// `~/.factory/hooks.json`, in the same `{ hooks: { <event>: [{ matcher?,
// hooks: [{ type, command }] }] } }` shape Claude Code and Codex use — so
// `--with-hooks` reuses `buildMergedHooks` from codex-hooks.ts with the
// bundled `hooks.droid.json` manifest instead of writing a new merge
// strategy. Source: docs.factory.ai/cli/configuration/hooks-guide
const DROID_DIR = join(homedir(), ".factory");
const DROID_HOOKS = join(DROID_DIR, "hooks.json");

export const adapter = createJsonMcpAdapter({
  name: "droid",
  displayName: "Droid (Factory.ai)",
  detectDir: DROID_DIR,
  configPath: join(DROID_DIR, "mcp.json"),
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.factory/mcp.json. The `/mcp` slash command inside droid lists configured servers. Pass --with-hooks to also install the native ~/.factory/hooks.json auto-capture hooks.",
  // Droid requires `type` per the documented schema. stdio for npx-spawned shim.
  extraEntryFields: { type: "stdio" },
  installHooks: installDroidHooks,
});

/**
 * Merge the bundled `plugin/hooks/hooks.droid.json` into
 * `~/.factory/hooks.json`. Same idempotent merge/strip-by-script-path
 * behavior as the Codex and Claude Code hook installers: re-running keeps
 * user-authored hook entries and only replaces the ones agentmemory owns.
 */
function installDroidHooks(opts: ConnectOptions): ConnectResult {
  let pluginRoot: string;
  try {
    pluginRoot = findPluginRoot();
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const existing = readJsonSafe<HookManifest>(DROID_HOOKS);
  const merged = buildMergedHooks(existing, pluginRoot, "hooks.droid.json");

  if (opts.dryRun) {
    p.log.info(
      `[dry-run] Would ${existing ? "merge" : "create"} ${DROID_HOOKS} with ${Object.keys(merged.hooks).length} event(s)`,
    );
    return { kind: "installed", mutatedPath: DROID_HOOKS };
  }

  let backupPath: string | undefined;
  if (existsSync(DROID_HOOKS)) {
    backupPath = backupFile(DROID_HOOKS, "droid-hooks", "json");
    logBackup(backupPath);
  } else {
    mkdirSync(DROID_DIR, { recursive: true });
  }

  writeJsonAtomic(DROID_HOOKS, merged);

  logInstalled("Droid hooks", DROID_HOOKS);
  p.log.info(
    "User-scope hooks reference absolute paths under the bundled plugin/ dir. Re-run `agentmemory connect droid --with-hooks` after upgrading agentmemory to refresh them.",
  );

  return {
    kind: "installed",
    mutatedPath: DROID_HOOKS,
    ...(backupPath !== undefined && { backupPath }),
  };
}
