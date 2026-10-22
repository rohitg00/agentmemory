import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const IS_WIN = process.platform === "win32";

// A .cmd wrapper is the shape that fails: CreateProcess rejects it with
// EINVAL, and the obvious remedy (shell: true) reintroduces interpretation
// of whatever ends up on the command line.
describe.runIf(IS_WIN)("spawning a .cmd wrapper (#1264)", () => {
  let root: string;
  let binDir: string;
  let wrapper: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "am-cmd-"));
    binDir = join(root, "bin");
    mkdirSync(binDir, { recursive: true });
    const script = join(binDir, "echo-argv.js");
    writeFileSync(script, `console.log("ARGV:" + JSON.stringify(process.argv.slice(2)));\n`);
    chmodSync(script, 0o755);
    wrapper = join(binDir, "faketool.cmd");
    writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const viaComSpec = (args: string[]) =>
    spawnSync(process.env["ComSpec"] || "cmd.exe", ["/d", "/s", "/c", wrapper, ...args], {
      encoding: "utf-8",
    });

  it("cannot spawn a .cmd directly", () => {
    const direct = spawnSync(wrapper, ["inspect"], { encoding: "utf-8" });

    expect(direct.status).toBeNull();
    expect((direct.error as NodeJS.ErrnoException | undefined)?.code).toBe("EINVAL");
  });

  it("runs the wrapper when routed through cmd.exe", () => {
    const result = viaComSpec(["inspect", "abc123def456"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`ARGV:["inspect","abc123def456"]`);
  });

  it("keeps shell metacharacters in a container id opaque", () => {
    const hostile = "abc123 & echo PWNED";

    const result = viaComSpec(["inspect", hostile]);

    expect(result.stdout).not.toContain("PWNED\r\n");
    expect(JSON.parse(result.stdout.trim().slice("ARGV:".length))).toEqual(["inspect", hostile]);
  });

  it("keeps a pipe in a container id opaque", () => {
    const hostile = "abc123 | echo PWNED";

    const result = viaComSpec(["inspect", hostile]);

    expect(JSON.parse(result.stdout.trim().slice("ARGV:".length))).toEqual(["inspect", hostile]);
  });

  it("shows why shell: true is not the fix", () => {
    const hostile = "abc123 & echo PWNED";

    const shell = spawnSync(wrapper, ["inspect", hostile], { encoding: "utf-8", shell: true });

    expect(shell.stdout).toContain("PWNED");
  });
});
