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

describe("connect: Warp", () => {
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

  it("does not detect when ~/.warp/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/warp.js");
    expect(adapter.detect()).toBe(false);
  });

  it("writes mcpServers.agentmemory to ~/.warp/.mcp.json", async () => {
    mkdirSync(join(home, ".warp"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/warp.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfgPath = join(home, ".warp", ".mcp.json");
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    expect(cfg.mcpServers.agentmemory.command).toBe("npx");
    expect(cfg.mcpServers.agentmemory.args).toContain("@agentmemory/mcp");
    expect(cfg.mcpServers.agentmemory.env.AGENTMEMORY_URL).toMatch(
      /\$\{AGENTMEMORY_URL:-/,
    );
  });
});

describe("connect: Cline", () => {
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

  it("does not detect when ~/.cline/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/cline.js");
    expect(adapter.detect()).toBe(false);
  });

  it("writes mcpServers.agentmemory to ~/.cline/mcp.json", async () => {
    mkdirSync(join(home, ".cline"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/cline.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfg = JSON.parse(
      readFileSync(join(home, ".cline", "mcp.json"), "utf-8"),
    );
    expect(cfg.mcpServers.agentmemory.command).toBe("npx");
    expect(cfg.mcpServers.agentmemory.args).toContain("@agentmemory/mcp");
  });
});

describe("connect: Droid (Factory.ai)", () => {
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

  it("does not detect when ~/.factory/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/droid.js");
    expect(adapter.detect()).toBe(false);
  });

  it("writes mcpServers.agentmemory to ~/.factory/mcp.json with type:stdio", async () => {
    mkdirSync(join(home, ".factory"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/droid.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfg = JSON.parse(
      readFileSync(join(home, ".factory", "mcp.json"), "utf-8"),
    );
    expect(cfg.mcpServers.agentmemory.command).toBe("npx");
    expect(cfg.mcpServers.agentmemory.args).toContain("@agentmemory/mcp");
    // Droid requires `type` per its documented schema
    expect(cfg.mcpServers.agentmemory.type).toBe("stdio");
  });
});

describe("connect: Zed", () => {
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

  it("does not detect when ~/.config/zed/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/zed.js");
    expect(adapter.detect()).toBe(false);
  });

  it("writes context_servers.agentmemory to ~/.config/zed/settings.json", async () => {
    mkdirSync(join(home, ".config", "zed"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/zed.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfg = JSON.parse(
      readFileSync(join(home, ".config", "zed", "settings.json"), "utf-8"),
    );
    expect(cfg.context_servers.agentmemory.command).toBe("npx");
    expect(cfg.context_servers.agentmemory.args).toContain("@agentmemory/mcp");
    expect(cfg.mcpServers).toBeUndefined();
  });
});

describe("connect: Continue.dev", () => {
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

  it("does not detect when ~/.continue/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/continue.js");
    expect(adapter.detect()).toBe(false);
  });

  it("creates config.yaml from scratch when neither yaml nor json exists", async () => {
    mkdirSync(join(home, ".continue"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/continue.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const yamlPath = join(home, ".continue", "config.yaml");
    expect(existsSync(yamlPath)).toBe(true);
    expect(existsSync(join(home, ".continue", "config.json"))).toBe(false);
    const yaml = readFileSync(yamlPath, "utf-8");
    expect(yaml).toContain("mcpServers:");
    expect(yaml).toContain("name: agentmemory");
    expect(yaml).toContain("@agentmemory/mcp");
    expect(yaml).toContain("AGENTMEMORY_URL");
  });

  it("modifies existing legacy config.json", async () => {
    mkdirSync(join(home, ".continue"), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(home, ".continue", "config.json"),
      JSON.stringify({ models: [], mcpServers: [] }),
    );
    const { adapter } = await import("../src/cli/connect/continue.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const cfg = JSON.parse(
      readFileSync(join(home, ".continue", "config.json"), "utf-8"),
    );
    expect(Array.isArray(cfg.mcpServers)).toBe(true);
    const entry = cfg.mcpServers.find(
      (s: { name: string }) => s.name === "agentmemory",
    );
    expect(entry.command).toBe("npx");
    expect(entry.args).toContain("@agentmemory/mcp");
  });

  it("returns stub when config.yaml already exists (refuses silent yaml mutation)", async () => {
    mkdirSync(join(home, ".continue"), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(home, ".continue", "config.yaml"),
      "models: []\nmcpServers:\n  - name: existing\n    command: noop\n",
    );
    const { adapter } = await import("../src/cli/connect/continue.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("stub");
    // user's yaml must be untouched
    const yaml = readFileSync(
      join(home, ".continue", "config.yaml"),
      "utf-8",
    );
    expect(yaml).toContain("existing");
    expect(yaml).not.toContain("agentmemory");
  });
});

describe("connect: all eight new agents registered in ADAPTERS", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("knownAgents includes qwen, antigravity, kiro, warp, cline, continue, zed, droid", async () => {
    const { knownAgents } = await import("../src/cli/connect/index.js");
    const agents = knownAgents();
    for (const name of [
      "qwen",
      "antigravity",
      "kiro",
      "warp",
      "cline",
      "continue",
      "zed",
      "droid",
    ]) {
      expect(agents).toContain(name);
    }
  });
});
