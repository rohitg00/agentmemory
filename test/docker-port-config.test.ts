import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
const engineConfig = readFileSync(join(root, "iii-config.docker.yaml"), "utf8");

function workerBlock(name: string): string {
  const start = engineConfig.indexOf(`  - name: ${name}`);
  if (start === -1) return "";
  const next = engineConfig.indexOf("\n  - name:", start + 1);
  return engineConfig.slice(start, next === -1 ? undefined : next);
}

describe("Docker engine port configuration", () => {
  it("passes the resolved port quartet into the engine container", () => {
    expect(compose).toContain('III_REST_PORT: "${III_REST_PORT:-3111}"');
    expect(compose).toContain('III_STREAM_PORT: "${III_STREAM_PORT:-3112}"');
    expect(compose).toContain('III_VIEWER_PORT: "${III_VIEWER_PORT:-3113}"');
    expect(compose).toContain('III_ENGINE_PORT: "${III_ENGINE_PORT:-49134}"');
  });

  it("publishes the configured host and container ports", () => {
    expect(compose).toContain(
      '"127.0.0.1:${III_REST_PORT:-3111}:${III_REST_PORT:-3111}"',
    );
    expect(compose).toContain(
      '"127.0.0.1:${III_STREAM_PORT:-3112}:${III_STREAM_PORT:-3112}"',
    );
    expect(compose).toContain(
      '"127.0.0.1:${III_ENGINE_PORT:-49134}:${III_ENGINE_PORT:-49134}"',
    );
    expect(compose).toContain(
      '"127.0.0.1:${AGENTMEMORY_METRICS_PORT:-9464}:9464"',
    );
  });

  it("runs CLI-managed bind mounts as the host user without recursive chown", () => {
    expect(compose).toContain(
      'user: "${AGENTMEMORY_DOCKER_UID:-65532}:${AGENTMEMORY_DOCKER_GID:-65532}"',
    );
    expect(compose).toContain("AGENTMEMORY_DOCKER_SKIP_CHOWN");
  });

  it("configures every iii listener from the same environment", () => {
    expect(workerBlock("iii-http")).toContain("port: ${III_REST_PORT:3111}");
    expect(workerBlock("iii-stream")).toContain("port: ${III_STREAM_PORT:3112}");

    const manager = workerBlock("iii-worker-manager");
    expect(manager).toContain("port: ${III_ENGINE_PORT:49134}");
    expect(manager).toContain("host: 0.0.0.0");
  });

  it("leaves worker ownership to the host CLI", () => {
    expect(engineConfig).not.toContain("- name: iii-exec");
    expect(engineConfig).not.toContain("node dist/index.mjs");
  });

  it("keeps REST and viewer CORS aligned with overridden ports", () => {
    const http = workerBlock("iii-http");
    expect(http).toContain("http://localhost:${III_REST_PORT:3111}");
    expect(http).toContain("http://127.0.0.1:${III_REST_PORT:3111}");
    expect(http).toContain("http://localhost:${III_VIEWER_PORT:3113}");
    expect(http).toContain("http://127.0.0.1:${III_VIEWER_PORT:3113}");
  });
});
