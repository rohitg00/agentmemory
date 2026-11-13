import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(__dirname, "..");
const SOURCE = pathToFileURL(join(ROOT, "src/cli/connect/zcode.ts")).href;
const MCP = process.platform === "win32"
  ? { type: "stdio", command: "cmd", args: ["/c", "npx", "-y", "@agentmemory/mcp"] }
  : { type: "stdio", command: "npx", args: ["-y", "@agentmemory/mcp"] };

describe("ZCode configuration protections", () => {
  let home: string;
  let path: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-zcode-protection-"));
    path = join(home, ".zcode", "cli", "config.json");
    mkdirSync(join(home, ".zcode", "cli"), { recursive: true });
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(home, { recursive: true, force: true });
  });

  function seed(value: unknown): string {
    const raw = JSON.stringify(value, null, 2) + "\n";
    writeFileSync(path, raw, { mode: 0o600 });
    return raw;
  }

  function backupNames(): string[] {
    const dir = join(home, ".agentmemory", "backups");
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  }

  const permissionCases = [
    { name: "keeps an existing 0600 config under umask 022", existing: 0o600, umask: 0o022, expected: 0o600 },
    { name: "keeps an existing 0640 config under umask 022", existing: 0o640, umask: 0o022, expected: 0o640 },
    { name: "keeps an existing 0640 config under umask 077", existing: 0o640, umask: 0o077, expected: 0o640 },
    { name: "creates a private 0600 config under umask 022", existing: null, umask: 0o022, expected: 0o600 },
  ];
  for (const entry of permissionCases) it.skipIf(process.platform === "win32")(entry.name, () => {
    for (const dir of [home, join(home, ".zcode"), join(home, ".zcode", "cli")]) chmodSync(dir, 0o755);
    const original = entry.existing === null ? null : seed({ mcp: { servers: { other: { type: "stdio", command: "other", env: { FIXTURE_PRIVATE_VALUE: "synthetic-only" } } } } });
    if (entry.existing !== null) chmodSync(path, entry.existing);
    const code = "process.umask(" + entry.umask + "); const {adapter} = await import(" + JSON.stringify(SOURCE) + "); await adapter.install({dryRun:false,force:false});";
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
      cwd: ROOT, env: { ...process.env, HOME: home, USERPROFILE: home }, timeout: 8000, stdio: "pipe",
    });
    expect(statSync(path).mode & 0o777).toBe(entry.expected);
    const current = JSON.parse(readFileSync(path, "utf8"));
    expect(current.mcp.servers.agentmemory).toEqual(MCP);
    if (original !== null) {
      expect(current.mcp.servers.other).toEqual(JSON.parse(original).mcp.servers.other);
      expect(backupNames()).toHaveLength(1);
      expect(readFileSync(join(home, ".agentmemory", "backups", backupNames()[0]), "utf8")).toBe(original);
    } else expect(backupNames()).toEqual([]);
  });

  for (const [name, flags] of [
    ["legacy enable:false", { enable: false }],
    ["legacy enable:false with enabled:true", { enable: false, enabled: true }],
  ] as const) for (const withHooks of [false, true]) {
    it("preserves " + name + " without force (withHooks=" + withHooks + ")", async () => {
      const original = seed({ mcp: { servers: { agentmemory: { ...MCP, ...flags } } }, untouched: { keep: true } });
      const { adapter } = await import("../src/cli/connect/zcode.js");
      expect(await adapter.install({ dryRun: false, force: false, withHooks })).toEqual({ kind: "skipped", reason: "mcp-disabled" });
      expect(readFileSync(path, "utf8")).toBe(original);
      expect(backupNames()).toEqual([]);
      expect(await adapter.install({ dryRun: false, force: true, withHooks })).toMatchObject({ kind: "installed" });
      const next = JSON.parse(readFileSync(path, "utf8"));
      expect(next.mcp.servers.agentmemory).toEqual(MCP);
      expect(next.untouched).toEqual({ keep: true });
      expect(backupNames()).toHaveLength(1);
      expect(readFileSync(join(home, ".agentmemory", "backups", backupNames()[0]), "utf8")).toBe(original);
    });
  }

  it("retains the modern disabled-entry guard", async () => {
    const original = seed({ mcp: { servers: { agentmemory: { ...MCP, enabled: false } } } });
    const { adapter } = await import("../src/cli/connect/zcode.js");
    expect(await adapter.install({ dryRun: false, force: false })).toEqual({ kind: "skipped", reason: "mcp-disabled" });
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(backupNames()).toEqual([]);
  });

  it("keeps a matching explicitly enabled legacy entry unchanged", async () => {
    const original = seed({ mcp: { servers: { agentmemory: { ...MCP, enable: true, enabled: true } } } });
    const { adapter } = await import("../src/cli/connect/zcode.js");
    expect(await adapter.install({ dryRun: false, force: false })).toMatchObject({ kind: "already-wired" });
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(backupNames()).toEqual([]);
  });
});
