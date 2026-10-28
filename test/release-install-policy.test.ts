import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { expect, it } from "vitest";

it("publication dependency installs cannot execute root or dependency lifecycle scripts", () => {
  const workflow = parse(readFileSync(resolve(".github/workflows/publish.yml"), "utf8"));
  const commands = workflow.jobs.publish.steps
    .map((step: { run?: string }) => step.run)
    .filter((command?: string) => command?.startsWith("npm install --package-lock-only") || command?.startsWith("npm ci "));
  expect(commands).toHaveLength(2);
  const root = mkdtempSync(join(tmpdir(), "release-install-policy-"));
  const dependency = join(root, "dependency");
  mkdirSync(dependency);
  const marker = join(root, "lifecycle-ran");
  const script = 'require("node:fs").writeFileSync(process.env.RELEASE_LIFECYCLE_MARKER, "executed")';
  const env = { PATH: process.env.PATH, HOME: root, npm_config_cache: join(root, "cache"), npm_config_offline: "true", RELEASE_LIFECYCLE_MARKER: marker };
  try {
    writeFileSync(join(dependency, "package.json"), JSON.stringify({ name: "release-install-fixture", version: "1.0.0", scripts: { postinstall: "node install.cjs" } }));
    writeFileSync(join(dependency, "install.cjs"), script);
    const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", root], { cwd: dependency, env, encoding: "utf8", timeout: 20_000 }));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "release-policy-root", private: true, dependencies: { "release-install-fixture": `file:./${packed[0].filename}` }, scripts: { postinstall: "node install.cjs" } }));
    writeFileSync(join(root, "install.cjs"), script);
    for (const command of commands) {
      execFileSync("npm", command.split(" ").slice(1), { cwd: root, env, encoding: "utf8", timeout: 20_000 });
      expect(existsSync(marker), `${command} executed a lifecycle script`).toBe(false);
    }
    expect(existsSync(join(root, "node_modules/release-install-fixture/install.cjs"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
