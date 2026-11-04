import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

function fixtureRoot(withEnvExample: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "copy-assets-"));
  roots.push(root);
  mkdirSync(join(root, "src", "viewer"), { recursive: true });
  writeFileSync(join(root, "src", "viewer", "index.html"), "<html></html>");
  writeFileSync(join(root, "src", "viewer", "favicon.svg"), "<svg/>");
  if (withEnvExample) writeFileSync(join(root, ".env.example"), "# example\n");
  mkdirSync(join(root, "dist"), { recursive: true });
  for (const stale of ["iii-config.yaml", "iii-config.docker.yaml", "docker-compose.yml"]) {
    writeFileSync(join(root, "dist", stale), "stale");
  }
  return root;
}

function copyAssets(root: string) {
  return spawnSync(process.execPath, [resolve("scripts/copy-assets.mjs"), root], { encoding: "utf-8" });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("build asset copy", () => {
  it("copies the viewer and env example and removes engine configs from dist", () => {
    const root = fixtureRoot(true);
    expect(copyAssets(root).status).toBe(0);
    expect(readFileSync(join(root, "dist", "viewer", "index.html"), "utf-8")).toBe("<html></html>");
    expect(existsSync(join(root, "dist", "viewer", "favicon.svg"))).toBe(true);
    expect(existsSync(join(root, "dist", ".env.example"))).toBe(true);
    for (const stale of ["iii-config.yaml", "iii-config.docker.yaml", "docker-compose.yml"]) {
      expect(existsSync(join(root, "dist", stale))).toBe(false);
    }
  });

  it("works without an env example", () => {
    const root = fixtureRoot(false);
    expect(copyAssets(root).status).toBe(0);
    expect(existsSync(join(root, "dist", ".env.example"))).toBe(false);
  });

  it("fails when a viewer asset is missing", () => {
    const root = fixtureRoot(true);
    rmSync(join(root, "src", "viewer", "favicon.svg"));
    expect(copyAssets(root).status).not.toBe(0);
  });

  it("keeps POSIX-only shell commands out of the npm scripts contributors run", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf-8")).scripts as Record<string, string>;
    for (const name of ["build", "plugin:pack:openclaw", "plugin:pack:pi", "plugin:pack:codex"]) {
      expect(scripts[name], name).not.toMatch(/(^|[\s&|(])(rm|cp|mkdir|mv|chmod)\s/);
      expect(scripts[name], name).not.toContain("2>/dev/null");
    }
  });
});
