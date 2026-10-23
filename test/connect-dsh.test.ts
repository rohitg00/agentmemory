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
import { parseDocument } from "yaml";

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
    expect(parseDocument(patch).toJS()[0].insert[0].config.args).toEqual(["-y", "@agentmemory/mcp"]);
    expect(patch).toContain("AGENTMEMORY_URL:");
  });

  it("forwards the selected daemon and secret at dsh boot without storing credentials", async () => {
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: false });
    const patch = readFileSync(join(home, ".dsh", "cordis.patch.yml"), "utf-8");
    // dsh evaluates !!js values before constructing the scrubbed MCP child env.
    const doc = parseDocument(patch, {
      customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value: string) =>
        new Function("process", `return (${value})`)({ env: {
          AGENTMEMORY_URL: "http://127.0.0.1:43111",
          AGENTMEMORY_SECRET: "test-secret-not-for-config",
        } }) }],
    });
    expect(doc.errors).toEqual([]);
    expect(doc.toJS()[0].insert[0].config.env).toEqual({
      AGENTMEMORY_URL: "http://127.0.0.1:43111",
      AGENTMEMORY_SECRET: "test-secret-not-for-config",
    });
    expect(patch).not.toContain("test-secret-not-for-config");
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

  it.each([
    "[{id: hmr, disabled: true}]\n",
    "---\n- id: hmr\n  disabled: true\n...\n",
  ])("preserves a valid YAML document when installing: %s", async (existing) => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cordis.patch.yml"), existing);
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: false });
    const doc = parseDocument(readFileSync(join(dir, "cordis.patch.yml"), "utf-8"));
    expect(doc.errors).toEqual([]);
    expect(doc.toJS()[0]).toEqual({ id: "hmr", disabled: true });
    expect(doc.toJS()[1].insert[0].config.serverName).toBe("agentmemory");
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

  it.each([
    "# Example: serverName: agentmemory\n",
    "- insert:\n    - name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: agentmemory-other\n",
  ])("does not mistake a comment or another server for an installation: %s", async (existing) => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cordis.patch.yml"), existing);
    const { adapter } = await import("../src/cli/connect/dsh.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    const rows = parseDocument(readFileSync(join(dir, "cordis.patch.yml"), "utf-8")).toJS();
    expect(rows.flatMap((row: { insert: unknown[] }) => row.insert).filter(
      (entry: { config?: { serverName?: string } }) => entry.config?.serverName === "agentmemory",
    )).toHaveLength(1);
  });

  it("recognizes a quoted server name without overwriting its custom configuration", async () => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    const existing = "- insert:\n    - name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: 'agentmemory'\n        command: custom-mcp\n";
    writeFileSync(join(dir, "cordis.patch.yml"), existing);
    const { adapter } = await import("../src/cli/connect/dsh.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("already-wired");
    expect(readFileSync(join(dir, "cordis.patch.yml"), "utf-8")).toBe(existing);
  });

  it("adding hooks preserves an existing customized MCP server unless forced", async () => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    const server = { name: "@deepseek-ai/dsh-mcp-client", config: {
      serverName: "agentmemory", command: "custom-mcp", env: { AGENTMEMORY_URL: "https://memory.example.com" },
    } };
    writeFileSync(join(dir, "cordis.patch.yml"), JSON.stringify([{ insert: [server] }]));
    const { adapter } = await import("../src/cli/connect/dsh.js");
    const result = await adapter.install({ dryRun: false, force: false, withHooks: true });
    expect(result.kind).toBe("installed");
    const rows = parseDocument(readFileSync(join(dir, "cordis.patch.yml"), "utf-8")).toJS();
    expect(rows[0].insert[0]).toEqual(server);
    expect(rows[1].insert[0].id).toBe("agentmemory-hooks");
  });

  it.each(["- insert: [\n", "plugins: {}\n"])("rejects invalid patches without modifying them: %s", async (existing) => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, "cordis.patch.yml");
    writeFileSync(configPath, existing);
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await expect(adapter.install({ dryRun: false, force: true, withHooks: true })).rejects.toThrow("valid YAML sequence");
    expect(readFileSync(configPath, "utf-8")).toBe(existing);
    expect(existsSync(join(dir, "agentmemory.hooks.json"))).toBe(false);
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

  it("--force preserves sibling plugins in the same insert operation", async () => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cordis.patch.yml"), `# Personal plugins
- insert:
    - id: agentmemory
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: agentmemory
    # Keep my formatter
    - id: formatter
      name: my-formatter
      config:
        enabled: true
  before: assistant
`);
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: true });
    const patch = readFileSync(join(dir, "cordis.patch.yml"), "utf-8");
    expect(patch).toContain("id: formatter");
    expect(patch).toContain("name: my-formatter");
    expect(patch).toContain("# Keep my formatter");
    expect(patch).toContain("before: assistant");
    expect(patch.match(/serverName: agentmemory/g)).toHaveLength(1);
    const rows = parseDocument(patch).toJS();
    expect(rows).toHaveLength(1);
    expect(rows[0].insert.map((entry: { id: string }) => entry.id)).toEqual(["agentmemory", "formatter"]);
  });

  it.each([
    { id: "agentmemory", name: "@deepseek-ai/dsh-mcp-client", config: { serverName: "agentmemory", command: "old-command" } },
    { id: "agentmemory-hooks", name: "@deepseek-ai/dsh-hooks-claude-code", config: { configPath: "old-hooks.json" } },
  ])("--force preserves the sole $id entry's operation and position", async (entry) => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, "cordis.patch.yml");
    const operation = { insert: [entry], before: "assistant", root: "workspace" };
    writeFileSync(configPath, JSON.stringify([operation, { id: "hmr", disabled: true }]));
    const { adapter } = await import("../src/cli/connect/dsh.js");

    for (let i = 0; i < 2; i++) {
      await adapter.install({ dryRun: false, force: true, withHooks: entry.id === "agentmemory-hooks" });
      const doc = parseDocument(readFileSync(configPath, "utf-8"));
      expect(doc.errors).toEqual([]);
      const rows = doc.toJS();
      expect(rows[0]).toMatchObject({ before: "assistant", root: "workspace", insert: [{ id: entry.id, name: entry.name }] });
      expect(rows[0].insert).toHaveLength(1);
      expect(rows[0].insert[0].config).not.toEqual(entry.config);
      expect(rows[1]).toEqual({ id: "hmr", disabled: true });
    }
  });

  it("removes duplicate managed entries without deleting unrelated empty operations", async () => {
    const dir = join(home, ".dsh");
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, "cordis.patch.yml");
    const entry = { name: "@deepseek-ai/dsh-mcp-client", config: { serverName: "agentmemory" } };
    const emptyOperation = { insert: [], before: "untouched" };
    writeFileSync(configPath, JSON.stringify([emptyOperation, { insert: [entry, entry], before: "assistant" }, { insert: [entry] }]));
    const { adapter } = await import("../src/cli/connect/dsh.js");
    await adapter.install({ dryRun: false, force: true });
    const rows = parseDocument(readFileSync(configPath, "utf-8")).toJS();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(emptyOperation);
    expect(rows[1].before).toBe("assistant");
    expect(rows[1].insert).toHaveLength(1);
    expect(rows[1].insert[0].config.command).toBe("npx");
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
    expect(parseDocument(patch).toJS()[1].insert[0].config.configPath).toBe(hooksPath);
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
