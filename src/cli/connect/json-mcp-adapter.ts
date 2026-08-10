import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import * as p from "@clack/prompts";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  AGENTMEMORY_MCP_BLOCK,
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  writeTextAtomic,
  writeJsonAtomic,
} from "./util.js";

export type JsonMcpAdapterConfig = {
  name: string;
  displayName: string;
  detectDir: string;
  configPath: string;
  docs?: string;
  protocolNote?: string;
  // Integration style for onboarding grouping. Defaults to "mcp" since a
  // JSON MCP config writer is MCP-only by construction; hosts that also
  // ship hooks (e.g. OpenClaw) pass "native".
  category?: "native" | "mcp";
  // Wrapper key under which servers live. Default "mcpServers".
  // Zed uses "context_servers"; otherwise same shape.
  wrapperKey?: string;
  // Some hosts, including Zed, store settings as JSONC with comments and
  // trailing commas. Preserve those files with textual JSONC edits.
  jsonc?: boolean;
  // Extra fields merged into the agentmemory entry. Droid requires
  // type: "stdio"; other hosts ignore unknown fields.
  extraEntryFields?: Record<string, unknown>;
  // Invoked when `--with-hooks` is passed, independent of whether the MCP
  // entry was freshly installed or already wired (mirrors the Claude Code /
  // Codex adapters, issue #508 pattern) — hosts that ship a native hook
  // config alongside MCP (e.g. Droid's `~/.factory/hooks.json`) pass this
  // to install/refresh their hook manifest.
  installHooks?: (opts: ConnectOptions) => ConnectResult;
};

type McpEntry = typeof AGENTMEMORY_MCP_BLOCK;
type McpConfig = Record<string, unknown>;
type ReadConfigResult =
  | { kind: "missing"; config: McpConfig }
  | { kind: "parsed"; config: McpConfig; raw: string }
  | { kind: "invalid"; reason: string };

const formattingOptions = {
  insertSpaces: true,
  tabSize: 2,
  eol: "\n",
  insertFinalNewline: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMcpConfig(path: string, jsonc: boolean): ReadConfigResult {
  if (!existsSync(path)) return { kind: "missing", config: {} };

  const raw = readFileSync(path, "utf-8");
  try {
    const parsed = jsonc ? parseJsonc(raw) : JSON.parse(raw);
    if (parsed === undefined && raw.trim() === "") {
      return { kind: "parsed", config: {}, raw };
    }
    if (!isRecord(parsed)) {
      return { kind: "invalid", reason: "top-level config is not an object" };
    }
    return { kind: "parsed", config: parsed, raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "invalid", reason: message };
  }
}

function parseJsonc(raw: string): unknown {
  const errors: ParseError[] = [];
  const parsed = parse(raw, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
  });
  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(
      `JSONC parse error ${first.error} at offset ${first.offset}`,
    );
  }
  return parsed;
}

function serverEntries(value: unknown): Record<string, McpEntry> {
  return isRecord(value) ? { ...(value as Record<string, McpEntry>) } : {};
}

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["command"] !== "npx") return false;
  const args = Array.isArray(e["args"]) ? (e["args"] as string[]) : [];
  return args.includes("@agentmemory/mcp");
}

export function createJsonMcpAdapter(
  config: JsonMcpAdapterConfig,
): ConnectAdapter {
  const wrapperKey = config.wrapperKey ?? "mcpServers";
  return {
    name: config.name,
    displayName: config.displayName,
    category: config.category ?? "mcp",
    ...(config.docs !== undefined && { docs: config.docs }),
    ...(config.protocolNote !== undefined && {
      protocolNote: config.protocolNote,
    }),

    detect(): boolean {
      return existsSync(config.detectDir);
    },

    async install(opts: ConnectOptions): Promise<ConnectResult> {
      const jsonc = config.jsonc ?? false;
      const existing = readMcpConfig(config.configPath, jsonc);
      if (existing.kind === "invalid") {
        p.log.error(
          `${config.displayName}: ${config.configPath} could not be parsed (${existing.reason}); leaving it unchanged.`,
        );
        return { kind: "skipped", reason: "invalid-config" };
      }

      const next: McpConfig = { ...existing.config };
      const servers = serverEntries(next[wrapperKey]);

      const alreadyHas = entryMatches(servers["agentmemory"]);
      if (alreadyHas && !opts.force) {
        logAlreadyWired(config.displayName, config.configPath);
        if (opts.withHooks && config.installHooks) {
          const hookResult = config.installHooks(opts);
          if (hookResult.kind === "skipped") {
            p.log.warn(
              `${config.displayName} hooks skipped: ${hookResult.reason}.`,
            );
          }
        }
        return { kind: "already-wired", mutatedPath: config.configPath };
      }

      if (opts.dryRun) {
        p.log.info(
          `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} ${wrapperKey}.agentmemory in ${config.configPath}`,
        );
        if (opts.withHooks && config.installHooks) {
          const hookResult = config.installHooks(opts);
          if (hookResult.kind === "skipped") {
            p.log.warn(
              `${config.displayName} hooks skipped: ${hookResult.reason}.`,
            );
          }
        }
        return { kind: "installed", mutatedPath: config.configPath };
      }

      let backupPath: string | undefined;
      if (existsSync(config.configPath)) {
        backupPath = backupFile(config.configPath, config.name);
        logBackup(backupPath);
      } else {
        mkdirSync(dirname(config.configPath), { recursive: true });
      }

      servers["agentmemory"] = {
        ...AGENTMEMORY_MCP_BLOCK,
        ...(config.extraEntryFields ?? {}),
      };
      next[wrapperKey] = servers;
      if (jsonc && existing.kind === "parsed") {
        const edits = modify(
          existing.raw,
          [wrapperKey, "agentmemory"],
          servers["agentmemory"],
          { formattingOptions },
        );
        writeTextAtomic(config.configPath, applyEdits(existing.raw, edits));
      } else {
        writeJsonAtomic(config.configPath, next);
      }

      const verify = readMcpConfig(config.configPath, jsonc);
      const verifyServers =
        verify.kind === "invalid" ? undefined : serverEntries(verify.config[wrapperKey]);
      if (!entryMatches(verifyServers?.["agentmemory"])) {
        p.log.error(
          `Verification failed: ${config.configPath} did not contain ${wrapperKey}.agentmemory after write.`,
        );
        return { kind: "skipped", reason: "verification-failed" };
      }

      logInstalled(config.displayName, config.configPath);

      if (opts.withHooks && config.installHooks) {
        const hookResult = config.installHooks(opts);
        if (hookResult.kind === "skipped") {
          p.log.warn(
            `${config.displayName} hooks skipped: ${hookResult.reason}. MCP wiring still applied.`,
          );
        }
      }

      return {
        kind: "installed",
        mutatedPath: config.configPath,
        ...(backupPath !== undefined && { backupPath }),
      };
    },
  };
}
