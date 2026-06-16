import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentmemoryHome,
  buildBundledRuntimeConfig,
  isBundledConfig,
  prepareEngineLaunch,
  resolveEngineCwd,
  runtimeConfigPath,
} from "../src/cli/engine-launch.js";

const HOME = "/Users/test";

describe("engine launch path resolution", () => {
  it("anchors generated runtime config under the agentmemory home directory", () => {
    expect(agentmemoryHome(HOME)).toBe(join(HOME, ".agentmemory"));
    expect(runtimeConfigPath(HOME)).toBe(
      join(HOME, ".agentmemory", "iii-config.runtime.yaml"),
    );
  });

  it("identifies package-root and dist bundled configs", () => {
    const dist = "/opt/pkg/dist";
    expect(isBundledConfig(join(dist, "iii-config.yaml"), dist)).toBe(true);
    expect(isBundledConfig(join(dist, "..", "iii-config.yaml"), dist)).toBe(true);
    expect(isBundledConfig(join(HOME, ".agentmemory", "iii-config.yaml"), dist)).toBe(false);
    expect(isBundledConfig("/work/project/iii-config.yaml", dist)).toBe(false);
  });

  it("keeps cwd for project-local config and anchors other configs at agentmemory home", () => {
    const repo = "/work/project";
    expect(resolveEngineCwd(join(repo, "iii-config.yaml"), repo, HOME)).toBe(repo);
    expect(resolveEngineCwd(join(HOME, ".agentmemory", "iii-config.yaml"), repo, HOME)).toBe(
      join(HOME, ".agentmemory"),
    );
    expect(resolveEngineCwd("/opt/pkg/iii-config.yaml", repo, HOME)).toBe(
      join(HOME, ".agentmemory"),
    );
  });
});

describe("buildBundledRuntimeConfig", () => {
  const sample = [
    "          file_path: ./data/state_store.db",
    "          file_path: ./data/stream_store",
    "      watch:",
    "        - src/**/*.ts",
    "      exec:",
    "        - node dist/index.mjs",
  ].join("\n");

  it("rewrites bundled data and worker supervision paths to absolute paths", () => {
    const out = buildBundledRuntimeConfig(sample, HOME, "/usr/local/bin/node", "/opt/pkg/dist/index.mjs");

    expect(out).toContain(
      `file_path: '${join(HOME, ".agentmemory", "data", "state_store.db")}'`,
    );
    expect(out).toContain(
      `file_path: '${join(HOME, ".agentmemory", "data", "stream_store")}'`,
    );
    expect(out).toContain("- '/opt/pkg/dist/index.mjs'");
    expect(out).toContain("- '\"/usr/local/bin/node\" \"/opt/pkg/dist/index.mjs\"'");
    expect(out).not.toContain("./data/");
    expect(out).not.toContain("src/**/*.ts");
    expect(out).not.toContain("node dist/index.mjs");
  });

  it("escapes single quotes for YAML and double quotes for the exec command", () => {
    const out = buildBundledRuntimeConfig(
      sample,
      "/Users/o'brien",
      '/opt/node "lts"/bin/node',
      '/opt/pkg "stable"/dist/index.mjs',
    );

    expect(out).toContain("o''brien");
    expect(out).toContain('\\"lts\\"');
    expect(out).toContain('\\"stable\\"');
  });

  it("rewrites the real bundled config with no caller-cwd relative worker or data paths", () => {
    const raw = readFileSync(join(import.meta.dirname, "..", "iii-config.yaml"), "utf-8");
    const out = buildBundledRuntimeConfig(raw, HOME, process.execPath, "/opt/pkg/dist/index.mjs");

    expect(out).not.toContain("./data/");
    expect(out).not.toContain("src/**/*.ts");
    expect(out).not.toContain("- node dist/index.mjs");
    expect(out).toContain(join(HOME, ".agentmemory", "data", "state_store.db"));
    expect(out).toContain(join(HOME, ".agentmemory", "data", "stream_store"));
  });
});

describe("prepareEngineLaunch", () => {
  it("writes a generated runtime config for bundled config without copying caller data", () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-engine-launch-"));
    try {
      const invocationCwd = join(root, "project");
      const home = join(root, "home");
      const packageRoot = join(root, "pkg");
      const packageDist = join(packageRoot, "dist");
      const bundledConfig = join(packageRoot, "iii-config.yaml");
      const writtenPaths: string[] = [];
      const raw = [
        "          file_path: ./data/state_store.db",
        "          file_path: ./data/stream_store",
        "        - src/**/*.ts",
        "        - node dist/index.mjs",
      ].join("\n");

      const result = prepareEngineLaunch({
        configPath: bundledConfig,
        invocationCwd,
        home,
        packageDir: packageDist,
        nodeBin: "/usr/local/bin/node",
        readFile: () => raw,
        writeFile: (path, content) => {
          writtenPaths.push(path);
          writeFileSync(path, content);
        },
      });

      expect(result).toEqual({
        configPath: runtimeConfigPath(home),
        cwd: agentmemoryHome(home),
      });
      expect(writtenPaths).toEqual([runtimeConfigPath(home)]);
      expect(readFileSync(runtimeConfigPath(home), "utf-8")).toContain(
        join(home, ".agentmemory", "data", "state_store.db"),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves repo-local config untouched for source checkout development", () => {
    const root = mkdtempSync(join(tmpdir(), "agentmemory-engine-launch-"));
    try {
      const invocationCwd = join(root, "agentmemory");
      const home = join(root, "home");
      const packageDir = join(invocationCwd, "src");
      const projectConfig = join(invocationCwd, "iii-config.yaml");
      const writes: string[] = [];

      const result = prepareEngineLaunch({
        configPath: projectConfig,
        invocationCwd,
        home,
        packageDir,
        nodeBin: "/usr/local/bin/node",
        readFile: () => {
          throw new Error("repo-local config should not be read for rewrite");
        },
        writeFile: (path) => {
          writes.push(path);
        },
      });

      expect(result).toEqual({ configPath: projectConfig, cwd: invocationCwd });
      expect(writes).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("CLI integration", () => {
  it("starts native iii with the prepared runtime config and cwd", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "src", "cli.ts"), "utf-8");
    const start = source.indexOf("function startIiiBin");
    expect(start).toBeGreaterThanOrEqual(0);
    const next = source.indexOf("\n// Find a pinned-compatible", start);
    const body = source.slice(start, next);

    expect(body).toContain("const launch = prepareEngineLaunch");
    expect(body).toContain('["--config", launch.configPath]');
    expect(body).toContain("{ ...options, cwd: launch.cwd }");
    expect(body).toContain("configPath: launch.configPath");
  });
});
