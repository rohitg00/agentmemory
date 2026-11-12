import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult, HookState } from "./types.js";
import { hookState } from "./capture-notice.js";
import {
  AGENTMEMORY_MCP_BLOCK,
  backupFile,
  isLegacyMcpCommand,
  logAlreadyWired,
  logBackup,
  logInstalled,
  readJsonSafe,
  writeJsonAtomic,
} from "./util.js";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "./codex-hooks.js";

const CODEX_DIR = join(homedir(), ".codex");
const CODEX_TOML = join(CODEX_DIR, "config.toml");
const CODEX_HOOKS = join(CODEX_DIR, "hooks.json");

const TOML_BLOCK = `[mcp_servers.agentmemory]
command = ${JSON.stringify(AGENTMEMORY_MCP_BLOCK.command)}
args = [${AGENTMEMORY_MCP_BLOCK.args.map((arg) => JSON.stringify(arg)).join(", ")}]

[mcp_servers.agentmemory.env]
AGENTMEMORY_URL = "http://localhost:3111"
`;

const SECTION_HEADER = "[mcp_servers.agentmemory]";

function isWiredText(toml: string): boolean {
  return toml.includes(SECTION_HEADER);
}

const COMMAND_LINE = /^([ \t]*command[ \t]*=[ \t]*)(["'])(.*?)\2(?=[ \t]*(?:#.*)?$)/m;
const ARGS_KEY = /^[ \t]*args[ \t]*=[ \t]*(?=\[)/m;

function sectionBounds(toml: string): { start: number; end: number } | null {
  const header = toml.indexOf(SECTION_HEADER);
  if (header < 0) return null;
  const start = header + SECTION_HEADER.length;
  const end = toml.slice(start).search(/^\s*\[/m);
  return { start, end: end < 0 ? toml.length : start + end };
}

function decodeBasicString(literal: string): string {
  try {
    return JSON.parse(literal) as string;
  } catch {
    return literal.slice(1, -1);
  }
}

function findArgs(section: string): { open: number; end: number; items: string[] } | null {
  const key = section.match(ARGS_KEY);
  if (!key || key.index === undefined) return null;
  const open = key.index + key[0].length;
  const items: string[] = [];
  let depth = 0;
  for (let i = open; i < section.length; i++) {
    const ch = section[i];
    if (ch === "#") {
      const newline = section.indexOf("\n", i);
      if (newline < 0) return null;
      i = newline;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < section.length && section[j] !== ch && section[j] !== "\n") {
        j += ch === '"' && section[j] === "\\" ? 2 : 1;
      }
      if (section[j] !== ch) return null;
      const literal = section.slice(i, j + 1);
      if (depth === 1) items.push(ch === '"' ? decodeBasicString(literal) : literal.slice(1, -1));
      i = j;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]" && --depth === 0) {
      return { open, end: i + 1, items };
    }
  }
  return null;
}

function agentmemorySection(toml: string): string | null {
  const bounds = sectionBounds(toml);
  return bounds ? toml.slice(bounds.start, bounds.end) : null;
}

function hasLegacyCommand(toml: string): boolean {
  const section = agentmemorySection(toml);
  if (section === null) return false;
  return isLegacyMcpCommand(section.match(COMMAND_LINE)?.[3], findArgs(section)?.items);
}

function hasCurrentCommand(toml: string): boolean {
  const section = agentmemorySection(toml);
  if (section === null) return false;
  const args = findArgs(section)?.items;
  return (
    section.match(COMMAND_LINE)?.[3] === AGENTMEMORY_MCP_BLOCK.command &&
    JSON.stringify(args) === JSON.stringify(AGENTMEMORY_MCP_BLOCK.args)
  );
}

function migrateLegacyCommand(toml: string): string | null {
  const bounds = sectionBounds(toml)!;
  const section = toml.slice(bounds.start, bounds.end);
  const args = findArgs(section);
  if (!args) return null;
  const nextArgs = `[${AGENTMEMORY_MCP_BLOCK.args.map((arg) => JSON.stringify(arg)).join(", ")}]`;
  const migrated = (section.slice(0, args.open) + nextArgs + section.slice(args.end)).replace(
    COMMAND_LINE,
    (_, prefix: string) => `${prefix}${JSON.stringify(AGENTMEMORY_MCP_BLOCK.command)}`,
  );
  const next = toml.slice(0, bounds.start) + migrated + toml.slice(bounds.end);
  return hasCurrentCommand(next) ? next : null;
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

export const adapter: ConnectAdapter = {
  name: "codex",
  displayName: "Codex CLI",
  category: "native",
  autoCapture: "plugin-or-with-hooks",
  docs: "https://github.com/rohitg00/agentmemory#codex-cli-codex-plugin-platform",
  protocolNote:
    "→ Using MCP. Hooks ship via the Codex plugin; on Codex Desktop, also pass --with-hooks to install the global hooks.json workaround.",

  detect(): boolean {
    return existsSync(CODEX_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const exists = existsSync(CODEX_TOML);
    const current = exists ? readFileSync(CODEX_TOML, "utf-8") : "";
    const wired = isWiredText(current);
    const legacy = wired && hasLegacyCommand(current);

    if (wired && !legacy && !opts.force) {
      logAlreadyWired("Codex CLI", CODEX_TOML);
      const hooks = runCodexHooks(opts, "");
      return { kind: "already-wired", mutatedPath: CODEX_TOML, ...(hooks && { hooks }) };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would ${wired ? "rewrite" : "append"} [mcp_servers.agentmemory] in ${CODEX_TOML}`,
      );
      const hooks = runCodexHooks(opts, "");
      return { kind: "installed", mutatedPath: CODEX_TOML, ...(hooks && { hooks }) };
    }

    let backupPath: string | undefined;
    if (exists) {
      backupPath = backupFile(CODEX_TOML, "codex", "toml");
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(CODEX_TOML), { recursive: true });
    }

    if (legacy && !opts.force) {
      const migrated = migrateLegacyCommand(current);
      if (migrated === null) {
        p.log.error(
          `Could not migrate the agentmemory launcher in ${CODEX_TOML}. Run again with --force to rewrite the block.`,
        );
        return { kind: "skipped", reason: "verification-failed" };
      }
      writeFileSync(CODEX_TOML, migrated, "utf-8");
    } else {
      const cleaned = wired ? stripExistingBlock(current) : current;
      const joiner = cleaned.length === 0 || cleaned.endsWith("\n") ? "" : "\n";
      writeFileSync(CODEX_TOML, `${cleaned}${joiner}${cleaned.length > 0 ? "\n" : ""}${TOML_BLOCK}`, "utf-8");
    }

    const verify = readFileSync(CODEX_TOML, "utf-8");
    if (!isWiredText(verify)) {
      p.log.error(
        `Verification failed: ${CODEX_TOML} did not contain ${SECTION_HEADER} after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("Codex CLI", CODEX_TOML);
    p.log.info(
      "Codex picks up MCP servers on next launch. For the deeper plugin install, run: codex plugin marketplace add rohitg00/agentmemory && codex plugin add agentmemory@agentmemory",
    );

    const hooks = runCodexHooks(opts, " MCP wiring still applied.");

    return {
      kind: "installed",
      mutatedPath: CODEX_TOML,
      ...(backupPath !== undefined && { backupPath }),
      ...(hooks && { hooks }),
    };
  },
};

function runCodexHooks(opts: ConnectOptions, suffix: string): HookState | undefined {
  if (!opts.withHooks) return undefined;
  const hookResult = installCodexHooks(opts);
  if (hookResult.kind === "skipped") {
    p.log.warn(`Codex hooks fallback skipped: ${hookResult.reason}.${suffix}`);
  }
  return hookState(hookResult);
}

function installCodexHooks(opts: ConnectOptions): ConnectResult {
  let pluginRoot: string;
  try {
    pluginRoot = findPluginRoot();
  } catch (err) {
    return {
      kind: "skipped",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const existing = readJsonSafe<HookManifest>(CODEX_HOOKS);
  const merged = buildMergedHooks(existing, pluginRoot);

  if (opts.dryRun) {
    p.log.info(
      `[dry-run] Would ${existing ? "merge" : "create"} ${CODEX_HOOKS} with ${Object.keys(merged.hooks).length} event(s)`,
    );
    return { kind: "installed", mutatedPath: CODEX_HOOKS };
  }

  let backupPath: string | undefined;
  if (existsSync(CODEX_HOOKS)) {
    backupPath = backupFile(CODEX_HOOKS, "codex-hooks", "json");
    logBackup(backupPath);
  }

  writeJsonAtomic(CODEX_HOOKS, merged);

  logInstalled("Codex hooks", CODEX_HOOKS);
  p.log.warn(
    "Codex runs only trusted hooks: launch `codex` (the TUI) once and choose \"Trust all and continue\" at the \"Hooks need review\" prompt. `codex exec` never shows the prompt, so hooks stay inert until then.",
  );
  p.log.info(
    "User-scope hooks reference absolute paths under the bundled plugin/ dir. Re-run `agentmemory connect codex --with-hooks` after upgrading agentmemory to refresh them, then re-approve in the TUI.",
  );

  return {
    kind: "installed",
    mutatedPath: CODEX_HOOKS,
    ...(backupPath !== undefined && { backupPath }),
  };
}
