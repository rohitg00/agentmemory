import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  jcodeConfigPath,
  readJcodeMcpJson,
  removeTomlArrayValue,
  upsertTomlArrayValue,
  writeJcodeMcpJson,
} from "./jcode-toml.js";

// jcode wires lifecycle capture through TOML array hooks
// (~/.jcode/config.toml [hooks]) that translate jcode's JCODE_HOOK_* env
// vars into the Claude-style stdin JSON the bundled hooks read. The bridge
// script is a small static shim — no build step — installed into
// ~/.jcode/plugins/agentmemory/ alongside copies of the bundled hook
// scripts it spawns.

const JCODE_DIR = join(homedir(), ".jcode");
const PLUGIN_DIR = join(JCODE_DIR, "plugins", "agentmemory");
const BRIDGE_SCRIPT = "agentmemory-bridge.mjs";
// Each key installs with its own event argument: the bridge dispatches on
// argv[2], so omitting it would make every capture a silent no-op.
const HOOK_KEYS = ["session_start", "session_end", "post_tool", "turn_end"];

// Bundled hooks the bridge spawns. Copied next to the bridge so the
// install is self-contained (the npm package ships them under plugin/
// scripts/).
// _capture.mjs is a runtime dependency of every bundled hook — without it
// the spawn hangs on module resolution.
const BUNDLED_HOOKS = [
  "session-start.mjs",
  "session-end.mjs",
  "post-tool-use.mjs",
  "post-tool-failure.mjs",
  "stop.mjs",
  "_capture.mjs",
];

const DESIRED_MCP_ENTRY = { command: "agentmemory-mcp", timeout_secs: 60 };

const BRIDGE_SOURCE = `#!/usr/bin/env node
// agentmemory jcode bridge — translates jcode lifecycle-hook env vars into
// the Claude-style stdin JSON that the bundled agentmemory hooks read.
// Usage: agentmemory-bridge.mjs <session_start|post_tool|turn_end|session_end>
// Always exits 0: a capture failure must never fail the host's tool call.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVENT = process.argv[2] ?? "";
const MAPPINGS = {
  session_start: { script: "session-start.mjs", event: "SessionStart" },
  post_tool: { script: "post-tool-use.mjs", event: "PostToolUse", error_script: "post-tool-failure.mjs" },
  turn_end: { script: "stop.mjs", event: "Stop" },
  session_end: { script: "session-end.mjs", event: "SessionEnd" },
};
const map = MAPPINGS[EVENT];
if (!map) process.exit(0);

const env = process.env;

// jcode puts the tool-call input JSON in JCODE_HOOK_TOOL_INPUT (16KB cap);
// stdin is only documented for other hook types, so read it as a fallback.
let toolInput = {};
// Prefer the env var; stdin is a fallback for other hook types. Never
// block on a TTY stdin (manual runs) — a 100ms cap keeps this bounded.
const rawInput = env.JCODE_HOOK_TOOL_INPUT ?? readStdinCapped();
try { toolInput = JSON.parse(rawInput || "{}"); } catch {}

function readStdinCapped() {
  try {
    if (process.stdin.isTTY) return "";
    const timer = setTimeout(() => process.exit(0), 100);
    const text = readFileSync(0, "utf8");
    clearTimeout(timer);
    return text;
  } catch {
    return "";
  }
}

const isError = env.JCODE_HOOK_STATUS === "error";

const payload = {
  session_id: env.JCODE_HOOK_SESSION_ID ?? "unknown",
  cwd: env.JCODE_HOOK_CWD ?? process.cwd(),
  hook_event_name: map.event,
  tool_name: env.JCODE_HOOK_TOOL_NAME ?? "",
  tool_input: toolInput,
  // jcode exposes the output size on success and the error text on failure.
  tool_response: isError
    ? (env.JCODE_HOOK_ERROR ?? "unknown error")
    : env.JCODE_HOOK_OUTPUT_BYTES
      ? "[" + env.JCODE_HOOK_OUTPUT_BYTES + " bytes output]"
      : "",
  // The Stop hook reads the final assistant text through this field.
  prompt: env.JCODE_HOOK_LAST_ASSISTANT_TEXT ?? "",
};

const script = isError && map.error_script ? map.error_script : map.script;
const hookPath = join(dirname(fileURLToPath(import.meta.url)), script);

try {
  spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    timeout: 8000,
  });
} catch {}
process.exit(0);
`;

function bundledHookSource(hook: string): string {
  // Locate the bundled script shipped under plugin/scripts in the npm
  // package (dev: the repo checkout). Same walk as codex-hooks.ts.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, "plugin", "scripts", hook);
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`agentmemory: bundled hook ${hook} not found`);
}

function fileURLToPath(url: string): string {
  return url.startsWith("file://") ? url.slice("file://".length) : url;
}

export const adapter: ConnectAdapter = {
  name: "jcode",
  displayName: "jcode",
  docs: "https://github.com/1jehuang/jcode",
  category: "native",
  protocolNote:
    "→ Wiring REST capture via jcode's [hooks] TOML arrays. The MCP entry in ~/.jcode/mcp.json is the opt-in bridge for MCP-only flows.",
  detect(): boolean {
    return existsSync(JCODE_DIR);
  },
  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const configPath = jcodeConfigPath();
    const desiredServerJson = JSON.stringify(DESIRED_MCP_ENTRY);

    // Dry-run reports before any mutation.
    if (opts.dryRun) {
      console.log(
        `[dry run] would install ${BUNDLED_HOOKS.length + 1} scripts in ${PLUGIN_DIR}, ` +
          `register agentmemory in ${join(JCODE_DIR, "mcp.json")}, and wire ` +
          `${HOOK_KEYS.join(", ")} in ${configPath}`,
      );
      return { kind: "skipped", reason: "dry run" };
    }

    // 1) Bridge + bundled hook scripts, so the install is self-contained.
    mkdirSync(PLUGIN_DIR, { recursive: true });
    const bridgeCmd = join(PLUGIN_DIR, BRIDGE_SCRIPT);
    writeFileSync(bridgeCmd, BRIDGE_SOURCE);
    chmodSync(bridgeCmd, 0o755);
    for (const hook of BUNDLED_HOOKS) {
      const dest = join(PLUGIN_DIR, hook);
      writeFileSync(dest, bundledHookSource(hook));
      chmodSync(dest, 0o755);
    }

    // 2) MCP registration. A malformed existing mcp.json must abort the
    // MCP step (the TOML hooks still install) rather than overwrite it.
    let mcpMutated = false;
    try {
      const mcp = readJcodeMcpJson();
      const servers = (mcp.mcpServers as Record<string, unknown>) ?? {};
      const existingJson = servers.agentmemory
        ? JSON.stringify(servers.agentmemory)
        : null;
      if (existingJson !== desiredServerJson) {
        // Overwrite a stale/differing agentmemory entry; other servers in
        // the file are untouched.
        servers.agentmemory = { ...DESIRED_MCP_ENTRY };
        mcp.mcpServers = servers;
        writeJcodeMcpJson(mcp);
        mcpMutated = true;
      }
    } catch (e) {
      console.error(
        `[agentmemory] ~/.jcode/mcp.json is unreadable, skipping the MCP entry: ` +
          `${(e as Error).message}. TOML hooks are still installed.`,
      );
    }

    // 3) TOML hooks — each key installs with its event argument.
    let tomlMutated = false;
    for (const key of HOOK_KEYS) {
      const cmd = `${bridgeCmd} ${key}`;
      if (upsertTomlArrayValue(configPath, "hooks", key, cmd) === "written") {
        tomlMutated = true;
      }
    }

    if (!mcpMutated && !tomlMutated) {
      return { kind: "already-wired", mutatedPath: configPath };
    }
    return { kind: "installed", mutatedPath: configPath };
  },
};

// Uninstall is handled by jcode-toml.removeTomlArrayValue for each key plus
// mcp.json/mcpServers.agentmemory removal — kept out of the adapter so
// `connect` stays single-purpose (upstream convention: adapters install).
export function uninstallJcode(): void {
  for (const key of HOOK_KEYS) {
    const cmd = `${join(PLUGIN_DIR, BRIDGE_SCRIPT)} ${key}`;
    removeTomlArrayValue(jcodeConfigPath(), "hooks", key, cmd);
  }
  const mcp = readJcodeMcpJson();
  const servers = (mcp.mcpServers as Record<string, unknown>) ?? {};
  if (servers.agentmemory !== undefined) {
    delete servers.agentmemory;
    writeJcodeMcpJson(mcp);
  }
}
