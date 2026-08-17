import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { findPluginRoot } from "../src/cli/connect/codex-hooks.js";
import {
  buildMergedKlaatcodeHooks,
  type KlaatcodeHooksConfig,
} from "../src/cli/connect/klaatcode-hooks.js";

const PLUGIN_ROOT = resolve(__dirname, "..", "plugin");

const KLAATCODE_EVENTS = [
  "session_start",
  "before_message",
  "before_tool",
  "after_tool",
  "after_message",
  "session_end",
];

const KLAATCODE_TOOL_NAMES = [
  "run_command",
  "edit_file",
  "multi_edit",
  "write_file",
  "read_file",
  "apply_patch",
  "grep",
  "glob",
];

function entryCommand(entry: string | { command: string }): string {
  return typeof entry === "string" ? entry : entry.command;
}

function runHook(
  script: string,
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<{ out: string; code: number | null }> {
  return new Promise((resolve_) => {
    const child = spawn("node", [`plugin/scripts/${script}.mjs`], {
      env: { ...process.env, AGENTMEMORY_URL: "http://127.0.0.1:1", ...env },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("exit", (code) => resolve_({ out, code }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe("buildMergedKlaatcodeHooks (Klaat Code manifest)", () => {
  it("rewrites ${CLAUDE_PLUGIN_ROOT} to absolute pluginRoot in every command", () => {
    const merged = buildMergedKlaatcodeHooks(null, findPluginRoot());
    for (const entries of Object.values(merged)) {
      for (const entry of entries!) {
        const cmd = entryCommand(entry);
        expect(cmd).not.toContain("${CLAUDE_PLUGIN_ROOT}");
        expect(cmd).toContain(`${PLUGIN_ROOT}/scripts/`);
      }
    }
  });

  it("wires exactly the six events Klaat Code dispatches", () => {
    const merged = buildMergedKlaatcodeHooks(null, findPluginRoot());
    expect(Object.keys(merged).sort()).toEqual([...KLAATCODE_EVENTS].sort());
  });

  it("matches Klaat Code's snake_case tool names, not Claude Code's", () => {
    const merged = buildMergedKlaatcodeHooks(null, findPluginRoot());
    const entry = merged["before_tool"]?.[0];
    expect(typeof entry).toBe("object");
    const matcher = (entry as { matcher?: string }).matcher;
    expect(matcher).toBeDefined();
    const re = new RegExp(matcher!);
    for (const tool of KLAATCODE_TOOL_NAMES) expect(re.test(tool)).toBe(true);
    for (const claudeTool of ["Edit", "Write", "Bash"]) {
      expect(re.test(claudeTool)).toBe(false);
    }
  });

  it("preserves user-authored hooks in both v1 and v2 form", () => {
    const existing: KlaatcodeHooksConfig = {
      after_message: ["afplay /System/Library/Sounds/Glass.aiff"],
      before_tool: [{ command: "./scripts/guard-shell.sh", matcher: "run_command" }],
    };
    const merged = buildMergedKlaatcodeHooks(existing, findPluginRoot());
    expect(merged["after_message"]?.[0]).toBe(
      "afplay /System/Library/Sounds/Glass.aiff",
    );
    expect(entryCommand(merged["before_tool"]![0]!)).toBe(
      "./scripts/guard-shell.sh",
    );
  });

  it("is idempotent across re-installs", () => {
    const root = findPluginRoot();
    const once = buildMergedKlaatcodeHooks(null, root);
    const twice = buildMergedKlaatcodeHooks(once, root);
    expect(twice).toEqual(once);
  });
});

describe("hook payload compatibility with Klaat Code", () => {
  it("resolves the project from the payload's project_root field", async () => {
    const { resolveProject, hookCwd } = await import("../src/hooks/_project.js");
    const payload = { session_id: "s1", project_root: "/tmp" };
    expect(hookCwd(payload)).toBe("/tmp");
    expect(resolveProject(hookCwd(payload))).toBe("tmp");
  });

  it("falls back to KLAATAI_PROJECT_ROOT when the payload carries no path", async () => {
    const { hookCwd } = await import("../src/hooks/_project.js");
    const before = process.env["KLAATAI_PROJECT_ROOT"];
    process.env["KLAATAI_PROJECT_ROOT"] = "/tmp";
    try {
      expect(hookCwd({ session_id: "s1" })).toBe("/tmp");
    } finally {
      if (before === undefined) delete process.env["KLAATAI_PROJECT_ROOT"];
      else process.env["KLAATAI_PROJECT_ROOT"] = before;
    }
  });

  it("fails open when the memory server is unreachable", async () => {
    const { code } = await runHook("session-start", {
      event: "session_start",
      session_id: "s1",
      project_root: "/tmp",
    });
    expect(code).toBe(0);
  });
});
