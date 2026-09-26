import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  agentmemoryHome,
  dockerComposeArgs,
  dockerProjectName,
  isBundledConfig,
  legacyDataMigrations,
  redactCredentialUrls,
  resolveEngineCwd,
  resolveLaunchRenderFailure,
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

  it("forwards the redis state backend through to renderEngineConfig", () => {
    const raw = readFileSync(join(import.meta.dirname, "..", "iii-config.yaml"), "utf-8");
    const out = rewriteBundledConfig(
      raw,
      HOME,
      process.execPath,
      "/opt/pkg/dist/index.mjs",
      {
        dataDir: "/var/lib/agentmemory",
        stateBackend: { kind: "redis", redisUrl: "redis://localhost:6379" },
      },
    );

    expect(out).toMatch(/- name: iii-state\n {4}config:\n {6}adapter:\n {8}name: redis/);
    expect(out).toMatch(/- name: iii-stream\n {4}config:\n {6}port: 3112\n {6}host: 127\.0\.0\.1\n {6}adapter:\n {8}name: redis/);
    expect(out).not.toContain("store_method: file_based");
  });
});

describe("resolveLaunchRenderFailure", () => {
  it("is fatal when the redis backend fails to render, so the launch never silently falls back", () => {
    const result = resolveLaunchRenderFailure("redis", new Error("no adapter block"));
    expect(result.fatal).toBe(true);
    expect(result.fatal && result.message).toMatch(/no adapter block/);
  });

  it("stays non-fatal for the file backend, keeping the bundled-config fallback", () => {
    const result = resolveLaunchRenderFailure("file", new Error("disk full"));
    expect(result).toEqual({ fatal: false });
  });

  it("stringifies a non-Error throw", () => {
    const result = resolveLaunchRenderFailure("redis", "permission denied");
    expect(result.fatal && result.message).toMatch(/permission denied/);
  });
});

describe("redactCredentialUrls", () => {
  it("masks userinfo in a redis URL without touching the rest of the message", () => {
    const out = redactCredentialUrls(
      "Failed to connect to redis://user:s3cr3t@localhost:6379: connection refused",
    );
    expect(out).toBe("Failed to connect to redis://***@localhost:6379: connection refused");
    expect(out).not.toContain("s3cr3t");
  });

  it("leaves text with no credentials untouched", () => {
    expect(redactCredentialUrls("engine exited with code 1")).toBe("engine exited with code 1");
  });
});
