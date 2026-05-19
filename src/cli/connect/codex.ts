import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
} from "./util.js";

const CODEX_DIR = join(homedir(), ".codex");
const CODEX_TOML = join(CODEX_DIR, "config.toml");
const CODEX_HOOKS_JSON = join(CODEX_DIR, "hooks.json");
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PreCompact",
  "Stop",
] as const;
const AGENTMEMORY_HOOK_SCRIPTS = [
  "session-start.mjs",
  "prompt-submit.mjs",
  "pre-tool-use.mjs",
  "post-tool-use.mjs",
  "pre-compact.mjs",
  "stop.mjs",
] as const;

const TOML_BLOCK = `[mcp_servers.agentmemory]
command = "npx"
args = ["-y", "@agentmemory/mcp"]

[mcp_servers.agentmemory.env]
AGENTMEMORY_URL = "http://localhost:3111"
`;

const SECTION_HEADER = "[mcp_servers.agentmemory]";

function isWiredText(toml: string): boolean {
  return toml.includes(SECTION_HEADER);
}

function stripExistingBlock(toml: string): string {
  const lines = toml.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed === SECTION_HEADER ||
      trimmed === "[mcp_servers.agentmemory.env]"
    ) {
      skipping = true;
      continue;
    }
    if (
      skipping &&
      trimmed.startsWith("[") &&
      trimmed !== "[mcp_servers.agentmemory.env]"
    ) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}$/, "\n\n").trimEnd() + "\n";
}

type HookHandler = {
  type: string;
  command: string;
  statusMessage?: string;
};
type HookEntry = {
  matcher?: string;
  hooks: HookHandler[];
};
type HooksJson = {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
};

function shellQuote(value: string): string {
  if (platform() === "win32") {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isCodexAgentmemoryPluginRoot(dir: string): boolean {
  if (
    !existsSync(join(dir, ".codex-plugin", "plugin.json")) ||
    !existsSync(join(dir, "hooks", "hooks.codex.json")) ||
    !existsSync(join(dir, "scripts", "post-tool-use.mjs"))
  ) {
    return false;
  }
  try {
    const manifest = JSON.parse(
      readFileSync(join(dir, ".codex-plugin", "plugin.json"), "utf-8"),
    ) as { name?: string };
    return manifest.name === "agentmemory";
  } catch {
    return false;
  }
}

function findInstalledCodexPluginRoots(): string[] {
  const cacheRoot = join(CODEX_DIR, "plugins", "cache");
  if (!existsSync(cacheRoot)) return [];

  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return;
    if (isCodexAgentmemoryPluginRoot(dir)) {
      found.push(dir);
      return;
    }

    let entries: Array<{ isDirectory(): boolean; name: string }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
    }
  };

  walk(cacheRoot, 0);
  return found;
}

function pluginRootCandidates(): string[] {
  return [
    ...findInstalledCodexPluginRoots(),
    join(MODULE_DIR, "..", "plugin"),
    join(MODULE_DIR, "..", "..", "..", "plugin"),
    join(process.cwd(), "plugin"),
  ];
}

function resolvePluginRoot(): string {
  for (const candidate of pluginRootCandidates()) {
    if (
      existsSync(join(candidate, "hooks", "hooks.codex.json")) &&
      existsSync(join(candidate, "scripts", "post-tool-use.mjs"))
    ) {
      return candidate;
    }
  }
  throw new Error(
    "Could not locate bundled Codex hook scripts. Re-run from the published @agentmemory/agentmemory package.",
  );
}

function buildConfigLayerHooks(pluginRoot: string): Record<string, HookEntry[]> {
  return {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: `node ${shellQuote(join(pluginRoot, "scripts", "session-start.mjs"))}`,
            statusMessage: "agentmemory: loading session context",
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: `node ${shellQuote(join(pluginRoot, "scripts", "prompt-submit.mjs"))}`,
            statusMessage: "agentmemory: recalling relevant memories",
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: "Edit|Write|Read|Glob|Grep",
        hooks: [
          {
            type: "command",
            command: `node ${shellQuote(join(pluginRoot, "scripts", "pre-tool-use.mjs"))}`,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        hooks: [
          {
            type: "command",
            command: `node ${shellQuote(join(pluginRoot, "scripts", "post-tool-use.mjs"))}`,
          },
        ],
      },
    ],
    PreCompact: [
      {
        hooks: [
          {
            type: "command",
            command: `node ${shellQuote(join(pluginRoot, "scripts", "pre-compact.mjs"))}`,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: `node ${shellQuote(join(pluginRoot, "scripts", "stop.mjs"))}`,
          },
        ],
      },
    ],
  };
}

function parseHooksJson(text: string, path: string): HooksJson {
  try {
    const parsed = JSON.parse(text) as HooksJson;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    throw new Error(
      `${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function isAgentmemoryHookEntry(entry: HookEntry): boolean {
  return (entry.hooks ?? []).some((handler) => {
    const command = handler.command ?? "";
    return (
      command.toLowerCase().includes("agentmemory") &&
      AGENTMEMORY_HOOK_SCRIPTS.some((script) => command.includes(script))
    );
  });
}

function mergeHooksJson(existing: HooksJson, pluginRoot: string): HooksJson {
  const nextHooks: Record<string, HookEntry[]> = {};
  const existingHooks =
    existing.hooks && typeof existing.hooks === "object" ? existing.hooks : {};
  for (const [event, entries] of Object.entries(existingHooks)) {
    nextHooks[event] = Array.isArray(entries)
      ? entries.filter((entry) => !isAgentmemoryHookEntry(entry))
      : [];
  }

  const agentmemoryHooks = buildConfigLayerHooks(pluginRoot);
  for (const event of CODEX_HOOK_EVENTS) {
    nextHooks[event] = [
      ...(nextHooks[event] ?? []),
      ...(agentmemoryHooks[event] ?? []),
    ];
  }

  return { ...existing, hooks: nextHooks };
}

function hooksJsonIsWired(text: string): boolean {
  const hooksJson = parseHooksJson(text, CODEX_HOOKS_JSON);
  const hooks = hooksJson.hooks ?? {};
  return CODEX_HOOK_EVENTS.every((event) =>
    (hooks[event] ?? []).some(isAgentmemoryHookEntry),
  );
}

export const adapter: ConnectAdapter = {
  name: "codex",
  displayName: "Codex CLI",
  docs: "https://github.com/rohitg00/agentmemory#codex-cli-codex-plugin-platform",
  protocolNote:
    "→ Using MCP plus config-layer Codex hooks for automatic capture.",

  detect(): boolean {
    return existsSync(CODEX_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const exists = existsSync(CODEX_TOML);
    const current = exists ? readFileSync(CODEX_TOML, "utf-8") : "";
    const wired = isWiredText(current);
    const pluginRoot = resolvePluginRoot();
    const hooksExists = existsSync(CODEX_HOOKS_JSON);
    const currentHooks = hooksExists ? readFileSync(CODEX_HOOKS_JSON, "utf-8") : "";
    const hooksWired = hooksExists ? hooksJsonIsWired(currentHooks) : false;

    if (wired && hooksWired && !opts.force) {
      logAlreadyWired("Codex CLI", `${CODEX_TOML} + ${CODEX_HOOKS_JSON}`);
      return {
        kind: "already-wired",
        mutatedPath: `${CODEX_TOML}, ${CODEX_HOOKS_JSON}`,
      };
    }

    if (opts.dryRun) {
      if (!wired || opts.force) {
        p.log.info(
          `[dry-run] Would ${wired ? "rewrite" : "append"} [mcp_servers.agentmemory] in ${CODEX_TOML}`,
        );
      }
      if (!hooksWired || opts.force) {
        p.log.info(
          `[dry-run] Would ${hooksWired ? "rewrite" : "append"} agentmemory lifecycle hooks in ${CODEX_HOOKS_JSON}`,
        );
      }
      return {
        kind: "installed",
        mutatedPath: `${CODEX_TOML}, ${CODEX_HOOKS_JSON}`,
      };
    }

    let backupPath: string | undefined;
    if (exists && (!wired || opts.force)) {
      backupPath = backupFile(CODEX_TOML, "codex", "toml");
      logBackup(backupPath);
    }
    if (hooksExists && (!hooksWired || opts.force)) {
      const hooksBackup = backupFile(CODEX_HOOKS_JSON, "codex-hooks", "json");
      logBackup(hooksBackup);
      backupPath ??= hooksBackup;
    }
    if (!exists || !hooksExists) {
      mkdirSync(dirname(CODEX_TOML), { recursive: true });
    }

    if (!wired || opts.force) {
      const cleaned = wired ? stripExistingBlock(current) : current;
      const joiner = cleaned.length === 0 || cleaned.endsWith("\n") ? "" : "\n";
      const next = `${cleaned}${joiner}${cleaned.length > 0 ? "\n" : ""}${TOML_BLOCK}`;
      writeFileSync(CODEX_TOML, next, "utf-8");
    }

    if (!hooksWired || opts.force) {
      const existingHooks = hooksExists ? parseHooksJson(currentHooks, CODEX_HOOKS_JSON) : {};
      const nextHooks = mergeHooksJson(existingHooks, pluginRoot);
      writeFileSync(CODEX_HOOKS_JSON, `${JSON.stringify(nextHooks, null, 2)}\n`, "utf-8");
    }

    const verify = readFileSync(CODEX_TOML, "utf-8");
    if (!isWiredText(verify)) {
      p.log.error(
        `Verification failed: ${CODEX_TOML} did not contain ${SECTION_HEADER} after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }
    const verifyHooks = readFileSync(CODEX_HOOKS_JSON, "utf-8");
    if (!hooksJsonIsWired(verifyHooks)) {
      p.log.error(
        `Verification failed: ${CODEX_HOOKS_JSON} did not contain agentmemory Codex hooks after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("Codex CLI", CODEX_TOML);
    logInstalled("Codex hooks", CODEX_HOOKS_JSON);
    p.log.info(
      "Codex picks up MCP servers and config-layer hooks on next launch. Plugin-packaged hooks are still shipped, but current Codex builds may not dispatch them; this fallback keeps automatic capture working.",
    );
    return {
      kind: "installed",
      mutatedPath: `${CODEX_TOML}, ${CODEX_HOOKS_JSON}`,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};
