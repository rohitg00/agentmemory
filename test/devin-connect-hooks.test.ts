import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "../src/cli/connect/codex-hooks.js";

const PLUGIN_ROOT = resolve(__dirname, "..", "plugin");

const DEVIN_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SessionEnd",
];

const DEVIN_TOOL_NAMES = [
  "exec",
  "edit",
  "write",
  "read",
  "apply_patch",
  "grep",
  "glob",
];

function runHook(
  script: string,
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<string> {
  return new Promise((resolve_) => {
    const child = spawn("node", [`plugin/scripts/${script}.mjs`], {
      env: { ...process.env, AGENTMEMORY_URL: "http://127.0.0.1:1", ...env },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("exit", () => resolve_(out));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe("buildMergedHooks (Devin manifest)", () => {
  it("rewrites ${CLAUDE_PLUGIN_ROOT} to absolute pluginRoot in every command", () => {
    const merged = buildMergedHooks(null, findPluginRoot(), "hooks.devin.json");
    for (const entries of Object.values(merged.hooks)) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          expect(handler.command).not.toContain("${CLAUDE_PLUGIN_ROOT}");
          expect(handler.command).toContain(`${PLUGIN_ROOT}/scripts/`);
        }
      }
    }
  });

  it("only wires events Devin CLI actually dispatches", () => {
    const merged = buildMergedHooks(null, findPluginRoot(), "hooks.devin.json");
    expect(Object.keys(merged.hooks).sort()).toEqual([...DEVIN_EVENTS].sort());
  });

  it("matches Devin's lowercase tool names, not Claude Code's", () => {
    const merged = buildMergedHooks(null, findPluginRoot(), "hooks.devin.json");
    const matcher = merged.hooks["PreToolUse"]?.[0]?.matcher;
    expect(matcher).toBeDefined();
    const re = new RegExp(matcher!);
    for (const tool of DEVIN_TOOL_NAMES) expect(re.test(tool)).toBe(true);
    for (const claudeTool of ["Edit", "Write", "Bash"]) {
      expect(re.test(claudeTool)).toBe(false);
    }
  });

  it("preserves user-authored hooks when merging", () => {
    const existing: HookManifest = {
      hooks: {
        PermissionRequest: [
          { hooks: [{ type: "command", command: "bash ./mine.sh" }] },
        ],
      },
    };
    const merged = buildMergedHooks(
      existing,
      findPluginRoot(),
      "hooks.devin.json",
    );
    const kept = merged.hooks["PermissionRequest"]?.[0]?.hooks?.[0]?.command;
    expect(kept).toBe("bash ./mine.sh");
  });
});

describe("hook payload compatibility with Devin CLI", () => {
  it("resolves the project from DEVIN_PROJECT_DIR when the payload carries no cwd", async () => {
    const { resolveProject, hookCwd } = await import("../src/hooks/_project.js");
    const before = process.env["DEVIN_PROJECT_DIR"];
    process.env["DEVIN_PROJECT_DIR"] = "/tmp";
    try {
      expect(hookCwd({ session_id: "s1" })).toBe("/tmp");
      expect(resolveProject(hookCwd({ session_id: "s1" }))).toBe("tmp");
    } finally {
      if (before === undefined) delete process.env["DEVIN_PROJECT_DIR"];
      else process.env["DEVIN_PROJECT_DIR"] = before;
    }
  });

  it("emits Devin's hookSpecificOutput shape for injected context", async () => {
    const out = await runHook(
      "session-start",
      { hook_event_name: "SessionStart", session_id: "s1", source: "startup" },
      { DEVIN_PROJECT_DIR: "/tmp", AGENTMEMORY_INJECT_CONTEXT: "true" },
    );
    if (!out.trim()) return;
    const parsed = JSON.parse(out) as {
      hookSpecificOutput?: { hookEventName?: string; additionalContext?: string };
    };
    expect(parsed.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    expect(typeof parsed.hookSpecificOutput?.additionalContext).toBe("string");
  });
});
