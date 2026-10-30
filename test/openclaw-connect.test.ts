import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

describe("OpenClaw connector", () => {
  let home: string;
  let path: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "openclaw-connect-"));
    vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("OPENCLAW_CONFIG_PATH", "");
    vi.stubEnv("OPENCLAW_STATE_DIR", "");
    vi.stubEnv("OPENCLAW_HOME", "");
    vi.resetModules();
    mkdirSync(join(home, ".openclaw"));
    path = join(home, ".openclaw", "openclaw.json");
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }); });
  it("writes the native registry without overriding unrelated configuration, then stays unchanged", async () => {
    const existing = { agents: { defaults: { workspace: "/custom" } }, mcp: { servers: { other: { command: "custom" } } } };
    writeFileSync(path, JSON.stringify(existing));
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false, withMcp: true })).kind).toBe("installed");
    const text = readFileSync(path, "utf8"); const config = JSON.parse(text);
    expect(config.agents).toEqual(existing.agents);
    expect(config.mcp.servers.other).toEqual({ command: "custom" });
    expect(config.mcp.servers.agentmemory).toMatchObject({ command: process.execPath, transport: "stdio", env: { AGENTMEMORY_TOOLS: "all", AGENTMEMORY_FORCE_PROXY: "1" } });
    expect(config.mcp.servers.agentmemory.args[0]).toMatch(/dist[/\\]standalone\.mjs$/);
    expect(config.plugins.slots.memory).toBe("agentmemory");
    expect(config.plugins.entries.agentmemory.hooks.allowConversationAccess).toBe(true);
    expect(existsSync(join(home, ".openclaw/extensions/agentmemory/plugin.mjs"))).toBe(true);
    expect(existsSync(join(home, ".openclaw/extensions/agentmemory/skills/remember/SKILL.md"))).toBe(true);
    expect(config.mcpServers).toBeUndefined();
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("already-wired");
    expect(readFileSync(path, "utf8")).toBe(text);
  });
  it.each([["-y", "@agentmemory/mcp"], ["@agentmemory/mcp"]])("migrates the old AgentMemory launcher %j and preserves custom values", async (...args) => {
    const legacy = { command: "npx", args, timeout: 45000, env: { AGENTMEMORY_URL: "${AGENTMEMORY_URL:-http://localhost:3111}", AGENTMEMORY_SECRET: "${AGENTMEMORY_SECRET:-}", CUSTOM: "preserved" } };
    writeFileSync(path, JSON.stringify({ mcpServers: { agentmemory: legacy }, agents: { defaults: {} } }));
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const config = JSON.parse(readFileSync(path, "utf8"));
    expect(config.mcpServers).toBeUndefined();
    expect(config.mcp.servers.agentmemory.env).toEqual({ CUSTOM: "preserved", AGENTMEMORY_TOOLS: "all", AGENTMEMORY_FORCE_PROXY: "1" });
    expect(config.mcp.servers.agentmemory.transport).toBe("stdio");
    expect(config.mcp.servers.agentmemory.command).toBe(process.execPath);
    expect(config.mcp.servers.agentmemory.args).toEqual([fileURLToPath(new URL("../dist/standalone.mjs", import.meta.url))]);
    expect(config.mcp.servers.agentmemory.timeout).toBe(45000);
  });
  it("preserves an explicit legacy proxy override during migration", async () => {
    writeFileSync(path, JSON.stringify({ mcpServers: { agentmemory: { command: "npx", args: ["@agentmemory/mcp"], env: { AGENTMEMORY_FORCE_PROXY: "0" } } } }));
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    await adapter.install({ dryRun: false, force: false });
    expect(JSON.parse(readFileSync(path, "utf8")).mcp.servers.agentmemory.env.AGENTMEMORY_FORCE_PROXY).toBe("0");
  });
  it.each(["{ broken", "null", "[]", '{"mcp":{"servers":[]}}'])("does not overwrite malformed config %s", async (raw) => {
    writeFileSync(path, raw);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: true })).kind).toBe("skipped");
    expect(readFileSync(path, "utf8")).toBe(raw);
  });
  it("dry-run neither migrates nor creates backups", async () => {
    const raw = JSON.stringify({ mcpServers: { agentmemory: { command: "npx", args: ["@agentmemory/mcp"] } } });
    writeFileSync(path, raw);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    await adapter.install({ dryRun: true, force: false });
    expect(readFileSync(path, "utf8")).toBe(raw);
    expect(existsSync(join(home, ".agentmemory"))).toBe(false);
  });
  it("preserves a customized native server until force is requested", async () => {
    const raw = JSON.stringify({ mcp: { servers: { agentmemory: { command: "custom", env: { CUSTOM: "yes" } } } } });
    writeFileSync(path, raw);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    await adapter.install({ dryRun: false, force: false });
    expect(JSON.parse(readFileSync(path, "utf8")).mcp.servers.agentmemory).toEqual({ command: "custom", env: { CUSTOM: "yes" } });
    await adapter.install({ dryRun: false, force: true, withMcp: true });
    expect(JSON.parse(readFileSync(path, "utf8")).mcp.servers.agentmemory.command).toBe(process.execPath);
  });

  it("targets the native custom state directory", async () => {
    const state = join(home, "profile-state"); mkdirSync(state);
    vi.stubEnv("OPENCLAW_STATE_DIR", state);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect(adapter.detect()).toBe(true);
    await adapter.install({ dryRun: false, force: false });
    expect(existsSync(join(state, "openclaw.json"))).toBe(true);
    expect(existsSync(path)).toBe(false);
  });
  it("leaves mixed legacy registries untouched and explains why native validation needs migration", async () => {
    const raw = JSON.stringify({ mcpServers: { agentmemory: { command: "npx", args: ["@agentmemory/mcp"] }, custom: { command: "custom" } } });
    writeFileSync(path, raw);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("skipped");
    expect(readFileSync(path, "utf8")).toBe(raw);
  });
  it("preserves a customized current MCP server when removing its recognized legacy duplicate", async () => {
    const current = { command: "custom-launcher", args: ["--custom"], env: { CUSTOM: "keep" } };
    const other = { command: "another-server" };
    writeFileSync(path, JSON.stringify({
      mcpServers: { agentmemory: { command: "npx", args: ["-y", "@agentmemory/mcp"] } },
      mcp: { servers: { agentmemory: current, other } },
    }));
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const config = JSON.parse(readFileSync(path, "utf8"));
    expect(config.mcpServers).toBeUndefined();
    expect(config.mcp.servers).toEqual({ agentmemory: current, other });
  });
  it("does not rewrite an unrecognized custom legacy launcher", async () => {
    const raw = JSON.stringify({ mcpServers: { agentmemory: { command: "custom-launcher", args: ["@agentmemory/mcp"] } } });
    writeFileSync(path, raw);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("skipped");
    expect(readFileSync(path, "utf8")).toBe(raw);
  });
  it("does not report a null native entry as connected", async () => {
    writeFileSync(path, '{"mcp":{"servers":{"agentmemory":null}}}');
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("skipped");
    expect((await adapter.install({ dryRun: false, force: true })).kind).toBe("skipped");
    expect((await adapter.install({ dryRun: false, force: true, withMcp: true })).kind).toBe("installed");
  });

  it("installs native capture without silently enabling the shared MCP surface", async () => {
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    await adapter.install({ dryRun: false, force: false });
    expect(JSON.parse(readFileSync(path, "utf8")).mcp).toBeUndefined();
  });
  it("preserves custom JSON5 values and existing plugin permissions", async () => {
    writeFileSync(path, `{ agents: { defaults: { workspace: '/custom', }, }, plugins: { allow: ['other'], entries: { other: { enabled: true } } }, skills: { load: { extraDirs: ['/custom-skills'] } } }`);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    const config = JSON.parse(readFileSync(path, "utf8"));
    expect(config.plugins.allow).toEqual(["other", "agentmemory"]);
    expect(config.plugins.entries.other.enabled).toBe(true);
    expect(config.skills.load.extraDirs).toEqual(["/custom-skills"]);
    expect(config.agents.defaults.workspace).toBe("/custom");
  });
  it("keeps another memory slot selected until force is requested", async () => {
    const raw = JSON.stringify({ plugins: { slots: { memory: "another-provider" } } });
    writeFileSync(path, raw);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("skipped");
    expect(readFileSync(path, "utf8")).toBe(raw);
    expect(existsSync(join(home, ".openclaw/extensions"))).toBe(false);
    expect((await adapter.install({ dryRun: false, force: true })).kind).toBe("installed");
    expect(JSON.parse(readFileSync(path, "utf8")).plugins.slots.memory).toBe("agentmemory");
  });
  it("preserves explicit conversation-access denial until force is requested", async () => {
    const raw = JSON.stringify({ plugins: { entries: { agentmemory: { hooks: { allowConversationAccess: false } } } } });
    writeFileSync(path, raw);
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("skipped");
    expect(readFileSync(path, "utf8")).toBe(raw);
    expect((await adapter.install({ dryRun: false, force: true })).kind).toBe("installed");
  });
  it("uses dynamic custom state and config paths without touching the original profile", async () => {
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    const state = join(home, "profile-state"); const custom = join(home, "config", "custom.json5");
    vi.stubEnv("OPENCLAW_STATE_DIR", state); vi.stubEnv("OPENCLAW_CONFIG_PATH", custom);
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    expect(existsSync(custom)).toBe(true);
    expect(existsSync(join(state, "extensions/agentmemory/plugin.mjs"))).toBe(true);
    expect(existsSync(path)).toBe(false);
  });
  it("expands state and config tildes relative to the configured OpenClaw home", async () => {
    const customHome = join(home, "custom-home");
    vi.stubEnv("OPENCLAW_HOME", "~/custom-home");
    vi.stubEnv("OPENCLAW_STATE_DIR", "~/state"); vi.stubEnv("OPENCLAW_CONFIG_PATH", "~/config/custom.json5");
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    expect(existsSync(join(customHome, "state/extensions/agentmemory/plugin.mjs"))).toBe(true);
    expect(existsSync(join(customHome, "config/custom.json5"))).toBe(true);
  });
  it("uses a legacy state and config file when OpenClaw still resolves them", async () => {
    rmSync(join(home, ".openclaw"), { recursive: true });
    mkdirSync(join(home, ".clawdbot"));
    const legacy = join(home, ".clawdbot/clawdbot.json");
    writeFileSync(legacy, "{}");
    const { adapter } = await import("../src/cli/connect/openclaw.js");
    expect(adapter.detect()).toBe(true);
    expect((await adapter.install({ dryRun: false, force: false })).kind).toBe("installed");
    expect(JSON.parse(readFileSync(legacy, "utf8")).plugins.slots.memory).toBe("agentmemory");
    expect(existsSync(join(home, ".openclaw"))).toBe(false);
  });

});
