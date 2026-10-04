import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { ConnectAdapter } from "../src/cli/connect/types.js";

describe("agentmemory connect — codex adapter (mock filesystem)", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserprofile: string | undefined;
  let importCounter = 0;

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
    const mod = await import(
      "../src/cli/connect/codex.js?t=" + Date.now() + "-" + importCounter++
    );
    return (mod as { adapter: ConnectAdapter }).adapter;
  }

  it("detect() returns false when ~/.codex doesn't exist", async () => {
    const a = await loadAdapter();
    expect(a.detect()).toBe(false);
  });

  it("install() writes a stdio MCP server block for Codex", async () => {
    const codexDir = join(tmpHome, ".codex");
    require("node:fs").mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, "config.toml"), "");

    const a = await loadAdapter();
    expect(a.detect()).toBe(true);

    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const config = readFileSync(join(codexDir, "config.toml"), "utf-8");
    expect(config).toContain("[mcp_servers.agentmemory]");
    expect(config).toContain('type = "stdio"');
    expect(config).toContain('command = "npx"');
    expect(config).toContain('args = ["-y", "@agentmemory/mcp"]');
    expect(config).toContain("[mcp_servers.agentmemory.env]");
    expect(config).toContain('AGENTMEMORY_URL = "http://localhost:3111"');
  });

  it("install() creates a backup when rewriting an existing Codex config", async () => {
    const codexDir = join(tmpHome, ".codex");
    require("node:fs").mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, "config.toml"), "[projects.\"/tmp\"]\ntrust_level = \"trusted\"\n");

    const a = await loadAdapter();
    const result = await a.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    if (result.kind === "installed") {
      expect(result.backupPath).toBeDefined();
      expect(existsSync(result.backupPath!)).toBe(true);
    }
  });
});
