import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  iiiConfigCandidates,
  resolveIiiConfigPath,
} from "../src/cli/iii-config.js";

function paths() {
  const cwd = join("tmp", "project");
  const home = join("tmp", "home");
  const packageDir = join("tmp", "node_modules", "@agentmemory", "agentmemory", "dist");
  return {
    envConfig: join("tmp", "custom", "iii-config.yaml"),
    cwd,
    cwdConfig: join(cwd, "iii-config.yaml"),
    home,
    homeConfig: join(home, ".agentmemory", "iii-config.yaml"),
    packageDir,
    bundledConfig: join(packageDir, "iii-config.yaml"),
    bundledRootConfig: join(packageDir, "..", "iii-config.yaml"),
  };
}

function resolve(existing: string[], envPath?: string): string {
  const p = paths();
  const existingSet = new Set(existing);
  return resolveIiiConfigPath({
    envPath,
    cwd: p.cwd,
    home: p.home,
    packageDir: p.packageDir,
    exists: (path) => existingSet.has(path),
  });
}

describe("iii config lookup", () => {
  it("documents the lookup order", () => {
    const p = paths();
    expect(
      iiiConfigCandidates({
        envPath: p.envConfig,
        cwd: p.cwd,
        home: p.home,
        packageDir: p.packageDir,
      }),
    ).toEqual([
      p.envConfig,
      p.cwdConfig,
      p.homeConfig,
      p.bundledConfig,
      p.bundledRootConfig,
    ]);
  });

  it("uses AGENTMEMORY_III_CONFIG first", () => {
    const p = paths();
    expect(
      resolve(
        [p.envConfig, p.cwdConfig, p.homeConfig, p.bundledConfig],
        p.envConfig,
      ),
    ).toBe(p.envConfig);
  });

  it("uses cwd config before ~/.agentmemory and bundled configs", () => {
    const p = paths();
    expect(resolve([p.cwdConfig, p.homeConfig, p.bundledConfig])).toBe(
      p.cwdConfig,
    );
  });

  it("uses ~/.agentmemory config before bundled configs", () => {
    const p = paths();
    expect(resolve([p.homeConfig, p.bundledConfig])).toBe(p.homeConfig);
  });

  it("falls back to the bundled dist config", () => {
    const p = paths();
    expect(resolve([p.bundledConfig, p.bundledRootConfig])).toBe(
      p.bundledConfig,
    );
  });

  it("falls back to the bundled root config when dist config is absent", () => {
    const p = paths();
    expect(resolve([p.bundledRootConfig])).toBe(p.bundledRootConfig);
  });

  it("returns an empty string when no config exists", () => {
    expect(resolve([])).toBe("");
  });
});
