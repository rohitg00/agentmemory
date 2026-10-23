import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
const workerCompose = readFileSync(
  join(root, "deploy/runtime/worker-compose.yaml"),
  "utf8",
);
const entrypoint = readFileSync(
  join(root, "deploy/runtime/entrypoint.sh"),
  "utf8",
);

describe("Docker Worker Compose runtime", () => {
  it("publishes REST and viewer ports but not the retired stream port 3112", () => {
    expect(compose).toContain('"127.0.0.1:${AGENTMEMORY_REST_PORT:-3111}:3111"');
    expect(compose).toContain('"127.0.0.1:${AGENTMEMORY_VIEWER_PORT:-3113}:3113"');
    expect(compose).not.toContain("49134:");
    expect(compose).not.toContain("3112:");
  });

  it("keeps engine and service listeners on the private Compose network", () => {
    expect(workerCompose).toContain("url: ws://127.0.0.1:49134");
    expect(workerCompose).toContain("port: 49134");
    expect(workerCompose).toContain("      host: 127.0.0.1\n      port: 49134");
    expect(workerCompose).toContain('III_REST_PORT: "3111"');
    expect(workerCompose).toContain('III_VIEWER_PORT: "3113"');
    expect(workerCompose).toContain("port: 3111");
    expect(workerCompose).toContain('allowed_origins: ["__REST_ALLOWED_ORIGINS__"]');
    expect(entrypoint).toContain("REST_ALLOWED_ORIGINS must contain comma-separated origins");
    expect(workerCompose).toContain("state:");
    expect(workerCompose).toContain("http:");
    expect(workerCompose).toContain("agentmemory:");
    expect(workerCompose.match(/condition: on-failure/g)).toHaveLength(3);
    expect(workerCompose.match(/max_attempts: 5/g)).toHaveLength(3);
    expect(workerCompose.match(/delay: 500ms/g)).toHaveLength(3);
    expect(workerCompose.match(/max_delay: 30s/g)).toHaveLength(3);
    expect(workerCompose.match(/window: 60s/g)).toHaveLength(3);
    expect(workerCompose).not.toMatch(/^  (?:queue|cron|pubsub|stream):/m);
  });

  it("persists application state in a named volume and uses the shared image build", () => {
    expect(compose).toContain("dockerfile: deploy/Dockerfile");
    expect(compose).toContain("- ${AGENTMEMORY_DATA_DIR:-iii-data}:/data");
    expect(compose).toContain("iii-data:");
    expect(compose).not.toMatch(/^\s+- \.\//m);
  });

  it("starts the pinned runtime through the shared entrypoint with telemetry disabled", () => {
    expect(compose).toContain('III_TELEMETRY_ENABLED: "false"');
    expect(entrypoint).toContain("/usr/local/bin/iii compose");
    expect(entrypoint).toContain("--namespace agentmemory --up --file");
    expect(workerCompose).toContain("configuration:");
    expect(workerCompose).toContain('save_interval_ms: "${AGENTMEMORY_STATE_SAVE_INTERVAL_MS:-2000}"');
    expect(entrypoint).toContain('AGENTMEMORY_STATE_SAVE_INTERVAL_MS="${AGENTMEMORY_STATE_SAVE_INTERVAL_MS:-2000}"');
    expect(entrypoint).toContain("-lt 100");
    expect(entrypoint).toContain("-gt 3600000");
    expect(entrypoint).toContain("*[!0-9]*");
    expect(workerCompose).toContain("file_path: /data/state_store.db");
    expect(compose).toContain('AGENTMEMORY_SECRET: "${AGENTMEMORY_SECRET:-}"');
    expect(compose).toContain('AGENTMEMORY_STATE_BACKEND: "${AGENTMEMORY_STATE_BACKEND:-}"');
    expect(compose).toContain('AGENTMEMORY_REDIS_URL: "${AGENTMEMORY_REDIS_URL:-}"');
    expect(workerCompose).toContain('AGENTMEMORY_SECRET: "${AGENTMEMORY_SECRET:-}"');
    expect(workerCompose).toContain('OPENAI_API_KEY: "${OPENAI_API_KEY:-}"');
    expect(entrypoint).toContain("AGENTMEMORY_STATE_BACKEND=redis requires AGENTMEMORY_REDIS_URL");
    expect(entrypoint).toContain("name: redis");
  });

  it("seeds observability defaults while retaining explicit persisted values", () => {
    expect(entrypoint).toContain("value.sampling_ratio = 0.1");
    expect(entrypoint).toContain("value.logs_console_output = false");
    expect(entrypoint).toContain("entry.value = value");
  });

  it("sets host and viewer allowlists from runtime environment", () => {
    expect(workerCompose).toContain('AGENTMEMORY_VIEWER_HOST: "${AGENTMEMORY_VIEWER_HOST:-0.0.0.0}"');
    expect(workerCompose).toContain("VIEWER_ALLOWED_HOSTS:");
    expect(workerCompose).toContain("VIEWER_ALLOWED_ORIGINS:");
  });
});
