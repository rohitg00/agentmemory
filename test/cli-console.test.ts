import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("agentmemory console migration", () => {
  it.each([
    { args: [], port: 3113 },
    { args: ["--port", "3211"], port: 3213 },
    { args: ["--instance", "2", "--console-port", "4014"], port: 3313 },
  ])("prints the selected viewer without installing or launching an engine: $args", ({ args, port }) => {
    const home = mkdtempSync(join(tmpdir(), "agentmemory-console-"));
    try {
      const result = spawnSync(process.execPath, [resolve("dist/cli.mjs"), "console", ...args], {
        cwd: home,
        env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, CI: "1", NO_COLOR: "1" },
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("iii 0.25 retired the bundled engine console");
      expect(result.stdout).toContain(`http://localhost:${port}`);
      expect(result.stdout).toContain("agentmemory status");
      expect(existsSync(join(home, ".agentmemory", "bin"))).toBe(false);
      expect(existsSync(join(home, ".agentmemory", "engine-state.json"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
