import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installTarget } from "../src/installers.js";

const tmpRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "agentmemory-installers-"));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  while (tmpRoots.length) {
    const root = tmpRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("installTarget", () => {
  it("writes OpenCode plugin and config", () => {
    const root = tempRoot();
    const result = installTarget("opencode", { projectRoot: root });
    expect(result.filesWritten.some((p) => p.endsWith("agentmemory.js"))).toBe(true);
    const config = JSON.parse(readFileSync(join(root, "opencode.json"), "utf8"));
    expect(config.mcp.agentmemory.command).toEqual(["npx", "-y", "@agentmemory/mcp"]);
  });

  it("writes Cursor MCP config", () => {
    const root = tempRoot();
    installTarget("cursor", { projectRoot: root });
    const mcp = JSON.parse(readFileSync(join(root, ".cursor", "mcp.json"), "utf8"));
    expect(mcp.mcpServers.agentmemory.command).toBe("npx");
  });

  it("writes Codex hooks and config", () => {
    const root = tempRoot();
    installTarget("codex", { projectRoot: root });
    const hooks = JSON.parse(readFileSync(join(root, ".codex", "hooks.json"), "utf8"));
    const config = readFileSync(join(root, ".codex", "config.toml"), "utf8");
    expect(hooks.hooks.SessionStart[0].hooks[0].command).toContain("codex.mjs");
    expect(config).toContain("codex_hooks = true");
    expect(config).toContain("[mcp_servers.agentmemory]");
  });

  it("writes Roo MCP config and Kilo JSONC config", () => {
    const root = tempRoot();
    installTarget("roo", { projectRoot: root });
    installTarget("kilo", { projectRoot: root });
    const roo = JSON.parse(readFileSync(join(root, ".roo", "mcp.json"), "utf8"));
    const kilo = JSON.parse(readFileSync(join(root, ".kilo", "kilo.jsonc"), "utf8")) as Record<string, any>;
    expect(roo.mcpServers.agentmemory.command).toBe("npx");
    expect(kilo.mcp.agentmemory.command).toEqual(["npx", "-y", "@agentmemory/mcp"]);
  });

  it("preserves JSONC-based existing server entries when merging", () => {
    const root = tempRoot();
    const cursorDir = join(root, ".cursor");
    const kiloDir = join(root, ".kilo");
    mkdirSync(cursorDir, { recursive: true });
    mkdirSync(kiloDir, { recursive: true });
    writeFileSync(
      join(cursorDir, "mcp.json"),
      '{\n  // comment\n  "mcpServers": {\n    "existing": {"command": "foo"}\n  }\n}\n',
      "utf8",
    );
    writeFileSync(
      join(kiloDir, "kilo.jsonc"),
      '{\n  // comment\n  "mcp": {\n    "existing": {"type": "local", "command": ["foo"]}\n  }\n}\n',
      "utf8",
    );

    installTarget("cursor", { projectRoot: root });
    installTarget("kilo", { projectRoot: root });

    const cursor = JSON.parse(readFileSync(join(cursorDir, "mcp.json"), "utf8")) as Record<string, any>;
    const kilo = JSON.parse(readFileSync(join(kiloDir, "kilo.jsonc"), "utf8")) as Record<string, any>;
    expect(cursor.mcpServers.existing.command).toBe("foo");
    expect(cursor.mcpServers.agentmemory.command).toBe("npx");
    expect(kilo.mcp.existing.command).toEqual(["foo"]);
    expect(kilo.mcp.agentmemory.command).toEqual(["npx", "-y", "@agentmemory/mcp"]);
  });

  it("reuses native .jsonc paths when they already exist", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "opencode.jsonc"),
      '{\n  // comment\n  "mcp": {"existing": {"type": "local", "command": ["foo"]}}\n}\n',
      "utf8",
    );
    mkdirSync(join(root, ".kilo"), { recursive: true });
    writeFileSync(
      join(root, "kilo.jsonc"),
      '{\n  // comment\n  "mcp": {"existing": {"type": "local", "command": ["foo"]}}\n}\n',
      "utf8",
    );

    const opencode = installTarget("opencode", { projectRoot: root });
    const kilo = installTarget("kilo", { projectRoot: root });

    expect(opencode.filesWritten.some((p) => p.endsWith("opencode.jsonc"))).toBe(true);
    expect(kilo.filesWritten.some((p) => p.endsWith("kilo.jsonc"))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, "opencode.jsonc"), "utf8"))).toMatchObject({
      mcp: { existing: { command: ["foo"] }, agentmemory: { enabled: true } },
    });
    expect(JSON.parse(readFileSync(join(root, "kilo.jsonc"), "utf8"))).toMatchObject({
      mcp: { existing: { command: ["foo"] }, agentmemory: { enabled: true } },
    });
  });
});
