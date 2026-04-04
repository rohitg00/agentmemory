import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { getAllTools } from "../src/mcp/tools-registry.js";
import { VERSION } from "../src/version.js";

const ROOT = join(import.meta.dirname, "..");

function readText(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

describe("Consistency checks", () => {
  const toolCount = getAllTools().length;

  it("version.ts matches package.json", () => {
    const pkg = JSON.parse(readText("package.json"));
    expect(VERSION).toBe(pkg.version);
  });

  it("plugin.json version matches package.json", () => {
    const pkg = JSON.parse(readText("package.json"));
    const plugin = JSON.parse(readText("plugin/.claude-plugin/plugin.json"));
    expect(plugin.version).toBe(pkg.version);
  });

  it("export-import.ts supports current version", () => {
    const src = readText("src/functions/export-import.ts");
    expect(src).toContain(`"${VERSION}"`);
  });

  it("README mentions correct MCP tool count", () => {
    const readme = readText("README.md");
    const toolCountPattern = new RegExp(`${toolCount}\\s+MCP tools`);
    expect(readme).toMatch(toolCountPattern);
    const toolResourcePattern = new RegExp(`${toolCount}\\s+tools,\\s+6\\s+resources`);
    expect(readme).toMatch(toolResourcePattern);
  });

  it("all tool names are unique", () => {
    const tools = getAllTools();
    const names = new Set(tools.map((t) => t.name));
    expect(names.size).toBe(tools.length);
  });

  it("all tools have name, description, and inputSchema", () => {
    for (const tool of getAllTools()) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});
