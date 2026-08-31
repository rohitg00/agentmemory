import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentmemoryHome,
  dockerComposeArgs,
  dockerProjectName,
  isBundledConfig,
  legacyDataMigrations,
  resolveEngineCwd,
  rewriteBundledConfig,
  runtimeConfigPath,
} from "../src/cli/engine-launch.js";

const HOME = "/Users/test";

describe("engine-launch path resolution", () => {
  it("agentmemoryHome anchors config and runtimeConfigPath scopes instance state", () => {
    expect(agentmemoryHome(HOME)).toBe(join(HOME, ".agentmemory"));
    expect(runtimeConfigPath("/var/lib/agentmemory/instance-1")).toBe(
      join("/var/lib/agentmemory/instance-1", "iii-config.runtime.yaml"),
    );
  });

  it("isBundledConfig matches both package config locations", () => {
    const dist = "/opt/pkg/dist";
    expect(isBundledConfig(join(dist, "iii-config.yaml"), dist)).toBe(true);
    expect(isBundledConfig(join(dist, "..", "iii-config.yaml"), dist)).toBe(true);
    expect(isBundledConfig("/opt/pkg/iii-config.yaml", dist)).toBe(true);
    expect(isBundledConfig(join(HOME, ".agentmemory", "iii-config.yaml"), dist)).toBe(false);
    expect(isBundledConfig("/some/project/iii-config.yaml", dist)).toBe(false);
  });

  it("resolveEngineCwd keeps the invocation cwd for repo-local configs", () => {
    const repo = "/work/agentmemory";
    expect(resolveEngineCwd(join(repo, "iii-config.yaml"), repo, HOME)).toBe(repo);
  });

  it("resolveEngineCwd anchors bundled configs and preserves custom config roots", () => {
    const repo = "/work/some-project";
    expect(resolveEngineCwd("/opt/pkg/dist/iii-config.yaml", repo, HOME, true)).toBe(
      join(HOME, ".agentmemory"),
    );
    expect(
      resolveEngineCwd(join(HOME, ".agentmemory", "iii-config.yaml"), repo, HOME),
    ).toBe(join(HOME, ".agentmemory"));
    expect(resolveEngineCwd("/etc/custom-iii.yaml", repo, HOME)).toBe(
      "/etc",
    );
    expect(resolveEngineCwd("custom-iii.yaml", repo, HOME)).toBe(repo);
  });

  it("scopes Docker compose commands by REST-port project", () => {
    expect(dockerProjectName(3211)).toBe("agentmemory-3211");
    expect(
      dockerComposeArgs("/opt/agentmemory/docker-compose.yml", "agentmemory-3211", [
        "up",
        "-d",
      ]),
    ).toEqual([
      "compose",
      "-p",
      "agentmemory-3211",
      "-f",
      "/opt/agentmemory/docker-compose.yml",
      "up",
      "-d",
    ]);
  });

  it("legacyDataMigrations targets the resolved platform data dir", () => {
    const resolvedDataDir = "/var/lib/agentmemory";
    const migrations = legacyDataMigrations("/work/proj", HOME, resolvedDataDir);
    expect(migrations).toEqual([
      {
        from: join("/work/proj", "data", "state_store.db"),
        to: join(resolvedDataDir, "state_store.db"),
      },
      {
        from: join("/work/proj", "data", "stream_store"),
        to: join(resolvedDataDir, "stream_store"),
      },
    ]);
  });
});

describe("rewriteBundledConfig", () => {
  const SAMPLE = [
    "          file_path: ./data/state_store.db",
    "          file_path: ./data/stream_store",
    "  - name: iii-exec",
    "    config:",
    "      watch:",
    "        - src/**/*.ts",
    "      exec:",
    "        - node dist/index.mjs",
  ].join("\n");

  it("substitutes data paths and removes bundled worker supervision", () => {
    const out = rewriteBundledConfig(SAMPLE, HOME, "/usr/bin/node", "/opt/pkg/dist/index.mjs");
    expect(out).toContain(
      `file_path: '${join(HOME, ".agentmemory", "data", "state_store.db")}'`,
    );
    expect(out).toContain(
      `file_path: '${join(HOME, ".agentmemory", "data", "stream_store")}'`,
    );
    expect(out).not.toContain("./data/");
    expect(out).not.toContain("- name: iii-exec");
    expect(out).not.toContain("src/**/*.ts");
  });

  it("preserves unrelated commands in the bundled iii-exec worker", () => {
    const bundled = [
      "workers:",
      "  - name: iii-exec",
      "    config:",
      "      exec:",
      "        - node dist/index.mjs",
      "        - node scripts/other-worker.mjs",
    ].join("\n");

    const out = rewriteBundledConfig(
      bundled,
      HOME,
      "/usr/bin/node",
      "/opt/pkg/dist/index.mjs",
    );
    expect(out).toContain("- name: iii-exec");
    expect(out).toContain("- node scripts/other-worker.mjs");
    expect(out).not.toContain("- node dist/index.mjs");
  });

  it("escapes apostrophes in paths for single-quoted YAML", () => {
    const out = rewriteBundledConfig(
      SAMPLE,
      "/Users/o'brien",
      "/usr/bin/node",
      "/opt/pkg/dist/index.mjs",
    );
    expect(out).toContain("o''brien");
  });

  it("rewrites the real bundled config with no relative paths left", () => {
    const raw = readFileSync(join(import.meta.dirname, "..", "iii-config.yaml"), "utf-8");
    const out = rewriteBundledConfig(raw, HOME, process.execPath, "/opt/pkg/dist/index.mjs");
    expect(out).not.toContain("./data/");
    expect(out).not.toContain("src/**/*.ts");
    expect(out).not.toContain("- node dist/index.mjs");
    expect(out).not.toContain("- name: iii-exec");
    expect(out).toContain(join(HOME, ".agentmemory", "data", "state_store.db"));
    expect(out).toContain(join(HOME, ".agentmemory", "data", "stream_store"));
  });

  it("uses the CLI-resolved data directory and port quartet", () => {
    const raw = readFileSync(join(import.meta.dirname, "..", "iii-config.yaml"), "utf-8");
    const dataDir = "/var/lib/agentmemory";
    const out = rewriteBundledConfig(
      raw,
      HOME,
      process.execPath,
      "/opt/pkg/dist/index.mjs",
      {
        dataDir,
        ports: {
          restPort: 3211,
          streamPort: 3212,
          viewerPort: 3213,
          enginePort: 49234,
        },
      },
    );

    expect(out).toContain(join(dataDir, "state_store.db"));
    expect(out).toContain("port: 3211");
    expect(out).toContain("port: 3212");
    expect(out).toContain("port: 49234");
  });
});
