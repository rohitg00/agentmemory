import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";

// Connect adapters for Qwen Code, Antigravity, and Kiro. Each writes
// the canonical MCP block (npx @agentmemory/mcp + env defaults) into
// the agent's documented config path.

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "am-connect-"));
}

describe("connect: Qwen Code", () => {
  let home: string;
  const ORIG = process.env["HOME"];
  beforeEach(() => {
    home = freshHome();
    vi.resetModules();
    process.env["HOME"] = home;
  });
  afterEach(() => {
    process.env["HOME"] = ORIG;
    rmSync(home, { recursive: true, force: true });
  });

  it("does not detect when ~/.qwen/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/qwen.js");
    expect(adapter.detect()).toBe(false);
  });

  it("writes mcpServers.agentmemory to ~/.qwen/settings.json", async () => {
    mkdirSync(join(home, ".qwen"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/qwen.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfg = JSON.parse(
      readFileSync(join(home, ".qwen", "settings.json"), "utf-8"),
    );
    expect(cfg.mcpServers.agentmemory.command).toBe("npx");
    expect(cfg.mcpServers.agentmemory.args).toContain("@agentmemory/mcp");
    expect(cfg.mcpServers.agentmemory.env.AGENTMEMORY_URL).toMatch(
      /\$\{AGENTMEMORY_URL:-/,
    );
    expect(cfg.mcpServers.agentmemory.env.AGENTMEMORY_TOOLS).toMatch(
      /\$\{AGENTMEMORY_TOOLS:-all\}/,
    );
  });
});

describe("connect: Antigravity", () => {
  let home: string;
  const ORIG = process.env["HOME"];
  beforeEach(() => {
    home = freshHome();
    vi.resetModules();
    process.env["HOME"] = home;
  });
  afterEach(() => {
    process.env["HOME"] = ORIG;
    rmSync(home, { recursive: true, force: true });
  });

  it("writes mcpServers.agentmemory to the platform-specific config path", async () => {
    const isMac = platform() === "darwin";
    const userDir = isMac
      ? join(home, "Library", "Application Support", "Antigravity", "User")
      : join(home, ".config", "Antigravity", "User");
    mkdirSync(userDir, { recursive: true });
    const { adapter } = await import("../src/cli/connect/antigravity.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfg = JSON.parse(
      readFileSync(join(userDir, "mcp_config.json"), "utf-8"),
    );
    expect(cfg.mcpServers.agentmemory.command).toBe("npx");
    expect(cfg.mcpServers.agentmemory.env.AGENTMEMORY_URL).toMatch(
      /\$\{AGENTMEMORY_URL:-/,
    );
  });
});

describe("connect: Kiro", () => {
  let home: string;
  const ORIG = process.env["HOME"];
  beforeEach(() => {
    home = freshHome();
    vi.resetModules();
    process.env["HOME"] = home;
  });
  afterEach(() => {
    process.env["HOME"] = ORIG;
    rmSync(home, { recursive: true, force: true });
  });

  it("does not detect when ~/.kiro/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/kiro.js");
    expect(adapter.detect()).toBe(false);
  });

  it("writes mcpServers.agentmemory to ~/.kiro/settings/mcp.json", async () => {
    mkdirSync(join(home, ".kiro"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/kiro.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfgPath = join(home, ".kiro", "settings", "mcp.json");
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    expect(cfg.mcpServers.agentmemory.command).toBe("npx");
    expect(cfg.mcpServers.agentmemory.args).toContain("@agentmemory/mcp");
  });
});

describe("connect: all three agents registered in ADAPTERS", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("knownAgents includes qwen, antigravity, kiro", async () => {
    const { knownAgents } = await import("../src/cli/connect/index.js");
    const agents = knownAgents();
    expect(agents).toContain("qwen");
    expect(agents).toContain("antigravity");
    expect(agents).toContain("kiro");
  });
});
