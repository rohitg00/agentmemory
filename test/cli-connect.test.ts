import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
    require("node:fs").mkdirSync(claudeDir, { recursive: true });
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

  it("install() with --force re-writes even when already wired", async () => {
    require("node:fs").mkdirSync(join(tmpHome, ".claude"), { recursive: true });
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
    require("node:fs").mkdirSync(join(tmpHome, ".claude"), { recursive: true });
    const before = JSON.stringify({ mcpServers: {} });
    writeFileSync(join(tmpHome, ".claude.json"), before);

    const a = await loadAdapter();
    const result = await a.install({ dryRun: true, force: false });
    expect(result.kind).toBe("installed");

    const after = readFileSync(join(tmpHome, ".claude.json"), "utf-8");
    expect(after).toBe(before);
  });

  it("install() creates a backup file under ~/.agentmemory/backups/", async () => {
    require("node:fs").mkdirSync(join(tmpHome, ".claude"), { recursive: true });
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

describe("agentmemory connect — hermes adapter (mock filesystem)", () => {
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
    const mod = await import("../src/cli/connect/hermes.js?t=" + Date.now());
    return (mod as { adapter: ConnectAdapter }).adapter;
  }

  function mkdirHermes(): string {
    const hermesDir = join(tmpHome, ".hermes");
    require("node:fs").mkdirSync(hermesDir, { recursive: true });
    return hermesDir;
  }

  it("detect() returns false when ~/.hermes doesn't exist", async () => {
    const a = await loadAdapter();
    expect(a.detect()).toBe(false);
  });

  it("install() creates config.yaml with MCP server and memory provider", async () => {
    const hermesDir = mkdirHermes();
    const a = await loadAdapter();
    expect(a.detect()).toBe(true);

    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const config = readFileSync(join(hermesDir, "config.yaml"), "utf-8");
    expect(config).toContain("mcp_servers:");
    expect(config).toContain("  agentmemory:");
    expect(config).toContain("    command: npx");
    expect(config).toContain('    args: ["-y", "@agentmemory/mcp"]');
    expect(config).toContain("memory:");
    expect(config).toContain("  provider: agentmemory");
  });

  it("install() preserves existing mcp_servers entries and memory keys", async () => {
    const hermesDir = mkdirHermes();
    writeFileSync(
      join(hermesDir, "config.yaml"),
      [
        "mcp_servers:",
        "  other:",
        "    command: other-cmd",
        "",
        "memory:",
        "  provider: builtin",
        "  retain_days: 30",
        "",
      ].join("\n"),
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const config = readFileSync(join(hermesDir, "config.yaml"), "utf-8");
    expect(config).toContain("  other:\n    command: other-cmd");
    expect(config).toContain("  agentmemory:\n    command: npx");
    expect(config).toContain("  provider: agentmemory");
    expect(config).toContain("  retain_days: 30");
  });

  it("install() is idempotent when Hermes is already wired", async () => {
    const hermesDir = mkdirHermes();
    const wired = [
      "mcp_servers:",
      "  agentmemory:",
      "    command: npx",
      '    args: ["-y", "@agentmemory/mcp"]',
      "",
      "memory:",
      "  provider: agentmemory",
      "",
    ].join("\n");
    writeFileSync(join(hermesDir, "config.yaml"), wired);

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("already-wired");
    expect(readFileSync(join(hermesDir, "config.yaml"), "utf-8")).toBe(wired);
  });

  it("install() with --dry-run does not mutate config.yaml", async () => {
    const hermesDir = mkdirHermes();
    const before = "memory:\n  provider: builtin\n";
    writeFileSync(join(hermesDir, "config.yaml"), before);

    const a = await loadAdapter();
    const result = await a.install({ dryRun: true, force: false });
    expect(result.kind).toBe("installed");
    expect(readFileSync(join(hermesDir, "config.yaml"), "utf-8")).toBe(before);
  });

  it("install() creates a backup file for existing config.yaml", async () => {
    const hermesDir = mkdirHermes();
    writeFileSync(join(hermesDir, "config.yaml"), "memory:\n  provider: builtin\n");

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    if (result.kind === "installed") {
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
      expect(result.backupPath!).toContain(".agentmemory/backups");
    }
  });

  it("install() with --force re-writes even when already wired", async () => {
    const hermesDir = mkdirHermes();
    writeFileSync(
      join(hermesDir, "config.yaml"),
      "mcp_servers:\n  agentmemory:\n    command: old\n\nmemory:\n  provider: agentmemory\n",
    );

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: true });
    expect(result.kind).toBe("installed");
    const config = readFileSync(join(hermesDir, "config.yaml"), "utf-8");
    expect(config).toContain("    command: npx");
    expect(config).toContain('    args: ["-y", "@agentmemory/mcp"]');
  });
});

describe("agentmemory connect — stub adapters log + return stub", () => {
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
