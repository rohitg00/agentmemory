import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function checkForms(key: string, sources: string[], reader = true) {
  const observed = [], expected = [];
  for (const source of sources) for (const documented of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), "am-env-computed-"));
    roots.push(root);
    mkdirSync(join(root, "src")); mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, "src/fixture.ts"), source);
    writeFileSync(join(root, ".env.example"), documented ? `${key}=\n` : "");
    writeFileSync(join(root, "scripts/check-env-example.mjs"), readFileSync(resolve("scripts/check-env-example.mjs")));
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
    const result = spawnSync(process.execPath, [join(root, "scripts/check-env-example.mjs"), "--json"], {
      cwd: root, encoding: "utf8", timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: root, USERPROFILE: root, LANG: "C.UTF-8", NO_COLOR: "1" },
    });
    expect(result.error).toBeUndefined();
    const report: { missing: string[]; orphan: string[] } = JSON.parse(result.stdout);
    observed.push({ source, documented, status: result.status, missing: report.missing, orphan: report.orphan });
    const missing = !documented && reader ? [key] : [];
    const orphan = documented && !reader ? [key] : [];
    expected.push({ source, documented, status: missing.length || orphan.length ? 1 : 0, missing, orphan });
  }
  expect(observed).toEqual(expected);
}
it("recognizes bracketed process environment receivers and their static keys", () => {
  checkForms("BRACKET_SETTING", [
    'export const value = process["env"]["BRACKET_SETTING"];',
    'export const value = process["env"].BRACKET_SETTING;',
    'const name = "env"; export const value = process[name].BRACKET_SETTING;',
  ]);
}, 120_000);
it("resolves literal and constant computed destructuring keys", () => {
  checkForms("COMPUTED_SETTING", [
    'const { ["COMPUTED_SETTING"]: value } = process.env; void value;',
    'const key = "COMPUTED_SETTING"; const { [key]: value } = process.env; void value;',
  ]);
}, 120_000);
it("keeps ordinary bracketed objects and shadowed process parameters out of environment readers", () => {
  checkForms("FAKE_SETTING", [
    'const ordinary = { env: { FAKE_SETTING: "local" } }; export const value = ordinary["env"].FAKE_SETTING;',
    'function local(process: { env: Record<string, string> }) { return process["env"]["FAKE_SETTING"]; } export const value = local({ env: { FAKE_SETTING: "local" } });',
  ], false);
}, 120_000);
