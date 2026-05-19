import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ADAPTERS,
  knownAgents,
  resolveAdapter,
} from "../src/cli/connect/index.js";
import type { ConnectAdapter } from "../src/cli/connect/types.js";

describe("agentmemory connect — dispatcher", () => {
  it("resolves every known agent by lowercase name", () => {
    for (const name of knownAgents()) {
      const a = resolveAdapter(name);
      expect(a, `expected adapter for ${name}`).not.toBeNull();
      expect(a!.name).toBe(name);
    }
  });

  it("resolves case-insensitively", () => {
    expect(resolveAdapter("Claude-Code")?.name).toBe("claude-code");
    expect(resolveAdapter("CURSOR")?.name).toBe("cursor");
  });

  it("returns null for unknown agents", () => {
    expect(resolveAdapter("nonexistent-agent")).toBeNull();
    expect(resolveAdapter("")).toBeNull();
  });

  it("ships exactly the 8 agents specified by the spec", () => {
    expect(knownAgents().sort()).toEqual(
      [
        "claude-code",
        "codex",
        "cursor",
        "gemini-cli",
        "hermes",
        "openclaw",
        "openhuman",
        "pi",
      ].sort(),
    );
    expect(ADAPTERS.length).toBe(8);
  });

  it("every adapter exposes detect() and install()", () => {
    for (const a of ADAPTERS) {
      expect(typeof a.detect).toBe("function");
      expect(typeof a.install).toBe("function");
      expect(typeof a.name).toBe("string");
      expect(typeof a.displayName).toBe("string");
    }
  });
});

describe("agentmemory connect — claude-code adapter (mock filesystem)", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "am-connect-"));
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserprofile !== undefined)
      process.env["USERPROFILE"] = originalUserprofile;
    else delete process.env["USERPROFILE"];
    rmSync(tmpHome, { recursive: true, force: true });
    vi.resetModules();
  });

  async function loadAdapter(): Promise<ConnectAdapter> {
    const mod = await import("../src/cli/connect/claude-code.js?t=" + Date.now());
    return (mod as { adapter: ConnectAdapter }).adapter;
  }

  it("detect() returns false when ~/.claude doesn't exist", async () => {
    const a = await loadAdapter();
    expect(a.detect()).toBe(false);
  });

  it("install() writes mcpServers.agentmemory into ~/.claude.json and is idempotent", async () => {
    const claudeDir = join(tmpHome, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(tmpHome, ".claude.json"),
      JSON.stringify({ mcpServers: { other: { command: "x" } } }),
    );

    const a = await loadAdapter();
    expect(a.detect()).toBe(true);

    const first = await a.install({ dryRun: false, force: false });
    expect(first.kind).toBe("installed");

    const config = JSON.parse(readFileSync(join(tmpHome, ".claude.json"), "utf-8"));
    expect(config.mcpServers.agentmemory.command).toBe("npx");
    expect(config.mcpServers.agentmemory.args).toContain("@agentmemory/mcp");
    expect(config.mcpServers.other.command).toBe("x");

    const second = await a.install({ dryRun: false, force: false });
    expect(second.kind).toBe("already-wired");
  });

  it("install() writes env passthrough block for AGENTMEMORY_URL + AGENTMEMORY_SECRET (#375)", async () => {
    // Remote deployments (k8s, reverse proxy) set AGENTMEMORY_URL +
    // AGENTMEMORY_SECRET in the shell. The wired MCP entry must honour
    // those via ${VAR} expansion so a single entry covers both local
    // and remote without the user needing to add a duplicate config
    // that triggers a /doctor duplicate-server warning.
    const claudeDir = join(tmpHome, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(tmpHome, ".claude.json"), JSON.stringify({}));

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const config = JSON.parse(readFileSync(join(tmpHome, ".claude.json"), "utf-8"));
    const entry = config.mcpServers.agentmemory;
    expect(entry.env).toBeDefined();
    expect(entry.env.AGENTMEMORY_URL).toBe("${AGENTMEMORY_URL}");
    expect(entry.env.AGENTMEMORY_SECRET).toBe("${AGENTMEMORY_SECRET}");
  });

  it("install() with --force re-writes even when already wired", async () => {
    mkdirSync(join(tmpHome, ".claude"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          agentmemory: { command: "npx", args: ["-y", "@agentmemory/mcp"] },
        },
      }),
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: true });
    expect(result.kind).toBe("installed");
  });

  it("install() with --dry-run does not mutate the file", async () => {
    mkdirSync(join(tmpHome, ".claude"), { recursive: true });
    const before = JSON.stringify({ mcpServers: {} });
    writeFileSync(join(tmpHome, ".claude.json"), before);

    const a = await loadAdapter();
    const result = await a.install({ dryRun: true, force: false });
    expect(result.kind).toBe("installed");

    const after = readFileSync(join(tmpHome, ".claude.json"), "utf-8");
    expect(after).toBe(before);
  });

  it("install() creates a backup file under ~/.agentmemory/backups/", async () => {
    mkdirSync(join(tmpHome, ".claude"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".claude.json"),
      JSON.stringify({ mcpServers: {} }),
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    if (result.kind === "installed") {
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
      expect(result.backupPath!).toContain(".agentmemory/backups");
    }
  });
});

describe("agentmemory connect — codex adapter (mock filesystem)", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "am-connect-codex-"));
    originalHome = process.env["HOME"];
    originalUserprofile = process.env["USERPROFILE"];
    process.env["HOME"] = tmpHome;
    process.env["USERPROFILE"] = tmpHome;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env["HOME"] = originalHome;
    else delete process.env["HOME"];
    if (originalUserprofile !== undefined)
      process.env["USERPROFILE"] = originalUserprofile;
    else delete process.env["USERPROFILE"];
    rmSync(tmpHome, { recursive: true, force: true });
    vi.resetModules();
  });

  async function loadAdapter(): Promise<ConnectAdapter> {
    const mod = await import("../src/cli/connect/codex.js?t=" + Date.now());
    return (mod as { adapter: ConnectAdapter }).adapter;
  }

  function mkdirCodex(): void {
    mkdirSync(join(tmpHome, ".codex"), { recursive: true });
  }

  function writeInstalledCodexPlugin(): string {
    const root = join(
      tmpHome,
      ".codex/plugins/cache/agentmemory/agentmemory/0.9.20",
    );
    mkdirSync(join(root, ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, "hooks"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(
      join(root, ".codex-plugin/plugin.json"),
      JSON.stringify({ name: "agentmemory" }),
    );
    writeFileSync(join(root, "hooks/hooks.codex.json"), JSON.stringify({ hooks: {} }));
    for (const script of [
      "session-start.mjs",
      "prompt-submit.mjs",
      "pre-tool-use.mjs",
      "post-tool-use.mjs",
      "pre-compact.mjs",
      "stop.mjs",
    ]) {
      writeFileSync(join(root, "scripts", script), "");
    }
    return root;
  }

  it("detect() returns false when ~/.codex doesn't exist", async () => {
    const a = await loadAdapter();
    expect(a.detect()).toBe(false);
  });

  it("install() writes MCP config plus config-layer lifecycle hooks", async () => {
    mkdirCodex();

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const toml = readFileSync(join(tmpHome, ".codex/config.toml"), "utf-8");
    expect(toml).toContain("[mcp_servers.agentmemory]");
    expect(toml).toContain('@agentmemory/mcp');

    const hooks = JSON.parse(
      readFileSync(join(tmpHome, ".codex/hooks.json"), "utf-8"),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
    expect(Object.keys(hooks.hooks)).toEqual(
      expect.arrayContaining([
        "SessionStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "PreCompact",
        "Stop",
      ]),
    );
    const postToolUse = hooks.hooks.PostToolUse[0].hooks[0].command;
    expect(postToolUse).toContain("plugin/scripts/post-tool-use.mjs");
    expect(postToolUse).not.toContain("CLAUDE_PLUGIN_ROOT");
  });

  it("install() backfills hooks when MCP config is already wired", async () => {
    mkdirCodex();
    writeFileSync(
      join(tmpHome, ".codex/config.toml"),
      '[mcp_servers.agentmemory]\ncommand = "npx"\n',
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const hooks = readFileSync(join(tmpHome, ".codex/hooks.json"), "utf-8");
    expect(hooks).toContain("post-tool-use.mjs");
  });

  it("install() prefers the installed Codex plugin cache over the current package path", async () => {
    mkdirCodex();
    const installedRoot = writeInstalledCodexPlugin();

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const hooks = JSON.parse(
      readFileSync(join(tmpHome, ".codex/hooks.json"), "utf-8"),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
    const postToolUse = hooks.hooks.PostToolUse[0].hooks[0].command;
    expect(postToolUse).toContain(installedRoot);
    expect(postToolUse).not.toContain("src/cli/connect");
  });

  it("install() preserves unrelated user hooks", async () => {
    mkdirCodex();
    writeFileSync(
      join(tmpHome, ".codex/hooks.json"),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { hooks: [{ type: "command", command: "echo keep-me" }] },
          ],
        },
      }),
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const hooks = JSON.parse(
      readFileSync(join(tmpHome, ".codex/hooks.json"), "utf-8"),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
    const commands = hooks.hooks.UserPromptSubmit.flatMap((entry) =>
      entry.hooks.map((hook) => hook.command),
    );
    expect(commands).toContain("echo keep-me");
    expect(commands.some((command) => command.includes("prompt-submit.mjs"))).toBe(true);
  });

  it("install() deduplicates stale agentmemory hook entries while preserving unrelated hooks", async () => {
    mkdirCodex();
    writeFileSync(
      join(tmpHome, ".codex/hooks.json"),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                { type: "command", command: "echo keep-me" },
                { type: "command", command: "node /old/agentmemory/path/prompt-submit.mjs" },
                { type: "command", command: "node /old/agentmemory/path/prompt-submit.mjs" },
              ],
            },
          ],
        },
      }),
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const hooks = JSON.parse(
      readFileSync(join(tmpHome, ".codex/hooks.json"), "utf-8"),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
    const commands = hooks.hooks.UserPromptSubmit.flatMap((entry) =>
      entry.hooks.map((hook) => hook.command),
    );
    expect(commands).toContain("echo keep-me");
    expect(commands.filter((command) => command.includes("prompt-submit.mjs"))).toHaveLength(1);
  });

  it("install() is idempotent once MCP and hooks are both wired", async () => {
    mkdirCodex();

    const a = await loadAdapter();
    const first = await a.install({ dryRun: false, force: false });
    expect(first.kind).toBe("installed");

    const second = await a.install({ dryRun: false, force: false });
    expect(second.kind).toBe("already-wired");
  });
});

describe("agentmemory connect — stub adapters log + return stub", () => {
  it("hermes adapter returns stub regardless of detect", async () => {
    const { adapter } = await import("../src/cli/connect/hermes.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("stub");
  });

  it("openhuman adapter returns stub", async () => {
    const { adapter } = await import("../src/cli/connect/openhuman.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("stub");
  });

  it("pi adapter returns stub", async () => {
    const { adapter } = await import("../src/cli/connect/pi.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("stub");
  });
});
