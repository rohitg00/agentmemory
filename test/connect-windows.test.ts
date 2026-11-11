import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const { log, pluginRootOverride } = vi.hoisted(() => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    step: vi.fn(),
  },
  pluginRootOverride: { value: null as string | null },
}));
vi.mock("@clack/prompts", () => ({
  log,
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: () => false,
  multiselect: vi.fn(),
}));

const REPO_PLUGIN = resolve(__dirname, "..", "plugin");
const WINDOWS_MCP = { command: "cmd", args: ["/c", "npx", "-y", "@agentmemory/mcp"] };
const QUOTED_NODE_COMMAND = /^node "(\/|[A-Za-z]:\/)[^"\\]+\.mjs"$/;

vi.mock("../src/cli/connect/codex-hooks.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/cli/connect/codex-hooks.js")>();
  return {
    ...actual,
    findPluginRoot: (...args: Parameters<typeof actual.findPluginRoot>) =>
      pluginRootOverride.value ?? actual.findPluginRoot(...args),
  };
});

type Handler = { command?: string; args?: string[] };

function hookHandlers(hooks: Record<string, { hooks: Handler[] }[]>): Handler[] {
  return Object.values(hooks).flatMap((entries) => entries.flatMap((entry) => entry.hooks));
}

function hookCommands(hooks: Record<string, { hooks: Handler[] }[]>): string[] {
  return hookHandlers(hooks).map((h) => h.command ?? "");
}

function spacedPluginRoot(home: string): string {
  const root = join(home, "AppData", "Local", "npm-cache", "_npx", "abc 123", "node_modules", "@agentmemory", "agentmemory", "plugin");
  mkdirSync(join(root, "hooks"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  for (const file of readdirSync(join(REPO_PLUGIN, "hooks"))) {
    copyFileSync(join(REPO_PLUGIN, "hooks", file), join(root, "hooks", file));
  }
  return root;
}

describe("connect on Windows with a home directory that contains spaces", () => {
  let home: string;
  const originalPlatform = process.platform;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am win home "));
    vi.resetModules();
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("APPDATA", join(home, "AppData", "Roaming"));
    vi.stubEnv("CLAUDE_CONFIG_DIR", "");
    vi.stubEnv("COPILOT_HOME", "");
    Object.defineProperty(process, "platform", { value: "win32" });
    pluginRootOverride.value = null;
    for (const fn of Object.values(log)) fn.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    vi.unstubAllEnvs();
    pluginRootOverride.value = null;
    rmSync(home, { recursive: true, force: true });
  });

  it("runConnect wires an agent instead of refusing on win32", async () => {
    mkdirSync(join(home, ".gemini"), { recursive: true });
    const { runConnect } = await import("../src/cli/connect/index.js");
    await runConnect(["gemini-cli", "--no-guidelines"]);
    const cfg = JSON.parse(readFileSync(join(home, ".gemini", "settings.json"), "utf-8"));
    expect(cfg.mcpServers.agentmemory).toMatchObject(WINDOWS_MCP);
  });

  it("writes a cmd-wrapped MCP server for JSON adapters and stays idempotent", async () => {
    mkdirSync(join(home, ".cursor"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/cursor.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const cfg = JSON.parse(readFileSync(join(home, ".cursor", "mcp.json"), "utf-8"));
    expect(cfg.mcpServers.agentmemory).toMatchObject(WINDOWS_MCP);
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("already-wired");
  });

  it("replaces a bare npx entry that Windows cannot spawn", async () => {
    mkdirSync(join(home, ".kiro", "settings"), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(home, ".kiro", "settings", "mcp.json"),
      JSON.stringify({ mcpServers: { agentmemory: { command: "npx", args: ["-y", "@agentmemory/mcp"] } } }),
    );
    const { adapter } = await import("../src/cli/connect/kiro.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const cfg = JSON.parse(readFileSync(join(home, ".kiro", "settings", "mcp.json"), "utf-8"));
    expect(cfg.mcpServers.agentmemory).toMatchObject(WINDOWS_MCP);
  });

  it("claude-code writes a cmd-wrapped MCP server and quoted absolute hook commands", async () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    const root = spacedPluginRoot(home);
    pluginRootOverride.value = root;
    const { adapter } = await import("../src/cli/connect/claude-code.js");
    expect((await adapter.install({ dryRun: false, force: false, withHooks: true })).kind).toBe("installed");

    const mcp = JSON.parse(readFileSync(join(home, ".claude.json"), "utf-8"));
    expect(mcp.mcpServers.agentmemory).toMatchObject(WINDOWS_MCP);

    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8"));
    const handlers = hookHandlers(settings.hooks);
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(handler.command).toBe("node");
      expect(handler.args).toHaveLength(1);
      expect(handler.args![0].startsWith(`${root.replace(/\\/g, "/")}/scripts/`)).toBe(true);
      expect(handler.args![0]).toMatch(/\.mjs$/);
    }
  });

  it("codex writes a cmd-wrapped TOML block and quoted hook commands", async () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    const root = spacedPluginRoot(home);
    pluginRootOverride.value = root;
    const { adapter } = await import("../src/cli/connect/codex.js");
    expect((await adapter.install({ dryRun: false, force: false, withHooks: true })).kind).toBe("installed");

    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    expect(toml).toContain('command = "cmd"');
    expect(toml).toContain('args = ["/c", "npx", "-y", "@agentmemory/mcp"]');

    const hooks = JSON.parse(readFileSync(join(home, ".codex", "hooks.json"), "utf-8"));
    for (const command of hookCommands(hooks.hooks)) {
      expect(command).toMatch(QUOTED_NODE_COMMAND);
      expect(command).toContain(root.replace(/\\/g, "/"));
    }
  });

  it("codex replaces a bare npx block without --force", async () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      '[mcp_servers.agentmemory]\ncommand = "npx"\nargs = ["-y", "@agentmemory/mcp"]\n',
    );
    const { adapter } = await import("../src/cli/connect/codex.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    expect(toml).toContain('command = "cmd"');
    expect(toml).not.toContain('command = "npx"');
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("already-wired");
  });

  it("opencode replaces a bare npx command array without --force", async () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(
      join(home, ".config", "opencode", "opencode.json"),
      JSON.stringify({ theme: "dark", mcp: { agentmemory: { type: "local", command: ["npx", "-y", "@agentmemory/mcp"], enabled: true } } }),
    );
    const { adapter } = await import("../src/cli/connect/opencode.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const cfg = JSON.parse(readFileSync(join(home, ".config", "opencode", "opencode.json"), "utf-8"));
    expect(cfg.theme).toBe("dark");
    expect(cfg.mcp.agentmemory.command).toEqual(["cmd", ...WINDOWS_MCP.args]);
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("already-wired");
  });

  it("continue replaces a bare npx entry in config.json without --force", async () => {
    mkdirSync(join(home, ".continue"), { recursive: true });
    writeFileSync(
      join(home, ".continue", "config.json"),
      JSON.stringify({ mcpServers: [{ name: "agentmemory", command: "npx", args: ["-y", "@agentmemory/mcp"] }] }),
    );
    const { adapter } = await import("../src/cli/connect/continue.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const cfg = JSON.parse(readFileSync(join(home, ".continue", "config.json"), "utf-8"));
    expect(cfg.mcpServers).toHaveLength(1);
    expect(cfg.mcpServers[0]).toMatchObject(WINDOWS_MCP);
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("already-wired");
  });

  it("dsh replaces a bare npx mcp-client row without --force", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    writeFileSync(
      join(home, ".dsh", "cordis.patch.yml"),
      "- insert:\n    - id: agentmemory\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        transport: stdio\n        serverName: agentmemory\n        command: npx\n        args: ['-y', '@agentmemory/mcp']\n",
    );
    const { adapter } = await import("../src/cli/connect/dsh.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    expect(patch).toContain("command: cmd");
    expect(patch).not.toContain("command: npx");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("already-wired");
  });

  it("only treats a bare npx launcher of @agentmemory/mcp as legacy", async () => {
    const { isLegacyMcpCommand } = await import("../src/cli/connect/util.js");
    expect(isLegacyMcpCommand("npx", ["-y", "@agentmemory/mcp"])).toBe(true);
    expect(isLegacyMcpCommand("npx", ["-y", "@team/custom-mcp"])).toBe(false);
    expect(isLegacyMcpCommand("npx", undefined)).toBe(false);
    expect(isLegacyMcpCommand("cmd", WINDOWS_MCP.args)).toBe(false);
  });

  it("codex migrates a bare npx command that has a trailing TOML comment", async () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      '[mcp_servers.agentmemory]\ncommand = "npx" # launcher\nargs = ["-y", "@agentmemory/mcp"] # pkg\n',
    );
    const { adapter } = await import("../src/cli/connect/codex.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    expect(toml).toContain('command = "cmd" # launcher');
    expect(toml).toContain('args = ["/c", "npx", "-y", "@agentmemory/mcp"] # pkg');
  });

  it("codex leaves a custom npx package untouched without --force", async () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    const original = '[mcp_servers.agentmemory]\ncommand = "npx"\nargs = ["-y", "@team/custom-mcp"]\n';
    writeFileSync(join(home, ".codex", "config.toml"), original);
    const { adapter } = await import("../src/cli/connect/codex.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("already-wired");
    expect(readFileSync(join(home, ".codex", "config.toml"), "utf-8")).toBe(original);
  });

  it("codex keeps existing env and options when it migrates the launcher", async () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "config.toml"),
      '[mcp_servers.agentmemory]\ncommand = "npx"\nargs = ["-y", "@agentmemory/mcp"]\nstartup_timeout_sec = 30\n\n[mcp_servers.agentmemory.env]\nAGENTMEMORY_URL = "https://memory.example.com"\nAGENTMEMORY_SECRET = "s3cret"\n\n[other]\nkey = 1\n',
    );
    const { adapter } = await import("../src/cli/connect/codex.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    expect(toml).toContain('command = "cmd"');
    expect(toml).toContain("startup_timeout_sec = 30");
    expect(toml).toContain('AGENTMEMORY_URL = "https://memory.example.com"');
    expect(toml).toContain('AGENTMEMORY_SECRET = "s3cret"');
    expect(toml).not.toContain("localhost:3111");
    expect(toml).toContain("[other]\nkey = 1");
  });

  it("continue keeps existing env when it migrates the launcher", async () => {
    mkdirSync(join(home, ".continue"), { recursive: true });
    const env = { AGENTMEMORY_URL: "https://memory.example.com", AGENTMEMORY_SECRET: "s3cret" };
    writeFileSync(
      join(home, ".continue", "config.json"),
      JSON.stringify({ mcpServers: [{ name: "agentmemory", command: "npx", args: ["-y", "@agentmemory/mcp"], env }] }),
    );
    const { adapter } = await import("../src/cli/connect/continue.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const cfg = JSON.parse(readFileSync(join(home, ".continue", "config.json"), "utf-8"));
    expect(cfg.mcpServers[0]).toMatchObject({ ...WINDOWS_MCP, env });
  });

  it("opencode keeps existing environment and options when it migrates the launcher", async () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    const environment = { AGENTMEMORY_URL: "https://memory.example.com", AGENTMEMORY_SECRET: "s3cret" };
    writeFileSync(
      join(home, ".config", "opencode", "opencode.json"),
      JSON.stringify({ mcp: { agentmemory: { type: "local", command: ["npx", "-y", "@agentmemory/mcp"], enabled: false, environment } } }),
    );
    const { adapter } = await import("../src/cli/connect/opencode.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const cfg = JSON.parse(readFileSync(join(home, ".config", "opencode", "opencode.json"), "utf-8"));
    expect(cfg.mcp.agentmemory).toEqual({ type: "local", command: ["cmd", ...WINDOWS_MCP.args], enabled: false, environment });
  });

  it("dsh keeps existing env when it migrates the launcher", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    writeFileSync(
      join(home, ".dsh", "cordis.patch.yml"),
      "- insert:\n    - id: agentmemory\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        transport: stdio\n        serverName: agentmemory\n        command: npx\n        args: ['-y', '@agentmemory/mcp']\n        env:\n          AGENTMEMORY_URL: https://memory.example.com\n          AGENTMEMORY_SECRET: s3cret\n",
    );
    const { adapter } = await import("../src/cli/connect/dsh.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const { parseDocument } = await import("yaml");
    const config = parseDocument(readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8")).toJS()[0].insert[0].config;
    expect(config.command).toBe("cmd");
    expect(config.args).toEqual(WINDOWS_MCP.args);
    expect(config.env).toEqual({ AGENTMEMORY_URL: "https://memory.example.com", AGENTMEMORY_SECRET: "s3cret" });
  });

  it("dsh leaves a custom npx package untouched without --force", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const original =
      "- insert:\n    - id: agentmemory\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        transport: stdio\n        serverName: agentmemory\n        command: npx\n        args: ['-y', '@team/custom-mcp']\n";
    writeFileSync(join(home, ".dsh", "cordis.patch.yml"), original);
    const { adapter } = await import("../src/cli/connect/dsh.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("already-wired");
    expect(readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8")).toBe(original);
  });

  it("droid hooks quote a plugin path with spaces", async () => {
    mkdirSync(join(home, ".factory"), { recursive: true });
    const root = spacedPluginRoot(home);
    pluginRootOverride.value = root;
    const { adapter } = await import("../src/cli/connect/droid.js");
    expect((await adapter.install({ dryRun: false, force: false, withHooks: true })).kind).toBe("installed");
    const mcp = JSON.parse(readFileSync(join(home, ".factory", "mcp.json"), "utf-8"));
    expect(mcp.mcpServers.agentmemory).toMatchObject({ ...WINDOWS_MCP, type: "stdio" });
    const hooks = JSON.parse(readFileSync(join(home, ".factory", "hooks.json"), "utf-8"));
    for (const command of hookCommands(hooks.hooks)) {
      expect(command).toMatch(QUOTED_NODE_COMMAND);
    }
  });

  it("opencode writes a cmd-wrapped command array", async () => {
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/opencode.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const cfg = JSON.parse(readFileSync(join(home, ".config", "opencode", "opencode.json"), "utf-8"));
    expect(cfg.mcp.agentmemory.command).toEqual(["cmd", ...WINDOWS_MCP.args]);
  });

  it("zed reads its settings from %APPDATA%\\Zed", async () => {
    const zedDir = join(home, "AppData", "Roaming", "Zed");
    mkdirSync(zedDir, { recursive: true });
    const { adapter } = await import("../src/cli/connect/zed.js");
    expect(adapter.detect()).toBe(true);
    await adapter.install({ dryRun: false, force: false });
    const cfg = JSON.parse(readFileSync(join(zedDir, "settings.json"), "utf-8"));
    expect(cfg.context_servers.agentmemory).toMatchObject(WINDOWS_MCP);
  });

  it("zed guideline lands beside the %APPDATA%\\Zed settings", async () => {
    const { guidelineTargets } = await import("../src/cli/connect/guidelines.js");
    expect(guidelineTargets(home).zed.globalPath).toBe(join(home, "AppData", "Roaming", "Zed", "AGENTS.md"));
  });

  it("converts Windows separators in hook command paths", async () => {
    const { toCommandPath } = await import("../src/cli/connect/util.js");
    expect(toCommandPath("C:\\Users\\Jane Doe\\plugin")).toBe("C:/Users/Jane Doe/plugin");
  });

  it("antigravity hooks use the Windows short path when the install path has spaces", async () => {
    mkdirSync(join(home, ".gemini", "antigravity-cli"), { recursive: true });
    const root = spacedPluginRoot(home);
    pluginRootOverride.value = root;
    const short = "C:/Users/JANEDO~1/AppData/Local/npm-cache/_npx/ABC123~1/plugin";
    const { installAntigravityCliHooks } = await import("../src/cli/connect/antigravity-cli.js");
    const shortPath = vi.fn(() => short);

    const result = installAntigravityCliHooks({ dryRun: false, force: false }, shortPath);

    expect(result.kind).toBe("installed");
    expect(shortPath).toHaveBeenCalledWith(root);
    const hooks = JSON.parse(readFileSync(join(home, ".gemini", "config", "hooks.json"), "utf-8"));
    const stop = hooks.agentmemory.Stop[0].command as string;
    expect(stop).toBe(`node ${short}/scripts/antigravity-bridge.mjs Stop`);
    expect(JSON.stringify(hooks)).not.toContain(" 123");
  });

  it("antigravity refuses only the hooks and prints manual steps when no short path exists", async () => {
    mkdirSync(join(home, ".gemini", "antigravity-cli"), { recursive: true });
    const root = spacedPluginRoot(home);
    pluginRootOverride.value = root;
    const { adapter, installAntigravityCliHooks } = await import("../src/cli/connect/antigravity-cli.js");

    const result = installAntigravityCliHooks({ dryRun: false, force: false }, () => null);

    expect(result.kind).toBe("skipped");
    expect(existsSync(join(home, ".gemini", "config", "hooks.json"))).toBe(false);
    const printed = log.message.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain(root);
    expect(printed).toContain("node C:/agentmemory/plugin/scripts/antigravity-bridge.mjs Stop");

    const mcpResult = await adapter.install({ dryRun: false, force: false });
    expect(mcpResult.kind).toBe("installed");
    const mcp = JSON.parse(readFileSync(join(home, ".gemini", "config", "mcp_config.json"), "utf-8"));
    expect(mcp.mcpServers.agentmemory).toMatchObject(WINDOWS_MCP);
  });
});
