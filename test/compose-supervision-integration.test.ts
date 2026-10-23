import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { delimiter } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { III_PINNED_VERSION } from "../src/version.js";
import { COMPOSE_WORKER_VERSIONS } from "../src/cli/compose-project.js";
import { afterAll, describe, expect, it } from "vitest";

const engine = [
  process.env.AGENTMEMORY_TEST_III,
  ...(process.env.PATH ?? "").split(delimiter).filter(Boolean).map((directory) => join(directory, process.platform === "win32" ? "iii.exe" : "iii")),
  join(homedir(), ".agentmemory", "bin", process.platform === "win32" ? "iii.exe" : "iii"),
].filter((candidate): candidate is string => Boolean(candidate)).map((candidate) => resolve(candidate)).find((candidate) => {
  try {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 3000 });
    return result.status === 0 && result.stdout.trim() === III_PINNED_VERSION;
  } catch { return false; }
});
const workerBinDir = process.env.AGENTMEMORY_TEST_LOCAL_WORKER_DIR;
const roots: string[] = [];
const children: ChildProcess[] = [];
const childLogs = new WeakMap<ChildProcess, string>();
const cleanEnv = () => {
  const env = { ...process.env, RUST_LOG: "error" };
  for (const key of ["III_URL", "III_ENGINE_URL", "III_NAMESPACE", "III_COMPOSE_STATE_DIR", "AGENTMEMORY_DATA_DIR", "AGENTMEMORY_RUNTIME_DIR", "AGENTMEMORY_DISABLE_COMPOSE_RESTART"]) delete env[key];
  return env;
};
function freePort(): number {
  const result = spawnSync("node", ["-e", 'const n=require("node:net").createServer();n.listen(0,"127.0.0.1",()=>{console.log(n.address().port);n.close()})'], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return Number(result.stdout.trim());
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
function prepare(stateRestart: string, appRestart = "{ condition: on-failure, delay: 500ms, max_delay: 1s, max_attempts: 5, window: 60s }") {
  const rest = freePort(); const http = rest; const enginePort = freePort();
  const root = mkdtempSync(join(tmpdir(), "agentmemory-supervision-")); roots.push(root);
  const data = join(root, "data"); mkdirSync(join(data, "config"), { recursive: true });
  const namespace = `amsupervision${rest}`; const compose = join(root, "worker-compose.yaml");
  const workerSource = (name: keyof typeof COMPOSE_WORKER_VERSIONS) => workerBinDir
    ? `path://${join(data, "local-workers", name)}`
    : `package://api.workers.iii.dev/${name}`;
  for (const name of ["state", "http"] as const) {
    const workerDir = join(data, "local-workers", name); mkdirSync(workerDir, { recursive: true });
    if (workerBinDir) {
      const bin = join(workerBinDir, name);
      writeFileSync(join(workerDir, "iii.worker.yaml"), `iii: v1\nname: ${name}\nlanguage: rust\nscripts:\n  start: ${quote(bin)}\n`);
    }
  }
  writeFileSync(compose, `namespace: ${namespace}\nstartup_timeout: 60s\nrequired_default: true\nengine:\n  url: ws://127.0.0.1:${enginePort}\n  workers:\n    configuration:\n      adapter:\n        name: fs\n        config:\n          directory: ${quote(join(data, "config"))}\n    iii-worker-manager:\n      host: 127.0.0.1\n      port: ${enginePort}\ncontainers:\n  state:\n    worker: ${quote(workerSource("state"))}\n${workerBinDir ? "" : `    version: ${COMPOSE_WORKER_VERSIONS.state}\n`}    config_name: state\n    restart: ${stateRestart}\n    config_override:\n      adapter:\n        name: kv\n        config: { store_method: file_based, file_path: ${quote(join(data, "state_store.db"))}, save_interval_ms: 100 }\n  http:\n    worker: ${quote(workerSource("http"))}\n${workerBinDir ? "" : `    version: ${COMPOSE_WORKER_VERSIONS.http}\n`}    config_name: http\n    restart: { condition: on-failure, delay: 500ms, max_delay: 1s, max_attempts: 5, window: 60s }\n    config_override: { host: 127.0.0.1, port: ${http} }\n  agentmemory:\n    worker: ${quote("path://.")}\n    working_dir: ${quote(process.cwd())}\n    start_after: [state, http]\n    startup_timeout: 90s\n    config_name: agentmemory\n    restart: ${appRestart}\n    scripts:\n      run: ${quote(`${process.execPath} ${join(process.cwd(), "dist/index.mjs")}`)}\n    environment:\n      HOME: ${quote(join(root, "home"))}\n      AGENTMEMORY_RUNTIME_DIR: ${quote(join(root, "home", ".agentmemory"))}\n      AGENTMEMORY_DATA_DIR: ${quote(data)}\n      III_ENGINE_PORT: ${quote(String(enginePort))}\n      III_REST_PORT: ${quote(String(rest))}\n      III_VIEWER_PORT: ${quote(String(freePort()))}\n      EMBEDDING_PROVIDER: 'none'\n      LLM_PROVIDER: 'none'\n      III_TELEMETRY_ENABLED: 'false'\n      RUST_LOG: 'error'\n`);
  const result = { root, data, compose, namespace }; return { ...result, rest, http, enginePort };
}
function stateFile(project: { data: string; namespace: string }): string | null {
  const root = join(project.data, "compose-state");
  const queue = [root];
  while (queue.length) {
    const dir = queue.pop()!; let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) queue.push(path);
      else if (entry.name === "state.json") {
        try { if (JSON.parse(readFileSync(path, "utf8")).namespace === project.namespace) return path; } catch {}
      }
    }
  }
  return null;
}
async function waitFor(project: { data: string; namespace: string }, predicate: (state: any) => boolean, timeout = 90_000): Promise<any> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const child = children.at(-1);
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`compose exited ${child.exitCode}: ${childLogs.get(child) ?? ""}`);
    const path = stateFile(project);
    if (path) { const state = JSON.parse(readFileSync(path, "utf8")); if (predicate(state)) return state; }
    await sleep(100);
  }
  throw new Error(`timed out waiting for compose state for ${project.namespace}: ${childLogs.get(children.at(-1)!) ?? ""}`);
}
function start(project: { compose: string; namespace: string; data: string }): ChildProcess {
  if (!engine) throw new Error(`iii ${III_PINNED_VERSION} is not available`);
  const child = spawn(engine, ["compose", "--namespace", project.namespace, "--up", "--file", project.compose], { env: { ...cleanEnv(), III_COMPOSE_STATE_DIR: join(project.data, "compose-state"), III_BUNDLE_WORKERS_DISABLED: "1", HOME: join(project.root, "home") }, stdio: ["ignore", "ignore", "pipe"], detached: true });
  children.push(child); childLogs.set(child, ""); child.stderr?.on("data", (chunk) => childLogs.set(child, `${childLogs.get(child) ?? ""}${chunk}`)); return child;
}
function killTree(pid: number): void {
  try { process.kill(-pid, "SIGKILL"); } catch {}
  try { process.kill(pid, "SIGKILL"); } catch {}
}
afterAll(() => { for (const child of children) if (child.pid) killTree(child.pid); for (const root of roots) rmSync(root, { recursive: true, force: true }); });

describe.skipIf(!engine || process.platform !== "linux" || process.env.AGENTMEMORY_SKIP_LIVE_TESTS === "1")("iii-compose v0.24.6 worker supervision", () => {
  it("marks a worker failed after bounded restarts and reports the exhausted budget", async () => {
    const project = prepare("{ condition: on-failure, delay: 500ms, max_delay: 500ms, max_attempts: 1, window: 60s }");
    const child = start(project);
    try {
      const ready = await waitFor(project, (s) => s.containers?.agentmemory?.status === "ready" && s.containers?.state?.status === "ready");
      const pid = ready.containers.state.pid;
      process.kill(pid, "SIGKILL");
      const firstRecovery = await waitFor(project, (s) => s.containers?.state?.status === "ready" && s.containers.state.pid !== pid, 15_000);
      process.kill(firstRecovery.containers.state.pid, "SIGKILL");
      const exhausted = await waitFor(project, (s) => s.containers?.state?.status === "failed", 30_000);
      expect(exhausted.containers.state.last_error).toMatch(/did not stay up after 1 restart attempts/);
      const supervisorLog = childLogs.get(child) ?? "";
      expect(supervisorLog).toMatch(/state did not stay up after 1 restart attempts: giving up/);
      const runtime = join(project.root, "home", ".agentmemory"); mkdirSync(runtime, { recursive: true });
      const projectState = JSON.parse(readFileSync(stateFile(project)!, "utf8"));
      writeFileSync(join(runtime, "engine-state.json"), JSON.stringify({
        kind: "compose", restPort: project.rest, viewerPort: project.rest + 2, enginePort: project.enginePort,
        engineUrl: `ws://127.0.0.1:${project.enginePort}`, namespace: project.namespace, file: project.compose,
        stateDir: join(project.data, "compose-state"), logFile: join(project.data, "compose-daemon.log"), binPath: engine,
        composePid: child.pid, enginePid: projectState.owner?.pid, workerVersions: { local: true },
      }));
      const status = spawnSync(process.execPath, [join(process.cwd(), "dist/cli.mjs"), "status", "--port", String(project.rest)], { env: { ...cleanEnv(), HOME: join(project.root, "home"), AGENTMEMORY_DATA_DIR: project.data, III_REST_PORT: String(project.rest), III_ENGINE_PORT: String(project.enginePort), III_VIEWER_PORT: String(project.rest + 2) }, encoding: "utf8", timeout: 20_000 });
      expect(status.status).toBe(0);
      expect(status.stdout + status.stderr).toMatch(/state did not stay up after 1 restart attempts|restart attempts exhausted|Worker Compose failure/i);
    } finally { if (child.pid) killTree(child.pid); }
  }, 120_000);

  it("retains and recalls a saved memory after a real state worker SIGKILL and restart", async () => {
    const project = prepare("{ condition: on-failure, delay: 500ms, max_delay: 1s, max_attempts: 5, window: 60s }");
    const child = start(project);
    let app;
    try {
      await waitFor(project, (s) => s.containers?.agentmemory?.status === "ready" && s.containers?.state?.status === "ready");
      const secret = readFileSync(join(project.data, "secret"), "utf8").trim();
      const base = `http://127.0.0.1:${project.rest}`;
      const marker = `supervision-state-memory-${Date.now()}`;
      const saved = await fetch(`${base}/agentmemory/remember`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ content: `${marker}: keep this after the state worker restarts`, type: "fact", project: "compose-supervision-test" }) });
      expect(saved.status).toBe(201);
      // Let the file-backed state adapter flush the acknowledged write before
      // simulating abrupt loss of the state process.
      await sleep(500);
      const initial = JSON.parse(readFileSync(stateFile(project)!, "utf8")); const oldPid = initial.containers.state.pid;
      process.kill(oldPid, "SIGKILL");
      const recovered = await waitFor(project, (s) => s.containers?.state?.status === "ready" && s.containers.state.pid !== oldPid, 30_000);
      expect(recovered.containers.state.pid).not.toBe(oldPid);
      for (let i = 0; i < 20; i++) {
        const response = await fetch(`${base}/agentmemory/memories?latest=true&project=compose-supervision-test`, { headers: { authorization: `Bearer ${secret}` } });
        const body = await response.json();
        if (response.ok && JSON.stringify(body).includes(marker)) { expect(body.memories?.some((memory: { content?: string }) => memory.content?.includes(marker))).toBe(true); return; }
        if (!response.ok) throw new Error(`memory list failed ${response.status}: ${JSON.stringify(body)}`);
        await sleep(250);
      }
      const response = await fetch(`${base}/agentmemory/memories?project=compose-supervision-test`, { headers: { authorization: `Bearer ${secret}` } });
      throw new Error(`saved memory was not recallable after state worker recovery (HTTP ${response.status}): ${JSON.stringify(await response.json())}`);
    } finally { if (child.pid) killTree(child.pid); }
  }, 120_000);
});
