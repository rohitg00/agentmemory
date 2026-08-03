import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildMergedAntigravityHooks,
  type AntigravityHookManifest,
} from "../src/cli/connect/antigravity-hooks.js";
import { findPluginRoot } from "../src/cli/connect/codex-hooks.js";
import {
  normalizePayload,
  responseFor,
  targetsFor,
} from "../src/hooks/antigravity-bridge.js";

const PLUGIN_ROOT = resolve(__dirname, "..", "plugin");

function build(existing: AntigravityHookManifest | null = null) {
  return buildMergedAntigravityHooks(existing, findPluginRoot());
}

function eventEntries(bundle: unknown, event: string) {
  return (bundle as Record<string, unknown>)[event] as {
    matcher?: string;
    hooks: { type: string; command: string; timeout?: number }[];
  }[];
}

describe("buildMergedAntigravityHooks", () => {
  it("rewrites ${CLAUDE_PLUGIN_ROOT} to absolute pluginRoot in every command", () => {
    const merged = build();
    for (const bundle of Object.values(merged)) {
      for (const [key, value] of Object.entries(bundle)) {
        if (!Array.isArray(value)) continue;
        for (const entry of value) {
          for (const handler of entry.hooks) {
            expect(handler.command, key).not.toContain("${CLAUDE_PLUGIN_ROOT}");
            expect(handler.command, key).toContain(`${PLUGIN_ROOT}/scripts/`);
          }
        }
      }
    }
  });

  it("registers under a single named bundle, as Antigravity's schema requires", () => {
    expect(Object.keys(build())).toEqual(["agentmemory"]);
    expect(build()["agentmemory"]!["enabled"]).toBe(true);
  });

  it("only wires events Antigravity actually dispatches", () => {
    const bundle = build()["agentmemory"]!;
    const events = Object.keys(bundle).filter((k) => k !== "enabled");
    // PostInvocation is intentionally unwired: PostToolUse already captures
    // the work, so firing both would double-record every turn.
    expect(events.sort()).toEqual(
      ["PreInvocation", "PreToolUse", "PostToolUse", "Stop"].sort(),
    );
  });

  it("scopes PreToolUse to the file tools agy actually exposes", () => {
    const matcher = eventEntries(build()["agentmemory"], "PreToolUse")[0]!
      .matcher!;
    for (const tool of ["view_file", "edit_file", "write_to_file", "grep_search"]) {
      expect(matcher.split("|")).toContain(tool);
    }
    // run_command is deliberately excluded — shell invocations are captured
    // on PostToolUse, and matching them here would fire on every command.
    expect(matcher.split("|")).not.toContain("run_command");
  });

  it("keeps user-authored hook bundles untouched", () => {
    const existing: AntigravityHookManifest = {
      "block-run-command": {
        enabled: true,
        PreToolUse: [
          {
            matcher: "run_command",
            hooks: [{ type: "command", command: "/usr/local/bin/deny.sh" }],
          },
        ],
      },
    };
    const merged = build(existing);
    expect(merged["block-run-command"]).toEqual(existing["block-run-command"]);
    expect(merged["agentmemory"]).toBeDefined();
  });

  it("replaces a stale agentmemory bundle instead of duplicating it", () => {
    const stale: AntigravityHookManifest = {
      "agentmemory-legacy": {
        enabled: true,
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: `node "${PLUGIN_ROOT}/scripts/removed-hook.mjs" Stop`,
              },
            ],
          },
        ],
      },
    };
    const merged = build(stale);
    expect(merged["agentmemory-legacy"]).toBeUndefined();
    expect(Object.keys(merged)).toEqual(["agentmemory"]);
  });

  it("re-install is idempotent", () => {
    const first = build();
    expect(build(first)).toEqual(first);
  });

  it("keeps a pluginRoot containing $-replacement patterns literal", () => {
    // `String.prototype.replace` with a string argument reads `$$`, `$&`,
    // "$`" and `$'` in the replacement as patterns. An install path holding
    // any of them would otherwise be rewritten into a broken command, and
    // the only symptom would be hooks that silently never fire.
    const tmp = mkdtempSync(join(tmpdir(), "am-antigravity-"));
    try {
      const oddRoot = join(tmp, "plug$&$$in");
      mkdirSync(join(oddRoot, "hooks"), { recursive: true });
      copyFileSync(
        join(PLUGIN_ROOT, "hooks", "hooks.antigravity.json"),
        join(oddRoot, "hooks", "hooks.antigravity.json"),
      );

      const command = eventEntries(
        buildMergedAntigravityHooks(null, oddRoot)["agentmemory"],
        "Stop",
      )[0]!.hooks[0]!.command;

      expect(command).toContain(`${oddRoot}/scripts/`);
      expect(command).not.toContain("${CLAUDE_PLUGIN_ROOT}");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("antigravity bridge payload normalization", () => {
  it("maps conversationId and workspacePaths onto the canonical fields", () => {
    const out = normalizePayload("PostToolUse", {
      conversationId: "conv_123",
      workspacePaths: ["/repo/app"],
      transcriptPath: "/tmp/t.jsonl",
    });
    expect(out["session_id"]).toBe("conv_123");
    expect(out["cwd"]).toBe("/repo/app");
    expect(out["transcript_path"]).toBe("/tmp/t.jsonl");
    expect(out["hook_event_name"]).toBe("PostToolUse");
  });

  it("flattens toolCall into tool_name/tool_input with Cascade names mapped", () => {
    const out = normalizePayload("PreToolUse", {
      conversationId: "c1",
      toolCall: {
        name: "view_file",
        args: { AbsolutePath: "/repo/src/index.ts", StartLine: 1 },
      },
    });
    expect(out["tool_name"]).toBe("read");
    expect(out["native_tool_name"]).toBe("view_file");
    expect((out["tool_input"] as Record<string, unknown>)["file_path"]).toBe(
      "/repo/src/index.ts",
    );
    // Original PascalCase args survive for anything downstream that wants them.
    expect((out["tool_input"] as Record<string, unknown>)["StartLine"]).toBe(1);
  });

  it("maps every PascalCase arg the canonical hooks read", () => {
    const cases: [string, string, string][] = [
      ["AbsolutePath", "file_path", "/repo/a.ts"],
      ["TargetFile", "file_path", "/repo/b.ts"],
      ["DirectoryPath", "path", "/repo/src"],
      ["SearchDirectory", "path", "/repo/test"],
      ["Pattern", "pattern", "*.ts"],
      ["Query", "pattern", "normalizePayload"],
      ["CommandLine", "command", "npm test"],
    ];
    for (const [from, to, value] of cases) {
      const input = normalizePayload("PreToolUse", {
        toolCall: { name: "view_file", args: { [from]: value } },
      })["tool_input"] as Record<string, unknown>;
      expect(input[to], `${from} -> ${to}`).toBe(value);
      // The original key survives alongside the canonical one.
      expect(input[from], from).toBe(value);
    }
  });

  it("does not let a mapped alias clobber an explicit canonical key", () => {
    const input = normalizePayload("PreToolUse", {
      toolCall: {
        name: "edit_file",
        args: { TargetFile: "/repo/alias.ts", file_path: "/repo/explicit.ts" },
      },
    })["tool_input"] as Record<string, unknown>;
    expect(input["file_path"]).toBe("/repo/explicit.ts");
  });

  it("passes unmapped tool names through unchanged", () => {
    const out = normalizePayload("PostToolUse", {
      toolCall: { name: "run_command", args: { CommandLine: "npm test" } },
    });
    expect(out["tool_name"]).toBe("run_command");
    expect((out["tool_input"] as Record<string, unknown>)["command"]).toBe(
      "npm test",
    );
  });

  it("falls back to a placeholder session id rather than dropping the event", () => {
    expect(normalizePayload("Stop", {})["session_id"]).toBe("unknown");
  });
});

describe("antigravity bridge stdout contract", () => {
  // agy documents `decision` as required on PreToolUse output and treats a
  // response without it as a denial — a bare `{}` there makes the agent
  // refuse every matched tool call instead of passively capturing it.
  it("answers PreToolUse with an explicit allow, everything else with {}", () => {
    expect(JSON.parse(responseFor("PreToolUse"))).toEqual({
      decision: "allow",
    });
    for (const event of ["PreInvocation", "PostToolUse", "Stop", ""]) {
      expect(JSON.parse(responseFor(event)), event).toEqual({});
    }
  });

  it("writes that contract to stdout when the bundled script actually runs", () => {
    const script = join(PLUGIN_ROOT, "scripts", "antigravity-bridge.mjs");
    const run = (event: string) =>
      execFileSync(process.execPath, [script, event], {
        input: JSON.stringify({
          conversationId: "c1",
          toolCall: { name: "view_file", args: { AbsolutePath: "/repo/a.ts" } },
        }),
        encoding: "utf-8",
        // No server is listening on port 1, so every capture fetch fails
        // fast: this asserts the response survives a failed capture, which
        // is exactly the case where a swallowed error could emit nothing.
        env: { ...process.env, AGENTMEMORY_URL: "http://127.0.0.1:1" },
        stdio: ["pipe", "pipe", "ignore"],
      });

    expect(JSON.parse(run("PreToolUse"))).toEqual({ decision: "allow" });
    expect(JSON.parse(run("PostToolUse"))).toEqual({});
  });
});

describe("antigravity bridge event routing", () => {
  it("opens the session on the first invocation only", () => {
    expect(targetsFor("PreInvocation", { invocationNum: 1 })).toEqual([
      "session-start.mjs",
      "prompt-submit.mjs",
    ]);
    expect(targetsFor("PreInvocation", { invocationNum: 4 })).toEqual([
      "prompt-submit.mjs",
    ]);
  });

  it("treats a missing invocationNum as the first invocation", () => {
    expect(targetsFor("PreInvocation", {})).toContain("session-start.mjs");
  });

  it("closes the session on Stop", () => {
    expect(targetsFor("Stop", {})).toEqual(["stop.mjs", "session-end.mjs"]);
  });

  it("ignores PostInvocation to avoid double-capturing a turn", () => {
    expect(targetsFor("PostInvocation", {})).toEqual([]);
  });
});
