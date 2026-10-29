#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { arch, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerWorker } from "iii-sdk";
import { assertSupportedPlatform } from "./command.mjs";

assertSupportedPlatform();
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const options = {};
const booleanFlags = new Set(["--small", "--assert", "--help"]);
const valueFlags = new Set(["--tarball", "--engine", "--out", "--dependencies", "--sizes", "--sessions", "--state-version", "--http-version", "--migrate-timeout-ms", "--probe-timeout-ms"]);
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (booleanFlags.has(key)) { options[key.slice(2)] = true; continue; }
  assert(valueFlags.has(key), `Unknown argument ${key}`);
  const value = process.argv[++i];
  assert(value && !value.startsWith("--"), `Missing value for ${key}`);
  options[key.slice(2).replaceAll("-", "_")] = value;
}
if (options.help) {
  console.log("Usage: node scripts/release-gate/large-store.mjs --tarball file.tgz [--engine bin] [--out dir] [--dependencies dir] [--small] [--sizes semantic=30,nodes=70,edges=140,insights=500] [--sessions N] [--state-version v] [--http-version v] [--migrate-timeout-ms N] [--probe-timeout-ms N] [--assert]");
  process.exit(0);
}
assert(options.tarball, "Pass --tarball with the built npm package to measure");
options.tarball = resolve(options.tarball);
if (options.out) options.out = resolve(options.out);
if (options.dependencies) options.dependencies = resolve(options.dependencies);
if (options.engine) options.engine = resolve(options.engine);

const scopeOrder = ["semantic", "nodes", "edges", "insights"];
const scopeNames = {
  semantic: "mem:semantic",
  nodes: "mem:graph:nodes",
  edges: "mem:graph:edges",
  insights: "mem:insights",
  sessions: "mem:sessions",
};
const defaults = options.small
  ? { semantic: 18, nodes: 18, edges: 20, insights: 20, sessions: 300 }
  : { semantic: 30, nodes: 70, edges: 140, insights: 500, sessions: 3000 };
const sizesMb = { semantic: defaults.semantic, nodes: defaults.nodes, edges: defaults.edges, insights: defaults.insights };
if (options.sizes) {
  for (const pair of options.sizes.split(",")) {
    const [name, raw] = pair.split("=").map((part) => part.trim());
    assert(scopeOrder.includes(name), `--sizes key must be one of ${scopeOrder.join(",")}: ${name}`);
    const mb = Number(raw);
    assert(Number.isFinite(mb) && mb >= 0, `--sizes ${name} must be a non-negative number of MiB`);
    sizesMb[name] = mb;
  }
}
const sessionCount = options.sessions !== undefined ? Number(options.sessions) : defaults.sessions;
assert(Number.isSafeInteger(sessionCount) && sessionCount >= 0, "--sessions must be a non-negative integer");
const migrateTimeoutMs = options.migrate_timeout_ms !== undefined ? Number(options.migrate_timeout_ms) : 300_000;
const probeTimeoutMs = options.probe_timeout_ms !== undefined ? Number(options.probe_timeout_ms) : 300_000;
assert(Number.isFinite(migrateTimeoutMs) && migrateTimeoutMs > 0, "--migrate-timeout-ms must be positive");
assert(Number.isFinite(probeTimeoutMs) && probeTimeoutMs > 0, "--probe-timeout-ms must be positive");

const composeSource = readFileSync(join(repo, "src/cli/compose-project.ts"), "utf8");
const workerVersions = {
  state: options.state_version ?? composeSource.match(/state:\s*"([^"]+)"/)?.[1],
  http: options.http_version ?? composeSource.match(/http:\s*"([^"]+)"/)?.[1],
};
assert(workerVersions.state && workerVersions.http, "Could not resolve worker versions; pass --state-version and --http-version");

const out = options.out ?? mkdtempSync(join(tmpdir(), "agentmemory-scale-"));
mkdirSync(out, { recursive: true });
const root = mkdtempSync(join(out, "run-"));
console.log(`Artifacts: ${root}`);
const prefix = join(root, "prefix"), modules = join(prefix, "node_modules"), pkg = join(modules, "@agentmemory/agentmemory");
mkdirSync(pkg, { recursive: true });
const children = new Set();
const probes = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const free = (port) => new Promise((resolve) => {
  const server = net.createServer(); server.once("error", () => resolve(false));
  server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
});
async function poll(label, check, timeout = 30_000) {
  const end = Date.now() + timeout;
  let error;
  do {
    try { const value = await check(); if (value) return value; } catch (cause) { error = cause; }
    await sleep(250);
  } while (Date.now() < end);
  throw new Error(`${label} timed out: ${error?.message ?? "not ready"}`);
}
function kill(child, signal = "SIGKILL") {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
}
process.on("exit", () => { for (const child of children) kill(child); });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => { for (const child of children) kill(child); process.exit(130); });
}

let manifest, engine, cli, fatal;
const p = { name: "large-store", sockets: new Set() };
function environment() {
  return {
    HOME: p.home, USERPROFILE: p.home, PATH: [dirname(process.execPath), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter), TMPDIR: root,
    CI: "1", NO_COLOR: "1", LANG: "C.UTF-8", OTEL_ENABLED: "false", III_TELEMETRY_ENABLED: "false",
    AGENTMEMORY_DATA_DIR: p.data, AGENTMEMORY_RUNTIME_DIR: p.runtime,
    III_REST_PORT: String(p.port), III_VIEWER_PORT: String(p.port + 2),
    III_ENGINE_PORT: String(p.enginePort), III_ENGINE_URL: `ws://127.0.0.1:${p.enginePort}`, III_NAMESPACE: `agentmemory-${p.port}`, AGENTMEMORY_METRICS_PORT: String(p.port + 6353),
    LLM_PROVIDER: "none", EMBEDDING_PROVIDER: "none", AGENTMEMORY_GRAPH_WEIGHT: "0.3",
    AGENTMEMORY_GRAPH_COMPACT_ON_BOOT: "false", AGENTMEMORY_AUTO_COMPRESS: "false", AGENTMEMORY_SESSION_SWEEP_ENABLED: "false", AGENTMEMORY_FINALIZE_IDLE_MS: "0",
    GRAPH_EXTRACTION_ENABLED: "false", CONSOLIDATION_ENABLED: "false", AGENTMEMORY_REFLECT: "false",
  };
}
function launch(executable, args, name) {
  const child = spawn(executable, args, { env: environment(), cwd: p.dir, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child); child.text = "";
  const log = (chunk) => { child.text = (child.text + chunk).slice(-1_048_576); appendFileSync(join(p.dir, `${name}.log`), chunk); };
  child.stdout.on("data", log); child.stderr.on("data", log); child.on("error", (error) => log(String(error)));
  child.done = new Promise((resolve) => child.on("close", (code, signal) => { children.delete(child); resolve({ code, signal }); }));
  return child;
}
async function install() {
  if (options.dependencies) {
    execFileSync("tar", ["-xzf", options.tarball, "--strip-components=1", "-C", pkg]);
    for (const entry of readdirSync(options.dependencies, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name.startsWith("@")) {
        mkdirSync(join(modules, entry.name), { recursive: true });
        for (const name of readdirSync(join(options.dependencies, entry.name))) {
          const target = join(modules, entry.name, name);
          if (!existsSync(target)) symlinkSync(join(options.dependencies, entry.name, name), target);
        }
      } else symlinkSync(join(options.dependencies, entry.name), join(modules, entry.name));
    }
  } else {
    writeFileSync(join(prefix, "package.json"), '{"name":"large-store-gate","private":true}\n');
    const installHome = join(root, "install-home"); mkdirSync(installHome);
    execFileSync("npm", ["install", "--ignore-scripts", "--omit=optional", "--no-audit", "--no-fund", options.tarball], {
      cwd: prefix, stdio: "inherit", timeout: 300_000,
      env: { HOME: installHome, USERPROFILE: installHome, PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter), npm_config_cache: join(root, "npm-cache") },
    });
  }
  manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
  cli = join(pkg, "dist/cli.mjs");
}
async function ensureEngine() {
  const pinned = manifest.dependencies["iii-sdk"];
  const candidate = options.engine ?? process.env.AGENTMEMORY_GATE_ENGINE;
  if (candidate) {
    const version = execFileSync(candidate, ["--version"], { encoding: "utf8" });
    assert(version.includes(pinned), `Engine version mismatch: ${version} (expected ${pinned})`);
    return candidate;
  }
  const targets = {
    darwin: { arm64: "aarch64-apple-darwin", x64: "x86_64-apple-darwin" },
    linux: { x64: "x86_64-unknown-linux-gnu", arm64: "aarch64-unknown-linux-gnu", arm: "armv7-unknown-linux-gnueabihf" },
  };
  const target = targets[platform()]?.[arch()];
  assert(target, `No iii engine asset mapping for ${platform()}-${arch()}`);
  const asset = `iii-${target}.tar.gz`;
  const base = `https://github.com/iii-hq/iii/releases/download/iii/v${pinned}`;
  const dir = join(root, "engine"); mkdirSync(dir, { recursive: true });
  const archive = join(dir, asset);
  const checksumResponse = await fetch(`${base}/${asset.replace(/\.tar\.gz$/, "")}.sha256`);
  assert(checksumResponse.ok, `Engine checksum download: HTTP ${checksumResponse.status}`);
  const expected = (await checksumResponse.text()).trim().split(/\s+/)[0];
  const response = await fetch(`${base}/${asset}`);
  assert(response.ok, `Engine download: HTTP ${response.status}`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
  assert.equal(actual, expected, `Engine archive checksum mismatch for ${asset}`);
  execFileSync("tar", ["-xzf", archive, "-C", dir]);
  const bin = join(dir, "iii");
  assert(existsSync(bin), `Expected engine binary at ${bin}`);
  const version = execFileSync(bin, ["--version"], { encoding: "utf8" });
  assert(version.includes(pinned), `Engine version mismatch: ${version} (expected ${pinned})`);
  return bin;
}
function writeWorkerCompose() {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const composeText = [
    `namespace: agentmemory-${p.port}`,
    "engine:",
    `  url: ws://127.0.0.1:${p.enginePort}`,
    "  workers:",
    "    configuration:",
    "      adapter:",
    "        name: fs",
    "        config:",
    `          directory: ${quote(join(p.data, "compose-config"))}`,
    "    iii-worker-manager:",
    "      host: 127.0.0.1",
    `      port: ${p.enginePort}`,
    "containers:",
    "  state:",
    "    worker: 'package://api.workers.iii.dev/state'",
    `    version: '${workerVersions.state}'`,
    "    config_name: state",
    "    config_override:",
    "      adapter:",
    "        name: kv",
    "        config:",
    `          file_path: ${quote(join(p.data, "state_store.db"))}`,
    "          store_method: file_based",
    "          save_interval_ms: 2000",
    "  http:",
    "    worker: 'package://api.workers.iii.dev/http'",
    `    version: '${workerVersions.http}'`,
    "    config_name: http",
    "    config_override:",
    "      host: 127.0.0.1",
    `      port: ${p.port}`,
    "      default_timeout: 180000",
    "",
  ].join("\n");
  writeFileSync(join(p.dir, "worker-compose.yaml"), composeText);
}
async function startEngine() {
  p.engine = launch(engine, ["compose", "--namespace", `agentmemory-${p.port}`, "--up", "--file", join(p.dir, "worker-compose.yaml")], "compose");
  await poll("Compose engine", async () => (await fetch(`http://127.0.0.1:${p.port}/`, { signal: AbortSignal.timeout(500) })).status > 0, 120_000);
  p.client = registerWorker(`ws://127.0.0.1:${p.enginePort}`, { workerName: "large-store-fixture", namespace: `agentmemory-${p.port}`, invocationTimeoutMs: 60_000, enableMetricsReporting: false, otel: { enabled: false } });
  await poll("Compose state worker", async () => {
    await p.client.trigger({ function_id: "state::get", payload: { scope: scopeNames.sessions, key: "_probe" } });
    return true;
  }, 120_000);
}
async function startWorker() {
  p.worker = launch(process.execPath, [cli, "--no-engine", "--port", String(p.port), "--data-dir", p.data], "worker");
  await poll("packaged CLI", async () => {
    if (p.worker.exitCode !== null) throw new Error(`CLI exited: ${p.worker.text}`);
    if (!p.worker.text.includes("REST API")) return false;
    const res = await fetch(`http://127.0.0.1:${p.port}/agentmemory/livez`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const value = await res.json();
    return value.viewerPort || value.viewerSkipped;
  }, 300_000);
  p.secret = readFileSync(join(p.runtime, "secret"), "utf8").trim();
}
const state = (id, payload) => p.client.trigger({ function_id: id, payload });

const timestamp = "2026-10-14T00:00:00.000Z";
const RECORD_TARGET_BYTES = 1024 * 1024;
const pad = (record, size, assign) => {
  const skeleton = JSON.stringify(assign(record, "")).length;
  return assign(record, "x".repeat(Math.max(1, RECORD_TARGET_BYTES - skeleton)));
};
const semanticRecord = (i) => pad({ id: `sem-${i}`, fact: "", confidence: 0.9, sourceSessionIds: ["sess-seed"], sourceMemoryIds: [], accessCount: 0, lastAccessedAt: timestamp, strength: 5, createdAt: timestamp, updatedAt: timestamp }, RECORD_TARGET_BYTES, (r, fill) => (r.fact = `Seeded semantic fact ${i}. ${fill}`, r));
const nodeRecord = (i) => pad({ id: `node-${i}`, name: `SeedNode${i}`, type: "concept", properties: {}, sourceObservationIds: ["mem_seed_source"], createdAt: timestamp }, RECORD_TARGET_BYTES, (r, fill) => (r.properties = { payload: fill }, r));
const edgeRecord = (i, nodeTotal) => pad({ id: `edge-${i}`, type: "related_to", sourceNodeId: `node-${i % Math.max(1, nodeTotal)}`, targetNodeId: `node-${(i + 1) % Math.max(1, nodeTotal)}`, weight: 0.8, sourceObservationIds: ["mem_seed_source"], createdAt: timestamp, isLatest: true }, RECORD_TARGET_BYTES, (r, fill) => (r.context = { reasoning: fill }, r));
const insightRecord = (i) => pad({ id: `insight-${i}`, title: `Seeded insight ${i}`, content: "", confidence: 0.85, reinforcements: 1, sourceConceptCluster: ["seed"], sourceMemoryIds: [], sourceLessonIds: [], sourceCrystalIds: [], evidenceVersion: 1, project: "fixture-large", tags: ["seed"], createdAt: timestamp, updatedAt: timestamp, decayRate: 0 }, RECORD_TARGET_BYTES, (r, fill) => (r.content = `Seeded insight content ${i}. ${fill}`, r));
const sessionRecord = (i) => ({ id: `sess-${i}`, project: "fixture-large", cwd: "/fixture/large", startedAt: timestamp, updatedAt: timestamp, endedAt: timestamp, status: "completed", observationCount: 0, agentId: "fixture-agent", firstPrompt: `Seeded session ${i}` });

async function seedScope(scope, recordCount, make) {
  let seeded = 0;
  const concurrency = 8;
  while (seeded < recordCount) {
    const batch = Math.min(concurrency, recordCount - seeded);
    await Promise.all(Array.from({ length: batch }, (_, offset) => {
      const record = make(seeded + offset);
      return state("state::set", { scope, key: record.id, value: record });
    }));
    seeded += batch;
    if (seeded % 64 < concurrency) console.log(`seeded ${scope}: ${seeded}/${recordCount}`);
  }
  return seeded;
}
async function seed() {
  const seeded = {};
  const perScope = {
    semantic: { count: Math.round(sizesMb.semantic), make: semanticRecord },
    nodes: { count: Math.round(sizesMb.nodes), make: nodeRecord },
    edges: { count: Math.round(sizesMb.edges), make: (i) => edgeRecord(i, Math.max(1, Math.round(sizesMb.nodes))) },
    insights: { count: Math.round(sizesMb.insights), make: insightRecord },
  };
  for (const name of scopeOrder) {
    const { count, make } = perScope[name];
    const start = performance.now();
    seeded[name] = { records: await seedScope(scopeNames[name], count, make), targetMiB: sizesMb[name], seedMs: Math.round(performance.now() - start) };
  }
  const start = performance.now();
  seeded.sessions = { records: await seedScope(scopeNames.sessions, sessionCount, sessionRecord), seedMs: Math.round(performance.now() - start) };
  return seeded;
}
async function response(path, body) {
  return fetch(`http://127.0.0.1:${p.port}/agentmemory${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.secret}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(probeTimeoutMs),
  });
}
async function probe(name, path, body) {
  const started = performance.now();
  const result = { name, method: body === undefined ? "GET" : "POST", path };
  try {
    const res = await response(path, body);
    result.status = res.status;
    let bytes = 0;
    const captured = [];
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (captured.reduce((sum, chunk) => sum + chunk.byteLength, 0) < 4096) captured.push(value);
      }
    }
    result.bytes = bytes;
    const text = Buffer.concat(captured.map((chunk) => Buffer.from(chunk))).toString("utf8").slice(0, 4096);
    try {
      const json = JSON.parse(text);
      result.json = json;
      if (json && typeof json === "object" && json.oversized === true) result.refused = true;
      const detail = json && typeof json === "object" ? json.error ?? json.message : undefined;
      if (detail) result.error = String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500);
      else if (json && typeof json === "object" && json.success === false) result.error = "success:false";
    } catch {}
    if (!result.error && res.status >= 400) result.error = `HTTP ${res.status}`;
  } catch (cause) {
    result.error = String(cause?.message ?? cause).slice(0, 500);
  }
  result.latencyMs = Math.round(performance.now() - started);
  result.ok = (result.status >= 200 && result.status < 300 && !result.error) || result.refused === true;
  delete result.json;
  probes.push(result);
  console.log(JSON.stringify(result));
  return result;
}
async function agentmemoryWorkers() {
  try {
    const listed = await state("engine::workers::list", {});
    return (listed?.workers ?? []).filter((worker) => (worker.name ?? "").includes("agentmemory")).map((worker) => ({ id: worker.id, name: worker.name, status: worker.status }));
  } catch (cause) {
    return [{ error: String(cause?.message ?? cause) }];
  }
}
function scanLogs() {
  const findings = { payload_too_large: 0, WS_ERR_UNSUPPORTED_MESSAGE_LENGTH: 0, files: [] };
  const candidates = [join(p.dir, "compose.log"), join(p.dir, "worker.log")];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".log")) candidates.push(full);
    }
  };
  try { walk(join(p.dir, ".iii")); } catch {}
  try { walk(join(p.data, "compose-state")); } catch {}
  try { walk(join(p.data, "compose", "logs")); } catch {}
  for (const file of new Set(candidates)) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    const hits = {
      payload_too_large: (text.match(/payload_too_large/g) ?? []).length,
      WS_ERR_UNSUPPORTED_MESSAGE_LENGTH: (text.match(/WS_ERR_UNSUPPORTED_MESSAGE_LENGTH/g) ?? []).length,
    };
    if (hits.payload_too_large || hits.WS_ERR_UNSUPPORTED_MESSAGE_LENGTH) findings.files.push({ file, ...hits });
    findings.payload_too_large += hits.payload_too_large;
    findings.WS_ERR_UNSUPPORTED_MESSAGE_LENGTH += hits.WS_ERR_UNSUPPORTED_MESSAGE_LENGTH;
  }
  return findings;
}

let seeded = {}, workersBefore = [], workersAfter = [], workerObserved = false, workerReregistered = false, logFindings = {}, migrateFinal;
try {
  await install();
  engine = await ensureEngine();
  const dir = join(root, "instance"), home = join(dir, "home"), data = join(dir, "data"), runtime = join(home, ".agentmemory");
  Object.assign(p, { dir, home, data, runtime });
  for (const path of [runtime, data]) mkdirSync(path, { recursive: true });
  for (let i = 0; i < 100 && p.port === undefined; i++) {
    const candidate = 12_000 + Math.floor(Math.random() * 7_000);
    const block = [0, 1, 2, 3, 6353, 46023].map((n) => candidate + n);
    if ((await Promise.all(block.map(free))).every(Boolean)) p.port = candidate;
  }
  assert(p.port, "No free port block");
  p.enginePort = p.port + 46023;
  writeWorkerCompose();
  await startEngine();
  const seedStart = performance.now();
  seeded = await seed();
  console.log(JSON.stringify({ name: "seeded", scopes: seeded, totalMs: Math.round(performance.now() - seedStart) }));
  await startWorker();
  workersBefore = await poll("agentmemory worker registration", async () => {
    const listed = await agentmemoryWorkers();
    return listed.some((worker) => worker.id) ? listed : false;
  }, 60_000);

  await probe("semantic", "/semantic?limit=50");
  await probe("insights", "/insights?limit=50");
  await probe("sessions", "/sessions");
  await probe("counts", "/counts");

  const migrate = await probe("graph-index-migrate", "/graph/index/migrate", { allowLegacyScan: true });
  const migrateDeadline = Date.now() + migrateTimeoutMs;
  let terminal;
  if (migrate.ok) {
    do {
      await sleep(3000);
      const res = await response("/graph/index");
      terminal = res.ok ? await res.json() : { state: `http-${res.status}` };
    } while (!terminal.ready && !terminal.error && !["paused", "unavailable"].includes(terminal.state) && Date.now() < migrateDeadline);
  }
  migrateFinal = {
    name: "graph-index-final",
    accepted: migrate.ok,
    state: terminal?.state ?? "not-started",
    ready: Boolean(terminal?.ready),
    processed: terminal?.processed,
    total: terminal?.total,
    error: terminal?.error ? String(terminal.error).slice(0, 500) : terminal === undefined ? migrate.error : undefined,
    elapsedMs: migrate.latencyMs,
  };
  probes.push(migrateFinal);
  console.log(JSON.stringify(migrateFinal));

  await probe("export", "/export");
  {
    const started = performance.now();
    let cursor, pages = 0, totalBytes = 0, lastStatus = 0, meshError;
    do {
      const res = await response(`/mesh/export${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      lastStatus = res.status;
      const text = await res.text();
      totalBytes += text.length;
      pages++;
      let json;
      try { json = JSON.parse(text); } catch {}
      cursor = json?.nextCursor;
      if (!res.ok) { meshError = `HTTP ${res.status}: ${text.slice(0, 300)}`; break; }
      if (pages > 200) { meshError = "pagination did not terminate"; break; }
    } while (cursor);
    const result = { name: "mesh-export", method: "GET", path: "/mesh/export (paged)", status: lastStatus, bytes: totalBytes, pages, latencyMs: Math.round(performance.now() - started), ...(meshError ? { error: meshError } : {}) };
    result.ok = lastStatus >= 200 && lastStatus < 300 && !meshError;
    probes.push(result);
    console.log(JSON.stringify(result));
  }

  workersAfter = await agentmemoryWorkers();
  const ids = (list) => list.filter((worker) => worker.id).map((worker) => worker.id);
  const before = ids(workersBefore), after = ids(workersAfter);
  workerObserved = before.length > 0 && after.length > 0 && !workersAfter.some((worker) => worker.error);
  workerReregistered = !workerObserved || before.length !== after.length || before.some((id) => !after.includes(id)) || after.some((id) => !before.includes(id));
  logFindings = scanLogs();
} catch (error) {
  fatal = error.stack ?? String(error);
  console.error(fatal);
} finally {
  if (p.worker) { kill(p.worker); await Promise.race([p.worker.done, sleep(3000)]); }
  if (p.client) { try { await p.client.shutdown(); } catch {} }
  for (const socket of p.sockets) socket.terminate();
  if (p.engine) { kill(p.engine); await Promise.race([p.engine.done, sleep(3000)]); }
  for (const child of [...children]) kill(child);
}

const probeFailed = probes.filter((entry) => !entry.ok && entry.name !== "graph-index-final");
const migrateOk = migrateFinal ? migrateFinal.accepted === true && migrateFinal.ready === true : false;
const summary = {
  ok: !fatal,
  root,
  tarball: options.tarball,
  engine,
  engineVersion: manifest?.dependencies?.["iii-sdk"],
  workerVersions,
  sizes: seeded,
  sessions: sessionCount,
  probes,
  failedProbes: probeFailed.map((entry) => entry.name),
  migrate: migrateFinal,
  stability: { workersBefore, workersAfter, workerObserved, workerReregistered },
  logFindings,
  fatal,
};
writeFileSync(join(root, "results.json"), JSON.stringify(summary, null, 2) + "\n");
console.log("\nprobe                    status       ms        MiB  error");
for (const entry of probes) {
  const mib = entry.bytes !== undefined ? (entry.bytes / (1024 * 1024)).toFixed(1) : "-";
  console.log(`${entry.name.padEnd(24)} ${String(entry.status ?? entry.state ?? "-").padEnd(8)} ${String(entry.latencyMs ?? entry.elapsedMs ?? "-").padEnd(9)} ${mib.padEnd(8)} ${entry.error ?? ""}`);
}
console.log(`workerObserved: ${workerObserved}  workerReregistered: ${workerReregistered}  payload_too_large hits: ${logFindings.payload_too_large ?? 0}  WS_ERR hits: ${logFindings.WS_ERR_UNSUPPORTED_MESSAGE_LENGTH ?? 0}`);
console.log(`Results: ${join(root, "results.json")}`);
const assertFailed = options.assert && (fatal || probeFailed.length > 0 || (migrateFinal && !migrateOk) || workerReregistered);
process.exit(fatal ? 1 : assertFailed ? 1 : 0);
