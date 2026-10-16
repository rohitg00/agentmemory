import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

  it("keeps a user command and its matcher from an entry it shares with agentmemory", () => {
    const ours = buildMergedHooks(null, PLUGIN_ROOT, "hooks.json").hooks["PreToolUse"]!;
    const user = { type: "command", command: "echo user-pre-tool" };
    const existing: HookManifest = {
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [ours[0]!.hooks[0]!, user] }] },
    };
    expect(buildMergedHooks(existing, PLUGIN_ROOT, "hooks.json").hooks["PreToolUse"]).toEqual([
      { matcher: "Bash", hooks: [user] },
      ...ours,
    ]);
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

describe("connect claude-code --with-hooks", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-claude-hooks-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(home, { recursive: true, force: true });
  });

  it("installs its hooks next to a prompt handler and keeps that handler", async () => {
    const settingsPath = join(home, ".claude", "settings.json");
    const promptEntry = { hooks: [{ type: "prompt", prompt: "Is the task done?" }] };
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ hooks: { Stop: [promptEntry] } }));

    const { resolveAdapter, runAdapter } = await import("../src/cli/connect/index.js");
    const result = await runAdapter(resolveAdapter("claude-code")!, {
      dryRun: false,
      force: false,
      withHooks: true,
    });

    expect(result.kind).toBe("installed");
    const stop = (JSON.parse(readFileSync(settingsPath, "utf-8")) as HookManifest).hooks["Stop"];
    expect(stop).toEqual([
      promptEntry,
      ...buildMergedHooks(null, PLUGIN_ROOT, "hooks.json").hooks["Stop"]!,
    ]);
  });
});
