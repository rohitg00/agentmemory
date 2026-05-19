import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");
const pluginRoot = join(repoRoot, "plugin");

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

const SUPPORTED_COPILOT_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PreCompact",
  "Stop",
  "SessionEnd",
  "SubagentStart",
  "SubagentStop",
  "Notification",
]);

const REQUIRED_MINIMUM_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
];

const KNOWN_SKILL_DIRS = [
  "recall",
  "remember",
  "session-history",
  "forget",
  "handoff",
  "recap",
  "commit-context",
  "commit-history",
];

describe("Copilot plugin manifest (plugin/.plugin/plugin.json)", () => {
  it("manifest exists with kebab-case name, version, and required fields", () => {
    const manifestPath = join(pluginRoot, ".plugin/plugin.json");
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
    const pluginVer = readJson<{ version: string }>(
      join(pluginRoot, ".plugin/plugin.json"),
    ).version;
    expect(pluginVer).toBe(pkgVer);
  });

  it("all referenced manifest paths resolve to existing files / directories", () => {
    const manifest = readJson<{ skills: string; mcpServers: string; hooks: string }>(
      join(pluginRoot, ".plugin/plugin.json"),
    );
    const manifestDir = join(pluginRoot, ".plugin");
    expect(existsSync(resolve(manifestDir, manifest.skills))).toBe(true);
    expect(existsSync(resolve(manifestDir, manifest.mcpServers))).toBe(true);
    expect(existsSync(resolve(manifestDir, manifest.hooks))).toBe(true);
  });

  it("skills path resolves and contains all known skill directories", () => {
    const manifest = readJson<{ skills: string }>(join(pluginRoot, ".plugin/plugin.json"));
    const manifestDir = join(pluginRoot, ".plugin");
    const skillsPath = resolve(manifestDir, manifest.skills);
    for (const skill of KNOWN_SKILL_DIRS) {
      expect(
        existsSync(join(skillsPath, skill)),
        `missing skill directory: ${skill}`,
      ).toBe(true);
    }
  });
});

describe("Copilot MCP config (.mcp.copilot.json)", () => {
  it("file exists with expected shape", () => {
    const mcpPath = join(pluginRoot, ".mcp.copilot.json");
    expect(existsSync(mcpPath)).toBe(true);
    const config = readJson<{
      mcpServers: {
        agentmemory: {
          type: string;
          command: string;
          args: string[];
          env: Record<string, string>;
          tools: string[];
        };
      };
    }>(mcpPath);
    const server = config.mcpServers.agentmemory;
    expect(server.type).toBe("local");
    expect(server.command).toBe("npx");
    expect(server.args).toEqual(["-y", "@agentmemory/mcp"]);
    expect(server.env["AGENTMEMORY_URL"]).toBe("${AGENTMEMORY_URL}");
    expect(server.env["AGENTMEMORY_SECRET"]).toBe("${AGENTMEMORY_SECRET}");
    expect(server.tools).toContain("*");
  });
});

describe("Copilot hooks config (hooks/hooks.copilot.json)", () => {
  type HookEntry = {
    type: string;
    command?: string;
    bash?: string;
    powershell?: string;
    matcher?: string;
  };

  function loadHooks() {
    return readJson<{ version: number; hooks: Record<string, HookEntry[]> }>(
      join(pluginRoot, "hooks/hooks.copilot.json"),
    );
  }

  it("has top-level version === 1 and hooks object", () => {
    const config = loadHooks();
    expect(config.version).toBe(1);
    expect(config.hooks).toBeDefined();
    expect(typeof config.hooks).toBe("object");
  });

  it("contains only supported Copilot event names", () => {
    const config = loadHooks();
    for (const event of Object.keys(config.hooks)) {
      expect(
        SUPPORTED_COPILOT_EVENTS.has(event),
        `unsupported event "${event}" in hooks.copilot.json`,
      ).toBe(true);
    }
  });

  it("contains all required minimum events", () => {
    const config = loadHooks();
    const events = Object.keys(config.hooks);
    for (const event of REQUIRED_MINIMUM_EVENTS) {
      expect(events, `missing required event: ${event}`).toContain(event);
    }
  });

  it("PreToolUse entry has the correct matcher", () => {
    const config = loadHooks();
    const preToolEntries = config.hooks["PreToolUse"];
    expect(preToolEntries).toBeDefined();
    const withMatcher = preToolEntries.find((e) => e.matcher === "Edit|Write|Read|Glob|Grep");
    expect(withMatcher, "PreToolUse must have matcher Edit|Write|Read|Glob|Grep").toBeDefined();
  });

  it("every handler has type === 'command' and exactly one of command/bash/powershell", () => {
    const config = loadHooks();
    for (const [event, entries] of Object.entries(config.hooks)) {
      for (const handler of entries) {
        expect(handler.type, `${event} handler type`).toBe("command");
        const commandFields = [handler.command, handler.bash, handler.powershell].filter(
          (v) => v !== undefined,
        );
        expect(
          commandFields.length,
          `${event} handler must have exactly one of command/bash/powershell`,
        ).toBe(1);
      }
    }
  });

  it("every referenced script exists on disk", () => {
    const config = loadHooks();
    const scriptRefs = new Set<string>();
    for (const entries of Object.values(config.hooks)) {
      for (const handler of entries) {
        const cmd = handler.command ?? handler.bash ?? handler.powershell ?? "";
        const match = cmd.match(/\$\{(?:COPILOT_PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}\/(scripts\/[^\s]+)/);
        if (match) scriptRefs.add(match[1]);
      }
    }
    expect(scriptRefs.size).toBeGreaterThan(0);
    for (const rel of scriptRefs) {
      expect(existsSync(join(pluginRoot, rel)), `missing hook script: ${rel}`).toBe(true);
    }
  });
});
