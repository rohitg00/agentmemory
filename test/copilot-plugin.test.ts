import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");
const pluginRoot = join(repoRoot, "plugin");

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("Copilot plugin manifest", () => {
  it("ships .copilot-plugin/plugin.json with hooks + mcp references", () => {
    const manifestPath = join(pluginRoot, ".copilot-plugin", "plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readJson<{
      name: string;
      version: string;
      hooks: string;
      mcpServers: string;
      skills: string;
    }>(manifestPath);
    expect(manifest.name).toBe("agentmemory");
    expect(manifest.hooks).toBe("./hooks/hooks.copilot.json");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    expect(existsSync(join(pluginRoot, manifest.hooks))).toBe(true);
    expect(existsSync(join(pluginRoot, manifest.mcpServers))).toBe(true);
    expect(existsSync(join(pluginRoot, manifest.skills))).toBe(true);
  });

  it("manifest version matches package.json", () => {
    const pkgVersion = readJson<{ version: string }>(join(repoRoot, "package.json")).version;
    const pluginVersion = readJson<{ version: string }>(
      join(pluginRoot, ".copilot-plugin", "plugin.json"),
    ).version;
    expect(pluginVersion).toBe(pkgVersion);
  });
});

describe("Copilot hook manifest", () => {
  it("uses versioned flat schema with command entries", () => {
    const hooksPath = join(pluginRoot, "hooks", "hooks.copilot.json");
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = readJson<{
      version: number;
      hooks: Record<
        string,
        Array<{
          type: string;
          bash: string;
          powershell: string;
          timeoutSec?: number;
        }>
      >;
    }>(hooksPath);
    expect(hooks.version).toBe(1);
    expect(Object.keys(hooks.hooks)).toContain("SessionStart");
    expect(Object.keys(hooks.hooks)).toContain("PostToolUse");
    expect(Object.keys(hooks.hooks)).toContain("SessionEnd");
    const all = Object.values(hooks.hooks).flat();
    for (const hook of all) {
      expect(hook.type).toBe("command");
      expect(typeof hook.bash).toBe("string");
      expect(typeof hook.powershell).toBe("string");
      expect(hook.bash).toContain("agentmemory-hook ");
    }
  });
});
