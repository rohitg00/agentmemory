import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, chownSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const currentGroup = process.getgid?.();
const otherGroup = process.getgroups?.().find(group => group !== currentGroup);

describe("ZCode config access identity", () => {
  let home: string;
  let path: string;
  let raw: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-zcode-access-"));
    path = join(home, ".zcode", "cli", "config.json");
    mkdirSync(join(home, ".zcode", "cli"), { recursive: true });
    raw = JSON.stringify({ mcp: { servers: { other: { type: "stdio", command: "other", env: { FIXTURE_PRIVATE_VALUE: "synthetic-only" } } } } }, null, 2) + "\n";
    writeFileSync(path, raw);
    if (process.platform !== "win32") chmodSync(path, 0o640);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(home, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32" || otherGroup === undefined)("retains a group-readable config's selected reader group", async () => {
    chownSync(path, process.getuid!(), otherGroup!);
    const before = statSync(path);
    expect(before.gid).not.toBe(currentGroup);
    const { adapter } = await import("../src/cli/connect/zcode.js");
    expect(await adapter.install({ dryRun: false, force: false })).toMatchObject({ kind: "installed" });
    const after = statSync(path);
    expect(after.gid).toBe(before.gid);
    expect(after.uid).toBe(before.uid);
    expect(after.mode & 0o777).toBe(0o640);
    expect(JSON.parse(readFileSync(path, "utf8")).mcp.servers.other).toEqual(JSON.parse(raw).mcp.servers.other);
  });

  it.skipIf(process.platform === "win32")("creates a private backup of a group-readable configuration", async () => {
    const { adapter } = await import("../src/cli/connect/zcode.js");
    expect(await adapter.install({ dryRun: false, force: false })).toMatchObject({ kind: "installed" });
    const directory = join(home, ".agentmemory", "backups");
    const names = readdirSync(directory);
    expect(names).toHaveLength(1);
    const backup = join(directory, names[0]);
    expect(statSync(backup).mode & 0o777).toBe(0o600);
    expect(readFileSync(backup, "utf8")).toBe(raw);
    expect(statSync(path).mode & 0o777).toBe(0o640);
  });
});
