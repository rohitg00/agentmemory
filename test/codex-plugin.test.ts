import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");
const pluginRoot = join(repoRoot, "plugin");

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("Codex plugin manifest (developers.openai.com/codex/plugins)", () => {
  it("ships .codex-plugin/plugin.json with kebab-case name + version + references", () => {
    const manifestPath = join(pluginRoot, ".codex-plugin/plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readJson<{
      name: string;
      version: string;
      description?: string;
      skills?: string;
      mcpServers?: string;
      hooks?: string;
    }>(manifestPath);
    expect(manifest.name).toBe("agentmemory");
    expect(manifest.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.skills).toBeDefined();
    expect(manifest.mcpServers).toBeDefined();
    expect(manifest.hooks).toBeDefined();
  });

  it("manifest version matches main package.json", () => {
    const pkgVer = readJson<{ version: string }>(join(repoRoot, "package.json")).version;
    const codexVer = readJson<{ version: string }>(
      join(pluginRoot, ".codex-plugin/plugin.json"),
    ).version;
    expect(codexVer).toBe(pkgVer);
  });

  it("all referenced manifest paths resolve to existing files / directories", () => {
    const manifest = readJson<{ skills: string; mcpServers: string; hooks: string }>(
      join(pluginRoot, ".codex-plugin/plugin.json"),
    );
    expect(existsSync(join(pluginRoot, manifest.skills))).toBe(true);
    expect(existsSync(join(pluginRoot, manifest.mcpServers))).toBe(true);
    expect(existsSync(join(pluginRoot, manifest.hooks))).toBe(true);
  });

  it("hooks.codex.json contains only events Codex supports (no Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure)", () => {
    const hooksPath = join(pluginRoot, "hooks/hooks.codex.json");
    const hooks = readJson<{ hooks: Record<string, unknown> }>(hooksPath);
    const events = Object.keys(hooks.hooks);
    const codexSupported = new Set([
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PermissionRequest",
      "PreCompact",
      "PostCompact",
      "Stop",
    ]);
    for (const event of events) {
      expect(codexSupported.has(event), `unexpected event "${event}" in hooks.codex.json`).toBe(true);
    }
    expect(events).toContain("SessionStart");
    expect(events).toContain("UserPromptSubmit");
    expect(events).toContain("PreToolUse");
    expect(events).toContain("PostToolUse");
    expect(events).toContain("PreCompact");
    expect(events).toContain("Stop");
  });

  it("hook command scripts referenced in hooks.codex.json exist on disk", () => {
    type HookHandler = { type: string; command: string };
    type HookEntry = { hooks: HookHandler[] };
    const hooks = readJson<{ hooks: Record<string, HookEntry[]> }>(
      join(pluginRoot, "hooks/hooks.codex.json"),
    );
    const scriptRefs = new Set<string>();
    for (const entries of Object.values(hooks.hooks)) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          const match = handler.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(scripts\/[^\s]+)/);
          if (match) scriptRefs.add(match[1]);
        }
      }
    }
    expect(scriptRefs.size).toBeGreaterThan(0);
    for (const rel of scriptRefs) {
      expect(existsSync(join(pluginRoot, rel)), `missing hook script: ${rel}`).toBe(true);
    }
  });
});

describe("Codex marketplace.json (.codex-plugin/marketplace.json at repo root)", () => {
  it("ships a marketplace manifest pointing at the plugin/ subdirectory", () => {
    const marketplacePath = join(repoRoot, ".codex-plugin/marketplace.json");
    expect(existsSync(marketplacePath)).toBe(true);
    const marketplace = readJson<{
      name: string;
      plugins: Array<{
        name: string;
        source: { source: string; url: string; path: string; ref?: string };
      }>;
    }>(marketplacePath);
    expect(marketplace.name).toBe("agentmemory");
    expect(marketplace.plugins).toHaveLength(1);
    const entry = marketplace.plugins[0];
    expect(entry.name).toBe("agentmemory");
    expect(entry.source.source).toBe("git-subdir");
    expect(entry.source.path).toBe("./plugin");
    expect(entry.source.url).toMatch(/rohitg00\/agentmemory/);
  });
});
