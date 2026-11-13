import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

it("rejects and repairs current API-count drift without changing historical prose", () => {
  const fixture = mkdtempSync(join(tmpdir(), "am-docs-api-"));
  try {
    const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], { cwd: root, maxBuffer: 128 * 1024 * 1024 });
    execFileSync("tar", ["-xf", "-", "-C", fixture], { input: archive });
    // Before a commit, test the same working files as the developer's local run.
    const changed = execFileSync("git", ["ls-files", "--modified", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
    for (const path of changed.split("\0").filter(Boolean)) cpSync(join(root, path), join(fixture, path), { recursive: true });
    cpSync(join(root, "dist"), join(fixture, "dist"), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"), "junction");
    execFileSync("git", ["init", "--quiet"], { cwd: fixture });
    const env = {
      PATH: process.env.PATH, HOME: fixture, USERPROFILE: fixture, LANG: "C.UTF-8",
      CI: "1", NO_COLOR: "1", III_TELEMETRY_ENABLED: "false",
      NODE_OPTIONS: "--max-old-space-size=2048",
    };
    const run = (check: boolean) => {
      const result = spawnSync(process.execPath, [join(fixture, "node_modules/tsx/dist/cli.mjs"), join(fixture, "scripts/docs-sync.ts"), ...(check ? ["--check"] : [])], {
        cwd: fixture, env, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
      });
      expect(result.error, result.stderr).toBeUndefined();
      return result;
    };
    const readme = join(fixture, "README.md");
    const original = readFileSync(readme, "utf8");
    const historical = "Historical example: 999 endpoints on port 1234.\n\n";
    writeFileSync(readme, historical + original);
    expect(run(true).status).toBe(0);
    const summary = /^(\d+(?:[,.\u00a0\u202f ]\d{3})*) endpoints on port /m.exec(original);
    const count = summary?.[1];
    expect(count).toBeDefined();
    if (!summary || !count) throw new Error("Current API inventory summary is missing");
    const incorrect = String(Number(count.replace(/\D/g, "")) + 1);
    writeFileSync(readme, historical + original.replace(summary[0], `${incorrect} endpoints on port `));
    const rejected = run(true);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("would update README.md");
    expect(run(false).status).toBe(0);
    expect(readFileSync(readme, "utf8")).toBe(historical + original);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}, 400_000);
