import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    const next = i + 1 < input.length ? input[i + 1] : undefined;
    if (inString) {
      output += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      output += ch;
      continue;
    }
    if (next && ch === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i += 1;
      if (i < input.length) output += "\n";
      continue;
    }
    if (next && ch === "/" && next === "*") {
      i += 2;
      while (i < input.length) {
        const curr = input[i];
        const following = i + 1 < input.length ? input[i + 1] : undefined;
        if (curr === "*" && following === "/") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    output += ch;
  }
  return output;
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(stripJsonComments(readFileSync(path, "utf8"))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(path: string, value: unknown): void {
  writeText(path, JSON.stringify(value, null, 2));
}

function chooseExistingPath(candidates: string[], fallback: string): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return fallback;
}

function packageRootFromCliDist(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  return `export const AgentmemoryPlugin = async ({ $ }) => {
  let sessionId = '';
  const getSessionId = () => {
    if (!sessionId) sessionId = 'opencode-' + Date.now().toString(36);
    return sessionId;
  };
  return {
  event: async ({ event }) => {
    if (event.type === 'session.created') {
      sessionId = getSessionId();
      await $\`${sessionStartScript}\`.stdin(JSON.stringify({ session_id: sessionId, cwd: process.cwd() })).quiet().nothrow();
    } else if (event.type === 'session.idle') {
      await $\`${stopScript}\`.stdin(JSON.stringify({ session_id: getSessionId(), cwd: process.cwd() })).quiet().nothrow();
    } else if (event.type === 'file.edited') {
      await $\`${postToolScript}\`.stdin(JSON.stringify({ session_id: getSessionId(), cwd: process.cwd(), tool_name: 'OpenCodeEdit', tool_input: { file_path: event.properties?.path ?? '' }, tool_output: 'file edited' })).quiet().nothrow();
    } else if (event.type === 'command.executed') {
      await $\`${postToolScript}\`.stdin(JSON.stringify({ session_id: getSessionId(), cwd: process.cwd(), tool_name: 'Bash', tool_input: { command: event.properties?.command ?? '' }, tool_output: 'command executed' })).quiet().nothrow();
    }
  },
  'tool.execute.after': async (input, output) => {
    await $\`${postToolScript}\`.stdin(JSON.stringify({ session_id: getSessionId(), cwd: process.cwd(), tool_name: input.tool, tool_input: input.args, tool_output: output })).quiet().nothrow();
  },
  'chat.message': async (_input, output) => {
    if (output?.message) {
      await $\`${promptScript}\`.stdin(JSON.stringify({ session_id: getSessionId(), cwd: process.cwd(), prompt: output.message })).quiet().nothrow();
    }
  }
  };
};
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

function mergeKiloConfig(configPath: string): void {
  const current = readJson(configPath);
  const mcp = (current.mcp as Record<string, unknown>) || {};
  mcp.agentmemory = {
    type: "local",
    command: ["npx", "-y", "@agentmemory/mcp"],
    environment: { AGENTMEMORY_URL: "http://localhost:3111" },
    enabled: true,
  };
  current.mcp = mcp;
  current.$schema = current.$schema || "https://kilocode.ai/config.schema.json";
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
      const configPath = chooseExistingPath(
        [join(projectRoot, "opencode.jsonc"), join(projectRoot, "opencode.json")],
        join(projectRoot, "opencode.json"),
      );
      writeText(pluginPath, generateOpenCodePlugin(packageRoot));
      mergeOpenCodeConfig(configPath);
      filesWritten.push(pluginPath, configPath);
      notes.push("Installed OpenCode plugin + MCP entry.");
      break;
    }
    case "cursor": {
      const root = opts?.global ? join(homedir(), ".cursor") : join(projectRoot, ".cursor");
      const mcpPath = join(root, "mcp.json");
      mergeCursorMcp(mcpPath);
      filesWritten.push(mcpPath);
      notes.push("Installed Cursor MCP config.");
      notes.push("Cursor does not expose a first-class lifecycle hook system like Claude Code; for automatic capture use the existing filesystem watcher or a host-specific extension/plugin layer.");
      notes.push("Roo/Kilo inside Cursor still use their own configs; install those separately.");
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
      const path = chooseExistingPath(
        [join(projectRoot, "kilo.jsonc"), join(projectRoot, ".kilo", "kilo.jsonc")],
        join(projectRoot, ".kilo", "kilo.jsonc"),
      );
      mergeKiloConfig(path);
      filesWritten.push(path);
      notes.push("Installed Kilo Code MCP config inside kilo.jsonc.");
      notes.push("Kilo has no native lifecycle hooks; use the filesystem watcher for best-available automatic capture.");
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
