import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { ConnectAdapter } from "../src/cli/connect/types.js";
import type { HookManifest } from "../src/cli/connect/codex-hooks.js";

const selected = vi.hoisted(() => ({ root: "" }));
vi.mock("../src/cli/connect/codex-hooks.js", async (original) => ({
  ...await original<typeof import("../src/cli/connect/codex-hooks.js")>(),
  findPluginRoot: () => selected.root,
}));

const OWNER = "agentmemory:zcode:v1";
const EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop"];
type Config = { hooks: { enabled?: boolean; timeoutMs?: number; events: HookManifest["hooks"] }; [key: string]: unknown };

describe("ZCode installation relocation", () => {
  let temp: string, home: string, a: string, b: string, path: string;
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), "zcode-relocation-")); home = join(temp, "home"); mkdirSync(home);
    path = join(home, ".zcode/cli/config.json");
    for (const name of ["A with $& spaces", "B with $& spaces"]) {
      const plugin = join(temp, name, "plugin"); mkdirSync(join(plugin, "hooks"), { recursive: true }); mkdirSync(join(plugin, "scripts"));
      writeFileSync(join(plugin, "hooks/hooks.zcode.json"), readFileSync(resolve(__dirname, "../plugin/hooks/hooks.zcode.json")));
    }
    a = join(temp, "A with $& spaces/plugin"); b = join(temp, "B with $& spaces/plugin"); selected.root = a;
    vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home); vi.resetModules();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); rmSync(temp, { recursive: true, force: true }); });
  async function adapter(): Promise<ConnectAdapter> { return (await import("../src/cli/connect/zcode.js")).adapter; }
  function seed(value: Config) { mkdirSync(join(home, ".zcode/cli"), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); }
  function config(): Config { return JSON.parse(readFileSync(path, "utf8")) as Config; }
  function backups() { const dir = join(home, ".agentmemory/backups"); return existsSync(dir) ? readdirSync(dir).sort() : []; }
  function handlers(value: Config) { return Object.entries(value.hooks.events).flatMap(([event, entries]) => entries.flatMap(entry => entry.hooks.map(hook => ({ event, entry, hook })))); }
  function fromRoot(value: Config, root: string) { const prefix = root.replace(/\\/g, "/") + "/scripts/"; return handlers(value).filter(({ hook }) => hook.args?.some(arg => arg.startsWith(prefix))); }
  async function installedA() { const item = await adapter(); await item.install({ dryRun: false, force: false, withHooks: true }); return item; }
  async function legacy(root: string) { const { buildMergedHooks } = await import("../src/cli/connect/codex-hooks.js"); return { hooks: { enabled: true, events: buildMergedHooks(null, root, "hooks.zcode.json").hooks } }; }

  it("relocates A to B with exactly one managed handler per event and no stale A path", async () => {
    const item = await installedA(); selected.root = b;
    expect(await item.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "installed" });
    const next = config(); expect(fromRoot(next, a)).toHaveLength(0); expect(fromRoot(next, b)).toHaveLength(6);
    for (const event of EVENTS) expect(next.hooks.events[event]).toHaveLength(1);
    expect(handlers(next).every(({ hook }) => hook.agentmemoryOwner === OWNER)).toBe(true);
  });

  it("relocates marked hooks even when A has already been removed", async () => {
    const item = await installedA(); rmSync(join(temp, "A with $& spaces"), { recursive: true }); selected.root = b;
    expect(await item.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "installed" });
    expect(fromRoot(config(), a)).toHaveLength(0); expect(fromRoot(config(), b)).toHaveLength(6);
  });

  it("preserves mixed user hooks, managed customization and unrelated settings", async () => {
    const item = await installedA(), first = config();
    const user = { type: "process", command: "node", args: [join(temp, "user/scripts/session-start.mjs")], onError: "deny" };
    const own = first.hooks.events.SessionStart![0].hooks[0]; own.enabled = false; own.timeoutMs = 1234; own.statusMessage = "user customization";
    first.hooks.events.SessionStart![0].hooks.push(user);
    first.hooks.timeoutMs = 7000; first.untouched = { keep: [1, 2, 3] };
    const permission = { hooks: [{ type: "command", command: "echo user-permission" }] };
    first.hooks.events.PermissionRequest = [permission]; seed(first); selected.root = b;
    await item.install({ dryRun: false, force: false, withHooks: true }); const next = config();
    expect(fromRoot(next, a)).toHaveLength(0); expect(fromRoot(next, b)).toHaveLength(6);
    expect(next.hooks.events.SessionStart![0].hooks[1]).toEqual(user);
    expect(next.hooks.events.SessionStart![0].hooks[0]).toMatchObject({ enabled: false, timeoutMs: 1234, statusMessage: "user customization", agentmemoryOwner: OWNER });
    expect(next.hooks.events.PermissionRequest).toEqual([permission]); expect(next.hooks.timeoutMs).toBe(7000); expect(next.untouched).toEqual(first.untouched);
  });

  for (const force of [false, true]) it(`refuses ambiguous unmarked foreign-root hooks without changing bytes or backups (force=${force})`, async () => {
    seed(await legacy(a)); const before = readFileSync(path, "utf8"); selected.root = b; const item = await adapter();
    expect(await item.install({ dryRun: false, force, withHooks: true })).toMatchObject({ kind: "skipped", reason: "hook-ownership" });
    expect(readFileSync(path, "utf8")).toBe(before); expect(backups()).toEqual([]);
  });

  it("migrates a proven current-root legacy invocation without changing its native argv", async () => {
    selected.root = b; const old = await legacy(b); seed(old); const item = await adapter(); await item.install({ dryRun: false, force: false, withHooks: true });
    expect(handlers(config())).toHaveLength(6);
    for (const event of EVENTS) {
      expect(config().hooks.events[event]![0].hooks[0]).toMatchObject({ ...old.hooks.events[event]![0].hooks[0], agentmemoryOwner: OWNER });
    }
  });

  it("preserves same-basename user scripts and explicitly other-owned handlers", async () => {
    const user = { type: "process", command: "node", args: [join(temp, "user/scripts/stop.mjs")] };
    const other = { type: "process", command: "node", args: [join(temp, "user/plugin/scripts/stop.mjs")], agentmemoryOwner: "another-owner" };
    seed({ hooks: { events: { Stop: [{ hooks: [user, other] }] } } }); selected.root = b; const item = await adapter();
    expect(await item.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "installed" });
    expect(config().hooks.events.Stop![0].hooks).toEqual([user, other]); expect(fromRoot(config(), b)).toHaveLength(6);
  });

  it("refuses an incompatible ownership marker instead of deleting a user command", async () => {
    seed({ hooks: { events: { Stop: [{ hooks: [{ type: "command", command: "echo keep user", agentmemoryOwner: OWNER }] }] } } });
    const before = readFileSync(path, "utf8"), item = await adapter();
    expect(await item.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "skipped", reason: "hook-ownership" });
    expect(readFileSync(path, "utf8")).toBe(before); expect(backups()).toEqual([]);
  });

  it("preserves unknown future ownership versions without appending more capture", async () => {
    const old = await legacy(a); old.hooks.events.Stop![0].hooks[0].agentmemoryOwner = "agentmemory:zcode:v2"; seed(old);
    const before = readFileSync(path, "utf8"), item = await adapter();
    expect(await item.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "skipped", reason: "hook-ownership" });
    expect(readFileSync(path, "utf8")).toBe(before); expect(backups()).toEqual([]);
  });

  it("dry-runs relocation and makes the completed B installation byte-idempotent", async () => {
    const item = await installedA(), before = readFileSync(path, "utf8"), saved = backups(); selected.root = b;
    expect(await item.install({ dryRun: true, force: false, withHooks: true })).toMatchObject({ kind: "installed" });
    expect(readFileSync(path, "utf8")).toBe(before); expect(backups()).toEqual(saved);
    await item.install({ dryRun: false, force: false, withHooks: true }); const after = readFileSync(path, "utf8"), afterBackups = backups();
    expect(await item.install({ dryRun: false, force: false, withHooks: true })).toMatchObject({ kind: "already-wired" });
    expect(readFileSync(path, "utf8")).toBe(after); expect(backups()).toEqual(afterBackups);
    expect(fromRoot(config(), a)).toHaveLength(0); expect(fromRoot(config(), b)).toHaveLength(6);
  });
});
