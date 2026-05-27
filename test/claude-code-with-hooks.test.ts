import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "../src/cli/connect/codex-hooks.js";

const PLUGIN_ROOT = resolve(__dirname, "..", "plugin");

describe("buildMergedHooks against plugin/hooks/hooks.json (Claude Code)", () => {
  it("locates the same plugin root used by the codex variant", () => {
    expect(findPluginRoot()).toBe(PLUGIN_ROOT);
  });

  it("rewrites ${CLAUDE_PLUGIN_ROOT} to absolute pluginRoot in every command", () => {
    const merged = buildMergedHooks(null, PLUGIN_ROOT, "hooks.json");
    for (const entries of Object.values(merged.hooks)) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          expect(handler.command).not.toContain("${CLAUDE_PLUGIN_ROOT}");
          expect(handler.command).toContain(`${PLUGIN_ROOT}/scripts/`);
        }
      }
    }
  });

  it("includes Claude-only events that hooks.codex.json omits", () => {
    const merged = buildMergedHooks(null, PLUGIN_ROOT, "hooks.json");
    const events = Object.keys(merged.hooks);
    expect(events).toContain("SessionStart");
    expect(events).toContain("Stop");
    const claudeOnly = ["SessionEnd", "SubagentStop", "Notification"];
    expect(
      claudeOnly.some((e) => events.includes(e)),
      `hooks.json should include at least one Claude-only event (${claudeOnly.join(", ")})`,
    ).toBe(true);
  });

  it("appends to existing user hooks without dropping them", () => {
    const existing: HookManifest = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "echo user-custom-claude" }] },
        ],
      },
    };
    const merged = buildMergedHooks(existing, PLUGIN_ROOT, "hooks.json");
    const sessionStart = merged.hooks["SessionStart"]!;
    expect(
      sessionStart.some((e) =>
        e.hooks.some((h) => h.command === "echo user-custom-claude"),
      ),
    ).toBe(true);
    expect(
      sessionStart.some((e) =>
        e.hooks.some((h) =>
          h.command.includes(`${PLUGIN_ROOT}/scripts/session-start.mjs`),
        ),
      ),
    ).toBe(true);
  });

  it("re-install strips previous agentmemory entries (idempotent)", () => {
    const first = buildMergedHooks(null, PLUGIN_ROOT, "hooks.json");
    const second = buildMergedHooks(first, PLUGIN_ROOT, "hooks.json");
    for (const event of Object.keys(first.hooks)) {
      expect(
        second.hooks[event]!.length,
        `${event} should not double after second install`,
      ).toBe(first.hooks[event]!.length);
    }
  });
});
