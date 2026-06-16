import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getAllTools, ESSENTIAL_TOOLS } from "../src/mcp/tools-registry.js";

const ROOT = join(import.meta.dirname, "..");
const EXPECTED_TOOL_COUNT = 55;
const TOOL_COUNT_SURFACES = [
  ".env.example",
  "README.md",
  "website/components/Compare.tsx",
  "plugin/plugin.json",
  "plugin/.claude-plugin/plugin.json",
  "plugin/.codex-plugin/plugin.json",
  "plugin/opencode/README.md",
  "plugin/skills/agentmemory-mcp-tools/REFERENCE.md",
];
const STALE_TOOL_COUNT_PATTERN =
  /51 MCP tools|51 tools|51 memory tools|full 51-tool surface|MCP TOOLS", "51"|53 MCP tools|53 tools|53 memory tools|full 53-tool surface|MCP TOOLS", "53"/;

function readText(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

describe("Tool count consistency", () => {
  it("registry exposes the expected number of tools", () => {
    expect(getAllTools().length).toBe(EXPECTED_TOOL_COUNT);
  });

  it("cli help derives the tool counts from the registry", () => {
    const cli = readText("src/cli.ts");
    expect(cli).toContain("const ALL_TOOLS_COUNT = getAllTools().length;");
    expect(cli).toContain(
      "(default: all = ${ALL_TOOLS_COUNT} tools; core = ${CORE_TOOLS_COUNT} essentials)",
    );
    expect(cli).not.toMatch(/all\s*=\s*51 tools/);
  });

  it("core tool count derives from the registry", () => {
    const coreCount = getAllTools().filter((t) => ESSENTIAL_TOOLS.has(t.name)).length;
    expect(coreCount).toBe(ESSENTIAL_TOOLS.size);
    expect(coreCount).toBeGreaterThan(0);
  });

  it("README advertises the same tool count as the registry", () => {
    const readme = readText("README.md");
    expect(readme).toContain(`${EXPECTED_TOOL_COUNT} MCP tools`);
    expect(readme).toContain(`${EXPECTED_TOOL_COUNT} tools`);
    expect(readme).not.toContain("51 MCP tools");
    expect(readme).not.toContain("53 MCP tools");
    expect(readme).not.toContain("53 tools");
  });

  it("README tool-count badges advertise the same count as the registry", () => {
    for (const path of [
      "assets/tags/stat-tools.svg",
      "assets/tags/light/stat-tools.svg",
    ]) {
      const asset = readText(path);
      expect(asset).toContain(`MCP TOOLS: ${EXPECTED_TOOL_COUNT}`);
      expect(asset).toContain(`>${EXPECTED_TOOL_COUNT}<`);
      expect(asset).not.toContain("MCP TOOLS: 53");
      expect(asset).not.toContain(">53<");
    }

    for (const path of [
      "assets/tags/section-mcp.svg",
      "assets/tags/light/section-mcp.svg",
    ]) {
      const asset = readText(path);
      expect(asset).toContain(`${EXPECTED_TOOL_COUNT} tools`);
      expect(asset).not.toContain("43 tools");
    }
  });

  it("metadata surfaces do not advertise stale 51- or 53-tool counts", () => {
    for (const path of TOOL_COUNT_SURFACES) {
      expect(readText(path), path).not.toMatch(STALE_TOOL_COUNT_PATTERN);
    }
  });

  it("skill count claims match the plugin/skills directory", () => {
    const skillCount = readdirSync(join(ROOT, "plugin", "skills"), {
      withFileTypes: true,
    }).filter((e) => e.isDirectory() && e.name !== "_shared").length;
    expect(readText("src/cli/connect/index.ts")).toContain(`${skillCount} skills`);
    expect(readText("README.md")).toContain(`${skillCount} skills`);
    expect(readText("AGENTS.md")).toContain(`12 hooks, ${skillCount} skills`);
    expect(readText("plugin/plugin.json")).toContain(`${skillCount} skills`);
  });

  it("INSTALL_FOR_AGENTS.md names the real core tool set", () => {
    const names = [...ESSENTIAL_TOOLS].map((t) =>
      t.replace(/^memory_/, "").replace(/_/g, " "),
    );
    const sentence = `The ${names.length} core tools cover ${names
      .slice(0, -1)
      .join(", ")}, and ${names[names.length - 1]}.`;
    expect(readText("INSTALL_FOR_AGENTS.md")).toContain(sentence);
  });
});
