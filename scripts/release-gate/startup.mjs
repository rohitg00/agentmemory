#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { arch, homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const options = { tarball: null, out: null, only: null, keep: false, delayMs: 48_000, skipBuild: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--tarball") options.tarball = resolve(process.argv[++i]);
  else if (arg === "--out") options.out = resolve(process.argv[++i]);
  else if (arg === "--only") options.only = new Set(process.argv[++i].split(","));
  else if (arg === "--delay-ms") options.delayMs = Number(process.argv[++i]);
  else if (arg === "--keep") options.keep = true;
  else if (arg === "--skip-build") options.skipBuild = true;
  else if (arg === "--help") {
    console.log("Usage: node scripts/release-gate/startup.mjs [--tarball file.tgz] [--out dir] [--only names] [--delay-ms 48000] [--skip-build] [--keep]");
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
function packageDigest() {
  const files = [];
  const walk = (dir, relative = "") => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), name);
    else if (entry.isFile()) files.push([name, sha(join(dir, entry.name))]);
  } };
  walk(pkg); files.sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
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
    if ((await Promise.all([0, 1, 2, 3, 6353, 46023].map((d) => free(port + d)))).every(Boolean)) return port;
  }
  throw new Error("No free port block");
}
let installed;
let tarball;
let artifactSha;
let cliSha;
let pkgSha;
let engine;
function baseEnv(home) {
  return { HOME: home, PATH: [join(prefix, "node_modules/.bin"), nodeDir, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter), TMPDIR: tmpdir(), CI: "1", NO_COLOR: "1", LANG: "C.UTF-8", EMBEDDING_PROVIDER: "none", LLM_PROVIDER: "none", III_TELEMETRY_ENABLED: "false" };
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
  cliSha = sha(cli); pkgSha = packageDigest();
  const cliVersion = await command(process.execPath, [cli, "--version"], baseEnv(installHome));
  assert.equal(cliVersion.trim(), installed.version);
}
class Instance {
  constructor(name) {
    this.name = name; this.dir = join(root, name); this.home = join(this.dir, "home"); this.data = join(this.dir, "data"); this.runtime = join(this.home, ".agentmemory");
    for (const dir of [this.home, this.data, this.runtime]) mkdirSync(dir, { recursive: true });
    this.logFile = join(out, `${name}.log`); this.envExtra = {}; this.handles = []; this.ownedPids = new Set(); this.dockerProject = null;
    instances.add(this);
  }
  async init() {
    this.port = await portBlock();
    const binDir = join(this.runtime, "bin"); mkdirSync(binDir, { recursive: true }); copyFileSync(engine, join(binDir, "iii")); chmodSync(join(binDir, "iii"), 0o755);
    return this;
  }
  env(extra = {}) { return { ...baseEnv(this.home), AGENTMEMORY_DATA_DIR: this.data, AGENTMEMORY_RUNTIME_DIR: this.runtime, III_REST_PORT: String(this.port), III_STREAM_PORT: String(this.port + 1), III_VIEWER_PORT: String(this.port + 2), III_ENGINE_PORT: String(this.port + 46023), AGENTMEMORY_METRICS_PORT: String(this.port + 6353), ...this.envExtra, ...extra }; }
  get url() { return `http://127.0.0.1:${this.port}`; }
  pid(name) { try { return Number(readFileSync(join(this.runtime, `${name}.pid`), "utf8").trim()); } catch { return null; } }
  config({ delayMs = 0, earlyPid = false, worker = true, relative = false } = {}) {
    let raw = readFileSync(join(pkg, "iii-config.yaml"), "utf8").split("  - name: iii-exec")[0];
    raw = raw.replaceAll("3111", String(this.port)).replaceAll("3112", String(this.port + 1)).replaceAll("3113", String(this.port + 2)).replaceAll("./data/", `${this.data}/`);
    raw += `  - name: iii-worker-manager\n    config:\n      port: ${this.port + 46023}\n      host: 127.0.0.1\n`;
    if (worker) {
      const wrapper = join(this.dir, relative ? "dist/index.mjs" : "delayed-worker.mjs");
      mkdirSync(dirname(wrapper), { recursive: true });
      writeFileSync(wrapper, `import { appendFileSync, writeFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(join(this.dir, "worker-starts.jsonl"))}, JSON.stringify({pid:process.pid,at:Date.now()})+'\\n');\n${earlyPid ? `writeFileSync(${JSON.stringify(join(this.runtime, "worker.pid"))}, String(process.pid));` : ""}\nawait new Promise(r=>setTimeout(r,${delayMs}));\nawait import(${JSON.stringify(pathToFileURL(join(pkg, "dist/index.mjs")).href)});\n`);
      raw += `  - name: iii-exec\n    config:\n      exec:\n        - ${relative ? "node dist/index.mjs" : `${process.execPath} ${wrapper}`}\n`;
    }
    const file = join(this.dir, "iii-config.yaml"); writeFileSync(file, raw); this.envExtra.AGENTMEMORY_III_CONFIG = file; if (worker && !relative) this.envExtra.AGENTMEMORY_ENGINE_MANAGES_WORKER = "true"; return file;
  }
  start(args = [], env = {}, cwd = this.dir) {
    this.cli = launch(process.execPath, [cli, ...args, "--port", String(this.port)], this.env(env), cwd, this.logFile);
    this.ownedPids.add(this.cli.pid); return this.cli;
  }
  async startEngine(config) {
    this.engine = launch(engine, ["--config", config, "--no-update-check"], this.env(), this.dir, this.logFile);
    this.ownedPids.add(this.engine.pid);
    await poll("external engine", async () => (await fetch(`${this.url}/`, { signal: AbortSignal.timeout(500) })).status > 0, 20_000);
    writeFileSync(join(this.runtime, "engine-state.json"), JSON.stringify({ kind: "native", configPath: config, binPath: engine, restPort: this.port, attached: true }));
    writeFileSync(join(this.runtime, "iii.pid"), String(this.engine.pid));
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
    if (this.dockerProject) await command(this.dockerBin, ["compose", "-p", this.dockerProject, "-f", join(pkg, "docker-compose.yml"), "down", "--volumes"], this.env(), this.dir, 30_000, this.logFile).catch((err) => log(`${this.name} Docker cleanup: ${err.message}`));
    for (const name of ["worker", "iii"]) { const pid = this.pid(name); if (pid) this.ownedPids.add(pid); }
    for (const row of this.wrapperStarts()) this.ownedPids.add(row.pid);
    for (const pid of this.ownedPids) kill(pid);
    await sleep(100);
  }
}
async function scenario(name, fn) {
  if (options.only && !options.only.has(name)) return;
  log(`RUN ${name}`); const at = Date.now(); const details = {}; let instance;
  try { instance = await new Instance(name).init(); await fn(instance, details); const status = details.skipped ? "skipped" : "pass"; results.push({ name, status, ms: Date.now() - at, details }); log(`${status.toUpperCase()} ${name}${details.skipped ? `: ${details.skipped}` : ""}`); }
  catch (err) { results.push({ name, status: "fail", ms: Date.now() - at, error: err.stack, details }); log(`FAIL ${name}: ${err.message}`); }
  finally { if (instance) await instance.close(); }
}
async function delayedConfigured(instance, details, { delayMs, earlyPid = false, relative = false, adopt = false, args = [] } = {}) {
  const config = instance.config({ delayMs, earlyPid, relative });
  if (adopt) await instance.startEngine(config);
  const at = Date.now(); instance.start(args); await instance.ready(delayMs + 25_000);
  details.readyMs = Date.now() - at; details.delayMs = delayMs; details.transport = "real pinned native engine and installed worker via custom delayed-import config";
  assert(details.readyMs >= delayMs - 1000, `Ready before configured worker delay: ${details.readyMs}`);
  const starts = instance.wrapperStarts(); assert.equal(starts.length, 1, "Configured worker launched more than once");
  assert.equal(instance.pid("worker"), starts[0].pid, "CLI imported a second worker instead of waiting for the configured worker");
  details.workerPid = starts[0].pid; details.enginePid = instance.pid("iii");
}
async function delayedSocket(instance, backendPort, delayMs) {
  const connections = new Set();
  let accepted = 0;
  const server = net.createServer((socket) => {
    accepted++; connections.add(socket); socket.pause();
    const timer = setTimeout(() => {
      if (socket.destroyed) return;
      const upstream = net.connect(backendPort, "127.0.0.1"); connections.add(upstream);
      upstream.on("connect", () => { socket.pipe(upstream); upstream.pipe(socket); socket.resume(); });
      upstream.on("error", () => socket.destroy()); socket.on("error", () => upstream.destroy());
      socket.on("close", () => upstream.destroy()); upstream.on("close", () => connections.delete(upstream));
    }, delayMs);
    socket.on("close", () => { clearTimeout(timer); connections.delete(socket); });
    socket.on("error", () => {});
  });
  server.closeAllConnections = () => { for (const socket of connections) socket.destroy(); };
  await new Promise((r) => server.listen(0, "127.0.0.1", r)); instance.handles.push(server);
  return { port: server.address().port, accepted: () => accepted };
}
async function fixtureServer(instance, livez) {
  let probes = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/agentmemory/livez") {
      probes++;
      if (probes === 1) { res.writeHead(404); res.end(); return; }
      livez(req, res, probes - 1); return;
    }
    res.writeHead(200, { "content-type": "application/json" }); res.end("{}");
  });
  await new Promise((r) => server.listen(instance.port, "127.0.0.1", r)); instance.handles.push(server);
  const sleeper = launch(process.execPath, ["-e", "setInterval(()=>{},1000)"], instance.env(), instance.dir);
  instance.ownedPids.add(sleeper.pid); writeFileSync(join(instance.runtime, "worker.pid"), String(sleeper.pid));
  instance.config({ worker: false });
  writeFileSync(join(instance.runtime, "engine-state.json"), JSON.stringify({ kind: "native", configPath: instance.envExtra.AGENTMEMORY_III_CONFIG, binPath: engine, restPort: instance.port, attached: true }));
  return { worker: sleeper, probes: () => probes };
}
async function expectFailure(instance, args, env, { budgetMs = 5000, message } = {}) {
  const at = Date.now(); const child = instance.start(args, env); const result = await exited(child, budgetMs);
  assert.notEqual(result.code, 0, `CLI incorrectly succeeded: ${child.text}`);
  if (message) assert(child.text.includes(message), `Missing ${message}: ${child.text.slice(-1500)}`);
  return { elapsedMs: Date.now() - at, exitCode: result.code };
}
function dockerFixture(instance, mode) {
  const fixtureBin = join(instance.dir, "fixture-bin"); mkdirSync(fixtureBin);
  const project = `agentmemory-${instance.port}`; const containerId = "startup-fixture-owned-container";
  const record = { Id: containerId, State: { Running: false }, Config: { Image: `iiidev/iii:${installed.dependencies["iii-sdk"]}`, Labels: { "com.docker.compose.project": project, "com.docker.compose.service": "iii-engine" } }, HostConfig: { PortBindings: { [`${instance.port}/tcp`]: [{ HostPort: String(instance.port) }] } }, Mounts: [{ Type: "bind", Source: instance.data, Destination: "/data" }] };
  const pidFile = join(instance.dir, "docker-stub.pid");
  const file = join(fixtureBin, "docker");
  writeFileSync(file, `#!${process.execPath}\nconst {writeFileSync}=require('node:fs');\nconst args=process.argv.slice(2);\nif(args[0]===${JSON.stringify(mode)}) { writeFileSync(${JSON.stringify(pidFile)},String(process.pid)); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); }\nelse if(args[0]==='inspect') console.log(${JSON.stringify(JSON.stringify([record]))});\nelse if(args.includes('ps')) console.log(${JSON.stringify(containerId)});\n`); chmodSync(file, 0o755);
  instance.envExtra.PATH = [fixtureBin, instance.env().PATH].join(delimiter);
  writeFileSync(join(instance.runtime, "engine-state.json"), JSON.stringify({ kind: "docker", schemaVersion: 2, composeFile: join(pkg, "docker-compose.yml"), projectName: project, engineVersion: installed.dependencies["iii-sdk"], restPort: instance.port, dataDir: instance.data, containerId, dataMountType: "bind", dataMountSource: instance.data, preserveContainer: mode === "inspect" }));
  return pidFile;
}
async function main() {
  await install();
  await scenario("slow-native", (i, d) => delayedConfigured(i, d, { delayMs: options.delayMs, earlyPid: true }));
  await scenario("configured-adoption", (i, d) => delayedConfigured(i, d, { delayMs: 8_000, adopt: true }));
  await scenario("unrelated-exec", async (i, d) => {
    const config = i.config({ worker: false });
    const other = join(i.dir, "unrelated-worker.mjs"); writeFileSync(other, "setInterval(()=>{},1000);\n");
    appendFileSync(config, `  - name: iii-exec\n    config:\n      exec:\n        - ${process.execPath} ${other}\n`);
    const at = Date.now(); i.start([], { AGENTMEMORY_READY_TIMEOUT_MS: "3000" }); await i.ready(8_000);
    d.readyMs = Date.now() - at; assert.equal(i.pid("worker"), i.cli.pid, "Unrelated exec prevented the CLI-owned worker from starting");
    d.transport = "real engine with unrelated iii-exec command plus installed CLI-owned worker";
  });
  await scenario("relative-exec", (i, d) => delayedConfigured(i, d, { delayMs: 8_000, relative: true }));
  await scenario("unresolved-relative-exec", async (i, d) => {
    const config = i.config({ worker: false });
    appendFileSync(config, "  - name: iii-exec\n    config:\n      exec:\n        - node dist/index.mjs\n");
    const cliCwd = join(i.dir, "cli-cwd"); mkdirSync(join(cliCwd, "dist"), { recursive: true }); writeFileSync(join(cliCwd, "dist/index.mjs"), "");
    const at = Date.now(); i.start([], { AGENTMEMORY_READY_TIMEOUT_MS: "5000" }, cliCwd); await i.ready(10_000);
    d.readyMs = Date.now() - at; assert.equal(i.pid("worker"), i.cli.pid, "A relative exec entry missing from the engine working directory prevented the CLI-owned worker from starting");
    d.transport = "real engine with a relative iii-exec worker entry that does not exist in its working directory; installed CLI-owned worker";
  });
  await scenario("native-engine-timeout", async (i, d) => {
    i.config({ worker: false });
    const binary = join(i.runtime, "bin/iii"); const launchPid = join(i.dir, "launched-engine.pid");
    writeFileSync(binary, `#!${process.execPath}\nconst {writeFileSync}=require('node:fs');\nif(process.argv.includes('--version')) { console.log('iii ${installed.dependencies["iii-sdk"]}'); process.exit(0); }\nwriteFileSync(${JSON.stringify(launchPid)},String(process.pid));\nsetInterval(()=>{},1000);\n`); chmodSync(binary, 0o755);
    Object.assign(d, await expectFailure(i, [], { AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "300" }, { message: "0.3s" }));
    const pid = Number(readFileSync(launchPid, "utf8")); i.ownedPids.add(pid); await poll("owned engine timeout cleanup", () => !alive(pid), 5_000);
    assert(!existsSync(join(i.runtime, "iii.pid"))); assert(!existsSync(join(i.runtime, "engine-state.json")));
    d.transport = "version-compatible engine executable fixture that stays alive without opening HTTP; actual installed CLI";
  });
  await scenario("untracked-native-adoption", async (i, d) => {
    const config = i.config({ worker: false }); const externalConfig = join(i.dir, "external-config.yaml");
    copyFileSync(config, externalConfig); rmSync(config); await i.startEngine(externalConfig);
    delete i.envExtra.AGENTMEMORY_III_CONFIG;
    rmSync(join(i.runtime, "engine-state.json")); rmSync(join(i.runtime, "iii.pid"));
    i.start([], { AGENTMEMORY_READY_TIMEOUT_MS: "3000" }); await i.ready(6_000);
    assert.equal(i.pid("worker"), i.cli.pid, "Untracked engine was assumed to own a configured worker");
    assert(alive(i.engine.pid)); d.transport = "real native engine without lifecycle metadata or AgentMemory exec config";
  });
  await scenario("cancel-owned-startup", async (i, d) => {
    i.config({ delayMs: 10_000, earlyPid: true }); i.start([], { AGENTMEMORY_READY_TIMEOUT_MS: "15000" });
    await poll("owned engine ready before cancellation", async () => i.pid("worker") && (await fetch(i.url, { signal: AbortSignal.timeout(500) })).status > 0, 5_000);
    const enginePid = i.pid("iii"); const workerPid = i.pid("worker");
    i.cli.kill("SIGINT"); const result = await exited(i.cli, 6_000); assert.equal(result.code, 130, `Cancellation result ${JSON.stringify(result)}: ${i.cli.text.slice(-800)}`);
    await poll("cancelled owned process cleanup", () => !alive(enginePid) && !alive(workerPid), 5_000);
    d.exitCode = result.code; d.ownedEngineStopped = true;
  });
  await scenario("cancel-external-startup", async (i, d) => {
    await i.startEngine(i.config({ worker: false })); const proxy = await delayedSocket(i, i.port + 46023, 10_000);
    i.start(["--no-engine"], { III_ENGINE_URL: `ws://127.0.0.1:${proxy.port}`, AGENTMEMORY_READY_TIMEOUT_MS: "15000" });
    await poll("worker connecting before cancellation", () => proxy.accepted() > 0, 5_000);
    i.cli.kill("SIGTERM"); const result = await exited(i.cli, 6_000); assert.equal(result.code, 143, `Cancellation result ${JSON.stringify(result)}: ${i.cli.text.slice(-800)}`);
    assert(alive(i.engine.pid), "Cancellation stopped an external engine"); d.exitCode = result.code; d.externalEnginePreserved = true;
  });
  await scenario("no-engine", async (i, d) => {
    await i.startEngine(i.config({ worker: false }));
    const socket = await delayedSocket(i, i.port + 46023, 3_000);
    const at = Date.now(); i.start(["--no-engine"], { III_ENGINE_URL: `ws://127.0.0.1:${socket.port}`, AGENTMEMORY_READY_TIMEOUT_MS: "10000" });
    await i.ready(15_000); d.readyMs = Date.now() - at; d.delayedConnections = socket.accepted();
    assert(d.readyMs >= 3000); assert(d.delayedConnections > 0); assert(alive(i.engine.pid), "External engine stopped during no-engine startup");
    const worker = i.pid("worker");
    const duplicate = launch(process.execPath, [cli, "--no-engine", "--port", String(i.port)], i.env(), i.dir, i.logFile);
    const result = await exited(duplicate, 5_000); assert.notEqual(result.code, 0); assert(duplicate.text.includes("already running"));
    assert.equal(i.pid("worker"), worker); assert(alive(worker)); assert(alive(i.engine.pid));
    d.duplicateExitCode = result.code; d.transport = "real native engine and installed worker over delayed TCP proxy";
  });
  await scenario("no-engine-timeout", async (i, d) => {
    await i.startEngine(i.config({ worker: false }));
    const socket = await delayedSocket(i, i.port + 46023, 5_000);
    Object.assign(d, await expectFailure(i, ["--no-engine"], { III_ENGINE_URL: `ws://127.0.0.1:${socket.port}`, AGENTMEMORY_READY_TIMEOUT_MS: "300" }, { message: "0.3s" }));
    assert(alive(i.engine.pid), "Timeout stopped an externally owned engine");
    assert(!i.pid("worker") || !alive(i.pid("worker")), "Failed in-process worker left a live stale PID");
    d.externalEnginePreserved = true;
  });
  await scenario("inline-worker-fatal", async (i, d) => {
    i.config({ worker: false }); mkdirSync(join(i.runtime, "secret"));
    const child = i.start([], { AGENTMEMORY_READY_TIMEOUT_MS: "10000" });
    const enginePid = await poll("owned engine PID before worker initialization", () => i.pid("iii"), 3_000); i.ownedPids.add(enginePid);
    const result = await exited(child, 6_000); assert.equal(result.code, 1); assert(child.text.includes("[agentmemory] Fatal:"), "Fixture did not exercise the worker's fatal initialization path");
    await poll("fatal initialization engine cleanup", () => !alive(enginePid), 4_000);
    assert(!i.pid("iii")); assert(!i.pid("worker") || !alive(i.pid("worker")));
    d.exitCode = result.code; d.ownedEngineStopped = true; d.transport = "real engine and inline installed worker; secret path occupied by a directory causes initialization failure";
  });
  await scenario("native-worker-timeout", async (i, d) => {
    i.config({ delayMs: 5_000, earlyPid: true });
    Object.assign(d, await expectFailure(i, [], { AGENTMEMORY_READY_TIMEOUT_MS: "300" }, { message: "0.3s" }));
    await poll("owned engine cleanup", () => (!i.pid("iii") || !alive(i.pid("iii"))) && (!i.pid("worker") || !alive(i.pid("worker"))), 5_000);
    assert(!(await fetch(i.url, { signal: AbortSignal.timeout(200) }).then(() => true).catch(() => false)), "Failed owned engine still serves REST");
    d.ownedEngineStopped = true;
  });
  await scenario("hung-livez-body", async (i, d) => {
    const f = await fixtureServer(i, (_req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.write('{"viewerPort":'); });
    Object.assign(d, await expectFailure(i, [], { AGENTMEMORY_READY_TIMEOUT_MS: "300" }, { budgetMs: 2_000, message: "0.3s" }));
    assert(alive(f.worker.pid)); d.externalWorkerPreserved = true; d.probes = f.probes(); d.transport = "controlled HTTP headers with a stalled response body; external worker PID fixture";
  });
  await scenario("malformed-livez", async (i, d) => {
    const invalid = ["not json", JSON.stringify({ viewerPort: -1 }), JSON.stringify({ viewerPort: 0 }), JSON.stringify({ viewerPort: 65536 }), JSON.stringify({ viewerPort: 3000.5 }), JSON.stringify({ viewerSkipped: "true" }), JSON.stringify({ viewerPort: null, viewerSkipped: false })];
    const f = await fixtureServer(i, (_req, res, n) => { res.writeHead(200, { "content-type": "application/json" }); res.end(invalid[n - 1] ?? JSON.stringify({ viewerSkipped: true })); });
    i.start([], { AGENTMEMORY_READY_TIMEOUT_MS: "6000" });
    await poll("CLI readiness hint", () => i.cli.text.includes("REST API"), 7_000);
    assert(f.probes() >= invalid.length + 2, `Malformed readiness accepted after ${f.probes()} probes`); await i.ready(1_000); d.probes = f.probes(); d.invalidResponses = invalid.length; d.transport = "controlled readiness response fixture";
  });
  await scenario("env-file-and-precedence", async (i, d) => {
    const f = await fixtureServer(i, (_req, res) => { res.writeHead(503); res.end(); });
    writeFileSync(join(i.runtime, ".env"), "AGENTMEMORY_READY_TIMEOUT_MS=350\nAGENTMEMORY_ENGINE_READY_TIMEOUT_MS=1000\n");
    d.fromFile = await expectFailure(i, [], {}, { budgetMs: 2500, message: "0.35s" });
    d.shellOverride = await expectFailure(i, [], { AGENTMEMORY_READY_TIMEOUT_MS: "150" }, { budgetMs: 2000, message: "0.15s" });
    assert(alive(f.worker.pid)); d.transport = "controlled unready external worker fixture";
  });
  await scenario("invalid-timeouts", async (i, d) => {
    d.rejected = [];
    for (const key of ["AGENTMEMORY_ENGINE_READY_TIMEOUT_MS", "AGENTMEMORY_READY_TIMEOUT_MS"]) {
      for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity", "500ms", "3600001"]) {
        const result = await expectFailure(i, ["--no-engine"], { [key]: value }, { budgetMs: 2500, message: key });
        d.rejected.push({ key, value, ...result });
        assert(!existsSync(join(i.runtime, "worker.pid")), "Invalid timeout imported the worker");
      }
    }
    const ownership = await expectFailure(i, ["--no-engine"], { AGENTMEMORY_ENGINE_MANAGES_WORKER: "yes" }, { budgetMs: 2500, message: "AGENTMEMORY_ENGINE_MANAGES_WORKER" });
    d.invalidOwnership = ownership;
    const help = await command(process.execPath, [cli, "--help"], i.env({ AGENTMEMORY_READY_TIMEOUT_MS: "invalid" }), i.dir);
    assert(help.includes("Usage:"));
  });
  await scenario("doctor", async (i, d) => {
    i.config({ delayMs: 2_000, earlyPid: true });
    writeFileSync(join(i.runtime, ".env"), "LLM_PROVIDER=none\nAGENTMEMORY_READY_TIMEOUT_MS=15000\n");
    const at = Date.now();
    const child = i.start(["doctor", "--all"], { EDITOR: "/usr/bin/true", PATH: [join(i.runtime, "bin"), i.env().PATH].join(delimiter) });
    await poll("doctor worker ready", () => child.text.includes("Engine and agentmemory worker ready"), 30_000);
    const result = await exited(child, 10_000); assert(result.code === 0 || result.code === 1, `Doctor crashed: ${child.text.slice(-1000)}`); d.doctorExitCode = result.code;
    await i.ready(10_000, false, true); assert(alive(i.pid("worker")), "Doctor-owned worker stopped when doctor exited"); d.readyMs = Date.now() - at; d.transport = "real native engine, configured delayed worker, installed doctor --all";
    assert(d.readyMs >= 2000); assert.equal(i.wrapperStarts().length, 1);
  });
  await scenario("doctor-invalid-timeout", async (i, d) => {
    await i.startEngine(i.config({ worker: false }));
    writeFileSync(join(i.runtime, ".env"), "LLM_PROVIDER=none\nAGENTMEMORY_READY_TIMEOUT_MS=invalid\n");
    Object.assign(d, await expectFailure(i, ["doctor", "--all"], { EDITOR: "/usr/bin/true", PATH: [join(i.runtime, "bin"), i.env().PATH].join(delimiter) }, { budgetMs: 10_000, message: "AGENTMEMORY_READY_TIMEOUT_MS" }));
    assert(alive(i.engine.pid), "Invalid doctor startup configuration stopped an existing engine");
    assert.equal(i.pid("iii"), i.engine.pid, "Invalid doctor configuration changed the external engine PID"); d.externalEnginePreserved = true;
  });
  await scenario("doctor-cli-worker", async (i, d) => {
    i.config({ worker: false });
    writeFileSync(join(i.runtime, ".env"), "LLM_PROVIDER=none\nAGENTMEMORY_READY_TIMEOUT_MS=15000\n");
    const child = i.start(["doctor", "--all"], { EDITOR: "/usr/bin/true", PATH: [join(i.runtime, "bin"), i.env().PATH].join(delimiter) });
    await poll("doctor detached worker ready", () => child.text.includes("Engine and agentmemory worker ready"), 30_000);
    const result = await exited(child, 10_000); assert(result.code === 0 || result.code === 1, `Doctor crashed: ${child.text.slice(-1000)}`);
    await i.ready(10_000, false, true); assert(alive(i.pid("worker")), "Doctor-owned worker stopped when doctor exited");
    assert.notEqual(i.pid("worker"), child.pid, "Doctor did not detach the CLI-owned worker");
    d.doctorExitCode = result.code; d.workerPid = i.pid("worker"); d.transport = "real native engine and installed detached worker created by doctor --all";
  });
  await scenario("hung-docker-start", async (i, d) => {
    const pidFile = dockerFixture(i, "start");
    Object.assign(d, await expectFailure(i, [], { AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "300" }, { budgetMs: 3000 }));
    const pid = Number(readFileSync(pidFile, "utf8")); i.ownedPids.add(pid); assert(!alive(pid), "Timed-out Docker start subprocess survived");
    assert(existsSync(join(i.runtime, "engine-state.json")), "Docker command timeout discarded owned lifecycle metadata");
    d.transport = "Docker command fixture whose start subprocess ignores SIGTERM; actual installed CLI";
  });
  await scenario("hung-docker-inspect", async (i, d) => {
    const pidFile = dockerFixture(i, "inspect");
    Object.assign(d, await expectFailure(i, [], { AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "300" }, { budgetMs: 8_000, message: "cannot be verified" }));
    const pid = Number(readFileSync(pidFile, "utf8")); i.ownedPids.add(pid); assert(!alive(pid), "Timed-out Docker inspect subprocess survived");
    assert(existsSync(join(i.runtime, "engine-state.json"))); d.transport = "Docker inspect subprocess fixture ignoring SIGTERM; actual installed CLI";
  });
  await scenario("docker", async (i, d) => {
    let dockerBin;
    try { dockerBin = execFileSync("which", ["docker"], { encoding: "utf8" }).trim(); } catch { d.skipped = "Docker executable unavailable"; return; }
    let host;
    try { host = process.env.DOCKER_HOST ?? execFileSync(dockerBin, ["context", "inspect", "--format", '{{(index .Endpoints "docker").Host}}'], { encoding: "utf8" }).trim(); } catch { d.skipped = "Docker context unavailable"; return; }
    i.dockerBin = dockerBin;
    i.envExtra = { AGENTMEMORY_USE_DOCKER: "1", DOCKER_HOST: host, DOCKER_CONFIG: process.env.DOCKER_CONFIG ?? join(homedir(), ".docker"), PATH: [dirname(dockerBin), i.env().PATH].join(delimiter) };
    try { d.serverVersion = (await command(dockerBin, ["info", "--format", "{{.ServerVersion}}"], i.env(), i.dir, 10_000)).trim(); } catch { d.skipped = "Docker daemon unavailable"; return; }
    let project;
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `agentmemory-${i.port}`;
      const filter = `label=com.docker.compose.project=${candidate}`;
      const existing = await Promise.all([
        command(dockerBin, ["ps", "-aq", "--filter", filter], i.env(), i.dir),
        command(dockerBin, ["network", "ls", "-q", "--filter", filter], i.env(), i.dir),
        command(dockerBin, ["volume", "ls", "-q", "--filter", filter], i.env(), i.dir),
      ]);
      if (existing.every((value) => !value.trim())) { project = candidate; break; }
      i.port = await portBlock();
    }
    assert(project, "Could not reserve an unused Docker project");
    i.dockerProject = project;
    const at = Date.now(); i.start([], { AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "30000", AGENTMEMORY_READY_TIMEOUT_MS: "15000" });
    await i.ready(90_000); d.freshReadyMs = Date.now() - at;
    const state = JSON.parse(readFileSync(join(i.runtime, "engine-state.json"), "utf8")); assert.equal(state.kind, "docker");
    const containerId = (await command(dockerBin, ["compose", "-p", i.dockerProject, "-f", join(pkg, "docker-compose.yml"), "ps", "-q", "iii-engine"], i.env(), i.dir)).trim(); assert(containerId);
    d.containerId = containerId;
    kill(i.cli.pid); await exited(i.cli, 3_000);
    await command(dockerBin, ["stop", "--time", "3", containerId], i.env(), i.dir, 15_000);
    const failedProxy = await delayedSocket(i, i.port + 46023, 10_000);
    d.stoppedRecoveryTimeout = await expectFailure(i, [], { III_ENGINE_URL: `ws://127.0.0.1:${failedProxy.port}`, AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "30000", AGENTMEMORY_READY_TIMEOUT_MS: "300" }, { budgetMs: 20_000, message: "0.3s" });
    const stopped = await command(dockerBin, ["inspect", "--format", "{{.State.Running}}", containerId], i.env(), i.dir); assert.equal(stopped.trim(), "false", "Failed recovery did not stop the container it restarted");
    assert.equal(JSON.parse(readFileSync(join(i.runtime, "engine-state.json"), "utf8")).containerId, containerId, "Failed Docker recovery lost lifecycle ownership");
    const proxy = await delayedSocket(i, i.port + 46023, 3_000);
    const restartAt = Date.now(); i.start([], { III_ENGINE_URL: `ws://127.0.0.1:${proxy.port}`, AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "30000", AGENTMEMORY_READY_TIMEOUT_MS: "15000" });
    await i.ready(30_000); d.recoveryReadyMs = Date.now() - restartAt;
    assert(d.recoveryReadyMs >= 3000); assert(proxy.accepted() > 0);
    const restored = JSON.parse(readFileSync(join(i.runtime, "engine-state.json"), "utf8")); assert.equal(restored.containerId, containerId);
    kill(i.cli.pid); await exited(i.cli, 3_000);
    const externalProxy = await delayedSocket(i, i.port + 46023, 10_000);
    d.runningEngineTimeout = await expectFailure(i, [], { III_ENGINE_URL: `ws://127.0.0.1:${externalProxy.port}`, AGENTMEMORY_READY_TIMEOUT_MS: "300" }, { budgetMs: 5_000, message: "0.3s" });
    const running = await command(dockerBin, ["inspect", "--format", "{{.State.Running}}", containerId], i.env(), i.dir); assert.equal(running.trim(), "true", "Failed attach stopped a preexisting running Docker engine");
    d.transport = "real Docker Compose pinned iii image; same owned container restarted; installed host worker over delayed TCP proxy";
  });
  await scenario("demo", async (i, d) => {
    i.config({ delayMs: 2_000, earlyPid: true }); const at = Date.now();
    const child = i.start(["demo", "--serve"], { AGENTMEMORY_READY_TIMEOUT_MS: "15000" });
    const result = await exited(child, 35_000); assert.equal(result.code, 0, child.text.slice(-1200)); assert(child.text.includes("demo complete"));
    d.completedMs = Date.now() - at; d.transport = "real native engine and installed demo command";
    assert(!(await fetch(i.url, { signal: AbortSignal.timeout(200) }).then(() => true).catch(() => false)), "Demo-owned engine survived teardown");
  });
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => {
  for (const i of instances) {
    for (const name of ["iii", "worker"]) kill(i.pid(name));
    for (const row of i.wrapperStarts()) kill(row.pid);
    for (const pid of i.ownedPids) kill(pid);
    if (i.dockerProject && !i.closed) {
      try { execFileSync(i.dockerBin, ["compose", "-p", i.dockerProject, "-f", join(pkg, "docker-compose.yml"), "down", "--volumes"], { env: i.env(), timeout: 30_000, stdio: "ignore" }); } catch {}
    }
  }
  for (const child of children) kill(child.pid);
  process.exit(130);
});
let fatal;
try { await main(); } catch (err) { fatal = err.stack; log(fatal); }
finally { for (const i of instances) await i.close(); for (const child of children) kill(child.pid); }
const unchanged = cliSha ? cliSha === sha(cli) && pkgSha === packageDigest() && artifactSha === sha(tarball) : false;
const summary = { ok: !fatal && unchanged && results.some((r) => r.status === "pass") && results.every((r) => r.status !== "fail"), version: installed?.version, enginePin: installed?.dependencies["iii-sdk"], tarball, tarballSha256: artifactSha, installedCliSha256: cliSha, installedPackageSha256: pkgSha, installedArtifactUnmodified: unchanged, node: process.version, platform: `${platform()}-${arch()}`, durationMs: Date.now() - started, root: options.keep ? root : undefined, scenarios: results, fatal };
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
log(`Summary: ${results.filter((r) => r.status === "pass").length}/${results.length} passed; ${join(out, "summary.json")}`);
if (!options.keep && !out.startsWith(`${root}/`)) rmSync(root, { recursive: true, force: true });
process.exit(summary.ok ? 0 : 1);
