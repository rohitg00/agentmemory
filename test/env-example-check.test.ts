import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function check(source: string, example = "", spaces = false) {
  const root = mkdtempSync(join(tmpdir(), spaces ? "am env guard " : "am-env-guard-"));
  roots.push(root);
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "src/fixture.ts"), source);
  writeFileSync(join(root, ".env.example"), example);
  writeFileSync(join(root, "scripts/check-env-example.mjs"), readFileSync(resolve("scripts/check-env-example.mjs")));
  symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
  const result = spawnSync(process.execPath, [join(root, "scripts/check-env-example.mjs")], {
    cwd: root, encoding: "utf8", timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: root, USERPROFILE: root, LANG: "C.UTF-8", NO_COLOR: "1" },
  });
  expect(result.error).toBeUndefined();
  return { code: result.status, output: result.stdout + result.stderr };
}

describe("environment example coverage guard", () => {
  it.each([
    'const value = process.env["UNDOCUMENTED_GUARD_SETTING"];',
    "const value = process.env['UNDOCUMENTED_GUARD_SETTING'];",
    "const value = process.env.UNDOCUMENTED_GUARD_SETTING;",
    'const value = getEnvVar("UNDOCUMENTED_GUARD_SETTING");',
    "const value = getEnvVar('UNDOCUMENTED_GUARD_SETTING');",
    "const env = process.env; const value = env.UNDOCUMENTED_GUARD_SETTING;",
    "const { UNDOCUMENTED_GUARD_SETTING: value } = process.env;",
    'function envValue(key: string) { return process.env[key]; } const value = envValue("UNDOCUMENTED_GUARD_SETTING");',
  ])("rejects an undocumented literal configuration reader: %s", (source) => {
    const result = check(source);
    expect(result.code).toBe(1);
    expect(result.output).toContain("UNDOCUMENTED_GUARD_SETTING");
  });

  it("accepts a documented configuration setting regardless of access notation", () => {
    const result = check("const value = process.env.DOCUMENTED_GUARD_SETTING;", "DOCUMENTED_GUARD_SETTING=\n");
    expect(result.code).toBe(0);
  });

  it("does not turn unrelated strings and comments into configuration readers", () => {
    const result = check('const labels = ["NOT_AN_ENVIRONMENT_SETTING"]; // process.env["COMMENT_ONLY_SETTING"]\n');
    expect(result.code).toBe(0);
  });

  it("keeps an explicit exception for inherited operating-system variables", () => {
    expect(check('const home = process.env["HOME"];').code).toBe(0);
  });

  it("keeps documented telemetry configuration consumed by the pinned engine SDK", () => {
    expect(check("", "III_TELEMETRY_ENABLED=false\n").code).toBe(0);
  });

  it("resolves an ordinary checkout path containing spaces", () => {
    expect(check('const value = process.env["DOCUMENTED_GUARD_SETTING"];', "DOCUMENTED_GUARD_SETTING=\n", true).code).toBe(0);
  });
});
