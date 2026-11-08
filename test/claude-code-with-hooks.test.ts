import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

  it.skipIf(process.platform === "win32")("preserves a literal trailing space instead of changing a different profile", async () => {
    const configDir = join(home, "custom Claude config ");
    const trimmedDir = configDir.trim();
    mkdirSync(configDir);
    mkdirSync(trimmedDir);
    writeFileSync(join(trimmedDir, ".claude.json"), '{"keep":"trimmed MCP"}');
    writeFileSync(join(trimmedDir, "settings.json"), '{"keep":"trimmed settings"}');
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);

    const { adapter } = await import("../src/cli/connect/claude-code.js");
    expect(adapter.detect()).toBe(true);
    expect(await adapter.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({
      kind: "installed",
      mutatedPath: join(configDir, ".claude.json"),
    });
    expect(JSON.parse(readFileSync(join(configDir, "settings.json"), "utf-8")).hooks.SessionStart).toBeDefined();
    expect(readFileSync(join(trimmedDir, ".claude.json"), "utf-8")).toBe('{"keep":"trimmed MCP"}');
    expect(readFileSync(join(trimmedDir, "settings.json"), "utf-8")).toBe('{"keep":"trimmed settings"}');
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
    expect(existsSync(join(home, ".claude"))).toBe(false);
  });

  it("skips a custom profile directory that does not exist", async () => {
    const configDir = join(home, "missing Claude config");
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);

    const { resolveAdapter, runAdapter } = await import("../src/cli/connect/index.js");
    expect(await runAdapter(resolveAdapter("claude-code")!, {
      dryRun: false,
      force: false,
      withHooks: true,
      guidelines: false,
    })).toEqual({ kind: "skipped", reason: "not-detected" });
    expect(existsSync(configDir)).toBe(false);
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
    expect(existsSync(join(home, ".claude"))).toBe(false);
  });

  it.each(["custom", "default"])("skips a %s profile path that is a file", async (profile) => {
    const configDir = join(home, profile === "custom" ? "Claude config" : ".claude");
    writeFileSync(configDir, "keep this file");
    if (profile === "custom") vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);

    const { resolveAdapter, runAdapter } = await import("../src/cli/connect/index.js");
    expect(await runAdapter(resolveAdapter("claude-code")!, {
      dryRun: false,
      force: false,
      withHooks: true,
      guidelines: false,
    })).toEqual({ kind: "skipped", reason: "not-detected" });
    expect(readFileSync(configDir, "utf-8")).toBe("keep this file");
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
  });

  it("uses a profile override set after the adapter was imported for detection, MCP and hooks", async () => {
    const { adapter } = await import("../src/cli/connect/claude-code.js");
    const configDir = join(home, "late Claude config");
    mkdirSync(configDir);
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);

    expect(adapter.detect()).toBe(true);
    expect(await adapter.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({
      kind: "installed",
      mutatedPath: join(configDir, ".claude.json"),
    });
    expect(JSON.parse(readFileSync(join(configDir, "settings.json"), "utf-8")).hooks.SessionStart).toBeDefined();
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
    expect(existsSync(join(home, ".claude"))).toBe(false);
  });

  describe.skipIf(process.platform === "win32")("CLI env-file hydration", () => {
    it.each([
      { source: "default .env", customEnvFile: false, shellOverride: false, matchingShell: false, padding: "none" },
      { source: "AGENTMEMORY_ENV_FILE", customEnvFile: true, shellOverride: false, matchingShell: false, padding: "none" },
      { source: "shell overriding the env file", customEnvFile: true, shellOverride: true, matchingShell: false, padding: "none" },
      { source: "matching shell and env-file values", customEnvFile: true, shellOverride: true, matchingShell: true, padding: "none" },
      { source: "a literal env-file value with surrounding spaces", customEnvFile: true, shellOverride: false, matchingShell: false, padding: "both" },
      { source: "a literal shell value with leading spaces", customEnvFile: true, shellOverride: true, matchingShell: false, padding: "leading" },
      { source: "a literal shell value with trailing spaces", customEnvFile: true, shellOverride: true, matchingShell: false, padding: "trailing" },
    ])("installs MCP and hooks using $source", ({ customEnvFile, shellOverride, matchingShell, padding }) => {
      const fileProfile = join(home, "env-file Claude config");
      const shellProfile = join(home, "shell Claude config");
      const withPadding = (value: string) =>
        `${padding === "leading" || padding === "both" ? "  " : ""}${value}${padding === "trailing" || padding === "both" ? "  " : ""}`;
      const fileValue = shellOverride ? fileProfile : withPadding(fileProfile);
      const selectedValue = shellOverride && !matchingShell ? withPadding(shellProfile) : fileValue;
      const selected = resolve(home, selectedValue);
      mkdirSync(fileProfile);
      mkdirSync(shellProfile);
      mkdirSync(selected, { recursive: true });
      mkdirSync(join(home, ".agentmemory"));
      const envFile = customEnvFile
        ? join(home, "custom.env")
        : join(home, ".agentmemory", ".env");
      writeFileSync(envFile, `CLAUDE_CONFIG_DIR="${fileValue}"\n`);

      const result = spawnSync(process.execPath, [
        resolve(__dirname, "..", "dist", "cli.mjs"),
        "connect", "claude-code", "--with-hooks", "--no-guidelines",
      ], {
        cwd: home,
        env: {
          ...process.env,
          AGENTMEMORY_ENV_FILE: customEnvFile ? envFile : undefined,
          CLAUDE_CONFIG_DIR: shellOverride ? selectedValue : undefined,
          CI: "1",
          NO_COLOR: "1",
        },
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status, result.stderr).toBe(0);
      const output = result.stdout + result.stderr;
      if (shellOverride) {
        expect(output).not.toContain("CLAUDE_CONFIG_DIR was loaded only");
      } else {
        expect(output).toContain("CLAUDE_CONFIG_DIR was loaded only from agentmemory's env file.");
        expect(output).toContain(`Launch Claude Code with the same CLAUDE_CONFIG_DIR value ${JSON.stringify(selectedValue)}`);
        expect(output.match(/CLAUDE_CONFIG_DIR was loaded only/g)).toHaveLength(1);
        expect(output.indexOf("CLAUDE_CONFIG_DIR was loaded only")).toBeLessThan(output.indexOf("wired into"));
      }
      if (padding === "none" || padding === "trailing") {
        expect(output).not.toContain("CLAUDE_CONFIG_DIR is relative");
      }
      expect(result.stdout).toContain(`wired into ${join(selectedValue, ".claude.json")}`);
      expect(JSON.parse(readFileSync(join(selected, ".claude.json"), "utf-8")).mcpServers.agentmemory).toBeDefined();
      expect(JSON.parse(readFileSync(join(selected, "settings.json"), "utf-8")).hooks.SessionStart).toBeDefined();
      for (const profile of [fileProfile, shellProfile]) {
        if (profile !== selected) {
          expect(existsSync(join(profile, ".claude.json"))).toBe(false);
          expect(existsSync(join(profile, "settings.json"))).toBe(false);
        }
      }
      expect(existsSync(join(home, ".claude.json"))).toBe(false);
      expect(existsSync(join(home, ".claude"))).toBe(false);
    }, 15000);

    it.each(["env file", "shell"])("keeps legacy paths and warns only for a shell whitespace-only value from the %s", (source) => {
      const fileProfile = join(home, "env-file Claude config");
      mkdirSync(fileProfile);
      mkdirSync(join(home, ".claude"));
      mkdirSync(join(home, ".agentmemory"));
      writeFileSync(join(home, ".agentmemory", ".env"),
        `CLAUDE_CONFIG_DIR="${source === "env file" ? " \t " : fileProfile}"\n`);

      const result = spawnSync(process.execPath, [
        resolve(__dirname, "..", "dist", "cli.mjs"),
        "connect", "claude-code", "--with-hooks", "--no-guidelines",
      ], {
        cwd: home,
        env: {
          ...process.env,
          AGENTMEMORY_ENV_FILE: undefined,
          CLAUDE_CONFIG_DIR: source === "shell" ? " \t " : undefined,
          CI: "1",
          NO_COLOR: "1",
        },
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status, result.stderr).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).not.toContain("CLAUDE_CONFIG_DIR was loaded only");
      if (source === "shell") {
        expect(output).toContain("CLAUDE_CONFIG_DIR contains only whitespace.");
        expect(output).toContain("Unset CLAUDE_CONFIG_DIR before launching Claude Code");
        expect(output.match(/CLAUDE_CONFIG_DIR contains only whitespace/g)).toHaveLength(1);
      } else {
        expect(output).not.toContain("CLAUDE_CONFIG_DIR contains only whitespace.");
      }
      expect(result.stdout).toContain(`wired into ${join(home, ".claude.json")}`);
      expect(JSON.parse(readFileSync(join(home, ".claude.json"), "utf-8")).mcpServers.agentmemory).toBeDefined();
      expect(JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8")).hooks.SessionStart).toBeDefined();
      expect(existsSync(join(fileProfile, ".claude.json"))).toBe(false);
      expect(existsSync(join(fileProfile, "settings.json"))).toBe(false);
    }, 15000);

    it.each(["leading", "trailing"])("skips a missing literal profile with %s whitespace even when the trimmed directory exists", (padding) => {
      const trimmedDir = join(home, "existing Claude config");
      const configDir = padding === "leading" ? ` ${trimmedDir}` : `${trimmedDir} `;
      mkdirSync(trimmedDir);

      const result = spawnSync(process.execPath, [
        resolve(__dirname, "..", "dist", "cli.mjs"),
        "connect", "claude-code", "--with-hooks", "--no-guidelines",
      ], {
        cwd: home,
        env: {
          ...process.env,
          AGENTMEMORY_ENV_FILE: undefined,
          CLAUDE_CONFIG_DIR: configDir,
          CI: "1",
          NO_COLOR: "1",
        },
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status, result.stderr).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain(JSON.stringify(configDir));
      expect(output).toContain("is not an existing directory");
      expect(output).toContain("leading or trailing whitespace");
      expect(output).toContain("not detected on this machine (skipping)");
      expect(output).not.toContain("wired into");
      expect(existsSync(resolve(home, configDir))).toBe(false);
      expect(existsSync(join(trimmedDir, ".claude.json"))).toBe(false);
      expect(existsSync(join(trimmedDir, "settings.json"))).toBe(false);
    }, 15000);

    it("warns before installing into a profile relative to the CLI working directory", () => {
      const configDir = "relative Claude config";
      const selected = join(home, configDir);
      mkdirSync(selected);

      const result = spawnSync(process.execPath, [
        resolve(__dirname, "..", "dist", "cli.mjs"),
        "connect", "claude-code", "--with-hooks", "--no-guidelines",
      ], {
        cwd: home,
        env: {
          ...process.env,
          AGENTMEMORY_ENV_FILE: undefined,
          CLAUDE_CONFIG_DIR: configDir,
          CI: "1",
          NO_COLOR: "1",
        },
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status, result.stderr).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain(`CLAUDE_CONFIG_DIR is relative and resolves to ${JSON.stringify(realpathSync(selected))}`);
      expect(output).toContain("Set the same absolute path for agentmemory and Claude Code");
      expect(output.match(/CLAUDE_CONFIG_DIR is relative/g)).toHaveLength(1);
      expect(output.indexOf("CLAUDE_CONFIG_DIR is relative")).toBeLessThan(output.indexOf("wired into"));
      expect(JSON.parse(readFileSync(join(selected, ".claude.json"), "utf-8")).mcpServers.agentmemory).toBeDefined();
      expect(JSON.parse(readFileSync(join(selected, "settings.json"), "utf-8")).hooks.SessionStart).toBeDefined();
      expect(existsSync(join(home, ".claude.json"))).toBe(false);
      expect(existsSync(join(home, ".claude"))).toBe(false);
    }, 15000);
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

  it.each([undefined, "", " \t "])("keeps legacy paths when CLAUDE_CONFIG_DIR is %s", async (override) => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", override);
    mkdirSync(join(home, ".claude"));

    const { adapter } = await import("../src/cli/connect/claude-code.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false, withHooks: true });

    expect(result).toMatchObject({ kind: "installed", mutatedPath: join(home, ".claude.json") });
    expect(JSON.parse(readFileSync(join(home, ".claude.json"), "utf-8")).mcpServers.agentmemory).toBeDefined();
    expect(JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf-8")).hooks.SessionStart).toBeDefined();
  });
});
