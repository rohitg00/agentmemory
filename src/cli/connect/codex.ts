import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
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

export const adapter: ConnectAdapter = {
  name: "codex",
  displayName: "Codex CLI",
  docs: "https://github.com/rohitg00/agentmemory#codex-cli-codex-plugin-platform",
  protocolNote:
    "→ Using MCP. Hooks are also available — see docs/codex.md.",

  detect(): boolean {
    return existsSync(CODEX_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const exists = existsSync(CODEX_TOML);
    const current = exists ? readFileSync(CODEX_TOML, "utf-8") : "";
    const wired = isWiredText(current);

    if (wired && !opts.force) {
      logAlreadyWired("Codex CLI", CODEX_TOML);
      return { kind: "already-wired", mutatedPath: CODEX_TOML };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would ${wired ? "rewrite" : "append"} [mcp_servers.agentmemory] in ${CODEX_TOML}`,
      );
      return { kind: "installed", mutatedPath: CODEX_TOML };
    }

    let backupPath: string | undefined;
    if (exists) {
      backupPath = backupFile(CODEX_TOML, "codex", "toml");
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(CODEX_TOML), { recursive: true });
    }

    const cleaned = wired ? stripExistingBlock(current) : current;
    const joiner = cleaned.length === 0 || cleaned.endsWith("\n") ? "" : "\n";
    const next = `${cleaned}${joiner}${cleaned.length > 0 ? "\n" : ""}${TOML_BLOCK}`;
    writeFileSync(CODEX_TOML, next, "utf-8");

    const verify = readFileSync(CODEX_TOML, "utf-8");
    if (!isWiredText(verify)) {
      p.log.error(
        `Verification failed: ${CODEX_TOML} did not contain ${SECTION_HEADER} after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("Codex CLI", CODEX_TOML);
    p.log.info(
      "Codex picks up MCP servers on next launch. For the deeper plugin install, run: codex plugin marketplace add rohitg00/agentmemory && codex plugin install agentmemory",
    );
    return {
      kind: "installed",
      mutatedPath: CODEX_TOML,
      ...(backupPath !== undefined && { backupPath }),
    };
  },
};
