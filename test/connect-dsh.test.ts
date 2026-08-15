import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// DeepSeek Harness adapter: appends an @deepseek-ai/dsh-mcp-client row to
// the home-level $DSH_HOME/cordis.patch.yml, the machine-local patch layer
// every profile loads.

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "am-dsh-"));
}

describe("connect: DeepSeek Harness", () => {
  let home: string;
  const ORIG_HOME = process.env["HOME"];
  const ORIG_USERPROFILE = process.env["USERPROFILE"];
  const ORIG_DSH_HOME = process.env["DSH_HOME"];

  beforeEach(() => {
    home = freshHome();
    vi.resetModules();
    process.env["HOME"] = home;
    process.env["USERPROFILE"] = home;
    delete process.env["DSH_HOME"];
  });
  afterEach(() => {
    if (ORIG_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIG_HOME;
    if (ORIG_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIG_USERPROFILE;
    if (ORIG_DSH_HOME === undefined) delete process.env["DSH_HOME"];
    else process.env["DSH_HOME"] = ORIG_DSH_HOME;
    rmSync(home, { recursive: true, force: true });
  });

  it("does not detect when ~/.dsh/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/dsh.js");
    expect(adapter.detect()).toBe(false);
  });

  it("honors DSH_HOME over ~/.dsh", async () => {
    const custom = join(home, "custom-dsh");
    mkdirSync(custom, { recursive: true });
    process.env["DSH_HOME"] = custom;
    const { adapter } = await import("../src/cli/connect/dsh.js");
    expect(adapter.detect()).toBe(true);
    await adapter.install({ dryRun: false, force: false });
    expect(existsSync(join(custom, "cordis.patch.yml"))).toBe(true);
  });

  it("appends the mcp-client row to a fresh cordis.patch.yml", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/dsh.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    expect(patch).toContain("- insert:");
    expect(patch).toContain("name: '@deepseek-ai/dsh-mcp-client'");
    expect(patch).toContain("serverName: agentmemory");
    expect(patch).toContain("transport: stdio");
    expect(patch).toContain("args: ['-y', '@agentmemory/mcp']");
    expect(patch).toContain("AGENTMEMORY_URL: http://localhost:3111");
  });

  it("preserves existing patch rows when appending", async () => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "cordis.patch.yml"),
      "- id: hmr\n  disabled: true\n",
      "utf-8",
    );
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: false });
    const patch = readFileSync(join(dir, "cordis.patch.yml"), "utf-8");
    expect(patch).toContain("- id: hmr");
    expect(patch).toContain("serverName: agentmemory");
  });

  it("is idempotent without --force", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: false });
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("already-wired");
    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    expect(patch.match(/serverName: agentmemory/g)).toHaveLength(1);
  });

  it("--force replaces the existing row instead of duplicating", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: false });
    const result = await adapter.install({ dryRun: false, force: true });
    expect(result.kind).toBe("installed");
    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    expect(patch.match(/serverName: agentmemory/g)).toHaveLength(1);
    expect(patch.match(/- insert:/g)).toHaveLength(1);
  });

  it("dry-run mutates nothing", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/dsh.js");
    const result = await adapter.install({ dryRun: true, force: false });
    expect(result.kind).toBe("installed");
    expect(existsSync(join(home, ".dsh", "cordis.patch.yml"))).toBe(false);
  });

  it("--with-hooks writes the manifest and the hooks-claude-code row", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/dsh.js");
    const result = await adapter.install({
      dryRun: false,
      force: false,
      withHooks: true,
    });
    expect(result.kind).toBe("installed");

    const hooksPath = join(home, ".dsh", "agentmemory.hooks.json");
    expect(existsSync(hooksPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(hooksPath, "utf-8"));
    // Bridge-supported events from the bundled Claude Code shaped manifest.
    for (const ev of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]) {
      expect(manifest.hooks[ev]).toBeDefined();
    }
    // Commands are resolved to absolute paths, no env placeholders left.
    const flat = JSON.stringify(manifest);
    expect(flat).not.toContain("${CLAUDE_PLUGIN_ROOT}");

    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    expect(patch).toContain("id: agentmemory-hooks");
    expect(patch).toContain("name: '@deepseek-ai/dsh-hooks-claude-code'");
    expect(patch).toContain(`configPath: ${JSON.stringify(hooksPath)}`);
    // MCP row still present alongside.
    expect(patch).toContain("serverName: agentmemory");
  });

  it("MCP-only install after --with-hooks keeps the hooks row intact", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: false, withHooks: true });
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("already-wired");
    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    expect(patch).toContain("id: agentmemory-hooks");
    expect(patch).toContain("serverName: agentmemory");
  });

  it("--with-hooks after MCP-only adds the hooks row without duplicating MCP", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: false });
    const result = await adapter.install({
      dryRun: false,
      force: false,
      withHooks: true,
    });
    expect(result.kind).toBe("installed");
    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    expect(patch.match(/serverName: agentmemory/g)).toHaveLength(1);
    expect(patch.match(/id: agentmemory-hooks/g)).toHaveLength(1);
  });

  it("--force --with-hooks replaces both rows without duplicating", async () => {
    mkdirSync(join(home, ".dsh"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: false, withHooks: true });
    const result = await adapter.install({
      dryRun: false,
      force: true,
      withHooks: true,
    });
    expect(result.kind).toBe("installed");
    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    expect(patch.match(/serverName: agentmemory/g)).toHaveLength(1);
    expect(patch.match(/id: agentmemory-hooks/g)).toHaveLength(1);
  });
});
