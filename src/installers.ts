import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type InstallTarget =
  | "opencode"
  | "cursor"
  | "codex"
  | "roo"
  | "kilo"
  | "pi"
  | "openclaw"
  | "hermes";

export type InstallResult = {
  target: InstallTarget;
  filesWritten: string[];
  notes: string[];
};

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function writeText(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, "utf8");
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(path: string, value: unknown): void {
  writeText(path, JSON.stringify(value, null, 2));
}

function packageRootFromCliDist(): string {
  return resolve(dirname(new URL(import.meta.url).pathname), "..");
}

function commandScript(packageRoot: string, rel: string): string {
  return `node ${join(packageRoot, "dist", "hooks", rel).replace(/\\/g, "/")}`;
}

function mergeCursorMcp(configPath: string): void {
  const current = readJson(configPath);
  const mcpServers = (current.mcpServers as Record<string, unknown>) || {};
  mcpServers.agentmemory = {
    command: "npx",
    args: ["-y", "@agentmemory/mcp"],
    env: { AGENTMEMORY_URL: "http://localhost:3111" },
  };
  current.mcpServers = mcpServers;
  writeJson(configPath, current);
}

function mergeCursorHooks(configPath: string, packageRoot: string): void {
  const current = readJson(configPath);
  const hooks = (current.hooks as Record<string, unknown>) || {};
  const script = commandScript(packageRoot, "cursor.mjs");
  const entry = [{ command: script }];
  hooks.sessionStart = entry;
  hooks.beforeSubmitPrompt = entry;
  hooks.afterFileEdit = entry;
  hooks.afterShellExecution = entry;
  hooks.afterMCPExecution = entry;
  hooks.preCompact = entry;
  hooks.stop = entry;
  current.version = 1;
  current.hooks = hooks;
  writeJson(configPath, current);
}

function mergeOpenCodeConfig(configPath: string): void {
  const current = readJson(configPath);
  const mcp = (current.mcp as Record<string, unknown>) || {};
  mcp.agentmemory = {
    type: "local",
    command: ["npx", "-y", "@agentmemory/mcp"],
    environment: { AGENTMEMORY_URL: "http://localhost:3111" },
    enabled: true,
  };
  current.$schema = "https://opencode.ai/config.json";
  current.mcp = mcp;
  writeJson(configPath, current);
}

function generateOpenCodePlugin(packageRoot: string): string {
  const sessionStartScript = commandScript(packageRoot, "session-start.mjs");
  const promptScript = commandScript(packageRoot, "prompt-submit.mjs");
  const postToolScript = commandScript(packageRoot, "post-tool-use.mjs");
  const stopScript = commandScript(packageRoot, "session-end.mjs");
  return `export const AgentmemoryPlugin = async ({ $ }) => ({
  event: async ({ event }) => {
    if (event.type === 'session.created') {
      await $\`${sessionStartScript}\`.stdin(JSON.stringify({ session_id: 'opencode-' + Date.now().toString(36), cwd: process.cwd() })).quiet().nothrow();
    } else if (event.type === 'session.idle') {
      await $\`${stopScript}\`.stdin(JSON.stringify({ session_id: 'opencode-' + Date.now().toString(36), cwd: process.cwd() })).quiet().nothrow();
    } else if (event.type === 'file.edited') {
      await $\`${postToolScript}\`.stdin(JSON.stringify({ session_id: 'opencode-' + Date.now().toString(36), cwd: process.cwd(), tool_name: 'OpenCodeEdit', tool_input: { file_path: event.properties?.path ?? '' }, tool_output: 'file edited' })).quiet().nothrow();
    } else if (event.type === 'command.executed') {
      await $\`${postToolScript}\`.stdin(JSON.stringify({ session_id: 'opencode-' + Date.now().toString(36), cwd: process.cwd(), tool_name: 'Bash', tool_input: { command: event.properties?.command ?? '' }, tool_output: 'command executed' })).quiet().nothrow();
    }
  },
  'tool.execute.after': async (input, output) => {
    await $\`${postToolScript}\`.stdin(JSON.stringify({ session_id: 'opencode-' + Date.now().toString(36), cwd: process.cwd(), tool_name: input.tool, tool_input: input.args, tool_output: output })).quiet().nothrow();
  },
  'chat.message': async (_input, output) => {
    if (output?.message) {
      await $\`${promptScript}\`.stdin(JSON.stringify({ session_id: 'opencode-' + Date.now().toString(36), cwd: process.cwd(), prompt: output.message })).quiet().nothrow();
    }
  }
});
`;
}

function mergeCodexConfig(configPath: string): void {
  const current = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  let next = current;
  if (!next.includes("[features]")) next += (next.endsWith("\n") ? "" : "\n") + "[features]\n";
  if (!/codex_hooks\s*=\s*true/.test(next)) {
    next = next.replace(/\[features\][^[]*/m, (block) => block.includes("codex_hooks") ? block : `${block}codex_hooks = true\n`);
  }
  if (!next.includes("[mcp_servers.agentmemory]")) {
    next += `${next.endsWith("\n") ? "" : "\n"}\n[mcp_servers.agentmemory]\ncommand = \"npx\"\nargs = [\"-y\", \"@agentmemory/mcp\"]\n\n[mcp_servers.agentmemory.env]\nAGENTMEMORY_URL = \"http://localhost:3111\"\n`;
  }
  writeText(configPath, next);
}

function generateCodexHooks(packageRoot: string): Record<string, unknown> {
  return {
    hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: commandScript(packageRoot, "codex.mjs") }] }],
      UserPromptSubmit: [{ hooks: [{ type: "command", command: commandScript(packageRoot, "codex.mjs") }] }],
      PostToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: commandScript(packageRoot, "codex.mjs") }] }],
      Stop: [{ hooks: [{ type: "command", command: commandScript(packageRoot, "codex.mjs") }] }],
    },
  };
}

function mergeGenericMcpJson(configPath: string): void {
  const current = readJson(configPath);
  const servers = (current.mcpServers as Record<string, unknown>) || {};
  servers.agentmemory = {
    command: "npx",
    args: ["-y", "@agentmemory/mcp"],
    env: { AGENTMEMORY_URL: "http://localhost:3111" },
  };
  current.mcpServers = servers;
  writeJson(configPath, current);
}

function ensureArraySetting(configPath: string, key: string, value: string): void {
  const current = readJson(configPath);
  const arr = Array.isArray(current[key]) ? [...(current[key] as string[])] : [];
  if (!arr.includes(value)) arr.push(value);
  current[key] = arr;
  writeJson(configPath, current);
}

function copyDir(src: string, dest: string): void {
  ensureDir(dirname(dest));
  cpSync(src, dest, { recursive: true });
}

export function installTarget(target: InstallTarget, opts?: { projectRoot?: string; global?: boolean }): InstallResult {
  const packageRoot = packageRootFromCliDist();
  const projectRoot = opts?.projectRoot || process.cwd();
  const filesWritten: string[] = [];
  const notes: string[] = [];

  switch (target) {
    case "opencode": {
      const pluginPath = join(projectRoot, ".opencode", "plugins", "agentmemory.js");
      const configPath = join(projectRoot, "opencode.json");
      writeText(pluginPath, generateOpenCodePlugin(packageRoot));
      mergeOpenCodeConfig(configPath);
      filesWritten.push(pluginPath, configPath);
      notes.push("Installed OpenCode plugin + MCP entry.");
      break;
    }
    case "cursor": {
      const root = opts?.global ? join(homedir(), ".cursor") : join(projectRoot, ".cursor");
      const hooksPath = join(root, "hooks.json");
      const mcpPath = join(root, "mcp.json");
      mergeCursorHooks(hooksPath, packageRoot);
      mergeCursorMcp(mcpPath);
      filesWritten.push(hooksPath, mcpPath);
      notes.push("Installed Cursor hooks + MCP config.");
      notes.push("Roo/Kilo inside Cursor still use their own MCP configs; install those separately.");
      break;
    }
    case "codex": {
      const root = opts?.global ? join(homedir(), ".codex") : join(projectRoot, ".codex");
      const hooksPath = join(root, "hooks.json");
      const configPath = join(root, "config.toml");
      writeJson(hooksPath, generateCodexHooks(packageRoot));
      mergeCodexConfig(configPath);
      filesWritten.push(hooksPath, configPath);
      notes.push("Installed Codex hooks + enabled codex_hooks feature + MCP config.");
      break;
    }
    case "roo": {
      const path = join(projectRoot, ".roo", "mcp.json");
      mergeGenericMcpJson(path);
      filesWritten.push(path);
      notes.push("Installed Roo MCP config. Roo has no native lifecycle hooks; use Cursor hooks separately if desired.");
      break;
    }
    case "kilo": {
      const path = join(projectRoot, ".kilocode", "mcp.json");
      mergeGenericMcpJson(path);
      filesWritten.push(path);
      notes.push("Installed Kilo Code MCP config. Kilo has no native lifecycle hooks; use Cursor hooks separately if desired.");
      break;
    }
    case "pi": {
      const home = homedir();
      const extDir = join(home, ".pi", "agent", "extensions", "agentmemory");
      copyDir(join(packageRoot, "integrations", "pi"), extDir);
      ensureArraySetting(join(home, ".pi", "agent", "settings.json"), "extensions", extDir);
      filesWritten.push(extDir, join(home, ".pi", "agent", "settings.json"));
      notes.push("Installed PI extension with lifecycle hooks.");
      break;
    }
    case "openclaw": {
      const home = homedir();
      const extDir = join(home, ".openclaw", "extensions", "agentmemory");
      copyDir(join(packageRoot, "integrations", "openclaw"), extDir);
      filesWritten.push(extDir);
      notes.push("Copied OpenClaw integration folder. Enable plugin in ~/.openclaw/openclaw.json manually if needed.");
      break;
    }
    case "hermes": {
      const home = homedir();
      const extDir = join(home, ".hermes", "plugins", "agentmemory");
      copyDir(join(packageRoot, "integrations", "hermes"), extDir);
      filesWritten.push(extDir);
      notes.push("Copied Hermes integration folder. Set memory.provider=agentmemory in ~/.hermes/config.yaml manually if needed.");
      break;
    }
    default:
      throw new Error(`Unsupported target: ${target satisfies never}`);
  }

  return { target, filesWritten, notes };
}
