#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { arch, homedir, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { registerWorker } from "iii-sdk";
import WebSocket, { WebSocketServer } from "ws";
import { assertCommandCompleted, assertSupportedPlatform, runCommand } from "./command.mjs";
import { decodeRkyvJsonScope } from "./recovery.mjs";

assertSupportedPlatform();
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  assert(["--tarball", "--engine", "--out", "--dependencies", "--nodes"].includes(key), `Unknown argument ${key}`);
  const value = process.argv[++i];
  assert(value && !value.startsWith("--"), `Missing value for ${key}`);
  options[key.slice(2)] = key === "--nodes" ? Number(value) : resolve(value);
}
assert(options.tarball, "Pass --tarball with the built npm package to test");
const nodeCount = options.nodes ?? 100;
assert(Number.isSafeInteger(nodeCount) && nodeCount >= 3 && nodeCount <= 100_000, "--nodes must be an integer between 3 and 100000");
const edgeCount = nodeCount * 3;
const scopes = {
  nodes: "mem:graph:nodes", edges: "mem:graph:edges", history: "mem:graph:edge-history",
  snapshot: "mem:graph:snapshot", control: "mem:graph:retrieval-control", migration: "mem:graph:index-migration", manifest: "mem:graph:index-manifest",
  index: "mem:graph:retrieval-data",
};
const canonicalScopes = [scopes.nodes, scopes.edges, scopes.history];
const out = options.out ?? mkdtempSync(join(tmpdir(), "agentmemory-graph-index-"));
mkdirSync(out, { recursive: true });
const root = mkdtempSync(join(out, "run-"));
console.log(`Artifacts: ${root}`);
const prefix = join(root, "prefix"), modules = join(prefix, "node_modules"), pkg = join(modules, "@agentmemory/agentmemory");
mkdirSync(prefix, { recursive: true });
const children = new Set(), profiles = [], results = [];
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
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
    await sleep(100);
  } while (Date.now() < end);
  throw new Error(`${label} timed out: ${error?.message ?? "not ready"}`);
}
function note(name, details = {}) {
  const result = { name, ...details }; results.push(result); console.log(JSON.stringify(result));
}
function kill(child, signal = "SIGKILL") {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
}
process.on("exit", () => { for (const child of children) kill(child); });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => { for (const child of children) kill(child); process.exit(130); });
}
let manifest, engine, cli, worker, originals, fatal, cleanupError;
async function install() {
  if (options.dependencies) {
    mkdirSync(pkg, { recursive: true });
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
    writeFileSync(join(prefix, "package.json"), '{"name":"graph-index-gate","private":true}\n');
    const installHome = join(root, "install-home"); mkdirSync(installHome);
    execFileSync("npm", ["install", "--ignore-scripts", "--omit=optional", "--no-audit", "--no-fund", options.tarball], {
      cwd: prefix, stdio: "inherit", timeout: 180_000,
      env: { HOME: installHome, USERPROFILE: installHome, PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter), npm_config_cache: join(root, "npm-cache") },
    });
  }
  manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
  engine = options.engine ?? process.env.AGENTMEMORY_GATE_ENGINE ?? join(homedir(), ".cache/agentmemory-release-gate", `iii-${manifest.dependencies["iii-sdk"]}-${platform()}-${arch()}`);
  assert(execFileSync(engine, ["--version"], { encoding: "utf8" }).includes(manifest.dependencies["iii-sdk"]), "Pinned native engine version required");
  cli = join(pkg, "dist/cli.mjs"); worker = join(pkg, "dist/index.mjs");
  originals = [options.tarball, cli, worker].map(hash);
}
async function profile(name, instance = 0, sharedHome) {
  const dir = join(root, name), home = sharedHome ?? join(dir, "home"), data = join(dir, "data"), runtime = instance ? data : join(home, ".agentmemory");
  for (const path of [runtime, data]) mkdirSync(path, { recursive: true });
  let port;
  for (let i = 0; i < 100; i++) {
    const candidate = 12_000 + Math.floor(Math.random() * 7_000);
    const block = [0, 1, 2, 3, 6353, 46023].map((n) => candidate + n);
    if (block.some((n) => profiles.some((p) => p.ports.includes(n)))) continue;
    if ((await Promise.all(block.map(free))).every(Boolean)) { port = candidate; break; }
  }
  assert(port, "No free port block");
  const p = { name, instance, dir, home, runtime, data, port, ports: [0, 1, 2, 3, 6353, 46023].map((n) => port + n), secret: "", trace: [], traceSummary: new Map(), phase: "startup", sockets: new Set(), holdManifestAt: 0, manifestReads: 0, held: false };
  profiles.push(p);
  const workerCompose = join(dir, "worker-compose.yaml");
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const namespace = `agentmemory-${port}`;
  const composeText = [
    `namespace: ${namespace}`,
    "engine:",
    `  url: ws://127.0.0.1:${port + 46023}`,
    "  workers:",
    "    configuration:",
    "      adapter:",
    "        name: fs",
    "        config:",
    `          directory: ${quote(join(data, "compose-config"))}`,
    "    iii-worker-manager:",
    "      host: 127.0.0.1",
    `      port: ${port + 46023}`,
    "containers:",
    "  state:",
    "    worker: 'package://api.workers.iii.dev/state'",
    "    version: '0.22.20'",
    "    config_name: state",
    "    config_override:",
    "      adapter:",
    "        name: kv",
    "        config:",
    `          file_path: ${quote(join(data, "state_store.db"))}`,
    "          store_method: file_based",
    "          save_interval_ms: 2000",
    "  http:",
    "    worker: 'package://api.workers.iii.dev/http'",
    "    version: '0.22.7'",
    "    config_name: http",
    "    config_override:",
    "      host: 127.0.0.1",
    `      port: ${port}`,
    "      default_timeout: 180000",
    "",
  ].join("\n");
  writeFileSync(workerCompose, composeText);
  return p;
}
function environment(p) {
  return {
    HOME: p.home, USERPROFILE: p.home, PATH: [dirname(process.execPath), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter), TMPDIR: root,
    CI: "1", NO_COLOR: "1", LANG: "C.UTF-8", OTEL_ENABLED: "false", III_TELEMETRY_ENABLED: "false",
    AGENTMEMORY_DATA_DIR: p.data, AGENTMEMORY_RUNTIME_DIR: p.runtime,
    ...(p.explicitSecret ? { AGENTMEMORY_SECRET: p.explicitSecret } : {}),
    III_REST_PORT: String(p.port), III_VIEWER_PORT: String(p.port + 2),
    III_ENGINE_PORT: String(p.port + 46023), III_ENGINE_URL: `ws://127.0.0.1:${p.port + 3}`, III_NAMESPACE: `agentmemory-${p.port}`, AGENTMEMORY_METRICS_PORT: String(p.port + 6353),
    LLM_PROVIDER: "none", EMBEDDING_PROVIDER: "none", AGENTMEMORY_GRAPH_WEIGHT: "0.3",
    AGENTMEMORY_GRAPH_COMPACT_ON_BOOT: "true", AGENTMEMORY_AUTO_COMPRESS: "false", AGENTMEMORY_SESSION_SWEEP_ENABLED: "false", AGENTMEMORY_FINALIZE_IDLE_MS: "0",
    GRAPH_EXTRACTION_ENABLED: "false", CONSOLIDATION_ENABLED: "false", AGENTMEMORY_REFLECT: "false",
    SNAPSHOT_ENABLED: "true", SNAPSHOT_DIR: join(p.dir, "snapshots"), SNAPSHOT_INTERVAL: "3600",
  };
}
function launch(p, executable, args, name) {
  const child = spawn(executable, args, { env: environment(p), cwd: p.dir, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child); child.text = "";
  const log = (chunk) => { child.text = (child.text + chunk).slice(-65536); appendFileSync(join(p.dir, `${name}.log`), chunk); };
  child.stdout.on("data", log); child.stderr.on("data", log); child.on("error", (error) => log(String(error)));
  child.done = new Promise((resolve) => child.on("close", (code, signal) => { children.delete(child); resolve({ code, signal }); }));
  return child;
}
async function relay(p) {
  p.manifestReads = 0;
  p.relay = new WebSocketServer({ host: "127.0.0.1", port: p.port + 3 });
  await new Promise((resolve, reject) => { p.relay.once("listening", resolve); p.relay.once("error", reject); });
  p.relay.on("connection", (downstream) => {
    const upstream = new WebSocket(`ws://127.0.0.1:${p.port + 46023}`);
    p.sockets.add(downstream); p.sockets.add(upstream);
    const queued = [], inFlight = new Map();
    const forward = (bytes) => upstream.readyState === WebSocket.OPEN ? upstream.send(bytes) : queued.push(bytes);
    upstream.on("open", () => { for (const bytes of queued.splice(0)) upstream.send(bytes); });
    downstream.on("message", (bytes) => {
      const message = JSON.parse(bytes.toString());
      if (message.type === "invokefunction" && message.function_id?.startsWith("state::") && message.data?.scope?.startsWith("mem:graph:")) {
        const record = { phase: p.phase, operation: message.function_id, scope: message.data.scope, key: message.data.key, requestBytes: bytes.length };
        if (p.trace.length < 20_000) p.trace.push(record);
        let summary = p.traceSummary.get(p.phase);
        if (!summary) p.traceSummary.set(p.phase, summary = { graphOperations: 0, maxGraphResponseBytes: 0, maxReadLatencyMs: 0, canonicalLists: [], snapshotOperations: 0 });
        summary.graphOperations++;
        if (record.operation === "state::list" && canonicalScopes.some((scope) => record.scope.startsWith(scope))) summary.canonicalLists.push(record.scope);
        if (record.scope.startsWith(scopes.snapshot)) summary.snapshotOperations++;
        inFlight.set(message.invocation_id, { record, summary, started: performance.now() });
        // A durable sealed descriptor exists before the first manifest read. Hold only this request to make the crash deterministic.
        if (message.function_id === "state::get" && message.data.scope === scopes.manifest) {
          p.manifestReads++;
          if (p.manifestReads === p.holdManifestAt) { p.holdManifestAt = 0; p.held = true; return; }
        }
      }
      forward(bytes);
    });
    upstream.on("message", (bytes) => {
      const message = JSON.parse(bytes.toString());
      const tracked = inFlight.get(message.invocation_id);
      if (message.type === "invocationresult" && tracked) {
        tracked.record.responseBytes = bytes.length; tracked.record.latencyMs = performance.now() - tracked.started;
        tracked.summary.maxGraphResponseBytes = Math.max(tracked.summary.maxGraphResponseBytes, bytes.length);
        if (tracked.record.operation === "state::get") tracked.summary.maxReadLatencyMs = Math.max(tracked.summary.maxReadLatencyMs, tracked.record.latencyMs);
        inFlight.delete(message.invocation_id);
      }
      if (downstream.readyState === WebSocket.OPEN) downstream.send(bytes);
    });
    for (const socket of [upstream, downstream]) {
      socket.on("error", () => { upstream.terminate(); downstream.terminate(); });
      socket.on("close", () => { p.sockets.delete(socket); upstream.terminate(); downstream.terminate(); });
    }
  });
}
async function startEngine(p, name) {
  await relay(p);
  p.engine = launch(p, engine, ["compose", "--namespace", `agentmemory-${p.port}`, "--up", "--file", join(p.dir, "worker-compose.yaml")], `${name}-compose`);
  await poll("Compose engine", async () => (await fetch(`http://127.0.0.1:${p.port}/`, { signal: AbortSignal.timeout(500) })).status > 0);
  p.client = registerWorker(`ws://127.0.0.1:${p.port + 46023}`, { workerName: `graph-index-fixture-${p.name}`, namespace: `agentmemory-${p.port}`, invocationTimeoutMs: 30_000, enableMetricsReporting: false, otel: { enabled: false } });
  await poll("Compose state worker", async () => {
    await p.client.trigger({ function_id: "state::get", payload: { scope: scopes.control, key: "current" } });
    return true;
  });
}
async function startWorker(p, name) {
  p.worker = launch(p, process.execPath, [cli, "--no-engine", "--port", String(p.port), "--data-dir", p.data, ...(p.instance ? ["--instance", String(p.instance)] : [])], name);
  await poll("packaged CLI", async () => {
    if (p.worker.exitCode !== null) throw new Error(`CLI exited: ${p.worker.text}`);
    if (!p.worker.text.includes("REST API")) return false;
    const value = await rest(p, "/livez"); return value.viewerPort || value.viewerSkipped;
  });
  p.secret = p.explicitSecret ?? readFileSync(join(p.runtime, "secret"), "utf8").trim();
}
async function start(p, name) { await startEngine(p, name); await startWorker(p, name); }
async function stop(p, graceful = false) {
  if (graceful && p.worker) { kill(p.worker, "SIGTERM"); await Promise.race([p.worker.done, sleep(5000)]); }
  kill(p.worker); if (p.worker) await Promise.race([p.worker.done, sleep(2000)]); p.worker = undefined;
  if (graceful) await sleep(2500);
  await p.client?.shutdown(); p.client = undefined;
  for (const socket of p.sockets) socket.terminate();
  if (p.relay) await new Promise((resolve) => p.relay.close(resolve)); p.relay = undefined;
  kill(p.engine); if (p.engine) await Promise.race([p.engine.done, sleep(2000)]); p.engine = undefined;
  await poll("ports closed", async () => (await Promise.all(p.ports.map(free))).every(Boolean), 5000);
}
async function response(p, path, body, secret = p.secret) {
  return fetch(`http://127.0.0.1:${p.port}/agentmemory${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000),
  });
}
async function rest(p, path, body) {
  const res = await response(p, path, body); const text = await res.text();
  assert(res.ok, `${path}: HTTP ${res.status}: ${text.slice(0, 1000)}`); return JSON.parse(text);
}
async function saveStatusHtml(p, name, expectedCounts) {
  const res = await response(p, "/status?format=html");
  assert(res.ok, `Status HTML: HTTP ${res.status}`);
  const html = await res.text();
  assert(html.includes(`<th>Nodes / edges</th><td>${expectedCounts}</td>`), `Status HTML must report ${expectedCounts}`);
  writeFileSync(join(p.dir, `${name}-status.html`), html);
  writeFileSync(join(p.dir, `${name}-status.json`), JSON.stringify(await rest(p, "/status"), null, 2) + "\n");
  const viewer = await fetch(`http://127.0.0.1:${p.port + 2}/`, { signal: AbortSignal.timeout(5000) });
  assert(viewer.ok, `Viewer HTML: HTTP ${viewer.status}`);
  writeFileSync(join(p.dir, `${name}-viewer.html`), await viewer.text());
  writeFileSync(join(p.dir, `${name}-viewer-snapshot.json`), JSON.stringify(await rest(p, "/viewer/snapshot"), null, 2) + "\n");
}
async function command(p, args, code = 0, extraEnv = {}) {
  const result = await runCommand(process.execPath, [cli, "graph-index", ...args, "--port", String(p.port), ...(p.instance ? ["--instance", String(p.instance)] : [])], { env: { ...environment(p), ...extraEnv }, cwd: p.dir, timeoutMs: 15_000 });
  assertCommandCompleted(result); assert.equal(result.code, code, result.output);
  return JSON.parse(result.output);
}
const state = (p, id, payload) => p.client.trigger({ function_id: id, payload });
async function assertEdgeKey(p, source, target, type, expectedIds) {
  const control = await rest(p, "/graph/index");
  assert(control.ready);
  const scope = control.generation ? `${scopes.index}:generation:${control.generation}` : scopes.index;
  const posting = createHash("sha256").update(JSON.stringify(`edgeKey\0${JSON.stringify([source, target, type])}`)).digest("hex");
  const key = `${control.buildId}:root:${posting}`;
  const root = await state(p, "state::get", { scope, key });
  assert.equal(root?.count, expectedIds.length);
  const ids = [];
  let next = root.head;
  while (next !== null) {
    assert(ids.length < expectedIds.length, "Exact edge posting contains extra or cyclic entries");
    const entry = await state(p, "state::get", { scope, key: `${control.buildId}:entry:${posting}:${next}` });
    assert(entry, "Missing exact edge posting entry");
    ids.push(entry.id); next = entry.next;
  }
  assert.deepEqual(ids.sort(), [...expectedIds].sort());
}
function persisted(p, scope) {
  try { return decodeRkyvJsonScope(readFileSync(join(p.data, "state_store.db", `${encodeURIComponent(scope)}.bin`))); } catch { return {}; }
}
function graphFiles(p) {
  const dir = join(p.data, "state_store.db");
  return readdirSync(dir).filter((file) => decodeURIComponent(file).startsWith("mem:graph:")).map((file) => ({ scope: decodeURIComponent(file).replace(/\.bin$/, ""), bytes: statSync(join(dir, file)).size }));
}
function ordinaryReads(p, phase, requestCount = 10) {
  const summary = p.traceSummary.get(phase);
  assert(summary?.graphOperations > 0, "Wire trace must observe actual graph operations");
  assert.equal(summary.canonicalLists.length, 0, `${phase}: implicit canonical scope scan`);
  assert.equal(summary.snapshotOperations, 0, `${phase}: legacy snapshot read`);
  assert(summary.graphOperations <= requestCount * 2080, `${phase}: graph read request budget exceeded`);
  assert(summary.maxGraphResponseBytes <= 64 * 1024, `${phase}: graph response exceeds bounded record envelope`);
  return summary;
}
async function measuredReads(p, label, tasks) {
  p.phase = label;
  const timings = await Promise.all(tasks.map(async ([name, task]) => {
    const started = performance.now(); await task();
    const durationMs = performance.now() - started;
    assert(durationMs < 15_000, `${label}/${name}: request exceeded 15 second local gate budget`);
    return { name, durationMs };
  }));
  note(label, { requests: timings, ...ordinaryReads(p, label, tasks.length) });
}
const timestamp = "2026-10-14T00:00:00.000Z";
const node = (id, name = id, extra = {}) => ({ id, name, type: "concept", properties: {}, sourceObservationIds: ["mem_gate_source"], createdAt: timestamp, ...extra });
const edge = (id, from, to, extra = {}) => ({ id, sourceNodeId: from, targetNodeId: to, type: "related_to", weight: 0.8, sourceObservationIds: ["mem_gate_source"], createdAt: timestamp, ...extra });
const exported = (nodes = [], edges = []) => ({ version: manifest.version, exportedAt: timestamp, sessions: [], observations: {}, memories: [], summaries: [], graphNodes: nodes, graphEdges: edges });
async function find(p, query) { return (await rest(p, "/graph/query", { query, maxDepth: 0, limit: 20 })).nodes; }
function snapshot(p, value) {
  const dir = join(p.dir, "snapshots"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify(value));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { env: environment(p), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet"); git("add", "state.json"); git("-c", "user.name=Local fixture", "-c", "user.email=fixture@localhost", "commit", "--quiet", "-m", "Synthetic graph snapshot");
  return git("rev-parse", "HEAD");
}
try {
  await install();
  const primary = await profile("primary");
  await startEngine(primary, "legacy-seed");
  const seedStart = performance.now();
  await state(primary, "state::set", { scope: "mem:memories", key: "mem_gate_source", value: {
    id: "mem_gate_source", type: "fact", title: "Fixture evidence", content: "Graph transport uses durable identity checks", sessionIds: [], concepts: [], files: [], sourceObservationIds: [],
    strength: 5, version: 1, isLatest: true, createdAt: timestamp, updatedAt: timestamp, project: "fixture-primary", agentId: "fixture-agent",
  } });
  for (let i = 0; i < nodeCount; i++) await state(primary, "state::set", { scope: scopes.nodes, key: `node-${i}`, value: node(`node-${i}`, `Cobalt${i}`) });
  for (let i = 0; i < edgeCount; i++) await state(primary, "state::set", { scope: scopes.edges, key: `edge-${i}`, value: edge(`edge-${i}`, `node-${i % nodeCount}`, `node-${(i + 1) % nodeCount}`) });
  await state(primary, "state::set", { scope: scopes.history, key: "past", value: edge("past", "node-0", "node-1", { isLatest: false, version: 1 }) });
  // A large legacy snapshot makes accidental fallback reads visible in the wire trace.
  await state(primary, "state::set", { scope: scopes.snapshot, key: "current", value: { version: 1, topNodes: [], topEdges: [], topDegrees: {}, stats: { totalNodes: nodeCount, totalEdges: edgeCount, nodesByType: { concept: nodeCount }, edgesByType: { related_to: edgeCount } }, updatedAt: timestamp, dirty: false, marker: "x".repeat(512 * 1024) } });
  note("native-legacy-fixture", { nodes: nodeCount, edges: edgeCount, history: 1, seedMs: performance.now() - seedStart });
  primary.phase = "legacy-startup-status-search";
  await startWorker(primary, "legacy-startup");
  assert.equal((await command(primary, ["status", "--json"])).state, "needs-migration");
  const plainStatus = await runCommand(process.execPath, [cli, "status", "--port", String(primary.port)], { env: environment(primary), cwd: primary.dir, timeoutMs: 15_000 });
  assertCommandCompleted(plainStatus); assert.equal(plainStatus.code, 0, plainStatus.output);
  assert(plainStatus.output.includes("unknown nodes, unknown edges"), "CLI status must not present unavailable graph counts as zero");
  assert.equal((await command(primary, ["migrate", "--json"], 2)).error.includes("--allow-legacy-scan"), true);
  assert.equal((await response(primary, "/graph/index", undefined, "wrong-secret")).status, 401);
  assert.equal((await response(primary, "/graph/index/migrate", { allowLegacyScan: true }, "wrong-secret")).status, 401);
  assert.equal((await response(primary, "/graph/index/migrate", { allowLegacyScan: "true" })).status, 400);
  assert.equal((await response(primary, "/graph/index/migrate", {})).status, 400);
  assert.equal((await rest(primary, "/graph/query", { query: "Cobalt0" })).nodes.length, 0);
  await rest(primary, "/status"); await rest(primary, "/search", { query: "Cobalt0", limit: 3 });
  await sleep(4000);
  await saveStatusHtml(primary, "legacy", "unknown / unknown");
  note("legacy-startup-status-search", ordinaryReads(primary, primary.phase));

  primary.phase = "explicit-discovery"; primary.holdManifestAt = 1;
  const migrationStart = performance.now();
  const accepted = await command(primary, ["migrate", "--allow-legacy-scan", "--json"]);
  assert(accepted.jobId);
  await poll("sealed manifest held before replay", () => primary.held);
  assert.equal((await command(primary, ["resume", "--json"])).jobId, accepted.jobId);
  await poll("sealed migration durable", () => persisted(primary, scopes.migration).current?.sealed === true);
  assert.deepEqual(primary.traceSummary.get(primary.phase).canonicalLists, canonicalScopes);
  const sealed = persisted(primary, scopes.migration).current;
  assert.equal(sealed.processed, 0); assert.equal(sealed.totals.nodes, nodeCount); assert.equal(sealed.totals.edges, edgeCount);
  await stop(primary);
  note("sealed-crash-before-replay", { jobId: accepted.jobId, processed: sealed.processed, total: nodeCount + edgeCount + 1, discoveryAndCrashMs: performance.now() - migrationStart });

  primary.phase = "sealed-partial-restart";
  primary.held = false; primary.holdManifestAt = 2;
  const allResumeStart = performance.now();
  await start(primary, "sealed-partial-restart");
  await poll("second manifest held after replay checkpoint", () => primary.held);
  const checkpointProcessed = Math.min(nodeCount, 128);
  await poll("partial migration checkpoint durable across scopes", () => {
    const job = persisted(primary, scopes.migration).current;
    const control = persisted(primary, scopes.control).current;
    const page = persisted(primary, scopes.manifest)[`${accepted.jobId}:nodes:0`];
    const data = persisted(primary, scopes.index);
    return job?.processed === checkpointProcessed && control?.buildId === accepted.buildId && control.nodes === checkpointProcessed &&
      !control.pending && !control.batchPending && page?.ids?.length === checkpointProcessed && page.ids.every((id) =>
        data[`${accepted.buildId}:record:node:${createHash("sha256").update(JSON.stringify(id)).digest("hex")}`]?.row?.id === id);
  });
  assert.equal(primary.traceSummary.get(primary.phase).canonicalLists.length, 0);
  assert.equal(primary.traceSummary.get(primary.phase).snapshotOperations, 0);
  await stop(primary);
  note("partial-checkpoint-crash", { processed: checkpointProcessed, checkpointAcrossControlManifestAndRecords: true, elapsedMs: performance.now() - allResumeStart });

  primary.phase = "sealed-restart";
  const resumeStart = performance.now();
  await start(primary, "sealed-restart");
  const ready = await poll("sealed migration resumed", async () => {
    const status = await rest(primary, "/graph/index");
    return status.ready || status.state === "paused" ? status : null;
  }, 300_000);
  assert(ready.ready, ready.error ?? ready.action);
  assert.equal(ready.jobId, accepted.jobId); assert.equal(ready.nodes, nodeCount); assert.equal(ready.edges, edgeCount); assert.equal(ready.historyEdges, 1);
  assert.equal(ready.processed, nodeCount + edgeCount + 1); assert.equal(ready.coverage, "complete");
  await assertEdgeKey(primary, "node-0", "node-1", "related_to", ["edge-0", `edge-${nodeCount}`, `edge-${nodeCount * 2}`]);
  const migrationMs = performance.now() - resumeStart;
  assert.equal(primary.traceSummary.get(primary.phase).canonicalLists.length, 0);
  assert.equal(primary.traceSummary.get(primary.phase).snapshotOperations, 0);
  await poll("ready index flushed", () => persisted(primary, scopes.migration).current?.state === "ready");
  note("sealed-restart", { nodes: ready.nodes, edges: ready.edges, processed: ready.processed, resumeWallMs: migrationMs, includesEngineAndWorkerStartup: true, recordsResumed: ready.processed - checkpointProcessed, resumedRecordsPerSecond: (ready.processed - checkpointProcessed) / (migrationMs / 1000), totalReplayAndCheckpointCrashWallMs: performance.now() - allResumeStart, graphFiles: graphFiles(primary) });

  primary.phase = "indexed-ordinary-reads";
  await saveStatusHtml(primary, "indexed", `${nodeCount} / ${edgeCount}`);
  assert((await find(primary, "Cobalt0")).some((row) => row.id === "node-0"));
  const detail = await rest(primary, "/graph/node?id=node-0&limit=1");
  assert.equal(detail.node.id, "node-0"); assert(detail.relations.length <= 1); assert(detail.relationsCursor);
  const next = await rest(primary, `/graph/node?id=node-0&limit=1&cursor=${encodeURIComponent(detail.relationsCursor)}`);
  assert(next.relations.length <= 1);
  assert.equal((await response(primary, "/graph/node?id=node-0&cursor=not-a-cursor")).status, 400);
  assert.equal((await rest(primary, "/graph/stats")).totalNodes, nodeCount);
  await rest(primary, "/status"); await rest(primary, "/search", { query: "Cobalt0", limit: 3 });
  note("indexed-ordinary-reads", ordinaryReads(primary, primary.phase));
  await measuredReads(primary, "warm-repeat", [["graph-query", async () => assert((await find(primary, "Cobalt0")).some((row) => row.id === "node-0"))]]);
  await measuredReads(primary, "parallel-reads-and-health", [
    ["graph-query", async () => assert((await find(primary, "Cobalt0")).some((row) => row.id === "node-0"))],
    ["node-detail", async () => assert.equal((await rest(primary, "/graph/node?id=node-0&limit=5")).node.id, "node-0")],
    ["memory-search", async () => { await rest(primary, "/search", { query: "Cobalt0", limit: 3 }); }],
    ["health", async () => { await rest(primary, "/health"); }],
    ["livez", async () => { await rest(primary, "/livez"); }],
  ]);

  primary.phase = "canonical-writer-reconciliation";
  assert.equal((await rest(primary, "/import", { strategy: "merge", exportData: exported([node("node-0", "AmberRenamed")]) })).success, true);
  assert(!(await find(primary, "Cobalt0")).some((row) => row.id === "node-0"));
  assert((await find(primary, "AmberRenamed")).some((row) => row.id === "node-0"));
  assert.equal((await response(primary, `/graph/node?id=node-0&cursor=${encodeURIComponent(detail.relationsCursor)}`)).status, 400);
  assert.equal((await rest(primary, "/mesh/receive", { graphNodes: [node("node-0", "ZirconMesh", { updatedAt: "2026-10-15T00:00:00.000Z" })] })).success, true);
  assert(!(await find(primary, "AmberRenamed")).some((row) => row.id === "node-0"));
  assert((await find(primary, "ZirconMesh")).some((row) => row.id === "node-0"));
  assert.equal((await rest(primary, "/mesh/receive", { graphNodes: [node("node-0", "ZirconMesh", { updatedAt: "2026-10-16T00:00:00.000Z", stale: true })] })).success, true);
  assert(!(await find(primary, "ZirconMesh")).some((row) => row.id === "node-0"));
  const commitHash = snapshot(primary, { graphNodes: [node("node-0", "OnyxRestored")], graphEdges: [edge("edge-0", "node-0", "node-2", { type: "uses" })] });
  assert.equal((await rest(primary, "/snapshot/restore", { commitHash })).success, true);
  assert((await find(primary, "OnyxRestored")).some((row) => row.id === "node-0"));
  const restored = await rest(primary, "/graph/node?id=node-0&limit=200");
  assert(restored.relations.some((relation) => relation.edgeId === "edge-0" && relation.neighbor?.id === "node-2" && relation.type === "uses"));
  await assertEdgeKey(primary, "node-0", "node-1", "related_to", [`edge-${nodeCount}`, `edge-${nodeCount * 2}`]);
  await assertEdgeKey(primary, "node-0", "node-2", "uses", ["edge-0"]);
  const remembered = await rest(primary, "/remember", { content: "Indigo durable capture survives graph migration restart", project: "fixture-primary", agentId: "fixture-agent" });
  assert.equal(remembered.success, true);
  assert(remembered.memory?.id);
  assert.equal((await rest(primary, "/mesh/receive", { graphNodes: [node("node-0", "OnyxRestored", { updatedAt: "2026-10-17T00:00:00.000Z", sourceObservationIds: [remembered.memory.id] })] })).success, true);
  const graphRecall = () => rest(primary, "/search", { query: "OnyxRestored", project: "fixture-primary", agentId: "fixture-agent", targetLayer: "memory", limit: 5, format: "full" });
  assert((await graphRecall()).results.some((row) => row.observation?.id === remembered.memory.id), "Graph-only query must find captured memory through current provenance");
  assert.equal((await rest(primary, "/search", { query: "OnyxRestored", project: "different-project", targetLayer: "memory", limit: 5 })).results.length, 0);
  assert((await rest(primary, "/search", { query: "Indigo durable capture", project: "fixture-primary", agentId: "fixture-agent", limit: 5 })).results.length > 0);
  note("canonical-writer-reconciliation", { importRename: true, meshRename: true, staleExcluded: true, snapshotOverlay: true, capturedMemory: true, graphOnlyMemoryRecall: true });
  await stop(primary, true);

  primary.phase = "completed-restart";
  await start(primary, "completed-restart");
  assert.equal((await command(primary, ["status", "--json"])).ready, true);
  await assertEdgeKey(primary, "node-0", "node-1", "related_to", [`edge-${nodeCount}`, `edge-${nodeCount * 2}`]);
  await assertEdgeKey(primary, "node-0", "node-2", "uses", ["edge-0"]);
  note("completed-restart-startup", ordinaryReads(primary, primary.phase));
  await measuredReads(primary, "cold-engine-query", [["graph-query", async () => assert((await find(primary, "OnyxRestored")).some((row) => row.id === "node-0"))]]);
  await measuredReads(primary, "repeated-engine-query", [["graph-query", async () => assert((await find(primary, "OnyxRestored")).some((row) => row.id === "node-0"))]]);
  primary.phase = "completed-restart-recall";
  assert((await graphRecall()).results.some((row) => row.observation?.id === remembered.memory.id), "Graph-only memory recall must survive a restart");
  assert((await rest(primary, "/search", { query: "Indigo durable capture", project: "fixture-primary", agentId: "fixture-agent", limit: 5 })).results.length > 0);
  assert.equal((await rest(primary, "/search", { query: "Indigo durable capture", project: "different-project", limit: 5 })).results.length, 0);
  note("completed-restart-recall", ordinaryReads(primary, primary.phase));

  const indexed = await rest(primary, "/graph/index");
  const controlScope = indexed.generation ? `${scopes.control}:generation:${indexed.generation}` : scopes.control;
  const oldControl = await state(primary, "state::get", { scope: controlScope, key: "current" });
  await state(primary, "state::set", { scope: controlScope, key: "current", value: { ...oldControl, schema: 1 } });
  await stop(primary, true);
  primary.phase = "older-index-startup";
  await start(primary, "older-index-startup");
  const unavailable = await command(primary, ["status", "--json"]);
  assert.equal(unavailable.state, "unavailable");
  assert(unavailable.error.includes("explicit graph-index migration"));
  note("older-index-startup", ordinaryReads(primary, primary.phase));
  primary.phase = "explicit-index-rebuild";
  await command(primary, ["migrate", "--allow-legacy-scan", "--json"]);
  const rebuilt = await poll("older index rebuilt explicitly", async () => {
    const status = await rest(primary, "/graph/index");
    return status.ready || status.state === "paused" ? status : null;
  }, 300_000);
  assert(rebuilt.ready, rebuilt.error ?? rebuilt.action);
  assert.notEqual(rebuilt.buildId, indexed.buildId);
  assert.equal(rebuilt.nodes, nodeCount);
  await assertEdgeKey(primary, "node-0", "node-2", "uses", ["edge-0"]);
  assert((await graphRecall()).results.some((row) => row.observation?.id === remembered.memory.id));
  note("explicit-index-rebuild", { canonicalMemoryPreserved: true, exactEdgeKeyRestored: true });

  const secondary = await profile("secondary", 1, primary.home); secondary.phase = "named-instance-startup-status-search";
  secondary.explicitSecret = randomBytes(32).toString("hex");
  await start(secondary, "fresh-profile");
  assert.equal(primary.home, secondary.home);
  assert.equal(secondary.runtime, secondary.data);
  assert.notEqual(primary.secret, secondary.secret);
  assert.equal((await command(secondary, ["status", "--json"], 1, { AGENTMEMORY_SECRET: primary.secret })).httpStatus, 401);
  assert.equal((await response(secondary, "/graph/index", undefined, primary.secret)).status, 401);
  assert.equal((await command(secondary, ["status", "--json"])).state, "needs-migration");
  assert.equal((await rest(secondary, "/search", { query: "Indigo durable capture", limit: 5 })).results.length, 0);
  note("named-instance-startup-status-search", ordinaryReads(secondary, secondary.phase));
  assert.equal((await rest(secondary, "/graph/reset", {})).success, true);
  assert.equal((await command(secondary, ["status", "--json"])).ready, true);
  assert.equal((await rest(primary, "/graph/index")).nodes, nodeCount);
  await stop(secondary);

  const separateHome = await profile("separate-home"); separateHome.phase = "separate-home-startup-status";
  await start(separateHome, "fresh-home");
  assert.notEqual(separateHome.home, primary.home);
  assert.notEqual(separateHome.secret, primary.secret);
  assert.equal((await response(separateHome, "/graph/index", undefined, primary.secret)).status, 401);
  assert.equal((await command(separateHome, ["status", "--json"])).state, "needs-migration");
  note("separate-home-startup-status", { credentialMode: "generated", ...ordinaryReads(separateHome, separateHome.phase) });
  await stop(separateHome);

  assert.equal((await rest(primary, "/graph/reset", {})).success, true);
  const reset = await command(primary, ["status", "--json"]);
  assert.equal(reset.ready, true); assert.equal(reset.nodes, 0); assert.equal(reset.jobId, undefined);
  assert.equal((await find(primary, "OnyxRestored")).length, 0);
  note("profile-isolation-and-reset", { namedInstance: secondary.instance, sharedHome: true, credentialMode: "explicit", separateCredentials: true, separateHomeGeneratedCredentials: true, separateData: true, readyEmptyGeneration: true, oldMigrationHidden: true });
} catch (error) { fatal = error.stack ?? String(error); console.error(fatal); }
finally {
  for (const p of profiles) {
    try { await stop(p); } catch (error) { cleanupError = `${cleanupError ?? ""}\n${error.stack ?? error}`; }
  }
  for (const child of children) kill(child);
  await Promise.all([...children].map((child) => Promise.race([child.done, sleep(2000)])));
}
const unchanged = Boolean(originals && [options.tarball, cli, worker].every((path, i) => hash(path) === originals[i]));
const portsClosed = (await Promise.all(profiles.flatMap((p) => p.ports).map(free))).every(Boolean);
const summary = {
  ok: !fatal && !cleanupError && unchanged && portsClosed, root, tarball: options.tarball, tarballSha256: originals?.[0], installedArtifactsUnmodified: unchanged,
  cachedDependencies: Boolean(options.dependencies), node: process.version, platform: `${platform()}-${arch()}`, engine: manifest?.dependencies["iii-sdk"],
  nodes: nodeCount, edges: edgeCount, realModelConversations: false, results, fatal, cleanupError, portsClosed,
};
for (const p of profiles) writeFileSync(join(p.dir, "graph-wire-trace.json"), JSON.stringify({ phases: Object.fromEntries(p.traceSummary), firstOperations: p.trace, retainedOperationsLimit: 20_000 }, null, 2) + "\n");
writeFileSync(join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`Summary: ${join(root, "summary.json")}`);
process.exit(summary.ok ? 0 : 1);
