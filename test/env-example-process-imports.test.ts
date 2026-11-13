import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const imports = [
  ['import proc from "node:process";', "proc.env"],
  ['import * as proc from "node:process";', "proc.env"],
  ['import { default as proc } from "node:process";', "proc.env"],
  ['import { env as environment } from "node:process";', "environment"],
  ['import proc from "process";', "proc.env"],
  ['import { env as environment } from "process";', "environment"],
];

describe("Node process import provenance", () => {
  it.each(imports)("checks the literal key through %s", (declaration, receiver) => {
    for (const documented of [false, true]) {
      const root = mkdtempSync(join(tmpdir(), "am-env-process-import-"));
      roots.push(root);
      mkdirSync(join(root, "src"));
      mkdirSync(join(root, "scripts"));
      writeFileSync(join(root, "src/fixture.ts"), `${declaration}\nexport const value = ${receiver}.PROCESS_IMPORT_SETTING;\n`);
      writeFileSync(join(root, ".env.example"), documented ? "PROCESS_IMPORT_SETTING=\n" : "");
      writeFileSync(join(root, "scripts/check-env-example.mjs"), readFileSync(resolve("scripts/check-env-example.mjs")));
      symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
      const result = spawnSync(process.execPath, [join(root, "scripts/check-env-example.mjs"), "--json"], {
        cwd: root, encoding: "utf8", timeout: 15_000,
        env: { PATH: process.env.PATH, HOME: root, USERPROFILE: root, LANG: "C.UTF-8", NO_COLOR: "1" },
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(documented ? 0 : 1);
      expect(JSON.parse(result.stdout)).toMatchObject({ missing: documented ? [] : ["PROCESS_IMPORT_SETTING"], orphan: [] });
    }
  });
});
