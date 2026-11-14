import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop"];

describe("ZCode plugin directory", () => {
  let output: string;
  let plugin: string;
  let originalClaudeHooks: Buffer;

  beforeAll(() => {
    output = mkdtempSync(join(tmpdir(), "am-zcode-package-"));
    plugin = join(output, "agentmemory-zcode");
    originalClaudeHooks = readFileSync(join(ROOT, "plugin/hooks/hooks.json"));
    execFileSync(process.execPath, [join(ROOT, "scripts/plugins/package-zcode.mjs")], {
      cwd: ROOT, env: { ...process.env, AGENTMEMORY_PLUGIN_OUT_DIR: output },
      timeout: 15000, stdio: "pipe",
    });
  });

  afterAll(() => { rmSync(output, { recursive: true, force: true }); });

  it("has only the ZCode manifest and one conventional six-event hook source", () => {
    expect(existsSync(join(plugin, ".zcode-plugin/plugin.json"))).toBe(true);
    expect(existsSync(join(plugin, ".claude-plugin"))).toBe(false);
    expect(existsSync(join(plugin, ".codex-plugin"))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(plugin, ".zcode-plugin/plugin.json"), "utf8"));
    expect(manifest.name).toBe("agentmemory");
    expect(manifest.version).toBe(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version);
    expect(manifest.hooks).toBeUndefined();
    expect(readdirSync(join(plugin, "hooks"))).toEqual(["hooks.json"]);
    const hooks = JSON.parse(readFileSync(join(plugin, "hooks/hooks.json"), "utf8"));
    expect(Object.keys(hooks.hooks).sort()).toEqual(EVENTS.slice().sort());
    expect(hooks.hooks.PermissionRequest).toBeUndefined();
    expect(hooks.hooks.PreToolUse[0].matcher).toBe("Bash|Read|Write|Edit|Grep|Glob");
  });

  it("ships the exact existing runtime scripts and a bundled MCP bridge", () => {
    const scripts = ["_capture", "plugin-bridge", "session-start", "prompt-submit", "pre-tool-use", "post-tool-use", "post-tool-failure", "stop"];
    expect(readdirSync(join(plugin, "scripts")).sort()).toEqual(scripts.map(name => name + ".mjs").sort());
    for (const name of scripts) {
      expect(readFileSync(join(plugin, "scripts", name + ".mjs"))).toEqual(readFileSync(join(ROOT, "plugin/scripts", name + ".mjs")));
    }
    expect(JSON.parse(readFileSync(join(plugin, ".mcp.json"), "utf8"))).toEqual({
      mcpServers: { agentmemory: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/plugin-bridge.mjs"] } },
    });
  });

  it("includes unchanged skills and preserves every other host's source manifest", () => {
    const skills = readdirSync(join(ROOT, "plugin/skills"));
    expect(readdirSync(join(plugin, "skills"))).toEqual(skills);
    for (const skill of skills) {
      const source = join(ROOT, "plugin/skills", skill, "SKILL.md");
      if (existsSync(source)) expect(readFileSync(join(plugin, "skills", skill, "SKILL.md"))).toEqual(readFileSync(source));
    }
    expect(readFileSync(join(ROOT, "plugin/hooks/hooks.json"))).toEqual(originalClaudeHooks);
    expect(existsSync(join(plugin, "LICENSE"))).toBe(true);
    expect(readFileSync(join(plugin, "README.md"))).toEqual(readFileSync(join(ROOT, "docs/plugins/zcode-local.md")));
  });
});
