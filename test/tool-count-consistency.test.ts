import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getAllTools, ESSENTIAL_TOOLS } from "../src/mcp/tools-registry.js";

const ROOT = join(import.meta.dirname, "..");
const EXPECTED_TOOL_COUNT = 53;

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
    expect(readme).not.toContain("51 MCP tools");
  });
});
