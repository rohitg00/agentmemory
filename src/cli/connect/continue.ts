import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

// Continue.dev v1+ prefers ~/.continue/config.yaml; config.json is
// deprecated and ignored when yaml is present. Three branches:
//   - config.yaml exists → emit stub with manual edit instructions
//     (no YAML dep in tree; preserving comments/anchors safely needs it)
//   - config.json exists → modify it (legacy path still loaded when no yaml)
//   - neither → create config.yaml from scratch (no merge risk)
// Source: docs.continue.dev/reference/yaml-migration
const CONTINUE_DIR = join(homedir(), ".continue");
const YAML_PATH = join(CONTINUE_DIR, "config.yaml");
const JSON_PATH = join(CONTINUE_DIR, "config.json");

type ContinueEntry = {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type ContinueJsonConfig = {
  mcpServers?: ContinueEntry[];
  [key: string]: unknown;
};

function buildEntry(): ContinueEntry {
  return {
    name: "agentmemory",
    command: AGENTMEMORY_MCP_BLOCK.command,
    args: [...AGENTMEMORY_MCP_BLOCK.args],
    env: { ...AGENTMEMORY_MCP_BLOCK.env },
  };
}

function entryIsAgentmemory(entry: ContinueEntry | undefined): boolean {
  if (!entry) return false;
  return entry.name === "agentmemory" && entry.args.includes("@agentmemory/mcp");
}

// Minimal YAML emitter for the agentmemory entry. Quotes string values
// that contain ${ ... } expansion to keep parsers happy. Only used when
// creating a fresh config.yaml — never when modifying an existing one.
function renderFreshYaml(): string {
  const e = buildEntry();
  const envLines = Object.entries(e.env ?? {})
    .map(([k, v]) => `      ${k}: "${v}"`)
    .join("\n");
  return [
    "mcpServers:",
    `  - name: ${e.name}`,
    `    command: ${e.command}`,
    "    args:",
    ...e.args.map((a) => `      - "${a}"`),
    "    env:",
    envLines,
    "",
  ].join("\n");
}

export const adapter: ConnectAdapter = {
  name: "continue",
  displayName: "Continue",
  category: "mcp",
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via ~/.continue/config.yaml (preferred) or config.json (legacy, only when no yaml).",

  detect(): boolean {
    return existsSync(CONTINUE_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const yamlExists = existsSync(YAML_PATH);
    const jsonExists = existsSync(JSON_PATH);

    // Branch 1: yaml present — refuse to silently mutate user's yaml
    // config (preserving comments/anchors needs a proper parser).
    if (yamlExists) {
      const indented = renderFreshYaml()
        .split("\n")
        .map((l) => (l ? `  ${l}` : l))
        .join("\n");
      const manual = `\nMerge this block into ~/.continue/config.yaml (the snippet already includes the top-level mcpServers key — if your config already has a mcpServers list, append the agentmemory entry to it instead of duplicating the key):\n\n${indented}`;
      p.log.info(
        `Continue: ${YAML_PATH} already exists. Manual edit needed.${manual}`,
      );
      return { kind: "stub", reason: "config.yaml-needs-manual-edit" };
    }

    // Branch 2: legacy json present — modify in place.
    if (jsonExists) {
      const existing = readJsonSafe<ContinueJsonConfig>(JSON_PATH);
      const next: ContinueJsonConfig = existing ? { ...existing } : {};
      const servers = Array.isArray(next.mcpServers)
        ? [...next.mcpServers]
        : [];

      const idx = servers.findIndex((s) => s?.name === "agentmemory");
      const alreadyHas = idx >= 0 && entryIsAgentmemory(servers[idx]);
      if (alreadyHas && !opts.force) {
        logAlreadyWired("Continue", JSON_PATH);
        return { kind: "already-wired", mutatedPath: JSON_PATH };
      }

      if (opts.dryRun) {
        p.log.info(
          `[dry-run] Would ${alreadyHas ? "overwrite" : "add"} mcpServers[agentmemory] in ${JSON_PATH}`,
        );
        return { kind: "installed", mutatedPath: JSON_PATH };
      }

      const backupPath = backupFile(JSON_PATH, "continue");
      logBackup(backupPath);

      const entry = buildEntry();
      if (idx >= 0) servers[idx] = entry;
      else servers.push(entry);
      next.mcpServers = servers;
      writeJsonAtomic(JSON_PATH, next);

      const verify = readJsonSafe<ContinueJsonConfig>(JSON_PATH);
      const verifyEntry = verify?.mcpServers?.find(
        (s) => s?.name === "agentmemory",
      );
      if (!entryIsAgentmemory(verifyEntry)) {
        p.log.error(
          `Verification failed: ${JSON_PATH} did not contain mcpServers[agentmemory] after write.`,
        );
        return { kind: "skipped", reason: "verification-failed" };
      }

      logInstalled("Continue (legacy config.json)", JSON_PATH);
      return {
        kind: "installed",
        mutatedPath: JSON_PATH,
        backupPath,
      };
    }

    // Branch 3: neither exists — create config.yaml from scratch (modern path).
    if (opts.dryRun) {
      p.log.info(`[dry-run] Would create ${YAML_PATH} with agentmemory entry`);
      return { kind: "installed", mutatedPath: YAML_PATH };
    }

    mkdirSync(dirname(YAML_PATH), { recursive: true });
    writeFileSync(YAML_PATH, renderFreshYaml(), "utf-8");
    logInstalled("Continue", YAML_PATH);
    return { kind: "installed", mutatedPath: YAML_PATH };
  },
};
