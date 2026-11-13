import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ConnectAdapter } from "../src/cli/connect/types.js";
import { buildMergedHooks, type HookManifest } from "../src/cli/connect/codex-hooks.js";

const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop"];
const PLUGIN = resolve(__dirname, "../plugin");
const MCP = process.platform === "win32"
  ? { type: "stdio", command: "cmd", args: ["/c", "npx", "-y", "@agentmemory/mcp"] }
  : { type: "stdio", command: "npx", args: ["-y", "@agentmemory/mcp"] };

type Config = {
  mcp?: { servers?: Record<string, unknown> };
  hooks?: { enabled?: boolean; timeoutMs?: number; events?: HookManifest["hooks"] };
  [key: string]: unknown;
};

describe("connect zcode", () => {
  let home: string;
  let path: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-zcode-"));
    path = join(home, ".zcode", "cli", "config.json");
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(home, { recursive: true, force: true });
  });

  async function adapter(): Promise<ConnectAdapter> {
    const { resolveAdapter } = await import("../src/cli/connect/index.js");
    const found = resolveAdapter("zcode");
    expect(found, "ZCode must be available through the public connect dispatcher").not.toBeNull();
    return found!;
  }

  function seed(value: unknown): string {
    const raw = JSON.stringify(value, null, 2) + "\n";
    mkdirSync(join(home, ".zcode", "cli"), { recursive: true });
    writeFileSync(path, raw);
    return raw;
  }

  function config(): Config {
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  }

  function backups(): string[] {
    const dir = join(home, ".agentmemory", "backups");
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }

  it("resolves ZCode through the public dispatcher", async () => {
    const a = await adapter();
    expect(a.name).toBe("zcode");
    expect(a.category).toBe("native");
    expect(a.autoCapture).toBe("with-hooks");
    const { resolveAdapter } = await import("../src/cli/connect/index.js");
    expect(resolveAdapter("ZCode")).toBe(a);
  });

  it("detects only an existing ZCode home without creating it", async () => {
    const a = await adapter();
    expect(a.detect()).toBe(false);
    expect(readdirSync(home)).toEqual([]);
    mkdirSync(join(home, ".zcode"));
    expect(a.detect()).toBe(true);
  });

  it("writes native nested stdio MCP without enabling capture by default", async () => {
    const a = await adapter();
    expect(await a.install({ dryRun: false, force: false })).toMatchObject({ kind: "installed", mutatedPath: path });
    expect(config()).toEqual({ mcp: { servers: { agentmemory: MCP } } });
    expect(backups()).toEqual([]);
  });

  it("installs exactly the six native process hooks, including failure", async () => {
    const a = await adapter();
    const result = await a.install({ dryRun: false, force: false, withHooks: true });
    expect(result).toMatchObject({ kind: "installed", hooks: "installed" });
    const hooks = config().hooks!;
    expect(hooks.enabled).toBe(true);
    expect(Object.keys(hooks.events!).sort()).toEqual(EVENTS.slice().sort());
    expect(hooks.events!.PreToolUse![0].matcher).toBe("Bash|Read|Write|Edit|Grep|Glob");
    const scripts = ["session-start", "prompt-submit", "pre-tool-use", "post-tool-use", "post-tool-failure", "stop"];
    for (const [index, event] of EVENTS.entries()) {
      const entries = hooks.events![event]!;
      expect(entries).toHaveLength(1);
      expect(entries[0].hooks).toHaveLength(1);
      expect(entries[0].hooks[0]).toMatchObject({ type: "process", command: "node", args: [join(PLUGIN, "scripts", scripts[index] + ".mjs").replace(/\\/g, "/")] });
    }
  });

  it("preserves unrelated native MCP, settings, trust and user hook entries", async () => {
    const other = { type: "http", url: "https://example.invalid/mcp", enabled: false };
    const guard = { hooks: [{ type: "command", command: "echo user-guard", onError: "deny" }] };
    const permission = { mode: "plan", allowedTools: ["Read"] };
    const plugins = { enabledPlugins: { "other@local": false } };
    seed({ mcp: { servers: { other } }, hooks: { enabled: true, timeoutMs: 7000, events: { PreToolUse: [guard], PermissionRequest: [guard] } }, permission, plugins, model: "user-model", untouched: [1, 2] });
    const a = await adapter();
    await a.install({ dryRun: false, force: false, withHooks: true });
    const next = config();
    expect(next.mcp!.servers!.other).toEqual(other);
    expect(next.permission).toEqual(permission);
    expect(next.plugins).toEqual(plugins);
    expect(next.model).toBe("user-model");
    expect(next.untouched).toEqual([1, 2]);
    expect(next.hooks!.timeoutMs).toBe(7000);
    expect(next.hooks!.events!.PreToolUse![0]).toEqual(guard);
    expect(next.hooks!.events!.PermissionRequest).toEqual([guard]);
  });

  it("adds missing hooks when MCP is already configured and preserves custom MCP env", async () => {
    const own = { ...MCP, env: { AGENTMEMORY_URL: "http://localhost:4321", CUSTOM: "fixture" } };
    seed({ mcp: { servers: { agentmemory: own } } });
    const a = await adapter();
    expect(await a.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ hooks: "installed" });
    expect(config().mcp!.servers!.agentmemory).toEqual(own);
    expect(Object.keys(config().hooks!.events!).sort()).toEqual(EVENTS.slice().sort());
  });

  it("is idempotent without extra hook handlers, writes or backups", async () => {
    seed({ untouched: true });
    const a = await adapter();
    await a.install({ dryRun: false, force: false, withHooks: true });
    const before = readFileSync(path, "utf8");
    const saved = backups();
    expect(saved).toHaveLength(1);
    expect(await a.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "already-wired", hooks: "installed" });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(backups()).toEqual(saved);
  });

  it("dry-run preserves the complete existing file and creates no backup", async () => {
    const before = seed({ mcp: { servers: { other: { type: "stdio", command: "other" } } }, custom: "keep" });
    const a = await adapter();
    expect(await a.install({ dryRun: true, force: false, withHooks: true })).toMatchObject({ kind: "installed" });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(backups()).toEqual([]);
  });

  it("dry-run creates no native home, config or backup", async () => {
    const a = await adapter();
    expect(await a.install({ dryRun: true, force: false, withHooks: true })).toMatchObject({ kind: "installed" });
    expect(readdirSync(home)).toEqual([]);
  });

  for (const [name, raw] of [
    ["malformed JSON", "{broken"], ["null root", "null"], ["array root", "[]"], ["scalar root", "7"],
    ["array MCP", '{"mcp":[]}'], ["array server map", '{"mcp":{"servers":[]}}'],
    ["array hooks", '{"hooks":[]}'], ["array events", '{"hooks":{"events":[]}}'],
    ["invalid event entry", '{"hooks":{"events":{"Stop":[{"hooks":null}]}}}'],
  ]) it("refuses " + name + " without modifying the file or making a backup", async () => {
    mkdirSync(join(home, ".zcode", "cli"), { recursive: true });
    writeFileSync(path, raw);
    const a = await adapter();
    expect(await a.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "skipped" });
    expect(readFileSync(path, "utf8")).toBe(raw);
    expect(backups()).toEqual([]);
  });

  it("requires force before replacing a conflicting agentmemory MCP entry", async () => {
    const before = seed({ mcp: { servers: { agentmemory: { type: "stdio", command: "user-custom" } } } });
    const a = await adapter();
    expect(await a.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "skipped" });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(backups()).toEqual([]);
    expect(await a.install({ dryRun: false, force: true, withHooks: true })).toMatchObject({ kind: "installed" });
    expect(config().mcp!.servers!.agentmemory).toEqual(MCP);
    expect(backups()).toHaveLength(1);
    expect(readFileSync(join(home, ".agentmemory", "backups", backups()[0]), "utf8")).toBe(before);
  });

  it("preserves explicit hook disabling until force is requested", async () => {
    const before = seed({ hooks: { enabled: false, events: {} } });
    const a = await adapter();
    expect(await a.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "skipped" });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(await a.install({ dryRun: false, force: true, withHooks: true })).toMatchObject({ kind: "installed", hooks: "installed" });
    expect(config().hooks!.enabled).toBe(true);
  });
});

describe("ZCode process hook paths", () => {
  it("keeps spaces and dollar replacement patterns literal in argv", () => {
    const root = mkdtempSync(join(tmpdir(), "am-zcode-path-"));
    try {
      const plugin = join(root, "plugin with $& dollar");
      mkdirSync(join(plugin, "hooks"), { recursive: true });
      writeFileSync(join(plugin, "hooks/hooks.zcode.json"), readFileSync(join(PLUGIN, "hooks/hooks.zcode.json")));
      const merged = buildMergedHooks(null, plugin, "hooks.zcode.json");
      expect(merged.hooks.Stop![0].hooks[0]).toMatchObject({ type: "process", command: "node", args: [join(plugin, "scripts/stop.mjs").replace(/\\/g, "/")] });
      expect(buildMergedHooks(merged, plugin, "hooks.zcode.json")).toEqual(merged);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
