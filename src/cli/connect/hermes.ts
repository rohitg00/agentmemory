import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  writeTextAtomic,
} from "./util.js";

const HERMES_DIR = join(homedir(), ".hermes");
const HERMES_CONFIG = join(HERMES_DIR, "config.yaml");
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/hermes";
const AGENTMEMORY_MCP_YAML = [
  "  agentmemory:",
  "    command: npx",
  '    args: ["-y", "@agentmemory/mcp"]',
];
const MEMORY_PROVIDER_YAML = "  provider: agentmemory";

function normalizeYaml(text: string): string {
  if (text.length === 0) return "";
  return text.endsWith("\n") ? text : `${text}\n`;
}

function nextTopLevelIndex(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[A-Za-z0-9_-]+:\s*(?:#.*)?$/.test(lines[i] ?? "")) return i;
  }
  return lines.length;
}

function findTopLevelSection(lines: string[], name: string): [number, number] | null {
  const start = lines.findIndex((line) => line === `${name}:`);
  if (start === -1) return null;
  return [start, nextTopLevelIndex(lines, start)];
}

function removeChildBlock(lines: string[], start: number, end: number, child: string): void {
  const childStart = lines.findIndex(
    (line, index) => index > start && index < end && line === `  ${child}:`,
  );
  if (childStart === -1) return;
  let childEnd = end;
  for (let i = childStart + 1; i < end; i++) {
    if (/^  [A-Za-z0-9_-]+:\s*(?:#.*)?$/.test(lines[i] ?? "")) {
      childEnd = i;
      break;
    }
  }
  lines.splice(childStart, childEnd - childStart);
}

function upsertMcpServers(text: string): string {
  const lines = normalizeYaml(text).split("\n");
  if (lines.at(-1) === "") lines.pop();
  const section = findTopLevelSection(lines, "mcp_servers");
  if (!section) {
    if (lines.length > 0) lines.push("");
    lines.push("mcp_servers:", ...AGENTMEMORY_MCP_YAML);
    return `${lines.join("\n")}\n`;
  }

  const [start, end] = section;
  removeChildBlock(lines, start, end, "agentmemory");
  lines.splice(start + 1, 0, ...AGENTMEMORY_MCP_YAML);
  return `${lines.join("\n")}\n`;
}

function upsertMemoryProvider(text: string): string {
  const lines = normalizeYaml(text).split("\n");
  if (lines.at(-1) === "") lines.pop();
  const section = findTopLevelSection(lines, "memory");
  if (!section) {
    if (lines.length > 0) lines.push("");
    lines.push("memory:", MEMORY_PROVIDER_YAML);
    return `${lines.join("\n")}\n`;
  }

  const [start, end] = section;
  const providerIndex = lines.findIndex(
    (line, index) => index > start && index < end && /^  provider:\s*/.test(line),
  );
  if (providerIndex === -1) lines.splice(start + 1, 0, MEMORY_PROVIDER_YAML);
  else lines[providerIndex] = MEMORY_PROVIDER_YAML;
  return `${lines.join("\n")}\n`;
}

function renderHermesConfig(existing: string): string {
  return upsertMemoryProvider(upsertMcpServers(existing));
}

function isHermesWired(text: string): boolean {
  return (
    /^mcp_servers:\n(?:[\s\S]*?\n)?  agentmemory:\n(?:[\s\S]*?\n)?    command: npx\n(?:[\s\S]*?\n)?    args: \["-y", "@agentmemory\/mcp"\]/m.test(
      text,
    ) && /^memory:\n(?:[\s\S]*?\n)?  provider: agentmemory/m.test(text)
  );
}

export const adapter: ConnectAdapter = {
  name: "hermes",
  displayName: "Hermes Agent",
  docs: DOCS,
  protocolNote:
    "→ Using MCP. Hooks are also available — see docs/hermes.md.",

  detect(): boolean {
    return existsSync(HERMES_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const before = existsSync(HERMES_CONFIG)
      ? readFileSync(HERMES_CONFIG, "utf-8")
      : "";

    if (!opts.force && before && isHermesWired(before)) {
      logAlreadyWired("Hermes", HERMES_CONFIG);
      return { kind: "already-wired", mutatedPath: HERMES_CONFIG };
    }

    const next = renderHermesConfig(before);
    if (opts.dryRun) {
      p.log.info(`[dry-run] Would merge agentmemory MCP + memory provider into ${HERMES_CONFIG}`);
      return { kind: "installed", mutatedPath: HERMES_CONFIG };
    }

    const backupPath = existsSync(HERMES_CONFIG)
      ? backupFile(HERMES_CONFIG, "hermes", "yaml")
      : undefined;
    if (backupPath) logBackup(backupPath);
    writeTextAtomic(HERMES_CONFIG, next);
    logInstalled("Hermes", HERMES_CONFIG);
    p.log.info("Restart Hermes to pick up the new MCP server and memory provider.");
    return { kind: "installed", mutatedPath: HERMES_CONFIG, backupPath };
  },
};
