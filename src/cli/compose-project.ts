import { chmodSync, existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { MAX_STARTUP_TIMEOUT_MS } from "./readiness.js";
import { getStateSaveIntervalMs } from "../config.js";

export interface EngineRuntimePorts {
  restPort: number;
  viewerPort: number;
  enginePort: number;
}

export interface StateBackendOptions {
  kind: "file" | "redis";
  redisUrl?: string;
}

/** Registry versions are pinned here so every generated project uses one reviewed set. */
export const COMPOSE_WORKER_VERSIONS = {
  state: "0.22.20",
  http: "0.22.7",
} as const;

export function composeNamespace(restPort: number): string {
  // A distinct namespace per REST port prevents two separately managed engine
  // daemons from competing for the SDK/default namespace during overlap.
  return `agentmemory-${restPort}`;
}

export function composeProjectPaths(dataDir: string): {
  directory: string;
  file: string;
  stateDir: string;
  logFile: string;
  configDir: string;
} {
  const directory = join(dataDir, "compose");
  return {
    directory,
    file: join(directory, "worker-compose.yaml"),
    stateDir: join(dataDir, "compose-state"),
    logFile: join(directory, "compose-daemon.log"),
    configDir: join(directory, "config"),
  };
}

const AGENTMEMORY_WORKER_ENV_ALLOWLIST = new Set([
  "EMBEDDING_PROVIDER", "OPENAI_API_KEY", "OPENAI_API_KEY_FOR_LLM", "OPENAI_BASE_URL",
  "OPENAI_MODEL", "OPENAI_EMBEDDING_API_KEY", "OPENAI_EMBEDDING_BASE_URL",
  "OPENAI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_DIMENSIONS", "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL",
  "GOOGLE_API_KEY", "VOYAGE_API_KEY", "VOYAGE_MODEL", "COHERE_API_KEY",
  "COHERE_MODEL", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "MINIMAX_API_KEY",
  "MINIMAX_MODEL", "OLLAMA_HOST", "LLM_PROVIDER", "BM25_WEIGHT", "VECTOR_WEIGHT",
  "MAX_TOKENS", "TOKEN_BUDGET", "MAX_OBS_PER_SESSION", "CONSOLIDATION_ENABLED",
  "GRAPH_EXTRACTION_ENABLED", "AGENTMEMORY_AUTO_COMPRESS", "AGENTMEMORY_INJECT_CONTEXT",
  "AGENTMEMORY_ALLOW_AGENT_SDK", "AGENTMEMORY_SESSION_SWEEP_ENABLED",
  "AGENTMEMORY_SESSION_SWEEP_STALE_HOURS", "AGENTMEMORY_FINALIZE_IDLE_MS",
  "AGENTMEMORY_GRAPH_COMPACT_ON_BOOT", "AGENTMEMORY_DROP_STALE_INDEX",
  "AGENTMEMORY_AUDIT_RETENTION_MONTHS", "AGENTMEMORY_AUDIT_MIGRATE_MAX_BYTES",
  "AGENTMEMORY_STATE_SAVE_INTERVAL_MS", "AGENTMEMORY_TOOLS", "AGENTMEMORY_VIEWER_HOST",
  "VIEWER_ALLOWED_HOSTS", "VIEWER_ALLOWED_ORIGINS", "AGENTMEMORY_SECRET", "AGENT_ID", "TEAM_ID",
  "TEAM_MODE", "USER_ID", "AGENTMEMORY_AGENT_SCOPE", "SNAPSHOT_DIR", "SNAPSHOT_ENABLED",
  "SNAPSHOT_INTERVAL", "STANDALONE_PERSIST_PATH", "CLAUDE_MEMORY_BRIDGE",
  "CLAUDE_MEMORY_LINE_BUDGET", "CLAUDE_PROJECT_PATH", "AGENTMEMORY_SUPPRESS_COST_WARNING",
  "FALLBACK_PROVIDERS", "OPENAI_API_VERSION", "OPENAI_REASONING_EFFORT", "OPENAI_TIMEOUT_MS",
  "MINIMAX_BASE_URL", "OPENROUTER_EMBEDDING_MODEL", "OPENROUTER_EMBEDDING_DIMENSIONS",
  "AGENTMEMORY_LLM_TIMEOUT_MS", "AGENTMEMORY_CAPTURE_MAX_ATTEMPTS",
  "AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS", "AGENTMEMORY_CAPTURE_DEDUP_HOURS",
  "AGENTMEMORY_CAPTURE_INBOX_MAX", "AGENTMEMORY_CAPTURE_DEAD_MAX", "AGENTMEMORY_CAPTURE_EVENTS_MAX",
  "AGENTMEMORY_CAPTURE_SPOOL", "AGENTMEMORY_CAPTURE_SPOOL_DIR",
  "AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES", "AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS",
  "AGENTMEMORY_IMPORT_ROOT", "AGENTMEMORY_EXPORT_ROOT", "AGENTMEMORY_GRAPH_WEIGHT",
  "SUMMARIZE_CHUNK_SIZE", "SUMMARIZE_CHUNK_CONCURRENCY", "CONSOLIDATION_DECAY_DAYS",
  "CONSOLIDATION_INTERVAL_MS", "AGENTMEMORY_CONSOLIDATION_COOLDOWN_MS",
  "AGENTMEMORY_FOLLOWUP_WINDOW_SECONDS", "GRAPH_EXTRACTION_BATCH_SIZE", "AGENTMEMORY_LLM_NOTHINK",
  "AGENTMEMORY_REFLECT", "AGENTMEMORY_IMAGE_EMBEDDINGS", "AGENTMEMORY_IMAGE_STORE_MAX_BYTES",
  "AGENTMEMORY_AUDIT_INDEX_PERSIST", "AGENTMEMORY_INDEX_SAVE_INTERVAL_MS",
  "AGENTMEMORY_VECTOR_BUCKET_SIZE", "AGENTMEMORY_VECTOR_BACKFILL_MAX",
  "AGENTMEMORY_VECTOR_BACKFILL", "AGENTMEMORY_SLOTS", "AGENTMEMORY_PROVIDER", "AGENTMEMORY_VERBOSE",
  "OBSIDIAN_AUTO_EXPORT", "AUTO_FORGET_ENABLED", "AUTO_FORGET_INTERVAL_MS", "LESSON_DECAY_ENABLED",
  "INSIGHT_DECAY_ENABLED", "REBUILD_EMBED_BATCH_SIZE", "RERANK_ENABLED",
]);

const COMPOSE_RESERVED_ENV = new Set([
  "III_URL",
  "III_ENGINE_URL",
  "III_ENGINE_PORT",
  "III_REST_PORT",
  "III_VIEWER_PORT",
  "III_NAMESPACE",
  "III_COMPOSE_NAMESPACE",
  "III_COMPOSE_FILE",
  "III_COMPOSE_DIR",
  "III_CONFIG_NAME",
  "III_WORKER_NAME",
]);

function stateSaveInterval(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return getStateSaveIntervalMs();
  if (!/^\d+$/.test(value.trim())) throw new Error("AGENTMEMORY_STATE_SAVE_INTERVAL_MS must be an integer between 100 and 3600000.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > 3_600_000) {
    throw new Error("AGENTMEMORY_STATE_SAVE_INTERVAL_MS must be an integer between 100 and 3600000.");
  }
  return parsed;
}

function restartPolicyLines(indent: string, enabled: boolean): string[] {
  if (!enabled) return [`${indent}restart: no`];
  return [
    `${indent}restart:`,
    `${indent}  condition: on-failure`,
    `${indent}  delay: 500ms`,
    `${indent}  max_delay: 30s`,
    `${indent}  max_attempts: 5`,
    `${indent}  window: 60s`,
  ];
}

export function shellQuote(value: string, windows: boolean): string {
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error("A shell command argument contains an unsupported control character.");
  if (windows) {
    // Windows paths cannot contain quotes. Doubling percent signs keeps literal
    // percent characters in cmd.exe; quotes protect whitespace and metacharacters.
    if (value.includes('"')) throw new Error("Windows shell arguments cannot contain a double quote.");
    return `"${value.replace(/%/g, "%%")}"`;
  }
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function shellCommand(program: string, args: string[], windows: boolean): string {
  const command = [program, ...args].map((part) => shellQuote(part, windows)).join(" ");
  // cmd.exe /C treats an initial quote specially. The outer quote pair makes
  // the quoted executable and its arguments one command string.
  return windows ? `"${command}"` : command;
}

function yamlString(value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error("A Compose path or configuration value contains an unsupported control character.");
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function localWorkerDirectory(value: string, cwd: string, projectRoot: string): string {
  if (isAbsolute(value)) return resolve(value);
  const fromCwd = resolve(cwd, value);
  const fromProject = resolve(projectRoot, value);
  if (fromCwd === fromProject) return fromCwd;
  if (!fromCwd.startsWith(`${resolve(projectRoot)}/`)) return fromCwd;
  return fromProject;
}

function localWorkerProjectDir(paths: ReturnType<typeof composeProjectPaths>, name: string): string {
  return join(paths.directory, "local-workers", name);
}

function ensureEngineTraceStorageConfig(configDir: string, dataDir: string): void {
  const configFile = join(configDir, "iii-observability.yaml");
  const traceDirectory = resolve(dataDir, "observability", "traces");
  const defaultTraceDirectory = "./data/observability/traces";
  let entry: Record<string, unknown>;
  if (existsSync(configFile)) {
    const parsed: unknown = parse(readFileSync(configFile, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Invalid persisted iii-observability configuration at ${configFile}.`);
    }
    entry = parsed as Record<string, unknown>;
    if (entry.id !== "iii-observability") {
      throw new Error(`Unexpected configuration id in ${configFile}; refusing to replace it.`);
    }
  } else {
    entry = {
      id: "iii-observability", name: "Observability", description: "", schema: {},
      value: { sampling_ratio: 0.1, logs_console_output: false },
    };
  }

  const value = entry.value && typeof entry.value === "object" && !Array.isArray(entry.value)
    ? entry.value as Record<string, unknown>
    : {};
  let changed = false;
  if (value.sampling_ratio === undefined) { value.sampling_ratio = 0.1; changed = true; }
  if (value.logs_console_output === undefined) { value.logs_console_output = false; changed = true; }
  const existingStorage = value.trace_storage;
  const storage = existingStorage && typeof existingStorage === "object" && !Array.isArray(existingStorage)
    ? existingStorage as Record<string, unknown>
    : {};
  const existingDirectory = storage.directory;
  if (typeof existingDirectory === "string" && existingDirectory.trim() !== "" && existingDirectory !== defaultTraceDirectory) {
    if (!changed) return;
  } else {
    storage.directory = traceDirectory;
    changed = true;
  }
  if (!changed) return;
  if (existingDirectory === undefined || existingDirectory === defaultTraceDirectory || existingDirectory === "") value.trace_storage = storage;
  entry.value = value;
  const temporaryFile = `${configFile}.tmp`;
  writeFileSync(temporaryFile, stringify(entry), { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryFile, 0o600);
  renameSync(temporaryFile, configFile);
  chmodSync(configFile, 0o600);
}

export interface ComposeProjectOptions {
  ports: EngineRuntimePorts;
  dataDir: string;
  projectRoot: string;
  nodeBin: string;
  homeDir: string;
  envFile?: string;
  workerBinDir?: string;
  workerBinDirIsAbsolute?: boolean;
  redisUrl?: string;
  workerEnvironment?: NodeJS.ProcessEnv;
  cwd?: string;
  stateBackend?: StateBackendOptions;
  startupTimeoutMs?: number;
  linux?: boolean;
  disableRestartPolicy?: boolean;
  windows?: boolean;
}

export function renderWorkerCompose(options: ComposeProjectOptions): string {
  const { restPort, viewerPort, enginePort } = options.ports;
  const paths = composeProjectPaths(options.dataDir);
  const namespace = composeNamespace(restPort);
  const workerBinDir = options.workerBinDir
    ? options.workerBinDirIsAbsolute
      ? resolve(options.workerBinDir)
      : localWorkerDirectory(options.workerBinDir, options.cwd ?? process.cwd(), options.projectRoot)
    : null;
  const startupSeconds = Math.ceil((options.startupTimeoutMs ?? 300_000) / 1000);
  const restartEnabled = !options.disableRestartPolicy;
  if (!Number.isSafeInteger(startupSeconds) || startupSeconds < 1 || startupSeconds * 1000 > MAX_STARTUP_TIMEOUT_MS + 999) {
    throw new Error("Compose worker startup timeout must be between 1 and 3600000 milliseconds.");
  }

  const workerSource = (name: keyof typeof COMPOSE_WORKER_VERSIONS): string =>
    workerBinDir
      ? `path://${localWorkerProjectDir(paths, name)}`
      : `package://api.workers.iii.dev/${name}`;
  const workerScript = (name: keyof typeof COMPOSE_WORKER_VERSIONS): string =>
    workerBinDir ? join(workerBinDir, name) : "";
  const filteredEnvFile = options.envFile
    ? join(paths.directory, ".agentmemory-filtered.env")
    : undefined;
  const lines = [
    `namespace: ${namespace}`,
    "startup_timeout: 60s",
    "stop_timeout: 20s",
    "required_default: true",
    "engine:",
    `  url: ws://127.0.0.1:${enginePort}`,
    "  workers:",
    "    configuration:",
    "      adapter:",
    "        name: fs",
    "        config:",
    `          directory: ${yamlString(paths.configDir)}`,
    "    iii-worker-manager:",
    "      host: 127.0.0.1",
    `      port: ${enginePort}`,
    "containers:",
  ];

  const stateScript = workerScript("state");
  lines.push(
    "  state:",
    `    worker: ${yamlString(workerSource("state"))}`,
    ...(!workerBinDir ? [`    version: ${yamlString(COMPOSE_WORKER_VERSIONS.state)}`] : []),
    "    config_name: state",
    ...restartPolicyLines("    ", restartEnabled),
    ...(workerBinDir ? [`    scripts:`, `      run: ${yamlString(shellCommand(stateScript, [], options.windows ?? process.platform === "win32"))}`] : []),
    "    config_override:",
    "      adapter:",
    "        name: kv",
    "        config:",
  );
  if (options.stateBackend?.kind === "redis") {
    const redisUrl = options.redisUrl ?? options.stateBackend.redisUrl;
    if (!redisUrl) {
      throw new Error("AGENTMEMORY_STATE_BACKEND=redis requires AGENTMEMORY_REDIS_URL to be set (e.g. redis://localhost:6379).");
    }
    if (/[\u0000-\u001f\u007f]/.test(redisUrl)) {
      throw new Error("AGENTMEMORY_REDIS_URL contains a control character; percent-encode it before using Redis.");
    }
    lines.splice(lines.length - 2, 2, "        name: redis", "        config:", `          redis_url: ${yamlString(redisUrl)}`);
  } else {
    lines.push(
      "          store_method: file_based",
      `          file_path: ${yamlString(join(options.dataDir, "state_store.db"))}`,
      `          save_interval_ms: ${stateSaveInterval(options.workerEnvironment?.AGENTMEMORY_STATE_SAVE_INTERVAL_MS)}`,
    );
  }

  const httpScript = workerScript("http");
  lines.push(
    "  http:",
    `    worker: ${yamlString(workerSource("http"))}`,
    ...(!workerBinDir ? [`    version: ${yamlString(COMPOSE_WORKER_VERSIONS.http)}`] : []),
    "    config_name: http",
    ...restartPolicyLines("    ", restartEnabled),
    ...(workerBinDir ? [`    scripts:`, `      run: ${yamlString(shellCommand(httpScript, [], options.windows ?? process.platform === "win32"))}`] : []),
    "    config_override:",
    "      host: 127.0.0.1",
    `      port: ${restPort}`,
    "      default_timeout: 180000",
    "      cors:",
    "        allowed_origins:",
    `          - ${yamlString(`http://localhost:${restPort}`)}`,
    `          - ${yamlString(`http://localhost:${viewerPort}`)}`,
    `          - ${yamlString(`http://127.0.0.1:${restPort}`)}`,
    `          - ${yamlString(`http://127.0.0.1:${viewerPort}`)}`,
    "        allowed_methods: [GET, POST, PUT, DELETE, OPTIONS]",
  );

  lines.push(
    "  agentmemory:",
    `    worker: ${yamlString(`path://${options.projectRoot}`)}`,
    "    start_after: [state, http]",
    `    startup_timeout: ${startupSeconds}s`,
    "    config_name: agentmemory",
    ...restartPolicyLines("    ", restartEnabled),
    "    scripts:",
    `      run: ${yamlString(shellCommand(options.nodeBin, ["dist/index.mjs"], options.windows ?? process.platform === "win32"))}`,
  );
  if (filteredEnvFile) lines.push(`    env_file: [${yamlString(filteredEnvFile)}]`);
  const explicitWorkerEnvironment = Object.entries(options.workerEnvironment ?? {})
    .filter(([key, value]) => value !== undefined && AGENTMEMORY_WORKER_ENV_ALLOWLIST.has(key) && !COMPOSE_RESERVED_ENV.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  lines.push(
    "    environment:",
    ...explicitWorkerEnvironment.map(([key, value]) => `      ${key}: ${yamlString(value!)}`),
    `      HOME: ${yamlString(options.homeDir)}`,
    `      PATH: ${yamlString(`${dirname(options.nodeBin)}:/usr/local/bin:/usr/bin:/bin`)}`,
    `      AGENTMEMORY_DATA_DIR: ${yamlString(options.dataDir)}`,
    `      AGENTMEMORY_RUNTIME_DIR: ${yamlString(options.dataDir)}`,
    ...(filteredEnvFile ? [`      AGENTMEMORY_ENV_FILE: ${yamlString(filteredEnvFile)}`] : []),
    ...(options.stateBackend?.kind === "redis" && options.redisUrl ? [`      AGENTMEMORY_REDIS_URL: ${yamlString(options.redisUrl)}`, "      AGENTMEMORY_STATE_BACKEND: 'redis'"] : []),
    `      III_ENGINE_PORT: ${yamlString(String(enginePort))}`,
    `      III_REST_PORT: ${yamlString(String(restPort))}`,
    `      III_VIEWER_PORT: ${yamlString(String(viewerPort))}`,
    "      III_TELEMETRY_ENABLED: 'false'",
    ...(options.linux ?? process.platform === "linux" ? ["      MALLOC_ARENA_MAX: '2'"] : []),
    "",
  );
  return lines.join("\n");
}

export function writeWorkerCompose(options: ComposeProjectOptions): { file: string; stateDir: string; logFile: string; text: string } {
  const paths = composeProjectPaths(options.dataDir);
  mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  mkdirSync(paths.configDir, { recursive: true, mode: 0o700 });
  mkdirSync(paths.stateDir, { recursive: true, mode: 0o700 });
  ensureEngineTraceStorageConfig(paths.configDir, options.dataDir);
  mkdirSync(join(options.dataDir, "observability", "traces"), { recursive: true, mode: 0o700 });
  if (options.workerBinDir) {
    const binDir = options.workerBinDirIsAbsolute
      ? resolve(options.workerBinDir)
      : localWorkerDirectory(options.workerBinDir, options.cwd ?? process.cwd(), options.projectRoot);
    for (const name of Object.keys(COMPOSE_WORKER_VERSIONS) as Array<keyof typeof COMPOSE_WORKER_VERSIONS>) {
      const projectDir = localWorkerProjectDir(paths, name);
      mkdirSync(projectDir, { recursive: true, mode: 0o700 });
      const manifest = [
        "iii: v1",
        `name: ${name}`,
        "language: rust",
        "scripts:",
        `  start: ${yamlString(join(binDir, name))}`,
        "",
      ].join("\n");
      writeFileSync(join(projectDir, "iii.worker.yaml"), manifest, { encoding: "utf8", mode: 0o600 });
      chmodSync(join(projectDir, "iii.worker.yaml"), 0o600);
    }
  }
  const text = renderWorkerCompose(options);
  if (options.envFile) {
    const filteredPath = join(paths.directory, ".agentmemory-filtered.env");
    const entries = readFileSync(options.envFile, "utf8").split(/\r?\n/).filter((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      return !match || !COMPOSE_RESERVED_ENV.has(match[1]!);
    });
    writeFileSync(filteredPath, `${entries.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(filteredPath, 0o600);
  }
  writeFileSync(paths.file, text, { encoding: "utf8", mode: 0o600 });
  chmodSync(paths.file, 0o600);
  return { file: paths.file, stateDir: paths.stateDir, logFile: paths.logFile, text };
}
