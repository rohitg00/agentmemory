import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync(".cursor-plugin/plugin.json", "utf-8"));
const hooks = JSON.parse(readFileSync("plugin/cursor/hooks.json", "utf-8"));
const mcp = JSON.parse(readFileSync("plugin/cursor/mcp.json", "utf-8"));

const CURSOR_HOOK_EVENTS = new Set([
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "subagentStart",
  "subagentStop",
  "beforeShellExecution",
  "afterShellExecution",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeReadFile",
  "afterFileEdit",
  "beforeSubmitPrompt",
  "preCompact",
  "stop",
  "afterAgentResponse",
  "afterAgentThought",
  "beforeTabFileRead",
  "afterTabFileEdit",
  "workspaceOpen",
]);

describe("Cursor plugin manifest", () => {
  it("has a kebab-case name and version matching the package", () => {
    expect(manifest.name).toMatch(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/);
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    expect(manifest.version).toBe(pkg.version);
  });

  it("references only paths that exist in the repo", () => {
    for (const p of [
      manifest.skills,
      manifest.hooks,
      manifest.mcpServers,
      manifest.logo,
    ]) {
      expect(typeof p).toBe("string");
      expect(p.includes("..")).toBe(false);
      expect(p.startsWith("/")).toBe(false);
      expect(existsSync(p)).toBe(true);
    }
  });

  it("skills path points at the shipped skill set", () => {
    expect(existsSync(join(manifest.skills, "recall", "SKILL.md"))).toBe(true);
    expect(existsSync(join(manifest.skills, "memory-discipline", "SKILL.md"))).toBe(
      true,
    );
  });
});

describe("Cursor plugin hooks config", () => {
  it("uses the native format with known event names", () => {
    expect(hooks.version).toBe(1);
    for (const event of Object.keys(hooks.hooks)) {
      expect(CURSOR_HOOK_EVENTS.has(event)).toBe(true);
    }
  });

  it("every hook command resolves from the plugin root to a built script", () => {
    for (const entries of Object.values(hooks.hooks) as Array<
      Array<{ command: string }>
    >) {
      for (const entry of entries) {
        expect(entry.command).toContain("${CURSOR_PLUGIN_ROOT}/");
        const script = entry.command.match(/plugin\/scripts\/\S+\.mjs/)?.[0];
        expect(script).toBeDefined();
        expect(existsSync(script!)).toBe(true);
      }
    }
  });
});

describe("Cursor plugin MCP config", () => {
  it("declares every ${VAR} placeholder in the manifest variables schema", () => {
    const raw = readFileSync("plugin/cursor/mcp.json", "utf-8");
    const vars = [...raw.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(0);
    for (const v of vars) {
      expect(manifest.variables.properties[v]).toBeDefined();
    }
  });

  it("wires the standalone MCP shim over stdio", () => {
    const server = mcp.mcpServers.agentmemory;
    expect(server.command).toBe("npx");
    expect(server.args).toContain("@agentmemory/mcp");
  });
});
