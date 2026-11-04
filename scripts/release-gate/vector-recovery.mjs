#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { arch, homedir, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { registerWorker } from "iii-sdk";
import { decodeRkyvJsonScope } from "./recovery.mjs";

const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  assert(["--tarball", "--engine", "--out", "--dependencies"].includes(key), `Unknown argument ${key}`);
  assert(process.argv[i + 1], `Missing value for ${key}`);
  options[key.slice(2)] = resolve(process.argv[++i]);
}
assert(options.tarball, "Pass --tarball with the built npm package to test");
const out = options.out ?? mkdtempSync(join(tmpdir(), "agentmemory-vector-recovery-"));
mkdirSync(out, { recursive: true });
const root = mkdtempSync(join(out, "run-"));
const home = join(root, "home"), runtime = join(home, ".agentmemory"), data = join(root, "data"), prefix = join(root, "prefix");
const modules = join(prefix, "node_modules"), pkg = join(modules, "@agentmemory/agentmemory");
for (const dir of [runtime, data, prefix]) mkdirSync(dir, { recursive: true });
if (options.dependencies) {
  mkdirSync(pkg, { recursive: true });
  execFileSync("tar", ["-xzf", options.tarball, "--strip-components=1", "-C", pkg]);
  if (!existsSync(join(pkg, "dist/cli.mjs"))) {
    execFileSync("tar", ["-xzf", options.tarball, "--strip-components=1", "-C", pkg]);
  }
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
  writeFileSync(join(prefix, "package.json"), '{"name":"vector-recovery-gate","private":true}\n');
  execFileSync("npm", ["install", "--ignore-scripts", "--omit=optional", "--no-audit", "--no-fund", options.tarball], { cwd: prefix, stdio: "inherit" });
}
const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const engine = options.engine ?? process.env.AGENTMEMORY_GATE_ENGINE ?? join(homedir(), ".cache/agentmemory-release-gate", `iii-${manifest.dependencies["iii-sdk"]}-${platform()}-${arch()}`);
assert(execFileSync(engine, ["--version"], { encoding: "utf8" }).includes(manifest.dependencies["iii-sdk"]), "Pinned native engine version required");
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const cli = join(pkg, "dist/cli.mjs"), worker = join(pkg, "dist/index.mjs");
const originalHashes = [options.tarball, cli, worker].map(hash);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function poll(label, check, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let error;
  do { try { const value = await check(); if (value) return value; } catch (err) { error = err; } await sleep(100); } while (Date.now() < deadline);
  throw new Error(`${label} timed out: ${error?.message ?? "not ready"}`);
}
const free = (port) => new Promise((resolve) => {
  const server = net.createServer(); server.once("error", () => resolve(false));
  server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
});
let port;
for (let i = 0; i < 100; i++) {
  const candidate = 12_000 + Math.floor(Math.random() * 7_000);
  if ((await Promise.all([0, 1, 2, 3, 6353, 46023].map((n) => free(candidate + n)))).every(Boolean)) { port = candidate; break; }
}
assert(port, "No free port block");
const ports = [0, 1, 2, 3, 6353, 46023].map((n) => port + n);
let dimensions = 3, failEmbeddings = false, holdNext = false, releaseHeld, inputs = 0, secret = "", workerProcess, engineProcess;
const children = new Set();
const fixture = createServer(async (req, res) => {
  try {
    assert.equal(req.url, "/v1/embeddings");
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert(Array.isArray(body.input)); inputs += body.input.length;
    if (holdNext) { holdNext = false; await new Promise((resolve) => { releaseHeld = resolve; }); }
    else if (failEmbeddings) { res.writeHead(503); res.end("fixture unavailable"); return; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: body.input.map((_, index) => ({ index, embedding: Array(dimensions).fill(1) })) }));
  } catch (error) { res.writeHead(400); res.end(error.message); }
});
await new Promise((resolve, reject) => { fixture.once("error", reject); fixture.listen(0, "127.0.0.1", resolve); });
const fixturePort = fixture.address().port;
const namespace = `agentmemory-${port}`;
const configPath = join(root, "worker-compose.yaml");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const config = [
  `namespace: ${namespace}`,
  "engine:",
  `  url: ws://127.0.0.1:${port + 46023}`,
  "  workers:",
  "    configuration:",
  "      adapter:",
  "        name: fs",
  "        config:",
  `          directory: ${quote(join(root, "compose-config"))}`,
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
  "          store_method: file_based",
  `          file_path: ${quote(join(data, "state_store.db"))}`,
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
writeFileSync(configPath, config);
const env = (extra = {}) => ({
  HOME: home, USERPROFILE: home, PATH: [dirname(process.execPath), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter), TMPDIR: root,
  CI: "1", NO_COLOR: "1", LANG: "C.UTF-8", OTEL_ENABLED: "false", III_TELEMETRY_ENABLED: "false",
  AGENTMEMORY_DATA_DIR: data, AGENTMEMORY_RUNTIME_DIR: runtime, III_REST_PORT: String(port), III_VIEWER_PORT: String(port + 2),
  III_ENGINE_PORT: String(port + 46023), III_ENGINE_URL: `ws://127.0.0.1:${port + 46023}`, III_NAMESPACE: namespace, AGENTMEMORY_METRICS_PORT: String(port + 6353),
  LLM_PROVIDER: "none", EMBEDDING_PROVIDER: "openai", OPENAI_EMBEDDING_API_KEY: "local-fixture-only", OPENAI_EMBEDDING_DIMENSIONS: String(dimensions),
  OPENAI_EMBEDDING_BASE_URL: `http://127.0.0.1:${fixture.address().port}/v1`, AGENTMEMORY_VECTOR_BACKFILL_MAX: "2", AGENTMEMORY_GRAPH_WEIGHT: "0",
  AGENTMEMORY_GRAPH_COMPACT_ON_BOOT: "false", AGENTMEMORY_AUTO_COMPRESS: "false", AGENTMEMORY_SESSION_SWEEP_ENABLED: "false", AGENTMEMORY_FINALIZE_IDLE_MS: "0",
  GRAPH_EXTRACTION_ENABLED: "false", CONSOLIDATION_ENABLED: "false", AGENTMEMORY_REFLECT: "false",
  SNAPSHOT_ENABLED: "true", SNAPSHOT_DIR: join(root, "snapshots"), SNAPSHOT_INTERVAL: "3600", ...extra,
});
function launch(command, args, extra, name) {
  const child = spawn(command, args, { env: env(extra), cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child); child.text = "";
  const log = (chunk) => { child.text += chunk; appendFileSync(join(root, `${name}.log`), chunk); };
  child.stdout.on("data", log); child.stderr.on("data", log); child.on("error", (error) => log(String(error)));
  child.done = new Promise((resolve) => child.on("close", (code, signal) => { children.delete(child); resolve({ code, signal }); }));
  return child;
}
function kill(child, signal = "SIGKILL") {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
}
async function rest(path, body, timeoutMs = 3_000) {
  const response = await fetch(`http://127.0.0.1:${port}/agentmemory${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
  assert(response.ok, `${path}: HTTP ${response.status}`); return response.json();
}
function persisted(scope = "mem:index:bm25") {
  try { return decodeRkyvJsonScope(readFileSync(join(data, "state_store.db", `${encodeURIComponent(scope)}.bin`))); } catch { return {}; }
}
async function state(functionId, payload) {
  const client = registerWorker(`ws://127.0.0.1:${port + 46023}`, { workerName: "vector-recovery-fixture", namespace, invocationTimeoutMs: 5_000, enableMetricsReporting: false, otel: { enabled: false } });
  try { return await client.trigger({ function_id: functionId, payload }); }
  finally { await client.shutdown(); }
}
async function stop(graceful = false) {
  if (graceful && workerProcess) { kill(workerProcess, "SIGTERM"); await Promise.race([workerProcess.done, sleep(5_000)]); }
  kill(workerProcess); if (workerProcess) await Promise.race([workerProcess.done, sleep(2_000)]);
  workerProcess = undefined;
  if (graceful) await sleep(3_000);
  kill(engineProcess); if (engineProcess) await Promise.race([engineProcess.done, sleep(2_000)]);
  engineProcess = undefined;
  await poll("ports closed", async () => (await Promise.all(ports.map(free))).every(Boolean), 5_000);
}
async function start(name, extra = {}, failure = false) {
  inputs = 0;
  engineProcess = launch(engine, ["compose", "--namespace", namespace, "--up", "--file", configPath], extra, `${name}-compose`);
  await poll("Compose REST", async () => (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) })).status > 0);
  workerProcess = launch(process.execPath, [cli, "--no-engine", "--port", String(port), "--data-dir", data], extra, name);
  if (failure) {
    const result = await Promise.race([workerProcess.done, sleep(10_000).then(() => ({ timeout: true }))]);
    assert.equal(result.code, 1, JSON.stringify(result)); assert(workerProcess.text.includes("wrong dimension"));
    assert.equal(inputs, 0); await stop(); return;
  }
  await poll("packaged CLI", async () => { if (!workerProcess.text.includes("REST API")) return false; const live = await rest("/livez"); return live.viewerPort || live.viewerSkipped; });
  secret = readFileSync(join(runtime, "secret"), "utf8").trim();
}
const results = [];
async function check(name, vectors, pending, state, expectedInputs) {
  const status = await poll(name, async () => {
    const value = await rest("/status");
    return value.index?.keywordRebuildRunning === false && value.index.vectorDocuments === vectors && value.index.pendingVectorBackfill === pending && value.index.vectorBackfillState === state ? value : null;
  });
  assert.equal(inputs, expectedInputs, `${name} embedding inputs`);
  if (state !== "waiting-for-opt-in") await poll("durable checkpoint and recovery marker", () => {
    const saved = persisted(); return saved["vectors:meta"]?.count === vectors && (pending ? saved["vectors:backfill"]?.since === null : !saved["vectors:backfill"]);
  });
  const record = { name, vectors, pending, state, embeddingInputs: inputs, persistence: status.indexPersistence };
  results.push(record); console.log(JSON.stringify(record));
}
let fatal, cleanupError;
try {
  await start("seed", { EMBEDDING_PROVIDER: "none" });
  const timestamp = "2020-01-01T00:00:00.000Z";
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: `obs_${i}`, sessionId: "fixture", timestamp, type: "discovery", title: `Cobalt fixture ${i}`, narrative: `Cobalt historical record ${i}`, facts: [], concepts: [], files: [], importance: 5 }));
  const imported = await rest("/import", { exportData: { version: manifest.version, exportedAt: timestamp, sessions: [{ id: "fixture", project: "fixture", cwd: root, startedAt: timestamp, status: "completed", observationCount: 3 }], observations: { fixture: rows }, memories: [], summaries: [] } });
  assert.equal(imported.success, true); await sleep(3_000); await stop();
  failEmbeddings = true;
  await start("provider-down", { AGENTMEMORY_VECTOR_BACKFILL: "all" });
  const failed = await poll("provider failure remains pending", async () => { const s = await rest("/status"); return s.index?.vectorBackfillState === "paused" ? s : null; });
  assert.equal(failed.index.pendingVectorBackfill, 3); assert.equal(failed.index.vectorDocuments, 0); await sleep(3_000); await stop(); failEmbeddings = false;
  await start("first-cap", { AGENTMEMORY_VECTOR_BACKFILL: "all" }); await check("first-cap", 2, 1, "paused", 2);
  assert.equal(persisted()["vectors:meta"].backfillSince, null);
  await state("state::delete", { scope: "mem:index:bm25", key: "vectors:backfill" });
  await poll("marker absent with checkpoint fallback", () => !persisted()["vectors:backfill"]);
  await stop();
  await start("opt-in-withdrawn"); await check("opt-in-withdrawn", 2, 1, "waiting-for-opt-in", 0); await stop();
  await start("resume-cap", { AGENTMEMORY_VECTOR_BACKFILL: "all" }); await check("resume-cap", 3, 0, "idle", 1); await stop();
  dimensions = 4;
  await start("dimension-refusal", {}, true);
  await start("dimension-reset", { AGENTMEMORY_DROP_STALE_INDEX: "true" }); await check("dimension-reset", 0, 3, "waiting-for-opt-in", 0); await stop(true);
  assert.equal(persisted()["vectors:meta"].count, 0); assert.equal(persisted()["vectors:backfill"].since, null);
  await start("empty-checkpoint"); await check("empty-checkpoint", 0, 3, "waiting-for-opt-in", 0); await stop();
  await start("dimension-cap", { AGENTMEMORY_VECTOR_BACKFILL: "all" }); await check("dimension-cap", 2, 1, "paused", 2); await stop();
  await start("dimension-complete", { AGENTMEMORY_VECTOR_BACKFILL: "all" }); await check("dimension-complete", 3, 0, "idle", 1); await stop();
  await start("completed-restart"); await check("completed-restart", 3, 0, "idle", 0);
  assert((await rest("/search", { query: "Cobalt", limit: 3 })).results.length > 0);
  failEmbeddings = true;
  assert.equal((await rest("/remember", { content: "Amber baseline migration uses durable retries", project: "fixture" })).success, true);
  await sleep(3_000); await stop();
  failEmbeddings = false; holdNext = true;
  await start("concurrent-write", { AGENTMEMORY_VECTOR_BACKFILL: "all" });
  await poll("held recovery request", () => releaseHeld);
  failEmbeddings = true;
  assert.equal((await rest("/remember", { content: "Zircon late canonical record needs vector coverage", project: "fixture" })).success, true);
  failEmbeddings = false; releaseHeld(); releaseHeld = undefined;
  await check("concurrent-write", 4, 1, "paused", 4); await stop();
  await start("concurrent-write-restart", { AGENTMEMORY_VECTOR_BACKFILL: "all" });
  await check("concurrent-write-restart", 5, 0, "idle", 1);
  await state("state::set", { scope: "mem:index:bm25", key: "vectors:backfill", value: { v: 2, since: "invalid fixture timestamp" } });
  await poll("invalid marker persisted", () => persisted()["vectors:backfill"]?.since === "invalid fixture timestamp");
  await stop();
  await start("marker-quarantine");
  await poll("vector quarantine with ready keywords", async () => {
    const status = await rest("/status");
    return status.index?.keywordRebuildRunning === false && status.index.vectorBackfillState === "paused" && status.indexPersistence.vector.lastError?.includes("Invalid persisted vector backfill marker");
  });
  assert((await rest("/search", { query: "Cobalt", limit: 3 })).results.length > 0);
  assert.equal((await rest("/remember", { content: "Indigo captured while optional recovery is quarantined", project: "fixture" })).success, true);
  await sleep(3_000);
  assert.equal(persisted()["vectors:meta"].count, 5);
  await state("state::set", { scope: "mem:index:bm25", key: "vectors:backfill", value: { v: 2, since: null } });
  await poll("repaired marker persisted", () => persisted()["vectors:backfill"]?.since === null);
  await stop(true);
  assert.equal(persisted()["vectors:meta"].count, 5, "shutdown must not advance a quarantined checkpoint");
  results.push({ name: "marker-quarantine", keywordsAvailable: true, captureAvailable: true, checkpointUnchanged: true });
  await start("marker-repaired", { AGENTMEMORY_VECTOR_BACKFILL: "all" });
  await check("marker-repaired", 6, 0, "idle", 1);
  assert.equal((await rest("/remember", { content: "Violet stable checkpoint clears completed recovery", project: "fixture" })).success, true);
  const target = { ...rows[0], id: "obs_incremental", sessionId: "incremental", timestamp: "2099-01-01T00:00:00.000Z", title: "Onyx current state" };
  failEmbeddings = true;
  assert.equal((await rest("/import", { exportData: { version: manifest.version, exportedAt: timestamp, sessions: [{ id: "incremental", project: "fixture", cwd: root, startedAt: timestamp, status: "completed", observationCount: 1 }], observations: { incremental: [target] }, memories: [], summaries: [] } })).success, true);
  await stop(true); failEmbeddings = false;
  assert.equal(persisted()["vectors:meta"].count, 7);
  assert(!Object.hasOwn(persisted()["vectors:meta"], "backfillSince"), "ordinary checkpoint clears completion fallback");
  const snapshots = join(root, "snapshots"); mkdirSync(snapshots, { recursive: true });
  writeFileSync(join(snapshots, "state.json"), JSON.stringify({ observations: { incremental: [{ ...target, timestamp, title: "Onyx restored historical state" }] } }));
  execFileSync("git", ["init", "--quiet", snapshots]);
  execFileSync("git", ["-C", snapshots, "add", "state.json"]);
  execFileSync("git", ["-C", snapshots, "-c", "user.name=Local fixture", "-c", "user.email=fixture@localhost", "commit", "--quiet", "-m", "Historical snapshot fixture"]);
  const commitHash = execFileSync("git", ["-C", snapshots, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  holdNext = true;
  await start("incremental-snapshot");
  await poll("held incremental recovery", () => releaseHeld);
  failEmbeddings = true;
  assert.equal((await rest("/snapshot/restore", { commitHash }, 30_000)).success, true);
  failEmbeddings = false; releaseHeld(); releaseHeld = undefined;
  await check("incremental-snapshot", 7, 1, "paused", 4);
  await poll("restored observation persisted before restart", () => {
    const restored = persisted("mem:obs:incremental")[target.id];
    return restored?.title === "Onyx restored historical state" && restored?.timestamp === timestamp;
  });
  await stop();
  await start("incremental-snapshot-gated");
  await check("incremental-snapshot-gated", 7, 1, "waiting-for-opt-in", 0); await stop();
  await start("incremental-snapshot-recovered", { AGENTMEMORY_VECTOR_BACKFILL: "all" });
  await check("incremental-snapshot-recovered", 8, 0, "idle", 1);
  const recall = await rest("/search", { query: "Onyx restored historical", limit: 100, format: "full" });
  writeFileSync(join(root, "snapshot-recall.json"), JSON.stringify(recall, null, 2) + "\n");
  const restored = recall.results.find((row) => row.observation?.id === target.id)?.observation;
  assert.equal(restored?.title, "Onyx restored historical state");
  assert.equal(restored?.timestamp, timestamp);
} catch (error) { fatal = error.stack; console.error(fatal); }
finally {
  try { await stop(); } catch (error) { cleanupError = error.stack ?? String(error); }
  finally {
    for (const child of children) kill(child);
    fixture.closeAllConnections();
    await new Promise((resolve) => fixture.close(resolve));
    await Promise.all([...children].map((child) => Promise.race([child.done, sleep(2_000)])));
  }
}
const unchanged = [options.tarball, cli, worker].every((path, i) => hash(path) === originalHashes[i]);
const summary = { ok: !fatal && !cleanupError && unchanged, root, tarball: options.tarball, tarballSha256: originalHashes[0], installedArtifactsUnmodified: unchanged, cachedDependencies: Boolean(options.dependencies), node: process.version, platform: `${platform()}-${arch()}`, engine: manifest.dependencies["iii-sdk"], results, fatal, cleanupError, portsClosed: (await Promise.all([...ports, fixturePort].map(free))).every(Boolean) };
writeFileSync(join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`Summary: ${join(root, "summary.json")}`); process.exit(summary.ok && summary.portsClosed ? 0 : 1);
