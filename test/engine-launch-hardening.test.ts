import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { engineFlushWaitMs, engineSaveIntervalMs, engineStateConfigPaths } from "../src/cli/engine-config.js";
import { renderWorkerCompose } from "../src/cli/compose-project.js";

const read = (path: string) => readFileSync(join(import.meta.dirname, "..", path), "utf-8");

describe("engine state flush timing", () => {
  it("derives the interval from the Compose state config before the runtime file", () => {
    const paths = engineStateConfigPaths("/home/u/.agentmemory", "/data/iii-config.runtime.yaml");
    expect(paths[0]).toBe("/home/u/.agentmemory/compose/worker-compose.yaml");
    expect(paths).toContain("/home/u/.agentmemory/compose/config/state.yaml");
    expect(paths.some((path) => path.includes("iii-state.yaml"))).toBe(false);
    expect(paths.at(-1)).toBe("/data/iii-config.runtime.yaml");
    const persisted = "id: iii-state\\nvalue:\\n  adapter:\\n    config:\\n      save_interval_ms: 2000\\n      store_method: file_based\\n";
    expect(engineSaveIntervalMs([persisted])).toBe(2000);
    expect(engineFlushWaitMs("file", [persisted])).toBe(3500);
    expect(engineFlushWaitMs("redis", [persisted])).toBe(0);
  });
});

describe("Worker Compose runtime configuration", () => {
  it("renders the registry workers and state flush interval without legacy config templates", () => {
    const rendered = renderWorkerCompose({
      ports: { restPort: 3211, viewerPort: 3213, enginePort: 49234 },
      dataDir: "/var/lib/agentmemory",
      projectRoot: "/opt/agentmemory",
      nodeBin: "/usr/bin/node",
      homeDir: "/home/u",
      linux: false,
    });
    expect(rendered).toContain("version: '0.22.20'");
    expect(rendered).toContain("version: '0.22.7'");
    expect(rendered).toContain("save_interval_ms: 2000");
    expect(rendered).toContain("file_path: '/var/lib/agentmemory/state_store.db'");
    expect(rendered).not.toContain("iii-config.yaml");
    expect(read("docker-compose.yml")).toContain('MALLOC_ARENA_MAX: "2"');
    expect(read("deploy/runtime/entrypoint.sh")).toContain('export MALLOC_ARENA_MAX="${MALLOC_ARENA_MAX:-2}"');
  });
});

describe("self-host deploy resource limits", () => {
  it("retains the deploy entrypoint open-file limit", () => {
    const entrypoint = read("deploy/runtime/entrypoint.sh");
    expect(entrypoint).toContain('current_nofile="$(ulimit -n)"');
    expect(entrypoint).toContain("ulimit -n 10240 2>/dev/null");
  });
});
