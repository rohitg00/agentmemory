import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";

// Connect adapter for Amp (Sourcegraph). Writes the canonical MCP
// block into amp.mcpServers (Amp's wrapper key, not the standard
// mcpServers) in the Amp settings.json. On Windows the config dir is
// %APPDATA%/amp; on macOS/Linux it is ~/.config/amp.

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "am-connect-amp-"));
}

// Returns the config directory that the adapter will actually use,
// mirroring ampConfigDir() in the adapter source.
function ampConfigDir(home: string): string {
  if (platform() === "win32") {
    const appdata = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
    return join(appdata, "amp");
  }
  return join(home, ".config", "amp");
}

describe("connect: Amp", () => {
  let home: string;
  const ORIG_HOME = process.env["HOME"];
  const ORIG_APPDATA = process.env["APPDATA"];

  beforeEach(() => {
    home = freshHome();
    vi.resetModules();
    process.env["HOME"] = home;
    process.env["APPDATA"] = join(home, "AppData", "Roaming");
  });

  afterEach(() => {
    process.env["HOME"] = ORIG_HOME;
    if (ORIG_APPDATA !== undefined) {
      process.env["APPDATA"] = ORIG_APPDATA;
    } else {
      delete process.env["APPDATA"];
    }
    rmSync(home, { recursive: true, force: true });
  });

  it("does not detect when amp config dir is absent", async () => {
    const { adapter } = await import("../src/cli/connect/amp.js");
    expect(adapter.detect()).toBe(false);
  });

  it("writes amp.mcpServers.agentmemory to settings.json", async () => {
    const configDir = ampConfigDir(home);
    mkdirSync(configDir, { recursive: true });
    const { adapter } = await import("../src/cli/connect/amp.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfgPath = join(configDir, "settings.json");
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    // Amp uses "amp.mcpServers" as the wrapper key
    expect(cfg["amp.mcpServers"].agentmemory.command).toBe("npx");
    expect(cfg["amp.mcpServers"].agentmemory.args).toContain("@agentmemory/mcp");
    expect(cfg["amp.mcpServers"].agentmemory.env.AGENTMEMORY_URL).toMatch(
      /\$\{AGENTMEMORY_URL:-/,
    );
    // Standard mcpServers should NOT be present (Amp uses amp.mcpServers)
    expect(cfg.mcpServers).toBeUndefined();
  });

  it("returns already-wired when agentmemory is already configured", async () => {
    const configDir = ampConfigDir(home);
    mkdirSync(configDir, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(configDir, "settings.json"),
      JSON.stringify({
        "amp.mcpServers": {
          agentmemory: {
            command: "npx",
            args: ["-y", "@agentmemory/mcp"],
            env: { AGENTMEMORY_URL: "${AGENTMEMORY_URL:-http://localhost:3111}" },
          },
        },
      }),
    );
    const { adapter } = await import("../src/cli/connect/amp.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("already-wired");
  });

  it("overwrites when --force is passed", async () => {
    const configDir = ampConfigDir(home);
    mkdirSync(configDir, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(configDir, "settings.json"),
      JSON.stringify({
        "amp.mcpServers": {
          agentmemory: { command: "old", args: [], env: {} },
        },
      }),
    );
    const { adapter } = await import("../src/cli/connect/amp.js");
    const result = await adapter.install({ dryRun: false, force: true });
    expect(result.kind).toBe("installed");
    const cfg = JSON.parse(readFileSync(join(configDir, "settings.json"), "utf-8"));
    expect(cfg["amp.mcpServers"].agentmemory.command).toBe("npx");
  });

  it("preserves existing settings when writing MCP config", async () => {
    const configDir = ampConfigDir(home);
    mkdirSync(configDir, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(configDir, "settings.json"),
      JSON.stringify({ amp: { someSetting: true } }),
    );
    const { adapter } = await import("../src/cli/connect/amp.js");
    await adapter.install({ dryRun: false, force: false });
    const cfg = JSON.parse(readFileSync(join(configDir, "settings.json"), "utf-8"));
    expect(cfg.amp.someSetting).toBe(true);
    expect(cfg["amp.mcpServers"].agentmemory).toBeDefined();
  });

  it("dry-run does not write any file", async () => {
    const configDir = ampConfigDir(home);
    mkdirSync(configDir, { recursive: true });
    const { adapter } = await import("../src/cli/connect/amp.js");
    const result = await adapter.install({ dryRun: true, force: false });
    expect(result.kind).toBe("installed");
    expect(existsSync(join(configDir, "settings.json"))).toBe(false);
  });
});

describe("connect: Amp registered in ADAPTERS", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("knownAgents includes amp", async () => {
    const { knownAgents } = await import("../src/cli/connect/index.js");
    const agents = knownAgents();
    expect(agents).toContain("amp");
  });

  it("resolveAdapter finds amp", async () => {
    const { resolveAdapter } = await import("../src/cli/connect/index.js");
    const adapter = resolveAdapter("amp");
    expect(adapter).not.toBeNull();
    expect(adapter?.name).toBe("amp");
    expect(adapter?.category).toBe("native");
  });
});