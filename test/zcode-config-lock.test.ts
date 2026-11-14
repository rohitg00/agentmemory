import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const selected = vi.hoisted(() => ({ root: "" }));
vi.mock("../src/cli/connect/codex-hooks.js", async (original) => ({
  ...await original<typeof import("../src/cli/connect/codex-hooks.js")>(),
  findPluginRoot: () => selected.root,
}));

describe("ZCode native configuration lock", () => {
  let temp: string, home: string, path: string, a: string, b: string;
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), "zcode-lock-"));
    home = join(temp, "home"); mkdirSync(home);
    path = join(home, ".zcode/cli/config.json");
    for (const name of ["A with spaces", "B with spaces"]) {
      const plugin = join(temp, name, "plugin");
      mkdirSync(join(plugin, "hooks"), { recursive: true }); mkdirSync(join(plugin, "scripts"));
      writeFileSync(join(plugin, "hooks/hooks.zcode.json"), readFileSync(resolve(__dirname, "../plugin/hooks/hooks.zcode.json")));
    }
    a = join(temp, "A with spaces/plugin"); b = join(temp, "B with spaces/plugin"); selected.root = a;
    vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home); vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules(); rmSync(temp, { recursive: true, force: true });
  });
  function seed(value: unknown) {
    mkdirSync(join(home, ".zcode/cli"), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  }
  function backups() {
    const dir = join(home, ".agentmemory/backups");
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }
  function holdNativeCompatibleLock() {
    const lock = path + ".lock";
    mkdirSync(lock);
    const owner = join(lock, "owner-synthetic-native-writer.json");
    writeFileSync(owner, JSON.stringify({ pid: process.pid, createdAt: Date.now(), token: "synthetic-native-writer" }));
    return () => { unlinkSync(owner); rmdirSync(lock); };
  }

  it("waits for the native owner and rereads its saved settings before relocating", async () => {
    const { adapter } = await import("../src/cli/connect/zcode.js");
    await adapter.install({ dryRun: false, force: false, withHooks: true });
    const original = readFileSync(path, "utf8"), nativeSnapshot = JSON.parse(original), oldBackups = backups();
    const release = holdNativeCompatibleLock(); selected.root = b;
    let finished = false;
    const pending = adapter.install({ dryRun: false, force: false, withHooks: true }).finally(() => { finished = true; });
    await new Promise(resolve => setTimeout(resolve, 50));
    const during = { finished, config: readFileSync(path, "utf8"), backups: backups() };
    nativeSnapshot.ui = { locale: "en-US" };
    const nativeBytes = JSON.stringify(nativeSnapshot, null, 2) + "\n";
    writeFileSync(path, nativeBytes); release();
    const result = await pending;
    expect(during).toEqual({ finished: false, config: original, backups: oldBackups });
    expect(result).toMatchObject({ kind: "installed" });
    const updated = JSON.parse(readFileSync(path, "utf8"));
    expect(updated.ui.locale).toBe("en-US");
    const hooks = Object.values(updated.hooks.events).flatMap((entries: any) => entries.flatMap((entry: any) => entry.hooks));
    expect(hooks.filter((hook: any) => hook.args?.[0]?.startsWith(a + "/scripts/"))).toHaveLength(0);
    expect(hooks.filter((hook: any) => hook.args?.[0]?.startsWith(b + "/scripts/"))).toHaveLength(6);
    expect(backups()).toHaveLength(1);
    expect(readFileSync(join(home, ".agentmemory/backups", backups()[0]), "utf8")).toBe(nativeBytes);
    expect(existsSync(path + ".lock")).toBe(false);
  });

  for (const force of [false, true]) it(`refuses a busy lock after a bounded wait without overwriting its owner (force=${force})`, async () => {
    seed({ ui: { locale: "en-US" } });
    const release = holdNativeCompatibleLock(), original = readFileSync(path), owners = readdirSync(path + ".lock");
    const { adapter } = await import("../src/cli/connect/zcode.js");
    vi.useFakeTimers();
    const pending = adapter.install({ dryRun: false, force });
    await vi.advanceTimersByTimeAsync(10000);
    const result = await pending;
    expect(result).toMatchObject({ kind: "skipped", reason: "config-locked" });
    expect(readFileSync(path)).toEqual(original); expect(backups()).toEqual([]);
    expect(readdirSync(path + ".lock")).toEqual(owners);
    release();
  });

  it("dry-runs without modifying or waiting on an existing native lock", async () => {
    seed({ untouched: true }); const release = holdNativeCompatibleLock();
    const original = readFileSync(path), ownerNames = readdirSync(path + ".lock");
    const { adapter } = await import("../src/cli/connect/zcode.js");
    expect(await adapter.install({ dryRun: true, force: false, withHooks: true })).toMatchObject({ kind: "installed" });
    expect(readFileSync(path)).toEqual(original); expect(backups()).toEqual([]);
    expect(readdirSync(path + ".lock")).toEqual(ownerNames); release();
  });

  it("dry-runs a missing configuration without creating its directories or lock", async () => {
    const { adapter } = await import("../src/cli/connect/zcode.js");
    expect(await adapter.install({ dryRun: true, force: false, withHooks: true })).toMatchObject({ kind: "installed" });
    expect(existsSync(join(home, ".zcode"))).toBe(false); expect(backups()).toEqual([]);
  });

  it("releases its lock after rejecting an existing conflicting MCP entry", async () => {
    seed({ mcp: { servers: { agentmemory: { type: "stdio", command: "keep-user-command" } } } });
    const before = readFileSync(path), { adapter } = await import("../src/cli/connect/zcode.js");
    expect(await adapter.install({ dryRun: false, force: false })).toMatchObject({ kind: "skipped", reason: "mcp-conflict" });
    expect(readFileSync(path)).toEqual(before); expect(backups()).toEqual([]); expect(existsSync(path + ".lock")).toBe(false);
  });
});
