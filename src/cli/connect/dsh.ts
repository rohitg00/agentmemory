import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import { backupFile, logAlreadyWired, logBackup, logInstalled } from "./util.js";

// DeepSeek Harness loads plugins through layered cordis patch files; the
// home-level $DSH_HOME/cordis.patch.yml is the machine-local layer shared
// by every profile, so one appended row wires agentmemory everywhere. The
// row instantiates the bundled @deepseek-ai/dsh-mcp-client plugin, which
// registers agentmemory's MCP tools on ctx.tools as
// mcp__agentmemory__<tool>.
// Source: packages/mcp/mcp-client/README.md and
// docs/user/develop/basic/publish.md in deepseek-ai/deepseek-harness.

function dshHome(): string {
  return process.env["DSH_HOME"] || join(homedir(), ".dsh");
}

// Harness env blocks are plain strings with no shell interpolation, so the
// URL is written literally instead of the ${VAR:-default} template the
// JSON-config agents get.
const PATCH_BLOCK = `- insert:
    - id: agentmemory
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: agentmemory
        command: npx
        args: ['-y', '@agentmemory/mcp']
        env:
          AGENTMEMORY_URL: http://localhost:3111
`;

const MARKER = "serverName: agentmemory";

export const adapter: ConnectAdapter = {
  name: "dsh",
  displayName: "DeepSeek Harness",
  docs: "https://github.com/rohitg00/agentmemory#other-agents",
  protocolNote:
    "→ Using MCP via $DSH_HOME/cordis.patch.yml (the home-level patch layer every profile loads). Tools appear as mcp__agentmemory__*.",
  category: "mcp",
  detect(): boolean {
    return existsSync(dshHome());
  },
  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const configPath = join(dshHome(), "cordis.patch.yml");
    const existing = existsSync(configPath)
      ? readFileSync(configPath, "utf-8")
      : "";

    if (existing.includes(MARKER) && !opts.force) {
      logAlreadyWired(this.displayName, configPath);
      return { kind: "already-wired", mutatedPath: configPath };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would append the agentmemory mcp-client row to ${configPath}`,
      );
      return { kind: "installed", mutatedPath: configPath };
    }

    let backupPath: string | undefined;
    if (existsSync(configPath)) {
      backupPath = backupFile(configPath, this.name, "yml");
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(configPath), { recursive: true });
    }

    let next: string;
    if (existing.includes(MARKER)) {
      // --force re-install: drop the previous agentmemory insert block
      // (from "- insert:" containing the marker through the next
      // top-level "- " or EOF), then append the fresh one.
      const lines = existing.split("\n");
      const markerIdx = lines.findIndex((l) => l.includes(MARKER));
      let start = markerIdx;
      while (start > 0 && !lines[start].startsWith("- ")) start--;
      let end = markerIdx + 1;
      while (end < lines.length && !lines[end].startsWith("- ")) end++;
      const kept = lines.slice(0, start).concat(lines.slice(end));
      next = kept.join("\n").replace(/\n+$/, "\n");
      next = `${next}${next.trim() ? "\n" : ""}${PATCH_BLOCK}`;
    } else {
      const base = existing.replace(/\n+$/, "\n");
      next = base.trim() ? `${base}\n${PATCH_BLOCK}` : PATCH_BLOCK;
    }

    const tmpPath = `${configPath}.tmp`;
    writeFileSync(tmpPath, next, "utf-8");
    renameSync(tmpPath, configPath);

    if (!readFileSync(configPath, "utf-8").includes(MARKER)) {
      p.log.error(
        `Verification failed: ${configPath} did not contain the agentmemory row after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled(this.displayName, configPath);
    return { kind: "installed", mutatedPath: configPath, backupPath };
  },
};
