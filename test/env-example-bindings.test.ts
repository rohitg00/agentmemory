import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type Case = { id: string; sources: Record<string, string>; example: string; expected: number; missing?: string[] };
const cases: Case[] = [
  {
    id: "scoped literal keys remain distinct",
    sources: { "fixture.ts": 'export function first() { const name = "UNDOCUMENTED_LEFT_SETTING"; return process.env[name]; }\nexport function second() { const name = "UNDOCUMENTED_RIGHT_SETTING"; return process.env[name]; }\n' },
    example: "", expected: 1, missing: ["UNDOCUMENTED_LEFT_SETTING", "UNDOCUMENTED_RIGHT_SETTING"],
  },
  {
    id: "documented scoped keys are not orphans",
    sources: { "fixture.ts": 'export function first() { const name = "DOCUMENTED_LEFT_SETTING"; return process.env[name]; }\nexport function second() { const name = "DOCUMENTED_RIGHT_SETTING"; return process.env[name]; }\n' },
    example: "DOCUMENTED_LEFT_SETTING=\nDOCUMENTED_RIGHT_SETTING=\n", expected: 0,
  },
  {
    id: "an ordinary env property is not process environment",
    sources: { "fixture.ts": 'const values = { env: { ORDINARY_OBJECT_LABEL: "label" } }; export const label = values.env.ORDINARY_OBJECT_LABEL;\n' },
    example: "", expected: 0,
  },
  {
    id: "a local reader alias retains its key argument",
    sources: { "fixture.ts": 'function readConfig(name: string) { return process.env[name]; } const setting = readConfig; export const value = setting("UNDOCUMENTED_ALIAS_SETTING");\n' },
    example: "", expected: 1, missing: ["UNDOCUMENTED_ALIAS_SETTING"],
  },
  {
    id: "an ordinary object named env is not ambient environment",
    sources: { "fixture.ts": 'const env = { ORDINARY_LOCAL_LABEL: "label" }; export const label = env.ORDINARY_LOCAL_LABEL;\n' },
    example: "", expected: 0,
  },
  {
    id: "an imported reader alias resolves across source files",
    sources: {
      "config.ts": "export function getEnvVar(name: string) { return process.env[name]; }\n",
      "fixture.ts": 'import { getEnvVar as read } from "./config.js"; const setting = read; export const value = setting("UNDOCUMENTED_IMPORTED_SETTING");\n',
    },
    example: "", expected: 1, missing: ["UNDOCUMENTED_IMPORTED_SETTING"],
  },
  {
    id: "a local process binding does not become the Node process",
    sources: { "fixture.ts": 'const process = { env: { ORDINARY_PROCESS_LABEL: "label" } }; export const label = process.env.ORDINARY_PROCESS_LABEL;\n' },
    example: "", expected: 0,
  },
  {
    id: "a same-named ordinary function does not become a config reader",
    sources: { "fixture.ts": 'function getEnvVar(name: string) { return { name }; } export const value = getEnvVar("ORDINARY_CALL_LABEL");\n' },
    example: "", expected: 0,
  },
];

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("environment reader binding provenance", () => {
  it.each(cases)("$id", ({ sources, example, expected, missing }) => {
    const root = mkdtempSync(join(tmpdir(), "am-env-bindings-"));
    roots.push(root);
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "scripts"));
    for (const [name, text] of Object.entries(sources)) writeFileSync(join(root, "src", name), text);
    writeFileSync(join(root, ".env.example"), example);
    writeFileSync(join(root, "scripts/check-env-example.mjs"), readFileSync(resolve("scripts/check-env-example.mjs")));
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
    const result = spawnSync(process.execPath, [join(root, "scripts/check-env-example.mjs"), "--json"], {
      cwd: root, encoding: "utf8", timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: root, USERPROFILE: root, LANG: "C.UTF-8", NO_COLOR: "1" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(expected);
    const report = JSON.parse(result.stdout);
    if (missing) expect(report.missing).toEqual(missing);
    else expect(report).toMatchObject({ missing: [], orphan: [] });
  });
});
