import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getAllTools } from "../src/mcp/tools-registry.js";
import { VERSION } from "../src/version.js";
import { collectRestEndpointsInDirectory } from "../scripts/skills/rest-endpoints.js";

const ROOT = join(import.meta.dirname, "..");

function readText(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function countRestApiEndpoints(): number {
  return collectRestEndpointsInDirectory(join(ROOT, "src/triggers")).length;
}

describe("Consistency checks", () => {
  const toolCount = getAllTools().length;
  const restEndpointCount = countRestApiEndpoints();

  it("version.ts matches package.json", () => {
    const pkg = JSON.parse(readText("package.json"));
    expect(VERSION).toBe(pkg.version);
  });

  it("plugin.json version matches package.json", () => {
    const pkg = JSON.parse(readText("package.json"));
    const plugin = JSON.parse(readText("plugin/.claude-plugin/plugin.json"));
    expect(plugin.version).toBe(pkg.version);
  });

  it("packages/mcp version matches package.json", () => {
    // The mcp package publishes in lockstep with the main package but its
    // version lives in its own manifest; without this guard a release bump
    // can silently ship a stale @agentmemory/mcp (it slipped in 0.9.29).
    const pkg = JSON.parse(readText("package.json"));
    const mcp = JSON.parse(readText("packages/mcp/package.json"));
    expect(mcp.version).toBe(pkg.version);
  });

  it.each(["hermes", "openclaw"])("%s YAML plugin version matches the release", (integration) => {
    const plugin = parse(readText(`integrations/${integration}/plugin.yaml`));
    expect(plugin.version).toBe(VERSION);
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

  it("documented REST endpoint counts match registered API paths", () => {
    const readme = readText("README.md");
    const agents = readText("AGENTS.md");
    const index = readText("src/index.ts");

    expect(restEndpointCount).toBeGreaterThan(0);
    if (readme.includes("endpoints on port")) expect(readme).toContain(`${restEndpointCount} endpoints on port`);
    expect(agents).toContain(`${restEndpointCount} REST endpoints`);
    expect(index).toContain(`REST API: ${restEndpointCount} endpoints`);
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

  it("keeps the repository self-host Docker Compose file out of the npm package", () => {
    const compose = readText("docker-compose.yml");
    const pkg = JSON.parse(readText("package.json"));
    const files: string[] = pkg.files ?? [];
    expect(compose).toContain("- ${AGENTMEMORY_DATA_DIR:-iii-data}:/data");
    expect(files).not.toContain("docker-compose.yml");
    // Neither removed legacy config template is part of the published package.
    expect(files).not.toContain("iii-config.yaml");
    expect(files).not.toContain("iii-config.docker.yaml");
  });
});
