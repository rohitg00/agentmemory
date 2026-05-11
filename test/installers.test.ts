import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  it("writes Cursor hooks and MCP config", () => {
    const root = tempRoot();
    installTarget("cursor", { projectRoot: root });
    const hooks = JSON.parse(readFileSync(join(root, ".cursor", "hooks.json"), "utf8"));
    const mcp = JSON.parse(readFileSync(join(root, ".cursor", "mcp.json"), "utf8"));
    expect(hooks.hooks.sessionStart[0].command).toContain("cursor.mjs");
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

  it("writes Roo and Kilo MCP configs", () => {
    const root = tempRoot();
    installTarget("roo", { projectRoot: root });
    installTarget("kilo", { projectRoot: root });
    const roo = JSON.parse(readFileSync(join(root, ".roo", "mcp.json"), "utf8"));
    const kilo = JSON.parse(readFileSync(join(root, ".kilocode", "mcp.json"), "utf8"));
    expect(roo.mcpServers.agentmemory.command).toBe("npx");
    expect(kilo.mcpServers.agentmemory.command).toBe("npx");
  });
});
