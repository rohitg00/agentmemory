import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import { isMap, isSeq, parseDocument, type YAMLMap } from "yaml";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import {
  backupFile,
  resolveDshHome,
  logAlreadyWired,
  logBackup,
  logInstalled,
  writeTextAtomic,
} from "./util.js";
import { findPluginRoot } from "./codex-hooks.js";

// Harness evaluates !!js before scrubbing secrets from the MCP child env.
const MCP_BLOCK = `- insert:
    - id: agentmemory
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: agentmemory
        command: npx
        args: ['-y', '@agentmemory/mcp']
        env:
          AGENTMEMORY_URL: !!js process.env.AGENTMEMORY_URL || 'http://localhost:3111'
          AGENTMEMORY_SECRET: !!js process.env.AGENTMEMORY_SECRET || ''
`;

const MCP_MARKER = "serverName: agentmemory";
const HOOKS_MARKER = "id: agentmemory-hooks";

function hooksBlock(pluginPath: string): string {
  return `- insert:
    - id: agentmemory-hooks
      name: ${JSON.stringify(pluginPath)}
`;
}

function parsePatch(content: string) {
  const doc = parseDocument(content);
  if (doc.contents === null) doc.contents = doc.createNode([]);
  if (doc.errors.length || !isSeq(doc.contents)) {
    throw new Error("Cannot update dsh cordis.patch.yml: expected a valid YAML sequence.");
  }
  return { doc, operations: doc.contents };
}

function isManaged(entry: unknown, marker: string): entry is YAMLMap {
  if (!isMap(entry)) return false;
  return marker === MCP_MARKER
    ? entry.get("name") === "@deepseek-ai/dsh-mcp-client" && entry.getIn(["config", "serverName"]) === "agentmemory"
    : entry.get("id") === "agentmemory-hooks" && typeof entry.get("name") === "string" &&
      (entry.get("name") === "@deepseek-ai/dsh-hooks-claude-code" || /[\\/]dist[\\/]integrations[\\/]dsh\.mjs$/.test(String(entry.get("name"))));
}

function managedEntries(content: string, marker: string): YAMLMap[] {
  return parsePatch(content).operations.items.flatMap((operation) => {
    const entries = isMap(operation) ? operation.get("insert", true) : null;
    return isSeq(entries) ? entries.items.filter((entry) => isManaged(entry, marker)) : [];
  });
}

function hasBlock(content: string, marker: string): boolean {
  return managedEntries(content, marker).length > 0;
}

function upsertBlock(content: string, marker: string, block: string): string {
  const { doc, operations } = parsePatch(content);
  const addition = parsePatch(block).operations;
  const replacement = addition.getIn([0, "insert", 0], true);
  let replaced = false;
  for (let i = 0; i < operations.items.length; i++) {
    const operation = operations.items[i];
    if (!isMap(operation)) continue;
    const entries = operation.get("insert", true);
    if (!isSeq(entries)) continue;
    let removed = false;
    for (let j = 0; j < entries.items.length; j++) {
      if (!isManaged(entries.items[j], marker)) continue;
      if (!replaced) {
        entries.set(j, replacement);
        replaced = true;
      } else {
        entries.delete(j--);
        removed = true;
      }
    }
    if (removed && entries.items.length === 0) operations.delete(i--);
  }
  if (!replaced) operations.items.push(...addition.items);
  operations.flow = false;
  return doc.toString();
}

export const adapter: ConnectAdapter = {
  name: "dsh",
  displayName: "DeepSeek Harness",
  docs: "https://github.com/rohitg00/agentmemory/blob/main/docs/dsh.md",
  protocolNote:
    "→ Using MCP via $DSH_HOME/cordis.patch.yml (the home-level patch layer every profile loads). Tools appear as mcp__agentmemory__*. Pass --with-hooks to also wire auto-capture with the bundled native DSH plugin.",
  category: "native",
  detect(): boolean {
    return existsSync(resolveDshHome());
  },
  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const home = resolveDshHome();
    const configPath = join(home, "cordis.patch.yml");
    const existing = existsSync(configPath)
      ? readFileSync(configPath, "utf-8")
      : "";

    const wantHooks = opts.withHooks === true;
    const hasMcp = hasBlock(existing, MCP_MARKER);
    const hooks = managedEntries(existing, HOOKS_MARKER);
    const pluginPath = wantHooks ? join(dirname(findPluginRoot()), "dist", "integrations", "dsh.mjs") : "";
    const hooksReady = hooks.length === 1 && hooks[0].get("name") === pluginPath && existsSync(pluginPath);

    if (wantHooks && !opts.force && hooks.some(entry => entry.get("name") === "@deepseek-ai/dsh-hooks-claude-code")) {
      throw new Error("Legacy DSH hooks bridge found. Run agentmemory connect dsh --with-hooks --force to replace it with the bundled native plugin. Existing manifest files will be preserved.");
    }

    if (hasMcp && (!wantHooks || hooksReady) && !opts.force) {
      logAlreadyWired(this.displayName, configPath);
      return { kind: "already-wired", mutatedPath: configPath };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would update the agentmemory mcp-client row${wantHooks ? " and the bundled capture plugin" : ""} in ${configPath}`,
      );
      return { kind: "installed", mutatedPath: configPath };
    }

    if (wantHooks && !existsSync(pluginPath)) {
      throw new Error("Bundled DSH plugin is missing. Reinstall AgentMemory, or run npm run build in a source checkout.");
    }

    let backupPath: string | undefined;
    if (existsSync(configPath)) {
      backupPath = backupFile(configPath, this.name, "yml");
      logBackup(backupPath);
    } else {
      mkdirSync(dirname(configPath), { recursive: true });
    }

    let next = hasMcp && !opts.force ? existing : upsertBlock(existing, MCP_MARKER, MCP_BLOCK);

    if (wantHooks && (!hooksReady || opts.force)) {
      next = upsertBlock(next, HOOKS_MARKER, hooksBlock(pluginPath));
    }

    writeTextAtomic(configPath, next);

    const written = readFileSync(configPath, "utf-8");
    if (!hasBlock(written, MCP_MARKER) || (wantHooks && !hasBlock(written, HOOKS_MARKER))) {
      p.log.error(
        `Verification failed: ${configPath} did not contain the agentmemory rows after write.`,
      );
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled(this.displayName, configPath);
    return { kind: "installed", mutatedPath: configPath, backupPath };
  },
};
