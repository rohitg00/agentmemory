import { describe, expect, it } from "vitest";
import { COMPOSE_WORKER_VERSIONS, renderWorkerCompose } from "../src/cli/compose-project.js";

describe("native Worker Compose runtime configuration", () => {
  it("pins state/http workers at the reviewed registry versions", () => {
    expect(COMPOSE_WORKER_VERSIONS).toEqual({ state: "0.22.20", http: "0.22.7" });
  });

  it("renders instance-specific worker ports and persistent state storage", () => {
    const rendered = renderWorkerCompose({
      ports: { restPort: 3211, viewerPort: 3213, enginePort: 49234 },
      dataDir: "/tmp/agentmemory",
      projectRoot: "/opt/agentmemory",
      nodeBin: "/usr/bin/node",
      homeDir: "/home/user",
      linux: false,
    });
    expect(rendered).toContain("worker: 'package://api.workers.iii.dev/state'");
    expect(rendered).toContain("version: '0.22.20'");
    expect(rendered).toContain("worker: 'package://api.workers.iii.dev/http'");
    expect(rendered).toContain("version: '0.22.7'");
    expect(rendered).toContain("port: 3211");
    expect(rendered).toContain("port: 49234");
    expect(rendered).toContain("file_path: '/tmp/agentmemory/state_store.db'");
    expect(rendered).toContain("namespace: agentmemory-3211");
    // The generated Compose project no longer emits the legacy engine config.
    expect(rendered).not.toContain("iii-config.yaml");
  });

  it("supports Redis state via Worker Compose", () => {
    const rendered = renderWorkerCompose({
      ports: { restPort: 3111, viewerPort: 3113, enginePort: 49134 },
      dataDir: "/tmp/am",
      projectRoot: "/opt/am",
      nodeBin: "node",
      homeDir: "/home/u",
      stateBackend: { kind: "redis", redisUrl: "redis://localhost:6379" },
      redisUrl: "redis://localhost:6379",
      linux: false,
    });
    expect(rendered).toContain("name: redis");
    expect(rendered).toContain("redis://localhost:6379");
    expect(rendered).not.toContain("store_method: file_based");
  });
});
