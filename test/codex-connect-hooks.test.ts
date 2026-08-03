import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  mkdtempSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  buildMergedHooks,
  findPluginRoot,
  type HookManifest,
} from "../src/cli/connect/codex-hooks.js";

const PLUGIN_ROOT = resolve(__dirname, "..", "plugin");

const CODEX_TOML_BLOCK = `[mcp_servers.agentmemory]
command = "npx"
args = ["-y", "@agentmemory/mcp"]

[mcp_servers.agentmemory.env]
AGENTMEMORY_URL = "http://localhost:3111"
`;

const CODEX_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PreCompact",
  "Stop",
] as const;

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "am-codex-connect-"));
}

describe("findPluginRoot", () => {
  it("locates the bundled plugin/ directory from src/cli/connect/", () => {
    const root = findPluginRoot();
    expect(root).toBe(PLUGIN_ROOT);
  });
});

describe("buildMergedHooks", () => {
  it("rewrites ${CLAUDE_PLUGIN_ROOT} to absolute pluginRoot in every command", () => {
    const merged = buildMergedHooks(null, PLUGIN_ROOT);
    for (const entries of Object.values(merged.hooks)) {
      for (const entry of entries) {
        for (const handler of entry.hooks) {
          expect(handler.command).not.toContain("${CLAUDE_PLUGIN_ROOT}");
          expect(handler.command).toContain(`${PLUGIN_ROOT}/scripts/`);
        }
      }
    }
  });

  it("preserves matchers from the bundled manifest (e.g. PreToolUse)", () => {
    const merged = buildMergedHooks(null, PLUGIN_ROOT);
    const preToolUse = merged.hooks["PreToolUse"];
    expect(preToolUse).toBeDefined();
    expect(preToolUse!.length).toBeGreaterThan(0);
    expect(preToolUse![0].matcher).toBe("Edit|Write|Read|Glob|Grep");
  });

  it("includes all six expected lifecycle events", () => {
    const merged = buildMergedHooks(null, PLUGIN_ROOT);
    for (const event of [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PreCompact",
      "Stop",
    ]) {
      expect(Object.keys(merged.hooks)).toContain(event);
    }
  });

  it("appends to existing user hooks without dropping them", () => {
    const existing: HookManifest = {
      hooks: {
        SessionStart: [
          {
            hooks: [{ type: "command", command: "echo user-custom" }],
          },
        ],
        UserPromptSubmit: [
          {
            hooks: [{ type: "command", command: "echo another-user-hook" }],
          },
        ],
      },
    };
    const merged = buildMergedHooks(existing, PLUGIN_ROOT);
    const sessionStart = merged.hooks["SessionStart"]!;
    const userHook = sessionStart.find((e) =>
      e.hooks.some((h) => h.command === "echo user-custom"),
    );
    expect(userHook, "user's SessionStart hook should survive").toBeDefined();
    const ours = sessionStart.find((e) =>
      e.hooks.some((h) => h.command.includes(`${PLUGIN_ROOT}/scripts/session-start.mjs`)),
    );
    expect(ours, "agentmemory SessionStart hook should be appended").toBeDefined();
  });

  it("re-install strips previous agentmemory entries (idempotent by script path)", () => {
    const first = buildMergedHooks(null, PLUGIN_ROOT);
    const second = buildMergedHooks(first, PLUGIN_ROOT);
    for (const event of Object.keys(first.hooks)) {
      expect(
        second.hooks[event]!.length,
        `${event} should not double after second install`,
      ).toBe(first.hooks[event]!.length);
    }
  });

  it("re-install preserves unrelated user entries", () => {
    const userEntry = {
      hooks: [{ type: "command", command: "echo user-untouchable" }],
    };
    const withUser: HookManifest = {
      hooks: {
        SessionStart: [userEntry],
        Stop: [{ hooks: [{ type: "command", command: "echo also-user" }] }],
      },
    };
    const installed = buildMergedHooks(withUser, PLUGIN_ROOT);
    const reinstalled = buildMergedHooks(installed, PLUGIN_ROOT);
    expect(
      reinstalled.hooks["SessionStart"]!.some((e) =>
        e.hooks.some((h) => h.command === "echo user-untouchable"),
      ),
    ).toBe(true);
    expect(
      reinstalled.hooks["Stop"]!.some((e) =>
        e.hooks.some((h) => h.command === "echo also-user"),
      ),
    ).toBe(true);
  });

  it("handles empty existing manifest object", () => {
    const merged = buildMergedHooks({ hooks: {} }, PLUGIN_ROOT);
    expect(Object.keys(merged.hooks).length).toBeGreaterThan(0);
  });
});

describe("buildMergedHooks file round-trip", () => {
  it("produces JSON that parses back to a structurally equivalent manifest", () => {
    const dir = join(tmpdir(), `agentmemory-codex-hooks-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "hooks.json");
    try {
      const merged = buildMergedHooks(null, PLUGIN_ROOT);
      writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
      const reread = JSON.parse(readFileSync(path, "utf-8")) as HookManifest;
      expect(Object.keys(reread.hooks).sort()).toEqual(Object.keys(merged.hooks).sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("connect: Codex --with-hooks", () => {
  let home: string;
  const ORIG = process.env["HOME"];
  const ORIG_USERPROFILE = process.env["USERPROFILE"];

  beforeEach(() => {
    home = freshHome();
    vi.resetModules();
    process.env["HOME"] = home;
    // os.homedir() on win32 reads USERPROFILE, not HOME — without this,
    // adapter.detect()/install() resolve the real user's home directory
    // instead of the isolated temp one.
    process.env["USERPROFILE"] = home;
  });

  afterEach(() => {
    if (ORIG === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIG;
    if (ORIG_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIG_USERPROFILE;
    rmSync(home, { recursive: true, force: true });
  });

  it("--with-hooks writes ~/.codex/hooks.json with Codex's six lifecycle events", async () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/codex.js");
    const result = await adapter.install({
      dryRun: false,
      force: false,
      withHooks: true,
    });
    expect(result.kind).toBe("installed");
    const hooksPath = join(home, ".codex", "hooks.json");
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, "utf-8")) as HookManifest;
    expect(Object.keys(hooks.hooks).sort()).toEqual([...CODEX_EVENTS].sort());
  });

  it("without --with-hooks, does not write ~/.codex/hooks.json", async () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/codex.js");
    await adapter.install({ dryRun: false, force: false });
    expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(false);
  });

  it("re-running install with --with-hooks on an already-wired MCP config still refreshes hooks.json", async () => {
    const codexDir = join(home, ".codex");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, "config.toml"), CODEX_TOML_BLOCK, "utf-8");

    const { adapter } = await import("../src/cli/connect/codex.js");
    const result = await adapter.install({
      dryRun: false,
      force: false,
      withHooks: true,
    });
    expect(result.kind).toBe("already-wired");

    const hooksPath = join(codexDir, "hooks.json");
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, "utf-8")) as HookManifest;
    expect(Object.keys(hooks.hooks).sort()).toEqual([...CODEX_EVENTS].sort());
  });

  it("already-wired without --with-hooks does not write hooks.json", async () => {
    const codexDir = join(home, ".codex");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, "config.toml"), CODEX_TOML_BLOCK, "utf-8");

    const { adapter } = await import("../src/cli/connect/codex.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("already-wired");
    expect(existsSync(join(codexDir, "hooks.json"))).toBe(false);
  });

  it("re-install with --with-hooks is idempotent and preserves user hook entries", async () => {
    const codexDir = join(home, ".codex");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, "config.toml"), CODEX_TOML_BLOCK, "utf-8");
    writeFileSync(
      join(codexDir, "hooks.json"),
      `${JSON.stringify(
        {
          hooks: {
            SessionStart: [
              { hooks: [{ type: "command", command: "echo user-custom" }] },
            ],
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const { adapter } = await import("../src/cli/connect/codex.js");
    await adapter.install({ dryRun: false, force: false, withHooks: true });
    await adapter.install({ dryRun: false, force: false, withHooks: true });

    const hooks = JSON.parse(
      readFileSync(join(codexDir, "hooks.json"), "utf-8"),
    ) as HookManifest;
    const sessionStart = hooks.hooks["SessionStart"]!;
    expect(
      sessionStart.some((e) =>
        e.hooks.some((h) => h.command === "echo user-custom"),
      ),
    ).toBe(true);
    expect(
      sessionStart.filter((e) =>
        e.hooks.some((h) =>
          h.command.replace(/\\/g, "/").includes("/scripts/session-start.mjs"),
        ),
      ),
    ).toHaveLength(1);
  });
});
