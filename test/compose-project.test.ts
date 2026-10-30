import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { composeEnvironment } from "../src/cli/compose-control.js";
import { COMPOSE_WORKER_VERSIONS, composeNamespace, renderWorkerCompose, shellCommand, shellQuote, writeWorkerCompose } from "../src/cli/compose-project.js";

const root = mkdtempSync(join(tmpdir(), "agentmemory-compose-"));
const rootUrl = `path://${root.replaceAll("\\", "/")}`;
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const options = (overrides: Record<string, unknown> = {}) => ({
  ports: { restPort: 3511, viewerPort: 3513, enginePort: 49534 },
  dataDir: join(root, "data"),
  projectRoot: join(root, "pkg"),
  nodeBin: "/opt/node/bin/node",
  homeDir: join(root, "home"),
  startupTimeoutMs: 300_000,
  linux: true,
  ...overrides,
});

describe("Worker Compose project", () => {
  it("pins registry workers and configures the isolated engine, state and HTTP", () => {
    const text = renderWorkerCompose(options());
    expect(text).toContain("namespace: agentmemory-3511");
    expect(text).toContain("url: ws://127.0.0.1:49534");
    expect(text).toContain("iii-worker-manager:");
    expect(text).toContain("directory: '");
    expect(text).toContain(`worker: 'package://api.workers.iii.dev/state'\n    version: '${COMPOSE_WORKER_VERSIONS.state}'`);
    expect(text).toContain(`worker: 'package://api.workers.iii.dev/http'\n    version: '${COMPOSE_WORKER_VERSIONS.http}'`);
    expect(text).not.toContain("dependencies:");
    expect(text).not.toContain("      configuration: latest");
    expect(text).toContain("save_interval_ms: 2000");
    expect(text.match(/condition: on-failure/g)).toHaveLength(3);
    expect(text).toContain("default_timeout: 180000");
    expect(text).toContain("allowed_methods: [GET, POST, PUT, DELETE, OPTIONS]");
    expect(text).toContain("start_after: [state, http]");
    expect(text).toContain("required_default: true");
    expect(text.match(/condition: on-failure/g)).toHaveLength(3);
    expect(text.match(/max_attempts: 5/g)).toHaveLength(3);
    expect(text.match(/delay: 500ms/g)).toHaveLength(3);
    expect(text.match(/max_delay: 30s/g)).toHaveLength(3);
    expect(text.match(/window: 60s/g)).toHaveLength(3);
    for (const retired of ["iii-stream", "iii-pubsub", "iii-http", "iii-state", "queue"]) expect(text).not.toContain(retired);
  });

  it("quotes worker shell commands correctly on POSIX and Windows", () => {
    const weird = "/tmp/Program Files/worker 'one';$(touch /tmp/should-not-exist)";
    const posix = shellCommand(weird, ["arg with spaces", "x;$()|&<>*?[]\\\""], false);
    expect(posix).toContain(`\'"\'"\'`);
    expect(shellQuote("C:\\Program Files\\Worker & Tools\\node.exe", true)).toBe(`"C:\\Program Files\\Worker & Tools\\node.exe"`);
    expect(shellCommand("C:\\Program Files\\Node Runtime\\node.exe", ["dist/index.mjs"], true)).toBe(`""C:\\Program Files\\Node Runtime\\node.exe" "dist/index.mjs""`);
    expect(shellQuote("100%", true)).toBe('"100%%"');
  });

  it("executes generated commands through sh -c even with spaces and metacharacters", () => {
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const dir = join(root, "Node Runtime & (stable)");
    mkdirSync(dir, { recursive: true });
    const node = join(dir, "node; safe");
    writeFileSync(node, "#!/bin/sh\nprintf '%s' \"$1\"\n", { mode: 0o755 });
    chmodSync(node, 0o755);
    const binDir = join(dir, "Local Workers & (safe)");
    mkdirSync(binDir, { recursive: true });
    const workerBins = {} as Record<string, string>;
    for (const name of ["state", "http"]) {
      workerBins[name] = join(binDir, name);
      writeFileSync(workerBins[name]!, "#!/bin/sh\nprintf '%s\\n' \"$0\"\n", { mode: 0o755 });
      chmodSync(workerBins[name]!, 0o755);
    }
    const rendered = renderWorkerCompose(options({ nodeBin: node, workerBinDir: binDir, workerBinDirIsAbsolute: true }));
    const parsed = parse(rendered) as { containers: Record<string, { scripts: { run: string } }> };
    for (const [key, bin] of [["state", workerBins.state!], ["http", workerBins.http!], ["agentmemory", node]] as const) {
      const run = parsed.containers[key]!.scripts.run;
      const { status, stdout } = spawnSync("sh", ["-c", run], { encoding: "utf8", env: process.env });
      expect(status).toBe(0);
      expect(stdout).toBe(key === "agentmemory" ? "dist/index.mjs" : `${bin}\n`);
    }
    const command = shellCommand(node, ["value with spaces;$(false)"], false);
    const result = spawnSync("sh", ["-c", command], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("value with spaces;$(false)");
  });

  it("forwards CLI and viewer overrides from the shell ahead of env-file values", () => {
    const text = renderWorkerCompose(options({ workerEnvironment: {
      AGENTMEMORY_TOOLS: "core", AGENTMEMORY_VIEWER_HOST: "127.0.0.1",
      VIEWER_ALLOWED_HOSTS: "example.test:3513", VIEWER_ALLOWED_ORIGINS: "https://example.test",
    } }));
    for (const [key, value] of Object.entries({ AGENTMEMORY_TOOLS: "core", AGENTMEMORY_VIEWER_HOST: "127.0.0.1", VIEWER_ALLOWED_HOSTS: "example.test:3513", VIEWER_ALLOWED_ORIGINS: "https://example.test" })) {
      expect(text).toContain(`${key}: '${value}'`);
    }
    expect(composeEnvironment({ AGENTMEMORY_TOOLS: "core", VIEWER_ALLOWED_HOSTS: "example.test" }, "/tmp/state")).toMatchObject({ AGENTMEMORY_TOOLS: "core", VIEWER_ALLOWED_HOSTS: "example.test" });
  });

  it("gives CLI/shell tool and viewer settings precedence over conflicting env-file values", () => {
    const envPath = join(root, "precedence.env");
    mkdirSync(root, { recursive: true });
    writeFileSync(envPath, [
      "AGENTMEMORY_TOOLS=all",
      "AGENTMEMORY_VIEWER_HOST=0.0.0.0",
      "VIEWER_ALLOWED_HOSTS=old.example.test",
      "VIEWER_ALLOWED_ORIGINS=https://old.example.test",
      "" ,
    ].join("\n"));
    const text = renderWorkerCompose(options({ envFile: envPath, workerEnvironment: {
      AGENTMEMORY_TOOLS: "core", AGENTMEMORY_VIEWER_HOST: "127.0.0.1",
      VIEWER_ALLOWED_HOSTS: "new.example.test", VIEWER_ALLOWED_ORIGINS: "https://new.example.test",
    } }));
    const { containers } = parse(text) as { containers: Record<string, { environment: Record<string, string>; env_file: string[] }> };
    const app = containers.agentmemory!;
    const fileValues = Object.fromEntries(readFileSync(envPath, "utf8").trim().split("\n").map((line) => line.split("=") as [string, string]));
    const effective = { ...fileValues, ...app.environment };
    expect(effective).toMatchObject({
      AGENTMEMORY_TOOLS: "core", AGENTMEMORY_VIEWER_HOST: "127.0.0.1",
      VIEWER_ALLOWED_HOSTS: "new.example.test", VIEWER_ALLOWED_ORIGINS: "https://new.example.test",
    });
    expect(app.env_file).toHaveLength(1);
  });

  it("uses the forwarded tools setting for the effective MCP tool list", async () => {
    const text = renderWorkerCompose(options({ workerEnvironment: { AGENTMEMORY_TOOLS: "core" } }));
    const app = (parse(text) as { containers: Record<string, { environment: Record<string, string> }> }).containers.agentmemory!;
    const { getVisibleTools } = await import("../src/mcp/tools-registry.js");
    const previous = process.env.AGENTMEMORY_TOOLS;
    process.env.AGENTMEMORY_TOOLS = app.environment.AGENTMEMORY_TOOLS;
    try { expect(getVisibleTools()).toHaveLength(8); }
    finally { if (previous === undefined) delete process.env.AGENTMEMORY_TOOLS; else process.env.AGENTMEMORY_TOOLS = previous; }
  });

  it("uses local worker binaries when requested and emits explicit path worker commands", () => {
    const text = renderWorkerCompose(options({ workerBinDir: "/opt/am/workers-local" }));
    expect(text).toContain(`worker: '${rootUrl}/data/compose/local-workers/state'`);
    expect(text).toContain("local-workers/state");
    const parsed = parse(text) as { containers: Record<string, { scripts: { run: string } }> };
    expect(parsed.containers.state!.scripts.run).toBe("'/opt/am/workers-local/state'");
    expect(parsed.containers.http!.scripts.run).toBe("'/opt/am/workers-local/http'");
    expect(text).not.toContain("version: '");
    expect(text).not.toContain("file_path: '/opt/am/workers-local");
  });

  it("uses and validates the configured state flush interval", () => {
    expect(renderWorkerCompose(options({ workerEnvironment: { AGENTMEMORY_STATE_SAVE_INTERVAL_MS: "9000" } }))).toContain("save_interval_ms: 9000");
    expect(renderWorkerCompose(options())).toContain("save_interval_ms: 2000");
    for (const invalid of ["nope", "99", "3600001", "1.5"]) {
      expect(() => renderWorkerCompose(options({ workerEnvironment: { AGENTMEMORY_STATE_SAVE_INTERVAL_MS: invalid } }))).toThrow(/AGENTMEMORY_STATE_SAVE_INTERVAL_MS/);
    }
  });

  it("honors disableRestartPolicy for every worker", () => {
    const disabled = parse(renderWorkerCompose(options({ disableRestartPolicy: true }))) as {
      containers: Record<string, { restart: string }>;
    };
    expect(Object.values(disabled.containers).map((container) => container.restart)).toEqual(["no", "no", "no"]);
  });

  it("passes configured embedding credentials/settings only to the application container", () => {
    const text = renderWorkerCompose(options({ workerEnvironment: { EMBEDDING_PROVIDER: "openai", OPENAI_API_KEY: "fake-gate-key", OPENAI_BASE_URL: "http://127.0.0.1:4555", ANTHROPIC_API_KEY: "ignored" } }));
    const app = text.slice(text.indexOf("  agentmemory:"));
    expect(app).toContain("EMBEDDING_PROVIDER: 'openai'");
    expect(app).toContain("OPENAI_API_KEY: 'fake-gate-key'");
    expect(app).toContain("OPENAI_BASE_URL: 'http://127.0.0.1:4555'");
    expect(text.slice(0, text.indexOf("containers:")).concat(text.slice(text.indexOf("  state:"), text.indexOf("  agentmemory:")))).not.toContain("fake-gate-key");
  });

  it("preserves memory policy, provider and durability overrides in native and Docker workers", async () => {
    const settings = {
      FALLBACK_PROVIDERS: "openai,gemini",
      OPENROUTER_EMBEDDING_MODEL: "custom/embedding",
      OPENAI_API_VERSION: "2024-10-21",
      MINIMAX_BASE_URL: "https://example.test/anthropic",
      AGENTMEMORY_LLM_TIMEOUT_MS: "45000",
      AGENTMEMORY_CAPTURE_INBOX_MAX: "1234",
      AGENTMEMORY_EXPORT_ROOT: "/tmp/exports",
      AGENTMEMORY_IMPORT_ROOT: "/tmp/imports",
      AGENTMEMORY_TOOLS: "core",
      AGENTMEMORY_INDEX_SAVE_INTERVAL_MS: "45000",
      AGENTMEMORY_VECTOR_BUCKET_SIZE: "250",
      AGENTMEMORY_VECTOR_BACKFILL_MAX: "100",
      CONSOLIDATION_DECAY_DAYS: "90",
      CONSOLIDATION_INTERVAL_MS: "900000",
      GRAPH_EXTRACTION_BATCH_SIZE: "5",
      AUTO_FORGET_ENABLED: "false",
      LESSON_DECAY_ENABLED: "false",
      INSIGHT_DECAY_ENABLED: "false",
    };
    const native = parse(renderWorkerCompose(options({ workerEnvironment: {
      ...settings, UNRELATED_SECRET: "not-for-the-worker", III_NAMESPACE: "wrong",
    } })));
    const docker = parse(readFileSync(new URL("../deploy/runtime/worker-compose.yaml", import.meta.url), "utf8"));
    const dockerService = parse(readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8")).services.agentmemory;
    const coolify = parse(readFileSync(new URL("../deploy/coolify/docker-compose.yml", import.meta.url), "utf8")).services.agentmemory;
    expect(native.containers.agentmemory.environment).toMatchObject(settings);
    expect(native.containers.agentmemory.environment).not.toHaveProperty("UNRELATED_SECRET");
    expect(native.containers.agentmemory.environment).not.toHaveProperty("III_NAMESPACE");
    for (const key of Object.keys(settings)) {
      expect(docker.containers.agentmemory.environment[key]).toBe("${" + key + ":-}");
      expect(dockerService.environment[key]).toBe("${" + key + ":-}");
      expect(coolify.environment[key]).toBe("${" + key + ":-}");
    }
    vi.stubEnv("AGENTMEMORY_ENV_FILE", join(root, "missing.env"));
    for (const [key, value] of Object.entries(native.containers.agentmemory.environment)) {
      vi.stubEnv(key, value as string);
    }
    vi.resetModules();
    const config = await import("../src/config.js");
    expect(config.loadFallbackConfig().providers).toEqual(["openai", "gemini"]);
    expect(config.getConsolidationDecayDays()).toBe(90);
    expect(config.getConsolidationIntervalMs()).toBe(900000);
    expect(config.getIndexSaveIntervalMs()).toBe(45000);
    expect(config.getVectorBucketSize()).toBe(250);
    expect(config.getVectorBackfillMax()).toBe(100);
    expect(config.getGraphBatchSize()).toBe(5);
  });

  it("supports Redis state without leaking Redis configuration into the daemon", () => {
    const text = renderWorkerCompose(options({ stateBackend: { kind: "redis", redisUrl: "redis://user:p'ass@localhost:6379" } }));
    expect(text).toContain("name: redis");
    expect(text).toContain("redis_url: 'redis://user:p''ass@localhost:6379'");
    expect(text).not.toContain("state_store.db");
  });

  it("includes env_file only when present and quotes paths safely", () => {
    const envPath = join(root, "home", ".env");
    mkdirSync(join(root, "home"), { recursive: true });
    writeFileSync(envPath, "ANTHROPIC_API_KEY=fixture-secret\nIII_URL=ws://wrong\nIII_NAMESPACE=wrong\n");
    const written = writeWorkerCompose(options({ envFile: envPath }));
    expect(written.text).toContain(`env_file: ['${join(root, "data", "compose", ".agentmemory-filtered.env")}']`);
    expect(written.text).toContain(".agentmemory-filtered.env");
    expect(written.text).toContain(`AGENTMEMORY_ENV_FILE: '${join(root, "data", "compose", ".agentmemory-filtered.env")}'`);
    expect(written.text).not.toContain("III_URL:");
    expect(readFileSync(join(root, "data", "compose", ".agentmemory-filtered.env"), "utf8")).toContain("ANTHROPIC_API_KEY=fixture-secret");
    expect(readFileSync(join(root, "data", "compose", ".agentmemory-filtered.env"), "utf8")).not.toContain("III_URL");
    expect(readFileSync(join(root, "data", "compose", ".agentmemory-filtered.env"), "utf8")).not.toContain("III_ENGINE_URL");
    expect(written.text).toContain("HOME: '");
  });

  it("writes generated local worker manifests with the pinned worker commands", () => {
    const binDir = join(root, "workers-local");
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    mkdirSync(binDir, { recursive: true });
    for (const name of ["state", "http"]) {
      writeFileSync(join(binDir, name), "#!/bin/sh\nexit 0\n");
      chmodSync(join(binDir, name), 0o755);
    }
    const written = writeWorkerCompose(options({ workerBinDir: binDir, workerBinDirIsAbsolute: true }));
    for (const name of ["state", "http"]) {
      const manifestPath = join(root, "data", "compose", "local-workers", name, "iii.worker.yaml");
      const manifest = readFileSync(manifestPath, "utf8");
      expect(manifest).toContain(`name: ${name}`);
      expect(manifest).toContain("start: '");
      expect(manifest).toContain(`/workers-local/${name}'`);
    }
    expect(written.text).toContain(`worker: '${rootUrl}/data/compose/local-workers/state'`);
  });

  it("seeds persistent engine trace storage in the data directory", () => {
    writeWorkerCompose(options());
    const configFile = join(root, "data", "compose", "config", "iii-observability.yaml");
    const entry = parse(readFileSync(configFile, "utf8")) as {
      id: string;
      value: { trace_storage: { directory: string }; sampling_ratio: number; logs_console_output: boolean };
    };
    expect(entry.id).toBe("iii-observability");
    expect(entry.value.trace_storage.directory).toBe(join(root, "data", "observability", "traces"));
    expect(entry.value.sampling_ratio).toBe(0.1);
    expect(entry.value.logs_console_output).toBe(false);
    expect(statSync(configFile).mode & 0o777).toBe(0o600);
  });

  it("stores engine traces under the instance data dir and preserves user observability settings", () => {
    const configDir = join(root, "data", "compose", "config");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "iii-observability.yaml"), [
      "id: iii-observability",
      "name: Observability",
      "description: custom settings",
      "schema: {}",
      "value:",
      "  service_name: agentmemory-test",
      "  sampling_ratio: 0.75",
      "  logs_console_output: true",
      "  trace_storage:",
      "    directory: ./data/observability/traces",
      "    max_disk_bytes: 67108864",
      "",
    ].join("\n"));

    writeWorkerCompose(options());
    const entry = parse(readFileSync(join(configDir, "iii-observability.yaml"), "utf8")) as {
      value: { service_name: string; sampling_ratio: number; logs_console_output: boolean; trace_storage: { directory: string; max_disk_bytes: number } };
    };
    expect(entry.value.service_name).toBe("agentmemory-test");
    expect(entry.value.sampling_ratio).toBe(0.75);
    expect(entry.value.logs_console_output).toBe(true);
    expect(entry.value.trace_storage).toEqual({
      directory: join(root, "data", "observability", "traces"),
      max_disk_bytes: 67108864,
    });
  });

  it("leaves a deliberately customized engine trace directory alone", () => {
    const configDir = join(root, "data", "compose", "config");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "iii-observability.yaml"), [
      "id: iii-observability",
      "value:",
      "  trace_storage:",
      "    directory: /mnt/traces",
      "",
    ].join("\n"));

    writeWorkerCompose(options());
    const entry = parse(readFileSync(join(configDir, "iii-observability.yaml"), "utf8")) as {
      value: { trace_storage: { directory: string }; sampling_ratio: number; logs_console_output: boolean };
    };
    expect(entry.value.trace_storage.directory).toBe("/mnt/traces");
  });

  it("writes the project and runtime state only inside the data dir with owner-only file permissions", () => {
    const written = writeWorkerCompose(options());
    expect(written.file).toBe(join(root, "data", "compose", "worker-compose.yaml"));
    expect(written.stateDir).toBe(join(root, "data", "compose-state"));
    expect(readFileSync(written.file, "utf8")).toBe(written.text);
    expect(statSync(written.file).mode & 0o777).toBe(0o600);
  });
});
