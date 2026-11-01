import { chmodSync, closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { join } from "node:path";
import { registerWorker } from "iii-sdk";
import { composeNamespace, type ComposeProjectOptions, writeWorkerCompose, COMPOSE_WORKER_VERSIONS } from "./compose-project.js";

export interface ComposeRuntime extends ComposeProjectOptions {
  namespace?: string;
  stateDir: string;
  logFile: string;
  envFile?: string;
  iiiBin: string;
  env: NodeJS.ProcessEnv;
}

export function composeRegistryFailureMessage(logText: string, workerBinDir?: string): string | null {
  const patterns = [
    /REGISTRY_UNREACHABLE|REGISTRY_ERROR|PACKAGE_DOWNLOAD_FAILED/i,
    /cannot reach the registry/i,
    /registry (?:returned|responded|response)[^\n]*HTTP 5\d\d|HTTP 5\d\d[^\n]*registry/i,
    /failed to resolve (?:a )?package|package resolution (?:failed|unavailable)|could not resolve .*registry/i,
    /could not download https:\/\/api\.workers\.iii\.dev\/download\//i,
  ];
  if (!patterns.some((pattern) => pattern.test(logText))) return null;
  const localWorkers = workerBinDir ? ` Configured local workers directory: ${workerBinDir}.` : "";
  return `Worker registry unavailable while resolving state/http; retry later or set AGENTMEMORY_WORKER_BIN_DIR.${localWorkers}`;
}

export function composeStateRegistryFailure(dataDir: string, file: string): string | null {
  const stateRoot = join(dataDir, "compose-state");
  try {
    const files = [] as string[];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "state.json") files.push(path);
      }
    };
    walk(stateRoot);
    for (const stateFile of files) {
      const state = JSON.parse(readFileSync(stateFile, "utf8")) as { compose_path?: string; containers?: Record<string, { status?: string; last_error?: string }> };
      const errors = Object.entries(state.containers ?? {}).filter(([, value]) => value.status === "failed").map(([name, value]) => `${name}: ${value.last_error ?? "failed"}`);
      const message = errors.join("\n");
      if (state.compose_path !== file) continue;
      if (message && composeRegistryFailureMessage(message)) return message;
    }
  } catch {}
  return null;
}

export function composeWorkerFailureSummary(project: ComposeProjectStatus | null): string | null {
  if (!project) return null;
  const failed = (project.containers ?? []).filter((container) => container.state === "failed");
  if (!failed.length) return null;
  return failed.map((container) => `${container.container ?? "worker"}: ${container.last_error ?? "failed after restart attempts were exhausted"}`).join("\n");
}

export type ComposeContainerStatus = { container?: string; state?: string; version?: string; pid?: number; owned?: boolean; log_path?: string; last_error?: string };
export type ComposeProjectStatus = { file?: string; state_dir?: string; namespace?: string; daemon_pid?: number; containers?: ComposeContainerStatus[]; [key: string]: unknown };
export type ComposeStatus = ComposeProjectStatus & {
  daemon_pid?: number;
  projects?: Array<{ file?: string; state_dir?: string; [key: string]: unknown }>;
};

export function ownedComposeProject(status: ComposeStatus, file: string): ComposeProjectStatus | null {
  return status.file === file ? status : status.projects?.find((item) => item.file === file) ?? null;
}

function cleanDaemonEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of ["HOME", "PATH", "LANG", "LC_ALL", "TERM", "NO_COLOR", "III_TELEMETRY_ENABLED", "MALLOC_ARENA_MAX", "III_BUNDLE_WORKERS_DISABLED", "III_COMPOSE_MAX_PARALLEL_WORKERS", "AGENTMEMORY_TOOLS", "AGENTMEMORY_VIEWER_HOST", "VIEWER_ALLOWED_HOSTS", "VIEWER_ALLOWED_ORIGINS"]) {
    const value = env[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export async function probeComposeEngine(port: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      socket.destroy();
      resolve(ready);
    };
    const abort = () => finish(false);
    // The caller normally supplies a larger engine-readiness deadline. Keep
    // each TCP probe bounded independently so a half-open route/proxy can never
    // pin one iteration until the whole startup budget expires.
    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function assertComposePortsFree(ports: readonly number[]): Promise<void> {
  for (const port of [...new Set(ports)]) {
    const occupied = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      const done = (value: boolean) => { socket.destroy(); resolve(value); };
      socket.setTimeout(350);
      socket.once("connect", () => done(true));
      socket.once("timeout", () => done(false));
      socket.once("error", () => done(false));
    });
    if (occupied) throw new Error(`Port ${port} is already in use on 127.0.0.1. Stop the process that owns it or choose another --port/--instance before starting agentmemory.`);
  }
}

export function composeEnvironment(env: NodeJS.ProcessEnv, stateDir: string): NodeJS.ProcessEnv {
  return {
    ...cleanDaemonEnv(env),
    III_COMPOSE_STATE_DIR: stateDir,
    III_TELEMETRY_ENABLED: "false",
    ...(process.platform === "linux" ? { MALLOC_ARENA_MAX: "2" } : {}),
    ...(env.AGENTMEMORY_DISABLE_COMPOSE_RESTART === "1" ? { AGENTMEMORY_DISABLE_COMPOSE_RESTART: "1" } : {}),
  };
}

export async function composeCall<T>(options: {
  engineUrl: string;
  namespace: string;
  functionId: "compose::down" | "compose::status";
  file: string;
  timeoutMs?: number;
}): Promise<T> {
  const client = registerWorker(options.engineUrl, {
    workerName: "agentmemory-cli",
    namespace: options.namespace,
    invocationTimeoutMs: options.timeoutMs ?? 30_000,
    otel: { enabled: false },
    enableMetricsReporting: false,
  });
  try {
    const connectionDeadline = Date.now() + 8_000;
    while (client.getConnectionState() !== "connected" && Date.now() < connectionDeadline) {
      const fatal = client.getFatalError();
      if (fatal) throw fatal;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (client.getConnectionState() !== "connected") throw new Error("Could not connect the Compose control client to its instance engine.");
    const deadline = Date.now() + 8_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const result = await client.trigger<T & { status?: string; error?: { code?: string; message?: string } }>({
          function_id: options.functionId,
          payload: { file: options.file },
          timeoutMs: options.timeoutMs ?? 30_000,
        });
        if (result && typeof result === "object" && result.status === "failed") {
          const detail = result.error?.message ?? result.error?.code ?? "unknown Compose failure";
          throw Object.assign(new Error(`${result.error?.code ? `${result.error.code}: ` : ""}${detail}`), { retryable: false });
        }
        return result;
      } catch (err) {
        lastError = err;
        if (err && typeof err === "object" && "retryable" in err && (err as { retryable?: boolean }).retryable === false) throw err;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    throw lastError ?? new Error("Compose daemon did not accept the control connection.");
  } finally {
    await client.shutdown().catch(() => {});
  }
}

export function startComposeDaemon(runtime: ComposeRuntime): { child: ChildProcess; file: string; namespace: string; stateDir: string; logFile: string; logStartOffset: number } {
  const project = writeWorkerCompose({ ...runtime, envFile: runtime.envFile });
  const logFile = runtime.logFile;
  mkdirSync(dirname(logFile), { recursive: true, mode: 0o700 });
  chmodSync(dirname(logFile), 0o700);
  const fd = openSync(logFile, "a", 0o600);
  const logStartOffset = fstatSync(fd).size;
  writeFileSync(fd, `\n[${new Date().toISOString()}] Starting Worker Compose\n`);
  const environment = composeEnvironment(runtime.env, project.stateDir);
  const child = spawn(runtime.iiiBin, ["compose", "--namespace", composeNamespace(runtime.ports.restPort), "--up", "--file", project.file], {
    cwd: runtime.projectRoot,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
    env: environment,
  });
  closeSync(fd);
  child.unref();
  return {
    child,
    file: project.file,
    namespace: composeNamespace(runtime.ports.restPort),
    stateDir: project.stateDir,
    logFile,
    logStartOffset,
  };
}

export function readComposeLogFromOffset(file: string, offset: number): string {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    let position = Math.min(Math.max(0, offset), size);
    const chunks: Buffer[] = [];
    while (position < size) {
      const chunk = Buffer.allocUnsafe(Math.min(16 * 1024, size - position));
      const count = readSync(fd, chunk, 0, chunk.length, position);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      position += count;
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

export function writeComposeState(path: string, state: {
  kind: "compose";
  restPort: number;
  viewerPort: number;
  enginePort: number;
  engineUrl: string;
  namespace: string;
  file: string;
  stateDir: string;
  logFile: string;
  logStartOffset?: number;
  binPath: string;
  enginePid?: number;
  workerBinDir?: string;
  workerFailure?: string;
  workerVersions: typeof COMPOSE_WORKER_VERSIONS | { local: true };
}): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

