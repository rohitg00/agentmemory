import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// pi adapter: copies the bundled integrations/pi extension into
// ~/.pi/agent/extensions/agentmemory/, which pi auto-discovers via its
// */index.ts rule — no settings.json edit needed.

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "am-pi-"));
}

describe("connect: pi", () => {
  let home: string;
  const ORIG_HOME = process.env["HOME"];
  const ORIG_USERPROFILE = process.env["USERPROFILE"];

  beforeEach(() => {
    home = freshHome();
    vi.resetModules();
    process.env["HOME"] = home;
    process.env["USERPROFILE"] = home;
  });
  afterEach(() => {
    if (ORIG_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIG_HOME;
    if (ORIG_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIG_USERPROFILE;
    rmSync(home, { recursive: true, force: true });
  });

  const extDir = () => join(home, ".pi", "agent", "extensions", "agentmemory");

  it("does not detect when ~/.pi/ is absent", async () => {
    const { adapter } = await import("../src/cli/connect/pi.js");
    expect(adapter.detect()).toBe(false);
  });

  it("copies index.ts and security.ts into the auto-discovered extension dir", async () => {
    mkdirSync(join(home, ".pi"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/pi.js");
    expect(adapter.detect()).toBe(true);
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const index = readFileSync(join(extDir(), "index.ts"), "utf-8");
    const security = readFileSync(join(extDir(), "security.ts"), "utf-8");
    expect(index).toContain("@earendil-works/pi-coding-agent");
    expect(index).toContain("./security.js");
    expect(security.length).toBeGreaterThan(0);
    expect(index).toBe(readFileSync("integrations/pi/index.ts", "utf-8"));
  });

  it("is idempotent when the installed copy matches", async () => {
    mkdirSync(join(home, ".pi"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/pi.js");
    await adapter.install({ dryRun: false, force: false });
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("already-wired");
  });

  it("refreshes a stale installed copy", async () => {
    mkdirSync(extDir(), { recursive: true });
    writeFileSync(join(extDir(), "index.ts"), "// stale\n", "utf-8");
    const { adapter } = await import("../src/cli/connect/pi.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");
    expect(readFileSync(join(extDir(), "index.ts"), "utf-8")).toBe(
      readFileSync("integrations/pi/index.ts", "utf-8"),
    );
  });

  it("backs up every modified extension file before overwriting", async () => {
    mkdirSync(extDir(), { recursive: true });
    writeFileSync(join(extDir(), "index.ts"), "// stale index\n", "utf-8");
    writeFileSync(join(extDir(), "security.ts"), "// stale security\n", "utf-8");
    const { adapter } = await import("../src/cli/connect/pi.js");
    const result = await adapter.install({ dryRun: false, force: false });
    expect(result.kind).toBe("installed");

    const backups = readdirSync(join(home, ".agentmemory", "backups"));
    const indexBackup = backups.find((f) => f.startsWith("pi-index-"));
    const securityBackup = backups.find((f) => f.startsWith("pi-security-"));
    expect(indexBackup).toBeDefined();
    expect(securityBackup).toBeDefined();
    expect(
      readFileSync(join(home, ".agentmemory", "backups", indexBackup!), "utf-8"),
    ).toBe("// stale index\n");
    expect(
      readFileSync(join(home, ".agentmemory", "backups", securityBackup!), "utf-8"),
    ).toBe("// stale security\n");
  });

  it("dry-run mutates nothing", async () => {
    mkdirSync(join(home, ".pi"), { recursive: true });
    const { adapter } = await import("../src/cli/connect/pi.js");
    const result = await adapter.install({ dryRun: true, force: false });
    expect(result.kind).toBe("installed");
    expect(existsSync(extDir())).toBe(false);
  });
});

describe("integrations/pi is a valid pi package", () => {
  it("package.json declares the pi manifest, keyword, and peer deps", () => {
    const pkg = JSON.parse(readFileSync("integrations/pi/package.json", "utf-8"));
    expect(pkg.keywords).toContain("pi-package");
    expect(pkg.pi.extensions).toEqual(["./index.ts"]);
    expect(pkg.peerDependencies["@earendil-works/pi-coding-agent"]).toBe("*");
    expect(pkg.peerDependencies["typebox"]).toBe("*");
    expect(pkg.private).not.toBe(true);
  });

  it("packs a self-contained extension with its helper and license", () => {
    const dir = mkdtempSync(join(tmpdir(), "am-pi-pack-"));
    try {
      const npmCli = process.env.npm_execpath;
      const output = execFileSync(npmCli ? process.execPath : "npm", [
        ...(npmCli ? [npmCli] : []),
        "pack", "./integrations/pi", "--ignore-scripts", "--offline",
        "--json", "--pack-destination", dir,
      ], {
        encoding: "utf-8",
        env: { ...process.env, npm_config_cache: join(dir, "cache") },
      });
      const [packed] = JSON.parse(output);
      execFileSync("tar", ["-xzf", join(dir, packed.filename), "-C", dir]);
      const packageDir = join(dir, "package");
      expect(readdirSync(packageDir).sort()).toEqual([
        "LICENSE", "README.md", "index.ts", "package.json", "security.ts",
      ]);
      const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8"));
      expect(readFileSync(join(packageDir, pkg.pi.extensions[0]), "utf-8"))
        .toBe(readFileSync("integrations/pi/index.ts", "utf-8"));
      expect(readFileSync(join(packageDir, "security.ts"), "utf-8"))
        .toBe(readFileSync("integrations/pi/security.ts", "utf-8"));
      expect(readFileSync(join(packageDir, "LICENSE"), "utf-8"))
        .toBe(readFileSync("LICENSE", "utf-8"));
      expect(pkg.dependencies).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the npm package ships integrations/pi", () => {
    const root = JSON.parse(readFileSync("package.json", "utf-8"));
    expect(root.files).toContain("integrations/pi/");
  });

  it("extension imports the current pi core package name", () => {
    const index = readFileSync("integrations/pi/index.ts", "utf-8");
    expect(index).toContain("@earendil-works/pi-coding-agent");
    expect(index).not.toContain("@mariozechner/pi-coding-agent");
  });
});
