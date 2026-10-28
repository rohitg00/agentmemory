#!/usr/bin/env node
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { arch, homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const options = { tarball: null, out: null, only: null, keep: false, delayMs: 48_000, skipBuild: false, workerBinDir: process.env.AGENTMEMORY_WORKER_BIN_DIR ?? null };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--tarball") options.tarball = resolve(process.argv[++i]);
  else if (arg === "--out") options.out = resolve(process.argv[++i]);
  else if (arg === "--only") options.only = new Set(process.argv[++i].split(","));
  else if (arg === "--delay-ms") options.delayMs = Number(process.argv[++i]);
  else if (arg === "--keep") options.keep = true;
  else if (arg === "--skip-build") options.skipBuild = true;
  else if (arg === "--worker-bin-dir") options.workerBinDir = resolve(process.argv[++i]);
  else if (arg === "--worker-bin-dir") options.workerBinDir = resolve(process.argv[++i]);
  else if (arg === "--help") {
    console.log("Usage: node scripts/release-gate/startup.mjs [--tarball file.tgz] [--out dir] [--only names] [--delay-ms 48000] [--skip-build] [--worker-bin-dir directory] [--keep]");
    process.exit(0);
  } else throw new Error(`Unknown argument ${arg}`);
}
assert(Number.isSafeInteger(options.delayMs) && options.delayMs > 0 && options.delayMs <= 300_000, "--delay-ms must be 1..300000");
const root = mkdtempSync(join(tmpdir(), "am-startup-"));
const out = options.out ?? mkdtempSync(join(tmpdir(), "agentmemory-startup-gate-"));
mkdirSync(out, { recursive: true });
const prefix = join(root, "prefix");
const pkg = join(prefix, "node_modules/@agentmemory/agentmemory");
const cli = join(pkg, "dist/cli.mjs");
const nodeDir = dirname(process.execPath);
const cache = process.env.AGENTMEMORY_GATE_CACHE ?? join(homedir(), ".cache/agentmemory-release-gate");
const children = new Set();
const instances = new Set();
const results = [];
const started = Date.now();
const log = (message) => {
  const line = `[${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`;
  console.log(line);
  appendFileSync(join(out, "gate.log"), `${line}\n`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
function packageFiles() {
  const files = [];
  const walk = (dir, relative = "") => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), name);
    else if (entry.isFile()) files.push([name, sha(join(dir, entry.name))]);
  } };
  walk(pkg); files.sort(([a], [b]) => a.localeCompare(b));
  return files;
}
function packageDigest() { return createHash("sha256").update(JSON.stringify(packageFiles())).digest("hex"); }
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function kill(pid, signal = "SIGKILL") {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return;
  try { process.kill(-pid, signal); } catch {}
  try { process.kill(pid, signal); } catch {}
}
function launch(command, args, env, cwd, logFile) {
  const child = spawn(command, args, { env, cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.text = "";
  child.stdoutText = "";
  child.result = null;
  const record = (chunk) => { child.text += chunk; if (logFile) appendFileSync(logFile, chunk); };
  child.stdout.on("data", (chunk) => { child.stdoutText += chunk; record(chunk); });
  child.stderr.on("data", record);
  child.on("error", (err) => record(String(err)));
  child.on("close", (code, signal) => { child.result = { code, signal }; children.delete(child); });
  return child;
}
async function exited(child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (!child.result && Date.now() < deadline) await sleep(25);
  if (!child.result) { kill(child.pid); throw new Error(`process exceeded ${timeoutMs}ms: ${child.text.slice(-1000)}`); }
  return child.result;
}
async function command(bin, args, env = process.env, cwd = repo, timeout = 120_000, logFile, output = "combined") {
  const child = launch(bin, args, env, cwd, logFile);
  const result = await exited(child, timeout);
  assert.equal(result.code, 0, `${bin} ${args.join(" ")}: ${child.text.slice(-1200)}`);
  return output === "stdout" ? child.stdoutText : child.text;
}
async function poll(label, probe, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  do {
    try { const value = await probe(); if (value) return value; } catch (err) { last = err; if (err.fatal) throw err; }
    await sleep(100);
  } while (Date.now() < deadline);
  throw new Error(`${label} timed out: ${last?.message ?? "not ready"}`);
}
async function unusedPort() {
  const server = net.createServer();
  await new Promise((r, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", r); });
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
async function free(port) {
  const server = net.createServer();
  return new Promise((r) => { server.once("error", () => r(false)); server.listen(port, "127.0.0.1", () => server.close(() => r(true))); });
}
async function portBlock() {
  for (let i = 0; i < 200; i++) {
    const port = 12000 + Math.floor(Math.random() * 7000);
    if ((await Promise.all([0, 1, 2, 3, 4, 6353, 46023].map((d) => free(port + d)))).every(Boolean)) return port;
  }
  throw new Error("No free port block");
}
let installed;
let tarball;
let artifactSha;
let cliSha;
let pkgSha;
let pkgFiles;
let engine;
function baseEnv(home) {
  return { HOME: home, PATH: [join(prefix, "node_modules/.bin"), nodeDir, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter), TMPDIR: tmpdir(), CI: "1", NO_COLOR: "1", LANG: "C.UTF-8", EMBEDDING_PROVIDER: "none", LLM_PROVIDER: "none", III_TELEMETRY_ENABLED: "false", OTEL_ENABLED: "false", RUST_LOG: "error" };
}
async function install() {
  tarball = options.tarball;
  if (!tarball) {
    if (!options.skipBuild) await command("npm", ["run", "build"], process.env, repo, 600_000, join(out, "build.log"));
    const packDir = join(root, "pack"); mkdirSync(packDir);
    const packed = await command("npm", ["pack", "--json", "--pack-destination", packDir], process.env, repo, 120_000, join(out, "pack.log"), "stdout");
    tarball = join(packDir, JSON.parse(packed)[0].filename);
  }
  artifactSha = sha(tarball);
  mkdirSync(prefix, { recursive: true });
  writeFileSync(join(prefix, "package.json"), '{"name":"startup-gate-prefix","private":true}\n');
  const installHome = join(root, "install-home"); mkdirSync(installHome);
  const npmCache = execFileSync("npm", ["config", "get", "cache"], { encoding: "utf8" }).trim();
  log(`installing exact tarball ${tarball}`);
  await command("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", tarball], { ...baseEnv(installHome), npm_config_cache: npmCache }, prefix, 600_000, join(out, "install.log"));
  installed = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
  engine = process.env.AGENTMEMORY_GATE_ENGINE ?? join(cache, `iii-${installed.dependencies["iii-sdk"]}-${platform()}-${arch()}`);
  assert(existsSync(engine), `Pinned engine missing: ${engine}. Run the standard release gate once, or set AGENTMEMORY_GATE_ENGINE.`);
  const version = await command(engine, ["--version"]);
  assert(version.includes(installed.dependencies["iii-sdk"]), `Engine version mismatch: ${version}`);
  cliSha = sha(cli); pkgFiles = packageFiles(); pkgSha = createHash("sha256").update(JSON.stringify(pkgFiles)).digest("hex");
  const cliVersion = await command(process.execPath, [cli, "--version"], baseEnv(installHome));
  assert.equal(cliVersion.trim(), installed.version);
}
class Instance {
  constructor(name) {
    this.name = name; this.dir = join(root, name); this.home = join(this.dir, "home"); this.data = join(this.dir, "data"); this.runtime = join(this.home, ".agentmemory"); this.configPath = null; this.envPath = join(this.runtime, ".env");
    for (const dir of [this.home, this.data, this.runtime]) mkdirSync(dir, { recursive: true });
    this.logFile = join(out, `${name}.log`); this.envExtra = {}; this.handles = []; this.ownedPids = new Set();
    instances.add(this);
  }
  async init() {
    this.port = await portBlock();
    const binDir = join(this.runtime, "bin"); mkdirSync(binDir, { recursive: true }); copyFileSync(engine, join(binDir, "iii")); chmodSync(join(binDir, "iii"), 0o755);
    return this;
  }
  env(extra = {}) { return { ...baseEnv(this.home), AGENTMEMORY_DATA_DIR: this.data, AGENTMEMORY_RUNTIME_DIR: this.runtime, III_REST_PORT: String(this.port), III_VIEWER_PORT: String(this.port + 2), III_ENGINE_PORT: String(this.port + 46023), AGENTMEMORY_METRICS_PORT: String(this.port + 6353), ...(options.workerBinDir ? { AGENTMEMORY_WORKER_BIN_DIR: options.workerBinDir } : {}), ...this.envExtra, ...extra }; }
  get url() { return `http://127.0.0.1:${this.port}`; }
  pid(name) { try { return Number(readFileSync(join(this.runtime, `${name}.pid`), "utf8").trim()); } catch { return null; } }
  config({ delayMs = 0, earlyPid = false, worker = true, workerDataDir = this.data, httpPort = this.port } = {}) {
    const namespace = `agentmemory-${this.port}`;
    const enginePort = this.port + 46023;
    const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
    const localWorkers = options.workerBinDir;
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
      `          directory: ${quote(join(this.data, "compose-config"))}`,
      "    iii-worker-manager:",
      "      host: 127.0.0.1",
      `      port: ${enginePort}`,
      "containers:",
      "  state:",
      `    worker: ${quote(localWorkers ? `path://${join(this.data, "local-workers/state")}` : "package://api.workers.iii.dev/state")}`,
      ...(!localWorkers ? ["    version: '0.22.20'"] : []),
      "    config_name: state",
      ...(localWorkers ? ["    scripts:", `      run: ${quote(join(localWorkers, "state"))}`] : []),
      "    config_override:",
      "      adapter:",
      "        name: kv",
      "        config:",
      "          store_method: file_based",
      "          save_interval_ms: 2000",
      `          file_path: ${quote(join(this.data, "state_store.db"))}`,
      "  http:",
      `    worker: ${quote(localWorkers ? `path://${join(this.data, "local-workers/http")}` : "package://api.workers.iii.dev/http")}`,
      ...(!localWorkers ? ["    version: '0.22.7'"] : []),
      "    config_name: http",
      ...(localWorkers ? ["    scripts:", `      run: ${quote(join(localWorkers, "http"))}`] : []),
      "    config_override:",
      "      host: 127.0.0.1",
      `      port: ${httpPort}`,
      "      default_timeout: 180000",
    ];
    if (localWorkers) {
      for (const name of ["state", "http"]) {
        const workerDir = join(this.data, "local-workers", name);
        mkdirSync(workerDir, { recursive: true });
        writeFileSync(join(workerDir, "iii.worker.yaml"), `iii: v1\nname: ${name}\nlanguage: rust\nscripts:\n  start: ${quote(join(localWorkers, name))}\n`);
      }
    }
    if (worker) {
      const wrapper = join(this.dir, "delayed-worker.mjs");
      writeFileSync(wrapper, `import { appendFileSync, writeFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(join(this.dir, "worker-starts.jsonl"))}, JSON.stringify({pid:process.pid,at:Date.now()})+'\\n');\n${earlyPid ? `writeFileSync(${JSON.stringify(join(this.runtime, "worker.pid"))}, String(process.pid));` : ""}\nawait new Promise(r=>setTimeout(r,${delayMs}));\nawait import(${JSON.stringify(pathToFileURL(join(pkg, "dist/index.mjs")).href)});\n`);
      lines.push(
        "  agentmemory:",
        `    worker: ${quote(`path://${pkg}`)}`,
        "    start_after: [state, http]",
        "    startup_timeout: 300s",
        "    config_name: agentmemory",
        "    scripts:",
        `      run: ${quote(`${process.execPath} ${wrapper}`)}`,
        `    working_dir: ${quote(this.dir)}`,
        "    environment:",
        `      HOME: ${quote(this.home)}`,
        `      PATH: ${quote([dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter))}`,
        `      AGENTMEMORY_DATA_DIR: ${quote(workerDataDir)}`,
        `      AGENTMEMORY_ENV_FILE: ${quote(this.envPath)}`,
        `      AGENTMEMORY_RUNTIME_DIR: ${quote(this.runtime)}`,
        `      III_REST_PORT: ${quote(String(this.port))}`,
        `      III_VIEWER_PORT: ${quote(String(this.port + 2))}`,
        `      III_ENGINE_PORT: ${quote(String(enginePort))}`,
        "      LLM_PROVIDER: 'none'",
        "      EMBEDDING_PROVIDER: 'none'",
        "      III_TELEMETRY_ENABLED: 'false'",
      );
    }
    lines.push("");
    const file = join(this.dir, "worker-compose.yaml");
    writeFileSync(file, lines.join("\n"));
    this.configPath = file;
    return file;
  }

  start(args = [], env = {}) {
    this.cli = launch(process.execPath, [cli, ...args, "--port", String(this.port)], this.env(env), this.dir, this.logFile);
    this.ownedPids.add(this.cli.pid); return this.cli;
  }
  writeComposeState(file, composePid) {
    this.composePid = composePid;
    this.configPath = file;
    const state = {
      kind: "compose", restPort: this.port, viewerPort: this.port + 2, enginePort: this.port + 46023,
      engineUrl: `ws://127.0.0.1:${this.port + 46023}`, namespace: `agentmemory-${this.port}`,
      file, stateDir: join(this.data, "compose-state"), logFile: this.logFile,
      binPath: join(this.runtime, "bin/iii"), composePid, workerVersions: { local: true },
    };
    writeFileSync(join(this.runtime, "engine-state.json"), JSON.stringify(state));
    return state;
  }
  async startEngine(config) {
    const engineEnv = { III_COMPOSE_STATE_DIR: join(this.data, "compose-state"), ...(options.workerBinDir ? { III_BUNDLE_WORKERS_DISABLED: "1" } : {}) };
    this.engine = launch(join(this.runtime, "bin/iii"), ["compose", "--namespace", `agentmemory-${this.port}`, "--up", "--file", config], this.env(engineEnv), this.dir, this.logFile);
    this.ownedPids.add(this.engine.pid);
    await poll("external Worker Compose engine", async () => {
      if (this.engine.result && this.engine.result.code !== 0) throw Object.assign(new Error(`Compose exited ${this.engine.result.code}: ${this.engine.text.slice(-1200)}`), { fatal: true });
      return (await fetch(`${this.url}/`, { signal: AbortSignal.timeout(500) })).status >= 200;
    }, 180_000);
    this.writeComposeState(config, this.engine.pid);
  }
  async ready(timeout = 90_000, requireHint = true, allowDoctorDiagnosticsFailure = false) {
    await poll(this.name, async () => {
      if (!allowDoctorDiagnosticsFailure && this.cli.result?.code && this.cli.result.code !== 0) { const err = new Error(`CLI exited ${this.cli.result.code}: ${this.cli.text.slice(-1100)}`); err.fatal = true; throw err; }
      if (requireHint && !this.cli.text.includes("REST API")) return false;
      const response = await fetch(`${this.url}/agentmemory/livez`, { signal: AbortSignal.timeout(1000) });
      if (!response.ok) return false;
      const body = await response.json(); return body.viewerPort || body.viewerSkipped;
    }, timeout);
  }
  wrapperStarts() { try { return readFileSync(join(this.dir, "worker-starts.jsonl"), "utf8").trim().split("\n").map(JSON.parse); } catch { return []; } }
  async close() {
    if (this.closed) return; this.closed = true;
    for (const handle of this.handles) { handle.closeAllConnections?.(); handle.close(); }
    for (const name of ["worker", "iii"]) { const pid = this.pid(name); if (pid) this.ownedPids.add(pid); }
    for (const row of this.wrapperStarts()) this.ownedPids.add(row.pid);
    try { const state = JSON.parse(readFileSync(join(this.runtime, "engine-state.json"), "utf8")); for (const pid of [state.composePid, state.enginePid]) if (Number.isInteger(pid) && pid > 0) this.ownedPids.add(pid); } catch {}
    for (const pid of [...this.ownedPids]) {
      try {
        const rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" }).split(/\r?\n/).map((row) => row.trim().split(/\s+/).map(Number)).filter((row) => row.length === 2 && row.every(Number.isFinite));
        const descendants = new Set([pid]);
        let changed = true;
        while (changed) { changed = false; for (const [child, parent] of rows) if (descendants.has(parent) && !descendants.has(child)) { descendants.add(child); changed = true; } }
        for (const child of descendants) this.ownedPids.add(child);
      } catch {}
    }
    for (const pid of this.ownedPids) kill(pid);
    const deadline = Date.now() + 10_000;
    while ([...this.ownedPids].some((pid) => alive(pid)) && Date.now() < deadline) await sleep(100);
  }
}
async function scenario(name, fn) {
  if (options.only && !options.only.has(name)) return;
  log(`RUN ${name}`); const at = Date.now(); const details = {}; let instance;
  try { instance = await new Instance(name).init(); await fn(instance, details); const status = details.skipped ? "skipped" : "pass"; results.push({ name, status, ms: Date.now() - at, details }); log(`${status.toUpperCase()} ${name}${details.skipped ? `: ${details.skipped}` : ""}`); }
  catch (err) { results.push({ name, status: "fail", ms: Date.now() - at, error: err.stack, details }); log(`FAIL ${name}: ${err.message}`); }
  finally { if (instance) await instance.close(); }
}
async function fixtureServer(instance, livez) {
  let probes = 0;
  const upstreamPort = instance.port + 1;
  const server = http.createServer((req, res) => {
    if (req.url === "/agentmemory/livez") {
      probes++;
      if (probes === 1) { res.writeHead(404); res.end(); return; }
      livez(req, res, probes - 1); return;
    }
    const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort, method: req.method, path: req.url, headers: req.headers }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  await new Promise((r) => server.listen(instance.port, "127.0.0.1", r)); instance.handles.push(server);
  const config = instance.config({ worker: false, httpPort: upstreamPort });
  await instance.startEngine(config);
  return { worker: instance.engine, probes: () => probes, state: JSON.parse(readFileSync(join(instance.runtime, "engine-state.json"), "utf8")) };
}
async function expectFailure(instance, args, env, { budgetMs = 5000, message } = {}) {
  const at = Date.now(); const child = instance.start(args, env); const result = await exited(child, budgetMs);
  assert.notEqual(result.code, 0, `CLI incorrectly succeeded: ${child.text}`);
  if (message) assert(child.text.includes(message), `Missing ${message}: ${child.text.slice(-1500)}`);
  return { elapsedMs: Date.now() - at, exitCode: result.code };
}

async function main() {
  if (options.workerBinDir) {
    assert(["state", "http"].every((name) => existsSync(join(options.workerBinDir, name))), `--worker-bin-dir must contain executable state and http binaries: ${options.workerBinDir}`);
    log(`local Worker Compose fixtures: ${options.workerBinDir}`);
  }
  await install();
  await scenario("slow-compose-worker", async (i, d) => {
    const config = i.config({ delayMs: options.delayMs, earlyPid: true });
    await i.startEngine(config);
    const at = Date.now(); i.start(["--no-engine"]);
    await i.ready(options.delayMs + 25_000);
    d.readyMs = Date.now() - at; d.delayMs = options.delayMs; d.transport = "managed Compose project with delayed packaged worker; CLI joins it with --no-engine";
    assert(d.readyMs >= options.delayMs - 1000, `Ready before configured Compose worker delay: ${d.readyMs}`);
    const starts = i.wrapperStarts(); assert.equal(starts.length, 1, "Compose launched the delayed packaged worker more than once");
    assert.equal(i.pid("worker"), starts[0].pid, "CLI imported a duplicate instead of waiting for the Compose worker");
    assert(alive(i.composePid), "CLI --no-engine stopped the externally owned Compose project");
  });
  await scenario("configured-compose-adoption", async (i, d) => {
    const config = i.config({ delayMs: 0, earlyPid: true });
    await i.startEngine(config); await poll("configured Compose worker ready", async () => (await fetch(`${i.url}/agentmemory/livez`)).ok, 30_000);
    const startsBefore = i.wrapperStarts(); assert.equal(startsBefore.length, 1);
    i.start(["--no-engine"]); await i.ready(10_000);
    assert.equal(i.wrapperStarts().length, 1, "CLI started a duplicate instead of joining the already-ready Compose worker");
    assert(alive(startsBefore[0].pid)); assert(alive(i.composePid));
    d.workerPid = startsBefore[0].pid; d.composePid = i.composePid; d.transport = "already-ready external Worker Compose project";
  });
  await scenario("compose-engine-timeout", async (i, d) => {
    i.config({ worker: false });
    const binary = join(i.runtime, "bin/iii"); const launchPid = join(i.dir, "launched-compose.pid");
    writeFileSync(binary, `#!${process.execPath}\nconst {writeFileSync}=require('node:fs');\nif(process.argv.includes('--version')) { console.log('iii ${installed.dependencies["iii-sdk"]}'); process.exit(0); }\nwriteFileSync(${JSON.stringify(launchPid)},String(process.pid));\nsetInterval(()=>{},1000);\n`); chmodSync(binary, 0o755);
    Object.assign(d, await expectFailure(i, [], { AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "300" }, { message: "The engine process started but the REST API never responded." }));
    const pid = Number(readFileSync(launchPid, "utf8")); i.ownedPids.add(pid); await poll("owned Compose engine timeout cleanup", () => !alive(pid), 5_000);
    assert(!existsSync(join(i.runtime, "engine-state.json")));
    d.transport = "version-compatible iii fixture accepting compose but never opening the engine port; actual installed CLI";
  });
  await scenario("cancel-owned-startup", async (i, d) => {
    const launchPid = join(i.dir, "cancel-owned-compose.pid");
    const binary = join(i.runtime, "bin/iii");
    writeFileSync(binary, `#!${process.execPath}\nconst {writeFileSync}=require('node:fs');\nif(process.argv.includes('--version')) { console.log('iii ${installed.dependencies["iii-sdk"]}'); process.exit(0); }\nwriteFileSync(${JSON.stringify(launchPid)},String(process.pid));\nsetInterval(()=>{},1000);\n`); chmodSync(binary, 0o755);
    i.start([], { AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "300000" });
    const composePid = await poll("CLI-owned Compose daemon", () => { try { return JSON.parse(readFileSync(join(i.runtime, "engine-state.json"), "utf8")).composePid; } catch { return null; } }, 5_000);
    i.ownedPids.add(composePid);
    const fakePid = await poll("non-serving owned engine process", () => { try { return Number(readFileSync(launchPid, "utf8")); } catch { return null; } }, 5_000); i.ownedPids.add(fakePid);
    i.cli.kill("SIGINT"); const result = await exited(i.cli, 10_000); assert.equal(result.code, 130, `Cancellation result ${JSON.stringify(result)}: ${i.cli.text.slice(-800)}`);
    await poll("cancelled owned Compose cleanup", () => !alive(composePid) && !alive(fakePid), 5_000);
    assert(!existsSync(join(i.runtime, "engine-state.json")));
    d.exitCode = result.code; d.ownedComposeStopped = true;
  });
  await scenario("cancel-external-startup", async (i, d) => {
    await i.startEngine(i.config({ delayMs: 10_000, earlyPid: true }));
    await poll("delayed Compose worker process", () => i.wrapperStarts()[0]?.pid, 10_000);
    i.start(["--no-engine"], { AGENTMEMORY_READY_TIMEOUT_MS: "300000" });
    await sleep(1000);
    i.cli.kill("SIGTERM"); const result = await exited(i.cli, 6_000); assert.equal(result.code, 143, `Cancellation result ${JSON.stringify(result)}: ${i.cli.text.slice(-800)}`);
    assert(alive(i.composePid), "Cancellation stopped an external Compose project");
    assert(alive(i.wrapperStarts()[0].pid), "Cancellation killed the Compose-owned delayed worker");
    d.exitCode = result.code; d.externalComposePreserved = true;
  });
  await scenario("no-engine", async (i, d) => {
    await i.startEngine(i.config({ delayMs: 3_000, earlyPid: true }));
    const at = Date.now(); i.start(["--no-engine"], { AGENTMEMORY_READY_TIMEOUT_MS: "15000" });
    await i.ready(20_000); d.readyMs = Date.now() - at;
    assert(d.readyMs >= 3_000); assert(alive(i.composePid), "External Compose project stopped during no-engine startup");
    const worker = i.wrapperStarts()[0].pid; assert(alive(worker));
    const duplicate = launch(process.execPath, [cli, "--no-engine", "--port", String(i.port)], i.env(), i.dir, i.logFile);
    const result = await exited(duplicate, 10_000); assert.equal(result.code, 0, duplicate.text.slice(-1200));
    assert.equal(i.wrapperStarts().length, 1, "A second --no-engine invocation duplicated the Compose worker");
    assert.equal(i.pid("worker"), worker); assert(alive(worker)); assert(alive(i.composePid));
    d.duplicateExitCode = result.code; d.transport = "real external Worker Compose project with delayed packaged worker";
  });
  await scenario("no-engine-timeout", async (i, d) => {
    await i.startEngine(i.config({ delayMs: 5_000, earlyPid: true }));
    const workerPid = await poll("delayed Compose worker process", () => i.wrapperStarts()[0]?.pid, 10_000);
    Object.assign(d, await expectFailure(i, ["--no-engine"], { AGENTMEMORY_READY_TIMEOUT_MS: "300" }, { message: "0.3s" }));
    assert(alive(i.composePid), "Worker readiness timeout stopped an externally owned Compose project");
    assert(alive(workerPid), "Compose supervisor's delayed worker was incorrectly killed by the joining CLI");
    d.externalComposePreserved = true;
  });
  await scenario("inline-worker-fatal", async (i, d) => {
    const workerData = join(i.data, "fatal-worker-data"); mkdirSync(join(workerData, "secret"), { recursive: true });
    const config = i.config({ workerDataDir: workerData }); await i.startEngine(config);
    Object.assign(d, await expectFailure(i, ["--no-engine"], { AGENTMEMORY_READY_TIMEOUT_MS: "3000" }, { budgetMs: 10_000, message: "3s" }));
    const workerLogs = readdirSync(join(i.data, "compose-state"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => { const stateRoot = join(i.data, "compose-state", entry.name); return readdirSync(stateRoot, { withFileTypes: true }).filter((project) => project.isDirectory()).map((project) => join(stateRoot, project.name, "logs", "agentmemory.log")); })
      .filter(existsSync)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    assert.match(workerLogs, /agentmemory could not create its API secret/i, "Compose did not report the packaged worker's fatal initialization failure");
    d.workerExitCode = 1; d.transport = "real Worker Compose supervision with packaged worker secret-path initialization failure";
  });
  await scenario("compose-worker-timeout", async (i, d) => {
    mkdirSync(join(i.data, "secret"), { recursive: true });
    Object.assign(d, await expectFailure(i, [], { AGENTMEMORY_READY_TIMEOUT_MS: "300" }, { budgetMs: 30_000, message: "0.3s" }));
    await poll("CLI-owned Compose timeout cleanup", () => { try { const state = JSON.parse(readFileSync(join(i.runtime, "engine-state.json"), "utf8")); return !alive(state.composePid) && !alive(state.enginePid); } catch { return true; } }, 10_000);
    assert(!existsSync(join(i.runtime, "engine-state.json")), "Timed-out owned Compose startup retained lifecycle metadata");
    assert(!(await fetch(i.url, { signal: AbortSignal.timeout(200) }).then(() => true).catch(() => false)), "Timed-out owned Compose project still serves REST");
    d.ownedComposeStopped = true;
  });
  await scenario("hung-livez-body", async (i, d) => {
    const f = await fixtureServer(i, (_req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.write('{"viewerPort":'); });
    const child = i.start(["--no-engine"], { AGENTMEMORY_READY_TIMEOUT_MS: "300" });
    await poll("CLI readiness failure", () => child.result, 5_000);
    assert.notEqual(child.result.code, 0); assert(child.text.includes("0.3s"), `Missing configured livez timeout: ${child.text.slice(-1000)}`);
    assert(alive(f.worker.pid)); d.externalWorkerPreserved = true; d.probes = f.probes(); d.transport = "controlled HTTP headers with a stalled response body, CLI-owned engine, and external Compose lifecycle metadata";
  });
  await scenario("malformed-livez", async (i, d) => {
    const invalid = ["not json", JSON.stringify({ viewerPort: -1 }), JSON.stringify({ viewerPort: 0 }), JSON.stringify({ viewerPort: 65536 }), JSON.stringify({ viewerPort: 3000.5 }), JSON.stringify({ viewerSkipped: "true" }), JSON.stringify({ viewerPort: null, viewerSkipped: false })];
    const f = await fixtureServer(i, (_req, res, n) => { res.writeHead(200, { "content-type": "application/json" }); res.end(invalid[n - 1] ?? JSON.stringify({ viewerSkipped: true })); });
    i.start(["--no-engine"], { AGENTMEMORY_READY_TIMEOUT_MS: "6000" });
    await poll("CLI readiness hint", () => i.cli.text.includes("REST API"), 7_000);
    assert(f.probes() >= invalid.length + 2, `Malformed readiness accepted after ${f.probes()} probes`); await i.ready(1_000); d.probes = f.probes(); d.invalidResponses = invalid.length; d.transport = "controlled malformed readiness responses with Compose lifecycle metadata";
  });
  await scenario("env-file-and-precedence", async (i, d) => {
    const f = await fixtureServer(i, (_req, res) => { res.writeHead(503); res.end(); });
    writeFileSync(i.envPath, "AGENTMEMORY_READY_TIMEOUT_MS=350\nAGENTMEMORY_ENGINE_READY_TIMEOUT_MS=1000\n");
    const fromFile = i.start(["--no-engine"], {}); const fileResult = await exited(fromFile, 10_000);
    assert.notEqual(fileResult.code, 0); assert(fromFile.text.includes("0.35s"), `Fixture .env timeout not applied: ${fromFile.text.slice(-1000)}`);
    d.fromFile = { exitCode: fileResult.code };
    const shellOverride = i.start(["--no-engine"], { AGENTMEMORY_READY_TIMEOUT_MS: "150" }); const shellResult = await exited(shellOverride, 10_000);
    assert.notEqual(shellResult.code, 0); assert(shellOverride.text.includes("0.15s"), `Environment override did not win: ${shellOverride.text.slice(-1000)}`);
    d.shellOverride = { exitCode: shellResult.code };
    assert(alive(f.worker.pid)); d.transport = "real external Worker Compose engine behind a controlled unready HTTP proxy";
  });
  await scenario("invalid-timeouts", async (i, d) => {
    d.rejected = [];
    for (const key of ["AGENTMEMORY_ENGINE_READY_TIMEOUT_MS", "AGENTMEMORY_READY_TIMEOUT_MS"]) {
      for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity", "500ms", "3600001"]) {
        const result = await expectFailure(i, ["--no-engine"], { [key]: value }, { budgetMs: 10_000, message: key });
        d.rejected.push({ key, value, ...result });
        assert(!existsSync(join(i.runtime, "worker.pid")), "Invalid timeout imported the worker");
      }
    }
    const ownership = await expectFailure(i, ["--no-engine"], { AGENTMEMORY_ENGINE_MANAGES_WORKER: "yes" }, { budgetMs: 10_000, message: "AGENTMEMORY_ENGINE_MANAGES_WORKER" });
    d.invalidOwnership = ownership;
    const help = await command(process.execPath, [cli, "--help"], i.env({ AGENTMEMORY_READY_TIMEOUT_MS: "invalid" }), i.dir);
    assert(help.includes("Usage:"));
  });
  await scenario("doctor", async (i, d) => {
    i.start(); await i.ready(120_000);
    const composeState = JSON.parse(readFileSync(join(i.runtime, "engine-state.json"), "utf8"));
    const child = i.start(["doctor", "--all"], { EDITOR: "/usr/bin/true", AGENTMEMORY_ENV_FILE: i.envPath });
    const result = await exited(child, 30_000); assert(result.code === 0 || result.code === 1, `Doctor crashed: ${child.text.slice(-1000)}`);
    assert(child.text.includes("Server reachable"), "Doctor did not diagnose the Compose-managed REST service");
    assert(alive(composeState.composePid), "Doctor stopped a healthy externally running Compose project");
    await i.ready(5_000, false, true); d.doctorExitCode = result.code; d.composePid = composeState.composePid; d.transport = "real CLI-managed Worker Compose project inspected by doctor --all";
  });
  await scenario("doctor-compose-recovery", async (i, d) => {
    const oldState = i.writeComposeState(i.config({ worker: false }), 2_000_000_000);
    writeFileSync(i.envPath, "LLM_PROVIDER=none\nAGENTMEMORY_READY_TIMEOUT_MS=30000\n");
    const child = i.start(["doctor", "--all"], { EDITOR: "/usr/bin/true", AGENTMEMORY_ENV_FILE: i.envPath });
    await poll("doctor Compose recovery ready", () => child.text.includes("Engine and agentmemory worker ready"), 120_000);
    const result = await exited(child, 30_000); assert(result.code === 0 || result.code === 1, `Doctor crashed: ${child.text.slice(-1000)}`);
    const state = JSON.parse(readFileSync(join(i.runtime, "engine-state.json"), "utf8"));
    assert.equal(state.kind, "compose"); assert(alive(state.composePid), "Doctor failed to leave the recovered Compose project running");
    assert.equal(i.wrapperStarts().length, 0, "Stale metadata repair unexpectedly used a test wrapper instead of the packaged worker");
    await i.ready(10_000, false, true); assert.notEqual(state.composePid, child.pid, "Doctor did not detach the Compose runtime");
    d.doctorExitCode = result.code; d.composePid = state.composePid; d.transport = "doctor stale-lifecycle repair starts the standard managed Compose project";
  });
  await scenario("trace-storage-integrity", async (i, d) => {
    i.start(); await i.ready(120_000);
    const lifecycle = JSON.parse(readFileSync(join(i.runtime, "engine-state.json"), "utf8"));
    assert.equal(lifecycle.kind, "compose");
    const installedFiles = packageFiles();
    const installedDigest = createHash("sha256").update(JSON.stringify(installedFiles)).digest("hex");
    const configFile = join(i.data, "compose", "config", "iii-observability.yaml");
    const entry = parseYaml(readFileSync(configFile, "utf8"));
    assert.equal(entry.value.trace_storage.directory, join(i.data, "observability", "traces"));
    assert(existsSync(entry.value.trace_storage.directory), "Trace storage directory was not provisioned in instance data");
    const stop = await command(process.execPath, [cli, "stop", "--port", String(i.port)], i.env(), i.dir, 30_000);
    d.stopped = true;
    await poll("trace runtime shutdown", () => !alive(lifecycle.composePid), 10_000);
    const finalFiles = packageFiles();
    const finalDigest = createHash("sha256").update(JSON.stringify(finalFiles)).digest("hex");
    assert.equal(finalDigest, installedDigest, "Installed package files changed after starting and stopping the managed runtime");
    assert.deepEqual(finalFiles, installedFiles, "Installed package gained or lost files after starting and stopping the managed runtime");
    assert.equal(createHash("sha256").update(readFileSync(tarball)).digest("hex"), artifactSha, "Packed artifact changed during the managed runtime smoke");
    d.installedArtifactUnmodified = true; d.traceDirectory = entry.value.trace_storage.directory;
    d.stopOutput = stop.slice(-300);
  });

  await scenario("demo", async (i, d) => {
    const at = Date.now();
    const child = i.start(["demo", "--serve"], { AGENTMEMORY_READY_TIMEOUT_MS: "15000" });
    const result = await exited(child, 35_000); assert.equal(result.code, 0, child.text.slice(-1200)); assert(child.text.includes("demo complete"));
    d.completedMs = Date.now() - at; d.transport = "real Worker Compose runtime and installed demo command";
    assert(!(await fetch(i.url, { signal: AbortSignal.timeout(200) }).then(() => true).catch(() => false)), "Demo-owned engine survived teardown");
  });
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => {
  for (const i of instances) {
    for (const name of ["iii", "worker"]) kill(i.pid(name));
    for (const row of i.wrapperStarts()) kill(row.pid);
    for (const pid of i.ownedPids) kill(pid);
  }
  for (const child of children) kill(child.pid);
  process.exit(130);
});
let fatal;
try { await main(); } catch (err) { fatal = err.stack; log(fatal); }
finally { for (const i of instances) await i.close(); for (const child of children) kill(child.pid); }
const finalPkgFiles = cliSha ? packageFiles() : [];
const changedPackageFiles = pkgFiles ? pkgFiles.filter(([name, digest]) => !finalPkgFiles.some(([finalName, finalDigest]) => finalName === name && finalDigest === digest)).map(([name]) => name).concat(finalPkgFiles.filter(([name]) => !pkgFiles.some(([initialName]) => initialName === name)).map(([name]) => name)) : [];
const unchanged = cliSha ? cliSha === sha(cli) && pkgSha === createHash("sha256").update(JSON.stringify(finalPkgFiles)).digest("hex") && artifactSha === sha(tarball) : false;
const summary = { ok: !fatal && unchanged && results.some((r) => r.status === "pass") && results.every((r) => r.status !== "fail"), version: installed?.version, enginePin: installed?.dependencies["iii-sdk"], tarball, tarballSha256: artifactSha, installedCliSha256: cliSha, installedPackageSha256: pkgSha, changedPackageFiles, installedArtifactUnmodified: unchanged, node: process.version, platform: `${platform()}-${arch()}`, durationMs: Date.now() - started, root: options.keep ? root : undefined, scenarios: results, fatal };
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
log(`Summary: ${results.filter((r) => r.status === "pass").length}/${results.length} passed; ${join(out, "summary.json")}`);
if (!options.keep && !out.startsWith(`${root}/`)) rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
process.exit(summary.ok ? 0 : 1);
