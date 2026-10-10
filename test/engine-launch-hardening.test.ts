import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENTMEMORY_STATE_SAVE_INTERVAL_MS,
  configuredSaveIntervalMs,
  engineFlushWaitMs,
  engineSaveIntervalMs,
  engineStateConfigPaths,
  renderEngineConfig,
} from "../src/cli/engine-config.js";
import {
  engineChildEnv,
  rewriteBundledConfig,
} from "../src/cli/engine-launch.js";
import { getStateSaveIntervalMs } from "../src/config.js";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf-8");

function intervals(text: string): string[] {
  return [...text.matchAll(/save_interval_ms:\s*(\S+)/g)].map((m) => m[1]!);
}

const customConfig = [
  "workers:",
  "  - name: iii-state",
  "    config:",
  "      adapter:",
  "        name: kv",
  "        config:",
  "          store_method: file_based",
  "          file_path: /srv/state",
  "  - name: iii-stream",
  "    config:",
  "      adapter:",
  "        name: kv",
  "        config:",
  "          store_method: in_memory",
].join("\n");

describe("engine file-store save interval", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ships 2000 ms for both file-backed stores in every bundled config", () => {
    expect(AGENTMEMORY_STATE_SAVE_INTERVAL_MS).toBe(2000);
    expect(intervals(read("iii-config.yaml"))).toEqual(["2000", "2000"]);
    expect(intervals(read("iii-config.docker.yaml"))).toEqual([
      "${AGENTMEMORY_STATE_SAVE_INTERVAL_MS:2000}",
      "${AGENTMEMORY_STATE_SAVE_INTERVAL_MS:2000}",
    ]);
    for (const platform of ["coolify", "fly", "railway", "render"]) {
      expect(intervals(read(`deploy/${platform}/entrypoint.sh`))).toEqual(["2000", "2000"]);
    }
  });

  it("keeps 2000 ms through the CLI render of the bundled config", () => {
    const rendered = rewriteBundledConfig(read("iii-config.yaml"), "/home/u", "node", "/x/index.mjs", {
      dataDir: "/home/u/.agentmemory/data",
      ports: { restPort: 4711, streamPort: 4712, viewerPort: 4713, enginePort: 49951 },
    });
    expect(intervals(rendered)).toEqual(["2000", "2000"]);
    expect(engineFlushWaitMs("file", [rendered])).toBe(3500);
  });

  it("applies an explicit override to both stores", () => {
    const rendered = renderEngineConfig(read("iii-config.yaml"), {
      dataDir: "/d",
      saveIntervalMs: 750,
    });
    expect(intervals(rendered)).toEqual(["750", "750"]);
    expect(configuredSaveIntervalMs(rendered)).toBe(750);
  });

  it("adds the interval to a custom file-backed store that has none and leaves in-memory stores alone", () => {
    const rendered = renderEngineConfig(customConfig, { dataDir: "/d" });
    expect(rendered).toContain("          store_method: file_based\n          save_interval_ms: 2000\n");
    expect(intervals(rendered)).toEqual(["2000"]);
  });

  it("keeps a value the user wrote in their own config unless overridden", () => {
    const own = customConfig.replace("store_method: file_based", "store_method: file_based\n          save_interval_ms: 9000");
    expect(intervals(renderEngineConfig(own, { dataDir: "/d" }))).toEqual(["9000"]);
    expect(intervals(renderEngineConfig(own, { dataDir: "/d", saveIntervalMs: 1000 }))).toEqual(["1000"]);
  });

  it("does not carry the interval into the redis adapter", () => {
    const rendered = renderEngineConfig(read("iii-config.yaml"), {
      dataDir: "/d",
      stateBackend: { kind: "redis", redisUrl: "redis://localhost:6379" },
    });
    expect(intervals(rendered)).toEqual([]);
    expect(engineFlushWaitMs("redis", [rendered])).toBe(0);
  });

  it("derives the interval from the persisted iii-state entry before the runtime config", () => {
    const paths = engineStateConfigPaths("/home/u/.agentmemory", "/data/iii-config.runtime.yaml");
    expect(paths[0]).toBe("/home/u/.agentmemory/config/iii-state.yaml");
    expect(paths.at(-1)).toBe("/data/iii-config.runtime.yaml");
    const persisted = "id: iii-state\nvalue:\n  adapter:\n    config:\n      save_interval_ms: 2000\n      store_method: file_based\n";
    const strippedRuntime = "workers:\n  - name: iii-state\n    # value now lives in the configuration worker\n";
    expect(engineSaveIntervalMs([persisted, strippedRuntime])).toBe(2000);
    expect(engineSaveIntervalMs([strippedRuntime])).toBe(5000);
    expect(engineFlushWaitMs("file", [persisted, strippedRuntime])).toBe(3500);
  });

  it("reads AGENTMEMORY_STATE_SAVE_INTERVAL_MS as a positive override", () => {
    vi.stubEnv("AGENTMEMORY_STATE_SAVE_INTERVAL_MS", "1500");
    expect(getStateSaveIntervalMs()).toBe(1500);
    vi.stubEnv("AGENTMEMORY_STATE_SAVE_INTERVAL_MS", "0");
    expect(getStateSaveIntervalMs()).toBeUndefined();
    vi.stubEnv("AGENTMEMORY_STATE_SAVE_INTERVAL_MS", "abc");
    expect(getStateSaveIntervalMs()).toBeUndefined();
  });
});

describe("engine child environment", () => {
  it("bounds glibc malloc arenas on linux", () => {
    expect(engineChildEnv({ PATH: "/usr/bin" }, "linux")["MALLOC_ARENA_MAX"]).toBe("2");
  });

  it("keeps a MALLOC_ARENA_MAX the user already set", () => {
    expect(engineChildEnv({ MALLOC_ARENA_MAX: "8" }, "linux")["MALLOC_ARENA_MAX"]).toBe("8");
  });

  it("does not set it on macOS or Windows", () => {
    expect(engineChildEnv({}, "darwin")["MALLOC_ARENA_MAX"]).toBeUndefined();
    expect(engineChildEnv({}, "win32")["MALLOC_ARENA_MAX"]).toBeUndefined();
  });

  it("sets it for the docker engine and the deploy entrypoints without overriding the user", () => {
    expect(read("docker-compose.yml")).toContain('MALLOC_ARENA_MAX: "${MALLOC_ARENA_MAX:-2}"');
    for (const platform of ["coolify", "fly", "railway", "render"]) {
      expect(read(`deploy/${platform}/entrypoint.sh`)).toContain('if [ -z "${MALLOC_ARENA_MAX:-}" ]; then');
    }
  });
});

describe("engine open-file limit", () => {
  it.skipIf(process.platform === "win32")("a child spawned by the CLI runtime inherits a soft limit raised to the hard limit", () => {
    const script = [
      'const { execSync } = require("node:child_process");',
      'process.stdout.write(execSync("ulimit -n").toString().trim());',
    ].join(" ");
    const result = spawnSync("/bin/sh", ["-c", 'ulimit -S -n 256 && exec "$@"', "outer", process.execPath, "-e", script], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    expect(result.status).toBe(0);
    const hard = spawnSync("/bin/sh", ["-c", "ulimit -H -n"], { encoding: "utf-8" }).stdout.trim();
    const seen = result.stdout.trim();
    if (hard === "unlimited") expect(seen === "unlimited" || Number(seen) >= 10240).toBe(true);
    else expect(Number(seen)).toBe(Number(hard));
  });

  it("sets the limit for the docker engine and the deploy entrypoints", () => {
    expect(read("docker-compose.yml")).toMatch(/ulimits:\n\s+nofile:\n\s+soft: 10240\n\s+hard: 10240/);
    for (const platform of ["coolify", "fly", "railway", "render"]) {
      expect(read(`deploy/${platform}/entrypoint.sh`)).toContain("ulimit -n 10240 2>/dev/null");
    }
  });
});
