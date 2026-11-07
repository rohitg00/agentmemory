import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "../src/cli/connect/codex-hooks.js";

const PLUGIN_ROOT = resolve(__dirname, "..", "plugin");

describe("buildMergedHooks against plugin/hooks/hooks.json (Claude Code)", () => {
  it("locates the same plugin root used by the codex variant", () => {
    expect(findPluginRoot()).toBe(PLUGIN_ROOT);
  });

  it("rewrites ${CLAUDE_PLUGIN_ROOT} to absolute pluginRoot in every exec-form argument", () => {
    const merged = buildMergedHooks(null, PLUGIN_ROOT, "hooks.json");
    for (const entries of Object.values(merged.hooks)) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          expect(handler.command).toBe("node");
          expect(handler.args).toHaveLength(1);
          expect(handler.args![0]).not.toContain("${CLAUDE_PLUGIN_ROOT}");
          expect(handler.args![0]).toContain(`${PLUGIN_ROOT}/scripts/`);
        }
      }
    }
  });

  it("includes Claude-only events that hooks.codex.json omits", () => {
    const merged = buildMergedHooks(null, PLUGIN_ROOT, "hooks.json");
    const events = Object.keys(merged.hooks);
    expect(events).toContain("SessionStart");
    expect(events).toContain("Stop");
    const claudeOnly = ["SessionEnd", "SubagentStop", "Notification"];
    expect(
      claudeOnly.some((e) => events.includes(e)),
      `hooks.json should include at least one Claude-only event (${claudeOnly.join(", ")})`,
    ).toBe(true);
  });

  it("appends to existing user hooks without dropping them", () => {
    const existing: HookManifest = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "echo user-custom-claude" }] },
        ],
      },
    };
    const merged = buildMergedHooks(existing, PLUGIN_ROOT, "hooks.json");
    const sessionStart = merged.hooks["SessionStart"]!;
    expect(
      sessionStart.some((e) =>
        e.hooks.some((h) => h.command === "echo user-custom-claude"),
      ),
    ).toBe(true);
    expect(
      sessionStart.some((e) =>
        e.hooks.some((h) =>
          h.args?.includes(`${PLUGIN_ROOT}/scripts/session-start.mjs`),
        ),
      ),
    ).toBe(true);
  });

  it("keeps a user command and its matcher from an entry it shares with agentmemory", () => {
    const ours = buildMergedHooks(null, PLUGIN_ROOT, "hooks.json").hooks["PreToolUse"]!;
    const user = { type: "command", command: "echo user-pre-tool" };
    const existing: HookManifest = {
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [ours[0]!.hooks[0]!, user] }] },
    };
    expect(buildMergedHooks(existing, PLUGIN_ROOT, "hooks.json").hooks["PreToolUse"]).toEqual([
      { matcher: "Bash", hooks: [user] },
      ...ours,
    ]);
  });

  it("replaces an earlier shell-form agentmemory install with the exec form", () => {
    const existing: HookManifest = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: `node "${PLUGIN_ROOT}/scripts/session-start.mjs"` }] },
        ],
      },
    };
    expect(buildMergedHooks(existing, PLUGIN_ROOT, "hooks.json").hooks["SessionStart"]).toEqual(
      buildMergedHooks(null, PLUGIN_ROOT, "hooks.json").hooks["SessionStart"],
    );
  });

  it("re-install strips previous agentmemory entries (idempotent)", () => {
    const first = buildMergedHooks(null, PLUGIN_ROOT, "hooks.json");
    const second = buildMergedHooks(first, PLUGIN_ROOT, "hooks.json");
    for (const event of Object.keys(first.hooks)) {
      expect(
        second.hooks[event]!.length,
        `${event} should not double after second install`,
      ).toBe(first.hooks[event]!.length);
    }
  });
});

describe("connect claude-code --with-hooks", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-claude-hooks-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(home, { recursive: true, force: true });
  });

  it("installs its hooks next to a prompt handler and keeps that handler", async () => {
    const settingsPath = join(home, ".claude", "settings.json");
    const promptEntry = { hooks: [{ type: "prompt", prompt: "Is the task done?" }] };
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ hooks: { Stop: [promptEntry] } }));

    const { resolveAdapter, runAdapter } = await import("../src/cli/connect/index.js");
    const result = await runAdapter(resolveAdapter("claude-code")!, {
      dryRun: false,
      force: false,
      withHooks: true,
    });

    expect(result.kind).toBe("installed");
    const stop = (JSON.parse(readFileSync(settingsPath, "utf-8")) as HookManifest).hooks["Stop"];
    expect(stop).toEqual([
      promptEntry,
      ...buildMergedHooks(null, PLUGIN_ROOT, "hooks.json").hooks["Stop"]!,
    ]);
  });

  it("detects Claude Code in CLAUDE_CONFIG_DIR without a default directory", async () => {
    const configDir = join(home, "custom Claude config");
    mkdirSync(configDir);
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);

    const { adapter } = await import("../src/cli/connect/claude-code.js");
    expect(adapter.detect()).toBe(true);
    expect(existsSync(join(home, ".claude"))).toBe(false);
  });

  it("merges MCP and hooks in CLAUDE_CONFIG_DIR and leaves default files untouched", async () => {
    const configDir = join(home, "custom Claude config");
    const configPath = join(configDir, ".claude.json");
    const settingsPath = join(configDir, "settings.json");
    const existingServer = { command: "existing-server", args: [] };
    const userHook = { hooks: [{ type: "command", command: "echo user-hook" }] };
    mkdirSync(configDir);
    mkdirSync(join(home, ".claude"));
    writeFileSync(configPath, JSON.stringify({ mcpServers: { existing: existingServer }, theme: "dark" }));
    writeFileSync(settingsPath, JSON.stringify({ env: { KEEP: "yes" }, hooks: { SessionStart: [userHook] } }));
    writeFileSync(join(home, ".claude.json"), '{"keep":"default MCP"}');
    writeFileSync(join(home, ".claude", "settings.json"), '{"keep":"default settings"}');
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);

    const { adapter } = await import("../src/cli/connect/claude-code.js");
    const options = { dryRun: false, force: false, withHooks: true };
    const result = await adapter.install(options);

    expect(result).toMatchObject({ kind: "installed", mutatedPath: configPath });
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.theme).toBe("dark");
    expect(config.mcpServers.existing).toEqual(existingServer);
    expect(config.mcpServers.agentmemory.args).toContain("@agentmemory/mcp");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.env).toEqual({ KEEP: "yes" });
    expect(settings.hooks.SessionStart).toEqual([
      userHook,
      ...buildMergedHooks(null, PLUGIN_ROOT, "hooks.json").hooks.SessionStart!,
    ]);
    expect(readFileSync(join(home, ".claude.json"), "utf-8")).toBe('{"keep":"default MCP"}');
    expect(readFileSync(join(home, ".claude", "settings.json"), "utf-8")).toBe('{"keep":"default settings"}');

    const installedSettings = readFileSync(settingsPath, "utf-8");
    expect((await adapter.install(options)).kind).toBe("already-wired");
    expect(readFileSync(settingsPath, "utf-8")).toBe(installedSettings);
  });

  it("reports the custom MCP path on a dry run without writing files", async () => {
    const configDir = join(home, "custom Claude config");
    mkdirSync(configDir);
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);

    const { adapter } = await import("../src/cli/connect/claude-code.js");
    const result = await adapter.install({ dryRun: true, force: false, withHooks: true });

    expect(result).toMatchObject({ kind: "installed", mutatedPath: join(configDir, ".claude.json") });
    expect(existsSync(join(configDir, ".claude.json"))).toBe(false);
    expect(existsSync(join(configDir, "settings.json"))).toBe(false);
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
  });

  it("puts MCP inside an explicitly configured default .claude directory", async () => {
    const configDir = join(home, ".claude");
    mkdirSync(configDir);
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);

    const { adapter } = await import("../src/cli/connect/claude-code.js");
    const result = await adapter.install({ dryRun: false, force: false });

    expect(result).toMatchObject({ kind: "installed", mutatedPath: join(configDir, ".claude.json") });
    expect(JSON.parse(readFileSync(join(configDir, ".claude.json"), "utf-8")).mcpServers.agentmemory).toBeDefined();
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
  });

  it.each([undefined, ""])("keeps legacy paths when CLAUDE_CONFIG_DIR is %s", async (override) => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", override);

    const { adapter } = await import("../src/cli/connect/claude-code.js");
    const result = await adapter.install({ dryRun: false, force: false, withHooks: true });

    expect(result).toMatchObject({ kind: "installed", mutatedPath: join(home, ".claude.json") });
    expect(JSON.parse(readFileSync(join(home, ".claude.json"), "utf-8")).mcpServers.agentmemory).toBeDefined();
    expect(JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8")).hooks.SessionStart).toBeDefined();
  });
});
