import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

  it("every host-path bind mount in docker-compose.yml is in the published files list (#136)", () => {
    // Regression guard for #136: docker-compose.yml references
    // ./iii-config.docker.yaml as a read-only bind mount, but the file
    // was missing from the published tarball. Docker silently creates
    // missing bind sources as empty directories, so the engine crashed
    // with "Is a directory (os error 21)" at /app/config.yaml.
    const compose = readText("docker-compose.yml");
    const pkg = JSON.parse(readText("package.json"));
    const files: string[] = pkg.files ?? [];

    // Match `./<path>:<container-path>` style bind mounts. We only care
    // about files that live in the repo root (so they'd be shipped via
    // the `files` field). `iii-data:/data` (a named volume) has no `./`
    // prefix and is correctly skipped.
    const bindRe = /^\s*-\s+\.\/([^\s:]+):[^\s]+/gm;
    const sources: string[] = [];
    for (const m of compose.matchAll(bindRe)) sources.push(m[1]!);

    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      // Any nested path would need a directory entry in `files` (e.g.
      // `dist/`); for top-level files, the exact name must be listed.
      const topLevel = src.split("/")[0]!;
      const covered =
        files.includes(src) ||
        files.includes(topLevel) ||
        files.includes(`${topLevel}/`);
      expect(
        covered,
        `docker-compose.yml mounts ./${src} but package.json "files" does not ship it — ${topLevel} would be auto-created as an empty dir on install, breaking \`npx @agentmemory/agentmemory\``,
      ).toBe(true);
    }
  });
});
