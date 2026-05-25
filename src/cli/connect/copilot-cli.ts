import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
import { findPluginRoot } from "./codex-hooks.js";

type CopilotHookCommand = {
  type: "command";
  matcher?: string;
  bash: string;
  powershell: string;
  env?: Record<string, string>;
  timeoutSec?: number;
};

type CopilotHooksConfig = {
  version: 1;
  hooks: Record<string, CopilotHookCommand[]>;
  disableAllHooks?: boolean;
};

type CopilotMcpConfig = {
  mcpServers?: Record<string, typeof AGENTMEMORY_MCP_BLOCK>;
  [key: string]: unknown;
};

function copilotHome(): string {
  return process.env["COPILOT_HOME"] || join(homedir(), ".copilot");
}

function hooksPath(): string {
  return join(copilotHome(), "hooks", "agentmemory.json");
}

function mcpConfigPath(): string {
  return join(copilotHome(), "mcp-config.json");
}

function entryMatches(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (e["command"] !== "npx") return false;
  const args = Array.isArray(e["args"]) ? (e["args"] as string[]) : [];
  return args.includes("@agentmemory/mcp");
}

function loadTemplateHooks(pluginRoot: string): CopilotHooksConfig {
  const templatePath = join(pluginRoot, "hooks", "hooks.copilot.json");
  return JSON.parse(readFileSync(templatePath, "utf-8")) as CopilotHooksConfig;
}

function normalizeAbsoluteCommands(
  hooks: CopilotHooksConfig,
  pluginRoot: string,
): CopilotHooksConfig {
  const scriptsDir = join(pluginRoot, "scripts").replace(/\\/g, "/");
  const next: CopilotHooksConfig = {
    version: hooks.version,
    hooks: {},
    ...(hooks.disableAllHooks !== undefined
      ? { disableAllHooks: hooks.disableAllHooks }
      : {}),
  };
  for (const [event, commands] of Object.entries(hooks.hooks)) {
    next.hooks[event] = commands.map((command) => {
      const match = command.bash.match(/^agentmemory-hook\s+([a-z0-9-]+)$/);
      if (!match) return command;
      const name = match[1]!;
      const absolute = `node "${scriptsDir}/${name}.mjs"`;
      return { ...command, bash: absolute, powershell: absolute };
    });
  }
  return next;
}

function preserveDisableAllHooks(
  existing: CopilotHooksConfig | null,
  next: CopilotHooksConfig,
): CopilotHooksConfig {
  if (existing && typeof existing.disableAllHooks === "boolean") {
    return { ...next, disableAllHooks: existing.disableAllHooks };
  }
  return next;
}

export const adapter: ConnectAdapter = {
  name: "copilot-cli",
  displayName: "GitHub Copilot CLI",
  docs: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks",
  protocolNote:
    "→ Using hooks + MCP. Hook events capture observations and MCP exposes interactive memory tools.",

  detect(): boolean {
    return true;
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const targetHooksPath = hooksPath();
    const targetMcpPath = mcpConfigPath();

    if (opts.remove) {
      return removeCopilotWiring(targetHooksPath, targetMcpPath, opts);
    }

    const pluginRoot = findPluginRoot();
    const template = loadTemplateHooks(pluginRoot);
    const maybeAbsolute = opts.withShimAbsolute
      ? normalizeAbsoluteCommands(template, pluginRoot)
      : template;

    const existingHooks = readJsonSafe<CopilotHooksConfig>(targetHooksPath);
    const desiredHooks = preserveDisableAllHooks(existingHooks, maybeAbsolute);
    const existingMcp = readJsonSafe<CopilotMcpConfig>(targetMcpPath);
    const alreadyHasMcp = entryMatches(existingMcp?.mcpServers?.["agentmemory"]);
    const alreadyHasHooks =
      JSON.stringify(existingHooks) === JSON.stringify(desiredHooks);

    if (alreadyHasMcp && alreadyHasHooks && !opts.force) {
      logAlreadyWired("GitHub Copilot CLI", targetHooksPath);
      return { kind: "already-wired", mutatedPath: targetHooksPath };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would ${alreadyHasHooks ? "refresh" : "write"} ${targetHooksPath}`,
      );
      p.log.info(
        `[dry-run] Would ${alreadyHasMcp ? "refresh" : "merge"} mcpServers.agentmemory in ${targetMcpPath}`,
      );
      return { kind: "installed", mutatedPath: targetHooksPath };
    }

    mkdirSync(join(copilotHome(), "hooks"), { recursive: true });

    if (existsSync(targetHooksPath)) {
      const backup = backupFile(targetHooksPath, "copilot-hooks", "json");
      logBackup(backup);
    }
    if (existsSync(targetMcpPath)) {
      const backup = backupFile(targetMcpPath, "copilot-mcp", "json");
      logBackup(backup);
    }

    writeJsonAtomic(targetHooksPath, desiredHooks);
    const nextMcp: CopilotMcpConfig = existingMcp ? { ...existingMcp } : {};
    const servers = {
      ...((nextMcp.mcpServers as Record<string, typeof AGENTMEMORY_MCP_BLOCK>) ??
        {}),
    };
    servers["agentmemory"] = AGENTMEMORY_MCP_BLOCK;
    nextMcp.mcpServers = servers;
    writeJsonAtomic(targetMcpPath, nextMcp);

    const verifyHooks = readJsonSafe<CopilotHooksConfig>(targetHooksPath);
    const verifyMcp = readJsonSafe<CopilotMcpConfig>(targetMcpPath);
    if (!verifyHooks || !entryMatches(verifyMcp?.mcpServers?.["agentmemory"])) {
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled("GitHub Copilot CLI hooks", targetHooksPath);
    logInstalled("GitHub Copilot CLI MCP", targetMcpPath);
    p.log.success(
      "✅ Wired agentmemory into Copilot CLI. Restart `copilot` for hooks to take effect.",
    );
    return { kind: "installed", mutatedPath: targetHooksPath };
  },
};

function removeCopilotWiring(
  targetHooksPath: string,
  targetMcpPath: string,
  opts: ConnectOptions,
): ConnectResult {
  const hadHooks = existsSync(targetHooksPath);
  const existingMcp = readJsonSafe<CopilotMcpConfig>(targetMcpPath);
  const hadMcp = entryMatches(existingMcp?.mcpServers?.["agentmemory"]);

  if (!hadHooks && !hadMcp) {
    p.log.info("GitHub Copilot CLI: no existing agentmemory wiring found.");
    return { kind: "removed", mutatedPath: targetHooksPath };
  }

  if (opts.dryRun) {
    if (hadHooks) p.log.info(`[dry-run] Would remove ${targetHooksPath}`);
    if (hadMcp) {
      p.log.info(
        `[dry-run] Would remove mcpServers.agentmemory from ${targetMcpPath}`,
      );
    }
    return { kind: "removed", mutatedPath: targetHooksPath };
  }

  if (hadHooks) {
    const backup = backupFile(targetHooksPath, "copilot-hooks", "json");
    logBackup(backup);
    rmSync(targetHooksPath, { force: true });
  }

  if (hadMcp && existingMcp) {
    const backup = backupFile(targetMcpPath, "copilot-mcp", "json");
    logBackup(backup);
    const next = { ...existingMcp };
    const servers = {
      ...((next.mcpServers as Record<string, typeof AGENTMEMORY_MCP_BLOCK>) ??
        {}),
    };
    delete servers["agentmemory"];
    next.mcpServers = servers;
    writeJsonAtomic(targetMcpPath, next);
  }

  p.log.success("Removed agentmemory wiring from GitHub Copilot CLI.");
  return { kind: "removed", mutatedPath: targetHooksPath };
}
