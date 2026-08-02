import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "../src/cli/connect/codex-hooks.js";

const PLUGIN_ROOT = resolve(__dirname, "..", "plugin");

describe("buildMergedHooks (Droid manifest)", () => {
  it("rewrites ${CLAUDE_PLUGIN_ROOT} to absolute pluginRoot in every command", () => {
    const merged = buildMergedHooks(null, findPluginRoot(), "hooks.droid.json");
    for (const entries of Object.values(merged.hooks)) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          expect(handler.command).not.toContain("${CLAUDE_PLUGIN_ROOT}");
          expect(handler.command).toContain(`${PLUGIN_ROOT}/scripts/`);
        }
      }
    }
  });

  it("includes Droid's five documented lifecycle events (and nothing else)", () => {
    const merged = buildMergedHooks(null, findPluginRoot(), "hooks.droid.json");
    const expectedEvents = [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "SessionEnd",
    ];
    expect(Object.keys(merged.hooks).sort()).toEqual(
      [...expectedEvents].sort(),
    );
  });

  it("preserves the PreToolUse matcher", () => {
    const merged = buildMergedHooks(null, findPluginRoot(), "hooks.droid.json");
    const preToolUse = merged.hooks["PreToolUse"];
    expect(preToolUse).toBeDefined();
    expect(preToolUse![0]!.matcher).toBe("Edit|Create|Read|Glob|Grep");
  });

  it("appends to existing user hooks without dropping them", () => {
    const existing: HookManifest = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "echo user-custom" }] },
        ],
      },
    };
    const merged = buildMergedHooks(existing, findPluginRoot(), "hooks.droid.json");
    const sessionStart = merged.hooks["SessionStart"]!;
    expect(
      sessionStart.some((e) => e.hooks.some((h) => h.command === "echo user-custom")),
    ).toBe(true);
    expect(
      sessionStart.some((e) =>
        e.hooks.some((h) => h.command.includes("session-start.mjs")),
      ),
    ).toBe(true);
  });

  it("re-install is idempotent (produces identical manifest)", () => {
    const first = buildMergedHooks(null, findPluginRoot(), "hooks.droid.json");
    const second = buildMergedHooks(first, findPluginRoot(), "hooks.droid.json");
    expect(second).toEqual(first);
  });
});
