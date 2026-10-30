import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repositoryRoot, enginePath } from "./fingerprint.js";
import { III_PINNED_VERSION } from "../../src/version.js";

const cli = join(repositoryRoot, "dist/cli.mjs");
const active = new Set<LocalSandbox>();

function pause(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function free(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise(true)));
  });
}

async function pickPort(): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = 12000 + Math.floor(Math.random() * 6000);
    const ports = [base, base + 2, base + 6353, base + 46023];
    if ((await Promise.all(ports.map(free))).every(Boolean)) return base;
  }
  throw new Error("No free evaluation port block");
}

function kill(pid: number | undefined): void {
  if (!pid) return;
  try { process.kill(-pid, "SIGKILL"); } catch {}
  try { process.kill(pid, "SIGKILL"); } catch {}
}

function killOwnedProcess(pid: number | undefined, expected: (command: string) => boolean): void {
  if (!pid) return;
  try {
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (!command || !expected(command)) return;
    let group = 0;
    try { group = Number(execFileSync("ps", ["-p", String(pid), "-o", "pgid="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()); } catch {}
    if (group === pid) {
      try { process.kill(-pid, "SIGKILL"); } catch {}
    }
    try { process.kill(pid, "SIGKILL"); } catch {}
  } catch {}
}

export interface Sandbox {
  request<T = any>(path: string, body?: unknown, method?: string): Promise<T>;
  close(): Promise<void>;
}

export class LocalSandbox implements Sandbox {
  readonly directory = mkdtempSync(join(tmpdir(), "agentmemory-eval-"));
  readonly home = join(this.directory, "home");
  readonly log = join(this.directory, "daemon.log");
  private port = 0;
  private child?: ChildProcess;
  private enginePid?: number;
  private composePid?: number;
  private env: NodeJS.ProcessEnv = {};

  async start(): Promise<void> {
    if (!existsSync(cli)) throw new Error("Build AgentMemory before live evaluation: npm run build");
    const engine = enginePath();
    if (!existsSync(engine)) throw new Error("Set AGENTMEMORY_EVAL_III to an installed iii " + III_PINNED_VERSION + " binary");
    const version = execFileSync(engine, ["--version"], { encoding: "utf8" }).trim();
    if (version !== III_PINNED_VERSION) throw new Error("Evaluation requires iii " + III_PINNED_VERSION + ", got " + version);
    const bin = join(this.home, ".agentmemory/bin");
    mkdirSync(bin, { recursive: true });
    copyFileSync(engine, join(bin, "iii"));
    chmodSync(join(bin, "iii"), 0o755);
    this.port ||= await pickPort();
    this.env = {
      PATH: [dirname(process.execPath), bin, "/usr/bin", "/bin"].join(":"),
      HOME: this.home,
      USERPROFILE: this.home,
      TMPDIR: tmpdir(),
      CI: "1", NO_COLOR: "1", LANG: "C.UTF-8",
      AGENTMEMORY_PROVIDER: "noop",
      AGENTMEMORY_AUTO_COMPRESS: "false",
      CONSOLIDATION_ENABLED: "false",
      GRAPH_EXTRACTION_ENABLED: "false",
      SNAPSHOT_DIR: join(this.directory, "snapshots"),
    };
    const fd = openSync(this.log, "a");
    this.child = spawn(process.execPath, [cli, "--port", String(this.port), "--data-dir", join(this.directory, "state")], {
      cwd: this.directory, env: this.env, detached: true, stdio: ["ignore", fd, fd],
    });
    closeSync(fd);
    if (active.size === 0) {
      process.once("SIGINT", onInterrupt);
      process.once("SIGTERM", onTerminate);
    }
    active.add(this);
    let spawnError: Error | undefined;
    this.child.once("error", (error) => { spawnError = error; });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (this.child.exitCode !== null || this.child.signalCode) break;
      try {
        await this.request("/livez");
        await this.request("/health");
        this.loadRuntimePids();
        return;
      } catch {
        await pause(250);
      }
    }
    const tail = readFileSync(this.log, "utf8").slice(-1600);
    throw new Error("Disposable AgentMemory did not become healthy: " + tail);
  }

  async request<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const secretFile = join(this.home, ".agentmemory/secret");
    if (existsSync(secretFile)) headers.Authorization = "Bearer " + readFileSync(secretFile, "utf8").trim();
    const response = await fetch("http://127.0.0.1:" + this.port + "/agentmemory" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"), headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(path + " returned HTTP " + response.status);
    const result = await response.json() as T;
    const record = result as { success?: boolean; error?: unknown };
    if (record?.success === false || record?.error) throw new Error(path + " reported failure");
    return result;
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    this.loadRuntimePids();
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(process.execPath, [cli, "stop", "--port", String(this.port), "--data-dir", join(this.directory, "state")], {
        cwd: this.directory, env: this.env, stdio: "ignore",
      });
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Sandbox stop timed out")); }, 30_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolvePromise();
        else reject(new Error("Sandbox stop failed: " + code));
      });
    });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && this.child.exitCode === null && !this.child.signalCode) await pause(50);
    if (this.child.exitCode === null && !this.child.signalCode) {
      this.child.kill("SIGTERM");
      const terminateDeadline = Date.now() + 2_000;
      while (Date.now() < terminateDeadline && this.child.exitCode === null && !this.child.signalCode) await pause(50);
      if (this.child.exitCode === null && !this.child.signalCode) this.child.kill("SIGKILL");
    }
    const ports = [this.port, this.port + 2, this.port + 6353, this.port + 46023];
    const portsDeadline = Date.now() + 15_000;
    while (Date.now() < portsDeadline && !(await Promise.all(ports.map(free))).every(Boolean)) await pause(100);
    if (!(await Promise.all(ports.map(free))).every(Boolean)) throw new Error("Sandbox Worker Compose runtime left ports open after stop");
  }

  private loadRuntimePids(): void {
    const stateFile = join(this.home, ".agentmemory/engine-state.json");
    try {
      const state = JSON.parse(readFileSync(stateFile, "utf8")) as {
        kind?: string; restPort?: number; file?: string; stateDir?: string; binPath?: string; namespace?: string; composePid?: number; enginePid?: number;
      };
      const expectedBin = join(this.home, ".agentmemory/bin/iii");
      if (state.kind !== "compose" || state.restPort !== this.port || state.binPath !== expectedBin ||
          !state.file?.startsWith(this.directory + "/")) return;
      this.composePid = state.composePid;
      this.enginePid = state.enginePid;
    } catch {}
    const pidFile = join(this.home, ".agentmemory/iii.pid");
    if (!this.enginePid && existsSync(pidFile)) this.enginePid = Number(readFileSync(pidFile, "utf8").trim());
  }

  forceStop(): void {
    this.loadRuntimePids();
    kill(this.child?.pid);
    const stateFile = join(this.home, ".agentmemory/engine-state.json");
    try {
      const state = JSON.parse(readFileSync(stateFile, "utf8")) as { file?: string; stateDir?: string; namespace?: string };
      const file = state.file;
      const stateDir = state.stateDir;
      const namespace = state.namespace;
      if (file?.startsWith(this.directory + "/") && stateDir?.startsWith(this.directory + "/") && namespace) {
        killOwnedProcess(this.composePid, (command) => command.includes("compose --namespace") && command.includes(namespace) && command.includes(file));
        killOwnedProcess(this.enginePid, (command) => command.includes("--config") && command.includes(namespace) && command.includes(stateDir));
      }
    } catch {}
  }

  async restart(): Promise<void> {
    await this.stop();
    this.enginePid = undefined;
    await this.start();
  }

  async close(): Promise<void> {
    try {
      await this.stop();
    } finally {
      this.forceStop();
      active.delete(this);
      if (active.size === 0) {
        process.removeListener("SIGINT", onInterrupt);
        process.removeListener("SIGTERM", onTerminate);
      }
      if (process.env.AGENTMEMORY_EVAL_KEEP !== "1") rmSync(this.directory, { recursive: true, force: true });
    }
  }
}

function onInterrupt(): never { process.exit(130); }
function onTerminate(): never { process.exit(143); }

process.once("exit", () => { for (const sandbox of active) sandbox.forceStop(); });

export async function startSandbox(): Promise<LocalSandbox> {
  const sandbox = new LocalSandbox();
  try {
    await sandbox.start();
    return sandbox;
  } catch (error) {
    await sandbox.close().catch(() => {});
    throw error;
  }
}
