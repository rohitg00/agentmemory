#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  appendFileSync,
  openSync,
  closeSync,
  statSync,
} from "node:fs";
import http from "node:http";
import net from "node:net";
import { homedir, tmpdir, platform, arch } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FORBIDDEN_PORTS = new Set([3111, 3112, 3113, 4098, 4131, 4132, 4133, 49134]);
const STATE_FLUSH_WAIT_MS = 5000;
const SCENARIOS = [
  ["install", "packed artifact installs and reports its identity"],
  ["capture", "bundled hooks capture and search finds every marker"],
  ["mcp", "installed MCP entrypoints list tools and save/search through the server"],
  ["offline", "hooks run while the service is down and the spool is recovered on restart"],
  ["dedup", "a replayed host event after a force kill stays one observation"],
  ["deadletter", "an accepted capture that fails processing survives a restart and is visible as a dead letter"],
  ["vectors", "vectors made before the first checkpoint survive a crash"],
  ["stopflush", "agentmemory stop then start loses nothing"],
  ["status", "viewer serves and /agentmemory/status explains every problem"],
  ["roundtrip", "export then import into a fresh home round-trips"],
];

function parseArgs(argv) {
  const opts = { out: null, keep: false, skipBuild: false, tarball: null, mcpTarball: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--out") opts.out = resolve(next());
    else if (a === "--keep") opts.keep = true;
    else if (a === "--skip-build") opts.skipBuild = true;
    else if (a === "--tarball") opts.tarball = resolve(next());
    else if (a === "--mcp-tarball") opts.mcpTarball = resolve(next());
    else if (a === "--only") opts.only = new Set(next().split(","));
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: npm run release:gate -- [--tarball file.tgz] [--mcp-tarball file.tgz] [--skip-build] [--only a,b] [--out dir] [--keep]\n" +
          `Scenarios: ${SCENARIOS.map((s) => s[0]).join(", ")}`,
      );
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const startedAt = Date.now();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = opts.out ?? join(tmpdir(), `agentmemory-release-gate-${stamp}`);
mkdirSync(OUT, { recursive: true });
const ROOT = mkdtempSync(join(tmpdir(), "amgate-"));
const LOG = join(OUT, "gate.log");
const CACHE = process.env["AGENTMEMORY_GATE_CACHE"] || join(homedir(), ".cache", "agentmemory-release-gate");
const NODE_BIN = dirname(process.execPath);

const ownedGroups = new Set();
const ownedChildren = new Set();
let cleanedUp = false;

function log(msg) {
  const line = `[${((Date.now() - startedAt) / 1000).toFixed(1).padStart(6)}s] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroup(pid, signal = "SIGKILL") {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {}
  try {
    process.kill(pid, signal);
  } catch {}
}

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const child of ownedChildren) {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
  for (const pid of ownedGroups) killGroup(pid);
  if (!opts.keep) {
    try {
      rmSync(ROOT, { recursive: true, force: true });
    } catch {}
  }
}

process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

function run(cmd, args, { env = process.env, cwd = REPO, input, timeoutMs = 60_000, logFile } = {}) {
  return new Promise((resolvePromise) => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { env, cwd, stdio: ["pipe", "pipe", "pipe"], detached: true });
    ownedChildren.add(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);
    child.on("error", (err) => {
      stderr += String(err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      ownedChildren.delete(child);
      const result = { code, signal, stdout, stderr, ms: Date.now() - t0, timedOut };
      if (logFile) appendFileSync(logFile, `$ ${cmd} ${args.join(" ")}\n${stdout}${stderr}\n[exit ${code ?? signal} in ${result.ms} ms]\n`);
      resolvePromise(result);
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function mustRun(label, cmd, args, options) {
  const r = await run(cmd, args, options);
  if (r.code !== 0) {
    throw new Error(`${label} failed (exit ${r.code ?? r.signal}${r.timedOut ? ", timed out" : ""}): ${(r.stderr || r.stdout).slice(-1500)}`);
  }
  return r;
}

const instanceHomes = new Map();

function secretFor(url) {
  for (const [base, home] of instanceHomes) {
    if (!url.startsWith(base)) continue;
    try {
      return readFileSync(join(home, ".agentmemory", "secret"), "utf8").trim();
    } catch {
      return "";
    }
  }
  return "";
}

async function request(method, url, body, timeoutMs = 30_000) {
  const headers = body === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" };
  const secret = secretFor(url);
  if (secret) headers.authorization = `Bearer ${secret}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

async function poll(label, fn, { timeoutMs = 30_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
      last = "condition not met";
    } catch (err) {
      if (err && err.fatal) throw err;
      last = err instanceof Error ? err.message : String(err);
    }
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label} (last: ${String(last).slice(0, 400)})`);
    await sleep(intervalMs);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function portFree(port) {
  return new Promise((resolvePromise) => {
    const srv = net.createServer();
    srv.once("error", () => resolvePromise(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolvePromise(true)));
  });
}

function portOpen(port) {
  return new Promise((resolvePromise) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.setTimeout(1000);
    sock.once("connect", () => {
      sock.destroy();
      resolvePromise(true);
    });
    sock.once("error", () => resolvePromise(false));
    sock.once("timeout", () => {
      sock.destroy();
      resolvePromise(false);
    });
  });
}

const reservedBases = new Set();
function instancePorts(base) {
  return [base, base + 1, base + 2, base + 3, base + 6353, base + 46023];
}

async function pickBasePort() {
  for (let i = 0; i < 200; i++) {
    const base = 12000 + Math.floor(Math.random() * 7000);
    if ([...reservedBases].some((b) => Math.abs(b - base) < 10)) continue;
    const ports = instancePorts(base);
    if (ports.some((p) => FORBIDDEN_PORTS.has(p))) continue;
    let ok = true;
    for (const p of ports) {
      if (!(await portFree(p))) {
        ok = false;
        break;
      }
    }
    if (ok) {
      reservedBases.add(base);
      return base;
    }
  }
  throw new Error("no free port block found");
}

function vectorFor(text, dims) {
  const out = new Array(dims);
  let seed = createHash("sha256").update(String(text)).digest();
  for (let i = 0; i < dims; i++) {
    if (i % 32 === 0 && i > 0) seed = createHash("sha256").update(seed).digest();
    out[i] = (seed[i % 32] - 128) / 128;
  }
  return out;
}

function startFakeEmbeddings(dims) {
  const stats = { calls: 0, inputs: 0, chatCalls: 0 };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch {}
      if (req.url && req.url.endsWith("/embeddings")) {
        const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
        stats.calls++;
        stats.inputs += inputs.length;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            object: "list",
            data: inputs.map((t, index) => ({ object: "embedding", index, embedding: vectorFor(t, dims) })),
            model: payload.model || "release-gate-fake",
            usage: { prompt_tokens: inputs.length, total_tokens: inputs.length },
          }),
        );
        return;
      }
      stats.chatCalls++;
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "release gate fake provider serves embeddings only" } }));
    });
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise({ server, stats, port: server.address().port }));
  });
}

function marker(tag) {
  return `gate${tag}${randomBytes(4).toString("hex")}`.toLowerCase();
}

function cleanPath(prefix) {
  return [join(prefix, "node_modules", ".bin"), NODE_BIN, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");
}

class Gate {
  constructor() {
    this.prefix = join(ROOT, "prefix");
    this.pkgDir = join(this.prefix, "node_modules", "@agentmemory", "agentmemory");
    this.fake = null;
    this.dims = 1536;
    this.instances = [];
    this.info = {};
  }

  bin(name) {
    return join(this.prefix, "node_modules", ".bin", name);
  }

  baseEnv(home) {
    const env = {
      PATH: cleanPath(this.prefix),
      HOME: home,
      TMPDIR: process.env["TMPDIR"] || tmpdir(),
      LANG: "C.UTF-8",
      CI: "1",
      NO_COLOR: "1",
    };
    return env;
  }

  hookCommands(event, toolName) {
    const hooksFile = join(this.pkgDir, "plugin", "hooks", "hooks.json");
    const config = JSON.parse(readFileSync(hooksFile, "utf-8"));
    const entries = config.hooks?.[event] ?? [];
    const commands = [];
    for (const entry of entries) {
      if (entry.matcher && toolName && !new RegExp(`^(?:${entry.matcher})$`).test(toolName)) continue;
      if (entry.matcher && !toolName) continue;
      for (const h of entry.hooks ?? []) if (h.type === "command") commands.push(h.command);
    }
    return commands;
  }
}

const gate = new Gate();

class Instance {
  constructor(name) {
    this.name = name;
    this.dir = join(ROOT, name);
    this.home = join(this.dir, "home");
    this.cwd = join(this.dir, "cwd");
    this.project = join(this.dir, "projects", "gate-app");
    for (const d of [this.home, this.cwd, this.project]) mkdirSync(d, { recursive: true });
    this.logFile = join(OUT, `instance-${name}.log`);
    this.hookLog = join(OUT, `hooks-${name}.log`);
    this.port = 0;
    this.cli = null;
    this.cliExit = null;
    this.enginePid = null;
    this.extraEnv = {};
  }

  get base() {
    return `http://127.0.0.1:${this.port}/agentmemory`;
  }

  env(extra = {}) {
    return {
      ...gate.baseEnv(this.home),
      OPENAI_API_KEY: "release-gate-fake-key",
      OPENAI_API_KEY_FOR_LLM: "false",
      OPENAI_BASE_URL: `http://127.0.0.1:${gate.fake.port}`,
      OPENAI_EMBEDDING_DIMENSIONS: String(gate.dims),
      AGENTMEMORY_URL: `http://127.0.0.1:${this.port}`,
      ...extra,
    };
  }

  enginePidPath() {
    return join(this.home, ".agentmemory", "iii.pid");
  }

  seedEngine() {
    const version = gate.info.enginePin;
    const cached = join(CACHE, `iii-${version}-${platform()}-${arch()}`);
    const target = join(this.home, ".agentmemory", "bin", "iii");
    if (existsSync(cached) && !existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(cached, target);
      chmodSync(target, 0o755);
    }
  }

  cacheEngine() {
    const version = gate.info.enginePin;
    const source = join(this.home, ".agentmemory", "bin", "iii");
    const cached = join(CACHE, `iii-${version}-${platform()}-${arch()}`);
    if (existsSync(source) && !existsSync(cached)) {
      try {
        mkdirSync(CACHE, { recursive: true });
        copyFileSync(source, cached);
        chmodSync(cached, 0o755);
      } catch {}
    }
  }

  async start(extraEnv = {}) {
    if (!this.port) this.port = await pickBasePort();
    instanceHomes.set(`http://127.0.0.1:${this.port}/`, this.home);
    this.extraEnv = extraEnv;
    this.seedEngine();
    for (const p of instancePorts(this.port)) {
      await poll(`port ${p} to be free`, async () => !(await portOpen(p)), { timeoutMs: 30_000 });
    }
    const fd = openSync(this.logFile, "a");
    appendFileSync(this.logFile, `\n==== start ${new Date().toISOString()} env=${JSON.stringify(extraEnv)}\n`);
    const t0 = Date.now();
    const child = spawn(gate.bin("agentmemory"), ["--port", String(this.port)], {
      cwd: this.cwd,
      env: this.env(extraEnv),
      stdio: ["ignore", fd, fd],
      detached: true,
    });
    closeSync(fd);
    this.cli = child;
    this.cliExit = null;
    ownedGroups.add(child.pid);
    child.on("exit", (code, signal) => {
      this.cliExit = { code, signal };
    });
    await poll(
      `${this.name} to answer /livez`,
      async () => {
        if (this.cliExit) {
          const err = new Error(`agentmemory exited (${this.cliExit.code ?? this.cliExit.signal}) before it was ready; see ${this.logFile}`);
          err.fatal = true;
          throw err;
        }
        const r = await request("GET", `${this.base}/livez`, undefined, 2000);
        return r.status === 200;
      },
      { timeoutMs: 420_000, intervalMs: 300 },
    );
    await poll(`${this.name} health`, async () => (await request("GET", `${this.base}/health`, undefined, 5000)).status === 200, { timeoutMs: 60_000 });
    this.enginePid = parseInt(readFileSync(this.enginePidPath(), "utf-8").trim(), 10) || null;
    if (this.enginePid) ownedGroups.add(this.enginePid);
    this.cacheEngine();
    const ms = Date.now() - t0;
    log(`${this.name}: up on :${this.port} in ${ms} ms (worker pid ${child.pid}, engine pid ${this.enginePid})`);
    return ms;
  }

  async waitDown() {
    await poll(`${this.name} worker to exit`, async () => this.cliExit !== null || !alive(this.cli.pid), { timeoutMs: 30_000 });
    if (this.enginePid) await poll(`${this.name} engine to exit`, async () => !alive(this.enginePid), { timeoutMs: 30_000 });
    for (const p of [this.port, this.port + 46023]) {
      await poll(`port ${p} to close`, async () => !(await portOpen(p)), { timeoutMs: 30_000 });
    }
  }

  async forceKill() {
    killGroup(this.enginePid);
    killGroup(this.cli?.pid);
    await this.waitDown();
    log(`${this.name}: force killed`);
  }

  async stop() {
    const t0 = Date.now();
    const r = await run(gate.bin("agentmemory"), ["stop", "--port", String(this.port)], {
      env: this.env(this.extraEnv),
      cwd: this.cwd,
      timeoutMs: 90_000,
      logFile: this.logFile,
    });
    if (r.code !== 0) throw new Error(`agentmemory stop exited ${r.code ?? r.signal}: ${(r.stdout + r.stderr).slice(-800)}`);
    await this.waitDown();
    log(`${this.name}: stopped cleanly in ${Date.now() - t0} ms`);
    return Date.now() - t0;
  }

  async shutdown() {
    if (!this.cli || this.cliExit) return;
    try {
      await this.stop();
    } catch (err) {
      log(`${this.name}: clean stop failed (${err.message}); killing`);
      await this.forceKill().catch(() => {});
    }
  }

  async hook(event, payload) {
    const commands = gate.hookCommands(event, payload.tool_name);
    assert(commands.length > 0, `no bundled ${event} hook matches ${payload.tool_name ?? "this event"}`);
    const results = [];
    for (const command of commands) {
      const r = await run("sh", ["-c", command], {
        env: {
          ...gate.baseEnv(this.home),
          CLAUDE_PLUGIN_ROOT: join(gate.pkgDir, "plugin"),
          CLAUDE_PROJECT_DIR: this.project,
          AGENTMEMORY_URL: `http://127.0.0.1:${this.port}`,
        },
        cwd: this.project,
        input: JSON.stringify({ hook_event_name: event, cwd: this.project, transcript_path: join(this.dir, "transcript.jsonl"), ...payload }),
        timeoutMs: 20_000,
        logFile: this.hookLog,
      });
      assert(r.code === 0, `${event} hook exited ${r.code ?? r.signal}${r.timedOut ? " (timed out)" : ""}: ${r.stderr.slice(-400)}`);
      results.push(r);
    }
    return { ms: results.reduce((a, r) => a + r.ms, 0) };
  }

  toolEvent(sessionId, mark, extra = {}) {
    return {
      session_id: sessionId,
      tool_name: "Bash",
      tool_input: { command: `npm test -- ${mark}` },
      tool_response: { stdout: `ran suite ${mark}: 12 passed`, stderr: "", interrupted: false },
      tool_use_id: `toolu_${randomBytes(8).toString("hex")}`,
      ...extra,
    };
  }

  async observations(sessionId) {
    const r = await request("GET", `${this.base}/observations?sessionId=${encodeURIComponent(sessionId)}`);
    assert(r.status === 200, `GET /observations returned ${r.status}`);
    return r.json.observations ?? [];
  }

  async countMarker(sessionId, mark) {
    const list = await this.observations(sessionId);
    return list.filter((o) => JSON.stringify(o).includes(mark)).length;
  }

  async searchFinds(mark) {
    const r = await request("POST", `${this.base}/search`, { query: mark, limit: 10 });
    return r.status === 200 && r.text.includes(mark);
  }

  async status() {
    const r = await request("GET", `${this.base}/status`, undefined, 30_000);
    assert(r.status === 200, `GET /status returned ${r.status}`);
    return r.json;
  }

  async capture(query = "") {
    const r = await request("GET", `${this.base}/capture${query}`);
    assert(r.status === 200, `GET /capture returned ${r.status}`);
    return r.json;
  }

  async totals() {
    const sessions = (await request("GET", `${this.base}/sessions`)).json?.sessions ?? [];
    let observations = 0;
    for (const s of sessions) observations += (await this.observations(s.id)).length;
    const memories = ((await request("GET", `${this.base}/memories`)).json?.memories ?? []).length;
    const st = await this.status();
    return {
      sessions: sessions.length,
      observations,
      memories,
      bm25Documents: st.index?.bm25Documents ?? null,
      vectorDocuments: st.index?.vectorDocuments ?? null,
    };
  }
}

async function mcpSession(command, args, env) {
  const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"], detached: true });
  ownedChildren.add(child);
  ownedGroups.add(child.pid);
  let buf = "";
  let stderr = "";
  const pending = new Map();
  child.stderr.on("data", (d) => (stderr += d));
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  let nextId = 1;
  const rpc = (method, params) => {
    const id = nextId++;
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out; stderr: ${stderr.slice(-400)}`)), 30_000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolvePromise(msg);
      });
    });
  };
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "release-gate", version: "1" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const close = () => {
    try {
      child.kill("SIGTERM");
    } catch {}
    ownedChildren.delete(child);
  };
  const call = async (name, argsObj) => {
    const r = await rpc("tools/call", { name, arguments: argsObj });
    const text = (r.result?.content ?? []).map((c) => c.text ?? "").join("\n");
    return { isError: Boolean(r.error || r.result?.isError), text, error: r.error };
  };
  return { init, rpc, call, close, stderr: () => stderr };
}

const results = [];

async function scenario(name, fn) {
  const meta = SCENARIOS.find((s) => s[0] === name);
  if (opts.only && name !== "install" && !opts.only.has(name)) {
    results.push({ name, title: meta[1], status: "skipped" });
    return;
  }
  log(`---- ${name}: ${meta[1]}`);
  const t0 = Date.now();
  const details = {};
  try {
    await fn(details);
    const ms = Date.now() - t0;
    results.push({ name, title: meta[1], status: "pass", ms, details });
    log(`PASS ${name} (${ms} ms)`);
  } catch (err) {
    const ms = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, title: meta[1], status: "fail", ms, error: message, details });
    log(`FAIL ${name} (${ms} ms): ${message}`);
  }
}

async function ensureUp(inst, extraEnv = {}) {
  if (inst.cli && !inst.cliExit && (await request("GET", `${inst.base}/livez`, undefined, 2000).then((r) => r.status === 200).catch(() => false))) return;
  if (inst.cli && !inst.cliExit) await inst.forceKill().catch(() => {});
  await inst.start(extraEnv);
}

async function buildAndPack() {
  const packDir = join(ROOT, "pack");
  mkdirSync(packDir, { recursive: true });
  let tarball = opts.tarball;
  let mcpTarball = opts.mcpTarball;
  if (!tarball) {
    if (!opts.skipBuild) {
      log("building (npm run build)");
      await mustRun("npm run build", "npm", ["run", "build"], { timeoutMs: 600_000, logFile: join(OUT, "build.log") });
    }
    log("packing @agentmemory/agentmemory");
    const r = await mustRun("npm pack", "npm", ["pack", "--json", "--pack-destination", packDir], { timeoutMs: 300_000 });
    tarball = join(packDir, JSON.parse(r.stdout)[0].filename);
  }
  if (!mcpTarball) {
    const r = await mustRun("npm pack (mcp)", "npm", ["pack", "--json", "--pack-destination", packDir], { cwd: join(REPO, "packages", "mcp"), timeoutMs: 120_000 });
    mcpTarball = join(packDir, JSON.parse(r.stdout)[0].filename);
  }
  return { tarball, mcpTarball };
}

async function install(details) {
  const { tarball, mcpTarball } = await buildAndPack();
  const sha = createHash("sha256").update(readFileSync(tarball)).digest("hex");
  details.tarball = tarball;
  details.tarballSha256 = sha;
  details.tarballBytes = statSync(tarball).size;
  mkdirSync(gate.prefix, { recursive: true });
  writeFileSync(join(gate.prefix, "package.json"), JSON.stringify({ name: "agentmemory-release-gate-prefix", private: true }) + "\n");
  const npmCache = execFileSync("npm", ["config", "get", "cache"], { encoding: "utf-8" }).trim();
  const installHome = join(ROOT, "install-home");
  mkdirSync(installHome, { recursive: true });
  log(`installing ${tarball} into a clean prefix`);
  const t0 = Date.now();
  await mustRun(
    "npm install of the packed tarballs",
    "npm",
    ["install", "--no-audit", "--no-fund", "--no-package-lock", tarball, mcpTarball],
    {
      cwd: gate.prefix,
      env: { ...gate.baseEnv(installHome), PATH: [NODE_BIN, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"), npm_config_cache: npmCache },
      timeoutMs: 600_000,
      logFile: join(OUT, "install.log"),
    },
  );
  details.installMs = Date.now() - t0;
  const ls = await run("npm", ["ls", "--all", "--json"], { cwd: gate.prefix, env: { ...gate.baseEnv(installHome), npm_config_cache: npmCache }, timeoutMs: 120_000 });
  writeFileSync(join(OUT, "resolved-dependencies.json"), ls.stdout);

  const repoPkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf-8"));
  const installed = JSON.parse(readFileSync(join(gate.pkgDir, "package.json"), "utf-8"));
  assert(installed.name === "@agentmemory/agentmemory", `installed package name is ${installed.name}`);
  details.version = installed.version;
  if (!opts.tarball) assert(installed.version === repoPkg.version, `installed version ${installed.version} != repo ${repoPkg.version}`);
  gate.info.enginePin = installed.dependencies["iii-sdk"];
  gate.info.version = installed.version;
  details.enginePin = gate.info.enginePin;
  const cliPath = execFileSync("sh", ["-c", "command -v agentmemory"], { env: { PATH: cleanPath(gate.prefix) }, encoding: "utf-8" }).trim();
  assert(cliPath === gate.bin("agentmemory"), `agentmemory on PATH resolves to ${cliPath}, not the installed prefix`);
  const v = await mustRun("agentmemory --version", gate.bin("agentmemory"), ["--version"], { env: gate.baseEnv(installHome), cwd: installHome });
  assert(v.stdout.trim() === installed.version, `agentmemory --version printed ${v.stdout.trim()}, expected ${installed.version}`);
  for (const f of ["dist/cli.mjs", "dist/standalone.mjs", "dist/index.mjs", "dist/viewer/index.html", "plugin/hooks/hooks.json", "plugin/scripts/post-tool-use.mjs", "plugin/scripts/_capture.mjs", "iii-config.yaml"]) {
    assert(existsSync(join(gate.pkgDir, f)), `packed artifact is missing ${f}`);
  }
  assert(existsSync(gate.bin("agentmemory-mcp")), "agentmemory-mcp bin is missing from the MCP shim package");

  const a = instA;
  details.firstBootMs = await a.start();
  const st = await a.status();
  details.reportedVersion = st.service?.version;
  details.reportedEngine = st.service?.engineVersion;
  assert(st.service?.version === installed.version, `/status reports version ${st.service?.version}, expected ${installed.version}`);
  assert(String(st.service?.engineVersion ?? "").includes(gate.info.enginePin), `/status reports engine ${st.service?.engineVersion}, expected the pinned ${gate.info.enginePin}`);
  assert(st.provider?.embeddings && st.provider.embeddings !== "none", `embedding provider is ${st.provider?.embeddings}`);
  details.embeddings = st.provider?.embeddings;
}

const instA = new Instance("main");
const instB = new Instance("vectors");
const instC = new Instance("restore");
const markers = {};

async function main() {
  log(`release gate output: ${OUT}`);
  log(`temp root: ${ROOT}`);
  gate.fake = await startFakeEmbeddings(gate.dims);
  log(`fake embedding provider on :${gate.fake.port}`);

  await scenario("install", install);
  if (!results[0] || results[0].status !== "pass") {
    for (const [name, title] of SCENARIOS.slice(1)) results.push({ name, title, status: "fail", error: "install failed" });
    return;
  }

  await scenario("capture", async (d) => {
    await ensureUp(instA);
    const sid = `gate-capture-${randomBytes(4).toString("hex")}`;
    markers.capture = [marker("amber"), marker("birch"), marker("cedar")];
    markers.prompt = marker("prompt");
    d.sessionId = sid;
    const timings = [];
    timings.push((await instA.hook("SessionStart", { session_id: sid, source: "startup" })).ms);
    timings.push((await instA.hook("UserPromptSubmit", { session_id: sid, prompt: `Investigate the flaky parser test ${markers.prompt}` })).ms);
    for (const m of markers.capture) timings.push((await instA.hook("PostToolUse", instA.toolEvent(sid, m))).ms);
    timings.push((await instA.hook("Stop", { session_id: sid, stop_hook_active: false })).ms);
    d.hookMs = timings;
    for (const m of markers.capture) {
      await poll(`search to find ${m}`, () => instA.searchFinds(m), { timeoutMs: 20_000 });
      const n = await instA.countMarker(sid, m);
      assert(n === 1, `marker ${m} is stored in ${n} observations, expected 1`);
    }
    const all = JSON.stringify(await instA.observations(sid));
    assert(all.includes(markers.prompt), "the prompt marker is not in any stored observation");
    d.observations = (await instA.observations(sid)).length;
  });

  await scenario("mcp", async (d) => {
    await ensureUp(instA);
    const env = { ...gate.baseEnv(instA.home), AGENTMEMORY_URL: `http://127.0.0.1:${instA.port}` };
    const shim = await mcpSession(gate.bin("agentmemory-mcp"), [], env);
    try {
      const tools = await shim.rpc("tools/list", {});
      const names = (tools.result?.tools ?? []).map((t) => t.name);
      d.shimTools = names.length;
      for (const t of ["memory_save", "memory_smart_search"]) assert(names.includes(t), `agentmemory-mcp does not list ${t}`);
      assert(!shim.stderr().includes("LOCAL FALLBACK"), "agentmemory-mcp fell back to local mode instead of using the server");
      const m = marker("mcp");
      markers.mcp = m;
      const saved = await shim.call("memory_save", { content: `Release gate MCP fact ${m}: the parser handles CRLF line endings`, type: "fact" });
      assert(!saved.isError, `memory_save failed: ${saved.text || JSON.stringify(saved.error)}`);
      await poll(`memory_smart_search to find ${m}`, async () => {
        const r = await shim.call("memory_smart_search", { query: m, limit: 5 });
        return !r.isError && r.text.includes(m);
      }, { timeoutMs: 20_000, intervalMs: 500 });
      const mem = await request("GET", `${instA.base}/memories`);
      assert(mem.text.includes(m), "the memory saved over MCP is not on the server");
    } finally {
      shim.close();
    }
    const cli = await mcpSession(gate.bin("agentmemory"), ["mcp"], env);
    try {
      const tools = await cli.rpc("tools/list", {});
      d.cliTools = (tools.result?.tools ?? []).length;
      assert(d.cliTools === d.shimTools, `agentmemory mcp lists ${d.cliTools} tools, the shim lists ${d.shimTools}`);
    } finally {
      cli.close();
    }
  });

  await scenario("offline", async (d) => {
    await ensureUp(instA);
    await instA.stop();
    const sid = `gate-offline-${randomBytes(4).toString("hex")}`;
    markers.offline = [marker("cobalt"), marker("indigo"), marker("violet")];
    const hookMs = [];
    for (const m of markers.offline) hookMs.push((await instA.hook("PostToolUse", instA.toolEvent(sid, m))).ms);
    d.hookMs = hookMs;
    assert(Math.max(...hookMs) < 5000, `a hook took ${Math.max(...hookMs)} ms while the service was down`);
    const cap = await mustRun("agentmemory capture --json", gate.bin("agentmemory"), ["capture", "--json"], { env: instA.env(), cwd: instA.cwd, timeoutMs: 30_000 });
    const spool = JSON.parse(cap.stdout.slice(cap.stdout.indexOf("{"))).spool;
    d.spooledWhileDown = spool.records;
    assert(spool.records >= markers.offline.length, `spool holds ${spool.records} records, expected ${markers.offline.length}`);
    d.restartMs = await instA.start();
    for (const m of markers.offline) {
      await poll(`recovered observation ${m}`, async () => (await instA.countMarker(sid, m)) >= 1, { timeoutMs: 30_000 });
      await poll(`search to find ${m}`, () => instA.searchFinds(m), { timeoutMs: 20_000 });
    }
    for (const m of markers.offline) {
      const n = await instA.countMarker(sid, m);
      assert(n === 1, `offline marker ${m} is stored ${n} times, expected 1`);
    }
    const after = await instA.capture();
    const left = (after.capture?.spool ?? []).reduce((a, s) => a + s.records, 0);
    d.spoolAfterRestart = left;
    assert(left === 0, `${left} records are still in the spool after restart`);
  });

  await scenario("dedup", async (d) => {
    await ensureUp(instA);
    const sid = `gate-dedup-${randomBytes(4).toString("hex")}`;
    const m = marker("garnet");
    const event = instA.toolEvent(sid, m);
    await instA.hook("PostToolUse", event);
    await poll(`first delivery of ${m}`, async () => (await instA.countMarker(sid, m)) === 1, { timeoutMs: 20_000 });
    await sleep(STATE_FLUSH_WAIT_MS);
    await instA.forceKill();
    d.restartMs = await instA.start();
    const before = (await instA.capture()).capture?.sinceStart?.duplicates ?? 0;
    await instA.hook("PostToolUse", event);
    await instA.hook("PostToolUse", event);
    const dup = await poll("replays to be answered as duplicates", async () => {
      const n = (await instA.capture()).capture?.sinceStart?.duplicates ?? 0;
      return n - before >= 2 ? n - before : 0;
    }, { timeoutMs: 20_000 });
    d.duplicatesAnswered = dup;
    assert((await instA.countMarker(sid, m)) === 1, `replayed event is stored ${await instA.countMarker(sid, m)} times, expected 1`);
    await instA.hook("PostToolUse", { ...event, tool_use_id: `toolu_${randomBytes(8).toString("hex")}` });
    await poll("a distinct event with identical content to be stored", async () => (await instA.countMarker(sid, m)) === 2, { timeoutMs: 20_000 });
  });

  await scenario("deadletter", async (d) => {
    await ensureUp(instA);
    await instA.stop();
    await instA.start({ MAX_OBS_PER_SESSION: "2" });
    const sid = `gate-dead-${randomBytes(4).toString("hex")}`;
    const ms = [marker("onyx"), marker("opal"), marker("quartz")];
    for (const m of ms) await instA.hook("PostToolUse", instA.toolEvent(sid, m));
    const dead = await poll("a dead letter for the failed capture", async () => {
      const c = await instA.capture("?status=dead");
      return (c.items ?? []).find((it) => String(it.preview ?? "").includes(ms[2]) && it.sessionId === sid);
    }, { timeoutMs: 20_000 });
    d.deadLetterError = dead.lastError;
    assert((await instA.countMarker(sid, ms[2])) === 0, "the failed capture was stored anyway");
    const st = await instA.status();
    assert((st.problems ?? []).some((p) => p.code === "capture-dead-letters" && p.fix), "/status does not report the dead letter with a fix");
    await sleep(STATE_FLUSH_WAIT_MS);
    await instA.forceKill();
    await instA.start({});
    const still = await instA.capture("?status=dead");
    assert((still.items ?? []).some((it) => it.eventId === dead.eventId), "the dead letter did not survive the restart");
    const retry = await request("POST", `${instA.base}/capture/retry`, { eventId: dead.eventId });
    assert(retry.status === 200, `POST /capture/retry returned ${retry.status}`);
    d.retry = retry.json;
    assert(retry.json?.recovered === 1, `retry recovered ${retry.json?.recovered}, expected 1`);
    await poll(`recovered capture ${ms[2]}`, async () => (await instA.countMarker(sid, ms[2])) === 1, { timeoutMs: 20_000 });
    await poll(`search to find ${ms[2]}`, () => instA.searchFinds(ms[2]), { timeoutMs: 20_000 });
    const after = await instA.capture();
    assert((after.capture?.inbox?.dead ?? 0) === 0, `${after.capture?.inbox?.dead} dead letters remain`);
    const obs = await instA.observations(sid);
    assert(obs.some((o) => o.id === dead.observationId), "the recovered observation does not keep the id assigned at acceptance");
  });

  await scenario("vectors", async (d) => {
    await ensureUp(instB);
    const sid = `gate-vectors-${randomBytes(4).toString("hex")}`;
    const count = 20;
    for (let i = 0; i < count; i++) await instB.hook("PostToolUse", instB.toolEvent(sid, marker(`vec${i}x`)));
    const t0 = Date.now();
    const st = await poll("the first vector checkpoint", async () => {
      const s = await instB.status();
      const p = s.indexPersistence;
      const durable = p && !p.saving && (p.pendingChanges === 0 || (p.pendingLog ?? 0) >= p.pendingChanges);
      return (s.index?.vectorDocuments ?? 0) >= count && p?.vector?.lastSavedAt && !p.firstCheckpointPending && durable ? s : null;
    }, { timeoutMs: 60_000, intervalMs: 500 });
    d.firstCheckpointWaitMs = Date.now() - t0;
    d.saveIntervalMs = st.indexPersistence.saveIntervalMs;
    const vectorsBefore = st.index.vectorDocuments;
    d.vectorsBefore = vectorsBefore;
    assert(d.saveIntervalMs > d.firstCheckpointWaitMs, "the checkpoint only happened at the regular save interval, so the first-checkpoint boundary was not exercised");
    await sleep(STATE_FLUSH_WAIT_MS);
    const embedBefore = gate.fake.stats.inputs;
    await instB.forceKill();
    d.restartMs = await instB.start();
    const after = await poll("vector index to load", async () => {
      const s = await instB.status();
      return typeof s.index?.vectorDocuments === "number" && s.index.vectorDocuments > 0 ? s : null;
    }, { timeoutMs: 30_000 });
    d.vectorsAfter = after.index.vectorDocuments;
    d.pendingVectorBackfill = after.index.pendingVectorBackfill;
    d.embeddingsAfterRestart = gate.fake.stats.inputs - embedBefore;
    assert(d.vectorsAfter === vectorsBefore, `${d.vectorsAfter} vectors after the crash, expected ${vectorsBefore}`);
    assert(d.pendingVectorBackfill === 0, `${d.pendingVectorBackfill} documents wait for vector backfill after the crash`);
    assert(d.embeddingsAfterRestart === 0, `the restart re-embedded ${d.embeddingsAfterRestart} inputs instead of loading saved vectors`);
    await instB.stop();
  });

  await scenario("stopflush", async (d) => {
    await ensureUp(instA);
    const sid = `gate-stop-${randomBytes(4).toString("hex")}`;
    const m = marker("ember");
    await instA.hook("PostToolUse", instA.toolEvent(sid, m));
    await poll(`search to find ${m}`, () => instA.searchFinds(m), { timeoutMs: 20_000 });
    const before = await instA.totals();
    d.before = before;
    d.stopMs = await instA.stop();
    d.restartMs = await instA.start();
    const after = await poll("indexes to match the pre-stop totals", async () => {
      const t = await instA.totals();
      return t.bm25Documents >= before.bm25Documents && t.vectorDocuments >= before.vectorDocuments ? t : null;
    }, { timeoutMs: 30_000, intervalMs: 500 });
    d.after = after;
    for (const k of Object.keys(before)) assert(after[k] === before[k], `${k} was ${before[k]} before stop and ${after[k]} after start`);
    assert((await instA.countMarker(sid, m)) === 1, "the observation captured right before stop is missing");
    assert(await instA.searchFinds(m), "search lost the marker captured right before stop");
  });

  await scenario("status", async (d) => {
    await ensureUp(instA);
    const viewer = await request("GET", `http://127.0.0.1:${instA.port + 2}/`, undefined, 10_000);
    assert(viewer.status === 200 && /<html/i.test(viewer.text), `viewer returned ${viewer.status}`);
    d.viewerBytes = viewer.text.length;
    const st = await instA.status();
    d.status = st.status;
    d.problems = (st.problems ?? []).map((p) => ({ level: p.level, code: p.code, message: p.message }));
    const errors = (st.problems ?? []).filter((p) => p.level === "error");
    assert(errors.length === 0, `status reports errors: ${errors.map((p) => `${p.code}: ${p.message}`).join("; ")}`);
    const unexplained = (st.problems ?? []).filter((p) => !p.message || !p.fix);
    assert(unexplained.length === 0, `problems without a message and a fix: ${unexplained.map((p) => p.code).join(", ")}`);
    assert(["ok", "info", "warn"].includes(st.status), `status level is ${st.status}`);
    const html = await request("GET", `${instA.base}/status?format=html`, undefined, 10_000).catch(() => null);
    d.statusHtml = html?.status ?? null;
  });

  await scenario("roundtrip", async (d) => {
    await ensureUp(instA);
    const exp = await request("GET", `${instA.base}/export`, undefined, 60_000);
    assert(exp.status === 200 && exp.json, `GET /export returned ${exp.status}`);
    writeFileSync(join(ROOT, "export.json"), exp.text);
    d.exportBytes = exp.text.length;
    const source = await instA.totals();
    d.source = source;
    await instA.shutdown();
    await ensureUp(instC);
    const imp = await request("POST", `${instC.base}/import`, { exportData: exp.json, strategy: "merge" }, 120_000);
    assert(imp.status === 200, `POST /import returned ${imp.status}: ${imp.text.slice(0, 300)}`);
    d.import = imp.json;
    const restored = await poll("restored totals to match the export", async () => {
      const t = await instC.totals();
      return t.sessions === source.sessions && t.observations === source.observations && t.memories === source.memories ? t : null;
    }, { timeoutMs: 60_000, intervalMs: 1000 });
    d.restored = restored;
    const probe = [...(markers.capture ?? []), ...(markers.offline ?? [])];
    for (const m of probe) await poll(`restored search to find ${m}`, () => instC.searchFinds(m), { timeoutMs: 30_000 });
    if (markers.mcp) {
      const mem = await request("GET", `${instC.base}/memories`);
      assert(mem.text.includes(markers.mcp), "the MCP memory did not round-trip");
    }
    await instC.stop();
  });
}

let fatal = null;
try {
  await main();
} catch (err) {
  fatal = err instanceof Error ? err.stack || err.message : String(err);
  log(`gate aborted: ${fatal}`);
} finally {
  for (const inst of [instA, instB, instC]) await inst.shutdown().catch(() => {});
  if (gate.fake) gate.fake.server.close();
}

const failed = results.filter((r) => r.status === "fail");
const summary = {
  ok: !fatal && failed.length === 0 && results.some((r) => r.status === "pass"),
  package: "@agentmemory/agentmemory",
  version: gate.info.version ?? null,
  enginePin: gate.info.enginePin ?? null,
  node: process.version,
  platform: `${platform()}-${arch()}`,
  durationMs: Date.now() - startedAt,
  embeddings: gate.fake ? { requests: gate.fake.stats.calls, inputs: gate.fake.stats.inputs, chatRequests: gate.fake.stats.chatCalls } : null,
  scenarios: results,
  fatal,
  output: OUT,
};
for (const inst of [instA, instB, instC]) {
  try {
    if (existsSync(inst.home)) {
      const files = readdirSync(join(inst.home, ".agentmemory")).filter((f) => f.endsWith(".log"));
      for (const f of files) copyFileSync(join(inst.home, ".agentmemory", f), join(OUT, `${inst.name}-${f}`));
    }
  } catch {}
}
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log("");
for (const r of results) console.log(`${r.status.toUpperCase().padEnd(7)} ${r.name.padEnd(11)} ${String(r.ms ?? "-").padStart(7)} ms  ${r.title}${r.error ? `\n        ${r.error}` : ""}`);
console.log("");
console.log(JSON.stringify(summary, null, 2));
cleanup();
process.exit(summary.ok ? 0 : 1);
