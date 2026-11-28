import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const hasAclTools = process.platform === "linux" &&
  spawnSync("getfacl", ["--version"]).status === 0 &&
  spawnSync("setfacl", ["--version"]).status === 0;

describe.skipIf(!hasAclTools)("ZCode Linux access ACL preservation", () => {
  let home: string;
  let path: string;
  let original: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-zcode-acl-"));
    path = join(home, ".zcode", "cli", "config.json");
    mkdirSync(dirname(path), { recursive: true });
    for (const directory of [home, join(home, ".zcode"), dirname(path)]) chmodSync(directory, 0o755);
    original = JSON.stringify({ mcp: { servers: { other: { type: "stdio", command: "other", env: { FIXTURE_PRIVATE_VALUE: "synthetic-only" } } } } }, null, 2) + "\n";
    writeFileSync(path, original);
    chmodSync(path, 0o640);
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(home, { recursive: true, force: true });
  });

  function acl(file: string): string {
    return execFileSync("getfacl", ["--omit-header", "--absolute-names", "--numeric", file], { encoding: "utf8" });
  }

  async function connectAndCheck(beforeAcl: string): Promise<void> {
    const before = statSync(path);
    const { adapter } = await import("../src/cli/connect/zcode.js");
    expect(await adapter.install({ dryRun: false, force: false })).toMatchObject({ kind: "installed" });
    expect(acl(path)).toBe(beforeAcl);
    const after = statSync(path);
    expect(after.uid).toBe(before.uid);
    expect(after.gid).toBe(before.gid);
    expect(after.mode & 0o777).toBe(0o640);
    expect(JSON.parse(readFileSync(path, "utf8")).mcp.servers.other).toEqual(JSON.parse(original).mcp.servers.other);
    const backups = join(home, ".agentmemory", "backups");
    const names = readdirSync(backups);
    expect(names).toHaveLength(1);
    expect(statSync(join(backups, names[0])).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(backups, names[0]), "utf8")).toBe(original);
  }

  it("does not grant an inherited named reader access to a config without extended ACLs", async () => {
    const beforeAcl = acl(path);
    expect(beforeAcl).not.toContain("user:65534:");
    execFileSync("setfacl", ["-m", "d:u:65534:r--", dirname(path)]);
    expect(acl(path)).toBe(beforeAcl);
    await connectAndCheck(beforeAcl);
  });

  it("retains an explicit reader ACL instead of replacing it with the directory default", async () => {
    execFileSync("setfacl", ["-m", "u:65534:r--,g::---,m::r--", path]);
    const beforeAcl = acl(path);
    expect(beforeAcl).toContain("user:65534:r--");
    expect(beforeAcl).toContain("group::---");
    execFileSync("setfacl", ["-m", "d:u:65533:r--", dirname(path)]);
    expect(acl(path)).toBe(beforeAcl);
    await connectAndCheck(beforeAcl);
  });
});
