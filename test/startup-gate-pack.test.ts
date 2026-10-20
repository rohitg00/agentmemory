import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

describe.skipIf(process.platform === "win32")("startup gate npm pack output", () => {
  it("parses actual npm JSON without lifecycle stderr while retaining pack diagnostics", () => {
    const root = mkdtempSync(join(tmpdir(), "startup-pack-test-"));
    const fixture = join(root, "fixture");
    const bin = join(root, "bin");
    const out = join(root, "out");
    const cache = join(root, "npm-cache");
    const npmCli = realpathSync(process.env.npm_execpath || execFileSync("which", ["npm"], { encoding: "utf8" }).trim());
    const gate = fileURLToPath(new URL("../scripts/release-gate/startup.mjs", import.meta.url));
    try {
      mkdirSync(fixture); mkdirSync(bin);
      writeFileSync(join(fixture, "package.json"), JSON.stringify({ name: "@agentmemory/agentmemory", version: "1.0.0", dependencies: {}, files: ["payload.txt"], scripts: { prepack: "node prepack.cjs" } }));
      writeFileSync(join(fixture, "payload.txt"), "The package must be built by actual npm.\n");
      writeFileSync(join(fixture, "prepack.cjs"), 'console.error("fixture prepack diagnostic");');
      const wrapper = join(bin, "npm");
      writeFileSync(wrapper, `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "pack") {
  const result = spawnSync(process.execPath, [${JSON.stringify(npmCli)}, ...args], { cwd: ${JSON.stringify(fixture)}, env: process.env, stdio: "inherit" });
  process.exit(result.status ?? 1);
} else if (args[0] === "config") console.log(${JSON.stringify(cache)});
else process.exit(18);
`);
      chmodSync(wrapper, 0o755);
      const result = spawnSync(process.execPath, [gate, "--skip-build", "--out", out], {
        env: { ...process.env, PATH: [bin, process.env.PATH].join(delimiter), npm_config_cache: cache, AGENTMEMORY_GATE_ENGINE: join(root, "intentionally-missing-engine") },
        encoding: "utf8", timeout: 20_000,
      });
      expect(result.error, `${result.signal}: ${result.stderr}`).toBeUndefined();
      expect(result.status, result.stderr).toBe(1);
      const summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"));
      expect(summary.tarball).toMatch(/agentmemory-agentmemory-1\.0\.0\.tgz$/);
      expect(summary.fatal).toContain("Pinned engine missing:");
      expect(summary.fatal).toContain("intentionally-missing-engine");
      expect(summary.fatal).not.toContain("SyntaxError");
      const packLog = readFileSync(join(out, "pack.log"), "utf8");
      expect(packLog).toContain("fixture prepack diagnostic");
      expect(packLog).toContain('"filename": "agentmemory-agentmemory-1.0.0.tgz"');
      expect(existsSync(summary.tarball)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 25_000);
});
