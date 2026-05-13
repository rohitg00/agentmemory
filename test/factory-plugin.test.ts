import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");
const pluginRoot = join(repoRoot, "plugin");
const factoryPluginRoot = join(pluginRoot, ".factory-plugin");

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("Factory Droids plugin manifest", () => {
  it("ships .factory-plugin/plugin.json with name + version + references", () => {
    const manifestPath = join(factoryPluginRoot, "plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readJson<{
      name: string;
      version: string;
      description?: string;
      factoryVersion?: string;
      skills?: string;
      mcpServers?: string;
      hooks?: string;
    }>(manifestPath);
    expect(manifest.name).toBe("agentmemory");
    expect(manifest.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/);
    expect(manifest.factoryVersion).toBeDefined();
    expect(manifest.skills).toBeDefined();
    expect(manifest.mcpServers).toBeDefined();
    expect(manifest.hooks).toBeDefined();
  });

  it("manifest version matches main package.json", () => {
    const pkgVer = readJson<{ version: string }>(join(repoRoot, "package.json")).version;
    const factoryVer = readJson<{ version: string }>(
      join(factoryPluginRoot, "plugin.json"),
    ).version;
    expect(factoryVer).toBe(pkgVer);
  });

  it("all referenced manifest paths resolve to existing files / directories", () => {
    const manifest = readJson<{ skills: string; mcpServers: string; hooks: string }>(
      join(factoryPluginRoot, "plugin.json"),
    );
    expect(existsSync(join(factoryPluginRoot, manifest.skills))).toBe(true);
    expect(existsSync(join(factoryPluginRoot, manifest.mcpServers))).toBe(true);
    expect(existsSync(join(factoryPluginRoot, manifest.hooks))).toBe(true);
  });

  it("hooks.factory.json registers the same first-class lifecycle events as Claude Code", () => {
    const hooks = readJson<{ hooks: Array<{ event: string }> }>(
      join(pluginRoot, "hooks/hooks.factory.json"),
    );
    const events = hooks.hooks.map((hook) => hook.event).sort();
    expect(events).toEqual([
      "Notification",
      "PostToolUse",
      "PostToolUseFailure",
      "PreCompact",
      "PreToolUse",
      "SessionEnd",
      "SessionStart",
      "Stop",
      "SubagentStart",
      "SubagentStop",
      "TaskCompleted",
      "UserPromptSubmit",
    ]);
  });

  it("hook command scripts referenced in hooks.factory.json exist on disk", () => {
    const hooks = readJson<{
      hooks: Array<{ action: { type: string; command: string } }>;
    }>(join(pluginRoot, "hooks/hooks.factory.json"));
    const scriptRefs = new Set<string>();
    for (const hook of hooks.hooks) {
      expect(hook.action.type).toBe("command");
      const match = hook.action.command.match(
        /^node "\$\{FACTORY_PLUGIN_ROOT\}\/(scripts\/[^"\s]+\.mjs)"$/,
      );
      expect(match, `invalid Factory hook command: ${hook.action.command}`).not.toBeNull();
      if (match) scriptRefs.add(match[1]);
    }
    expect(scriptRefs.size).toBeGreaterThan(0);
    for (const rel of scriptRefs) {
      expect(existsSync(join(pluginRoot, rel)), `missing hook script: ${rel}`).toBe(true);
    }
  });
});

describe("Factory marketplace.json (.factory-plugin/marketplace.json at repo root)", () => {
  it("ships a marketplace manifest pointing at the plugin/ subdirectory", () => {
    const marketplacePath = join(repoRoot, ".factory-plugin/marketplace.json");
    expect(existsSync(marketplacePath)).toBe(true);
    const marketplace = readJson<{
      name: string;
      plugins: Array<{
        name: string;
        source: string;
      }>;
    }>(marketplacePath);
    expect(marketplace.name).toBe("agentmemory");
    expect(marketplace.plugins).toHaveLength(1);
    const entry = marketplace.plugins[0];
    expect(entry.name).toBe("agentmemory");
    expect(entry.source).toBe("./plugin");
  });
});
