#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { arch, homedir, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const options = { tarball: null, out: null, skipBuild: false, keep: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--tarball" || arg === "--out") {
    assert(process.argv[i + 1] && !process.argv[i + 1].startsWith("--"), `${arg} requires a path`);
    options[arg.slice(2)] = resolve(process.argv[++i]);
  } else if (arg === "--skip-build") options.skipBuild = true;
  else if (arg === "--keep") options.keep = true;
  else if (arg === "--help") {
    console.log("Usage: node scripts/release-gate/reflection.mjs [--tarball file.tgz] [--out dir] [--skip-build] [--keep]");
    process.exit(0);
  } else throw new Error(`Unknown argument ${arg}`);
}

const root = mkdtempSync(join(tmpdir(), "am-reflection-"));
const out = options.out ?? mkdtempSync(join(tmpdir(), "agentmemory-reflection-gate-"));
const home = join(root, "home");
const runtime = join(home, ".agentmemory");
const dataDir = join(root, "data");
const prefix = join(root, "prefix");
const pkgDir = join(prefix, "node_modules/@agentmemory/agentmemory");
const cli = join(pkgDir, "dist/cli.mjs");
for (const dir of [out, home, runtime, dataDir, prefix]) mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const children = new Set();
const ownedPids = new Set();
const results = [];
const artifact = {};
const modelRequests = [];
const wire = [];
const began = Date.now();
let port, modelServer, modelPort, daemon, bridge, secret, installed;
let modelMode = "valid";
let modelContent = "Combine checkpoint validation with rotation verification before completion.";
let packageBefore;
const log = (text) => {
  const line = `[${((Date.now() - began) / 1000).toFixed(1)}s] ${text}`;
  console.log(line);
  appendFileSync(join(out, "gate.log"), `${line}\n`);
};
function packageDigest() {
  const files = [];
  const walk = (directory, relative = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(directory, entry.name), name);
      else if (entry.isFile()) files.push([name, sha(join(directory, entry.name))]);
    }
  };
  walk(pkgDir);
  files.sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
function cleanEnv(targetHome = home) {
  return {
    HOME: targetHome, PATH: [join(prefix, "node_modules/.bin"), dirname(process.execPath), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter),
    TMPDIR: tmpdir(), CI: "1", NO_COLOR: "1", LANG: "C.UTF-8", III_TELEMETRY_ENABLED: "false",
    EMBEDDING_PROVIDER: "none", AGENTMEMORY_AUTO_COMPRESS: "false", AGENTMEMORY_SESSION_SWEEP_ENABLED: "false",
    AGENTMEMORY_DATA_DIR: dataDir, AGENTMEMORY_RUNTIME_DIR: runtime,
    III_REST_PORT: String(port), III_VIEWER_PORT: String(port + 2),
    III_ENGINE_PORT: String(port + 46023), AGENTMEMORY_METRICS_PORT: String(port + 6353),
    AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
    OPENAI_API_KEY: "reflection-gate-synthetic-key", OPENAI_BASE_URL: `http://127.0.0.1:${modelPort}`,
    OPENAI_MODEL: "reflection-gate", OPENAI_TIMEOUT_MS: "5000",
  };
}
function launch(bin, args, { env = cleanEnv(), cwd = root, name = "command", stdin = false } = {}) {
  const child = spawn(bin, args, { env, cwd, detached: true, stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"] });
  children.add(child);
  child.text = "";
  child.result = null;
  const record = (chunk) => {
    child.text += chunk;
    appendFileSync(join(out, `${name}.log`), chunk);
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  child.once("error", (error) => { record(String(error)); child.result = { code: -1 }; });
  child.once("close", (code, signal) => { child.result = { code, signal }; children.delete(child); });
  return child;
}
function kill(pid, signal = "SIGTERM") {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return;
  try { process.kill(-pid, signal); } catch {}
  try { process.kill(pid, signal); } catch {}
}
async function waitExit(child, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (!child.result && Date.now() < deadline) await sleep(50);
  if (!child.result) { kill(child.pid, "SIGKILL"); throw new Error(`Process timeout: ${child.text.slice(-1500)}`); }
  return child.result;
}
async function command(bin, args, options = {}) {
  const child = launch(bin, args, options);
  const result = await waitExit(child, options.timeout ?? 120_000);
  assert.equal(result.code, 0, `${bin} ${args.join(" ")}: ${child.text.slice(-2000)}`);
  return child.text;
}
async function poll(label, probe, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    try { const result = await probe(); if (result) return result; } catch (error) { last = error; }
    await sleep(100);
  } while (Date.now() < deadline);
  throw new Error(`${label} timed out: ${last?.message ?? "not ready"}`);
}
function portFree(value) {
  const server = net.createServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(value, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
const daemonPorts = () => [port, port + 1, port + 2, port + 3, port + 6353, port + 46023];
async function pickPorts() {
  for (let i = 0; i < 200; i++) {
    port = 12000 + Math.floor(Math.random() * 7000);
    if ((await Promise.all(daemonPorts().map(portFree))).every(Boolean)) return;
  }
  throw new Error("No free port block");
}
function sourceLabel(prompt, marker, kind) {
  const line = prompt.split("\n").find((line) => line.includes(marker));
  const match = line?.match(new RegExp(`\\b${kind}\\d+\\b`));
  assert(match, `Prompt does not label ${marker}`);
  return match[0];
}
async function startModel() {
  modelServer = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      assert.equal(req.url, "/v1/chat/completions");
      const payload = JSON.parse(raw);
      const prompt = payload.messages.find((message) => message.role === "user")?.content ?? "";
      const entry = { mode: modelMode, path: req.url, prompt, system: payload.messages[0]?.content };
      modelRequests.push(entry);
      if (modelMode === "provider-failure") {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Synthetic provider unavailable" }));
        return;
      }
      let content;
      if (modelMode === "missing") content = '<insight confidence="0.8" title="Uncited result">An unsupported checkpoint assertion.</insight>';
      else if (modelMode === "malformed") content = '<insight confidence="0.8" title="Truncated output" sources="F1,L1">No closing tag';
      else if (modelMode === "empty") content = "<insights></insights>";
      else {
        const fact = sourceLabel(prompt, "FACT_ALPHA", "F");
        const lesson = sourceLabel(prompt, "LESSON_SELECTED", "L");
        const crystal = sourceLabel(prompt, "CRYSTAL_SELECTED", "C");
        const sources = modelMode === "forged" ? `${fact},${lesson},F999`
          : modelMode === "duplicate" ? `${fact},${fact}`
          : modelMode === "shared-evidence" ? `${fact},${crystal}`
          : `${fact},${lesson},${crystal}`;
        if (modelMode === "stale") {
          const changed = fixture();
          changed.semanticMemories[0].fact += " changed while generating";
          assert.equal((await rest("/import", { exportData: changed, strategy: "merge" })).success, true);
        }
        content = `<insight confidence="0.8" title="Verified checkpoint practice" sources="${sources}">${modelContent}</insight>`;
      }
      entry.response = content;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
    } catch (error) {
      modelRequests.push({ mode: modelMode, error: error.message });
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => modelServer.listen(0, "127.0.0.1", resolve));
  modelPort = modelServer.address().port;
}
async function install() {
  let tarball = options.tarball;
  if (!tarball) {
    if (!options.skipBuild) await command("npm", ["run", "build"], { env: process.env, cwd: repo, name: "build", timeout: 600_000 });
    const packDir = join(out, "pack"); mkdirSync(packDir, { recursive: true });
    const packed = await command("npm", ["pack", "--json", "--pack-destination", packDir], { env: process.env, cwd: repo, name: "pack" });
    tarball = join(packDir, JSON.parse(packed)[0].filename);
  }
  artifact.tarball = tarball;
  artifact.tarballSha256 = sha(tarball);
  writeFileSync(join(prefix, "package.json"), '{"name":"reflection-gate-prefix","private":true}\n');
  const installHome = join(root, "install-home"); mkdirSync(installHome);
  const npmCache = execFileSync("npm", ["config", "get", "cache"], { encoding: "utf8" }).trim();
  log("Installing packed CLI into a clean prefix");
  await command("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", tarball], { cwd: prefix, env: { ...cleanEnv(installHome), npm_config_cache: npmCache }, name: "install", timeout: 600_000 });
  installed = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  artifact.version = installed.version;
  artifact.cliSha256 = sha(cli);
  packageBefore = packageDigest();
  artifact.packageSha256 = packageBefore;
  const cache = process.env.AGENTMEMORY_GATE_CACHE ?? join(homedir(), ".cache/agentmemory-release-gate");
  const engine = process.env.AGENTMEMORY_GATE_ENGINE ?? join(cache, `iii-${installed.dependencies["iii-sdk"]}-${platform()}-${arch()}`);
  assert(existsSync(engine), `Pinned engine missing: ${engine}. Run release:gate first or set AGENTMEMORY_GATE_ENGINE.`);
  const version = await command(engine, ["--version"], { name: "engine-version" });
  assert(version.includes(installed.dependencies["iii-sdk"]), `Engine version mismatch: ${version}`);
  artifact.engineVersion = version.trim();
  const binDir = join(runtime, "bin"); mkdirSync(binDir);
  copyFileSync(engine, join(binDir, "iii")); chmodSync(join(binDir, "iii"), 0o755);
}
async function rest(path, body, { auth = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth) headers.authorization = `Bearer ${secret}`;
  const response = await fetch(`http://127.0.0.1:${port}/agentmemory${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (path !== "/livez") wire.push({ path, status: response.status, request: body, response: json });
  assert.equal(response.status, 200, `${path}: ${response.status} ${text.slice(0, 600)}`);
  return json;
}
async function startDaemon() {
  daemon = launch(process.execPath, [cli, "--port", String(port), "--data-dir", dataDir], { name: "daemon" });
  ownedPids.add(daemon.pid);
  await poll("packaged daemon startup", async () => {
    assert(!daemon.result, `CLI exited: ${daemon.text.slice(-1000)}`);
    const live = await rest("/livez", undefined, { auth: false });
    return live.viewerPort || live.viewerSkipped;
  });
  secret = readFileSync(join(runtime, "secret"), "utf8").trim();
  assert(secret, "Daemon did not generate a secret");
}
function rememberPids() {
  for (const name of ["worker", "iii"]) {
    try { ownedPids.add(Number(readFileSync(join(runtime, `${name}.pid`), "utf8").trim())); } catch {}
  }
}
async function stopDaemon() {
  rememberPids();
  if (daemon) await command(process.execPath, [cli, "stop", "--port", String(port)], { name: "stop", timeout: 20_000 });
  for (const pid of ownedPids) kill(pid);
  await poll("daemon ports released", async () => (await Promise.all(daemonPorts().map(portFree))).every(Boolean), 15_000);
  daemon = null;
}
function fixture() {
  const now = new Date().toISOString();
  const semanticMemories = ["ALPHA", "BETA", "GAMMA"].map((marker) => ({ id: `fact-${marker.toLowerCase()}`, fact: `FACT_${marker} checkpoint rotation validation`, confidence: 0.9, sourceSessionIds: [], sourceMemoryIds: [], accessCount: 0, lastAccessedAt: now, strength: 1, createdAt: now, updatedAt: now }));
  const lessons = ["a", "b"].flatMap((project) => ["SELECTED", "UNCITED"].map((marker) => ({ id: `lesson-${project}-${marker.toLowerCase()}`, content: `LESSON_${marker} checkpoint rotation practice for project ${project}`, context: "Synthetic fixture", confidence: 0.9, reinforcements: 0, source: "manual", sourceIds: [], project: `reflection-${project}`, tags: ["checkpoint", "rotation"], createdAt: now, updatedAt: now, decayRate: 0.05 })));
  const crystals = ["SELECTED", "UNCITED"].map((marker) => ({ id: `crystal-${marker.toLowerCase()}`, narrative: `CRYSTAL_${marker} checkpoint rotation summary`, keyOutcomes: [], filesAffected: [], lessons: ["checkpoint rotation"], sourceActionIds: [], createdAt: now }));
  const graphNodes = ["checkpoint", "rotation"].map((name) => ({ id: `node-${name}`, name, type: "concept", properties: {}, sourceObservationIds: [], createdAt: now, updatedAt: now }));
  const graphEdges = [{ id: "edge-checkpoint-rotation", sourceNodeId: "node-checkpoint", targetNodeId: "node-rotation", type: "related_to", weight: 1, sourceObservationIds: [], createdAt: now }];
  return { version: installed.version, exportedAt: now, sessions: [], observations: {}, memories: [], summaries: [], semanticMemories, lessons, crystals, graphNodes, graphEdges };
}
async function seed() {
  const result = await rest("/import", { exportData: fixture(), strategy: "replace" });
  assert.equal(result.success, true, JSON.stringify(result));
}
function toolResult(response) {
  assert(!response.isError && !response.error, JSON.stringify(response));
  return JSON.parse(response.content.map((item) => item.text ?? "").join("\n"));
}
async function directTool(name, args) {
  return toolResult(await rest("/mcp/call", { name, arguments: args }));
}
async function startBridge() {
  const child = launch(process.execPath, [join(pkgDir, "dist/standalone.mjs")], { name: "stdio", stdin: true });
  let buffer = "", nextId = 1;
  const pending = new Map();
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      try { const message = JSON.parse(line); pending.get(message.id)?.(message); } catch {}
    }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`stdio ${method} timeout`)); }, 30_000);
    pending.set(id, (response) => { clearTimeout(timer); pending.delete(id); resolve(response); });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  const initialized = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "reflection-gate", version: "1" } });
  assert(!initialized.error, JSON.stringify(initialized));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  bridge = {
    child,
    call: async (name, args) => {
      const response = await rpc("tools/call", { name, arguments: args });
      wire.push({ transport: "stdio", name, arguments: args, response });
      assert(!response.error, JSON.stringify(response));
      return toolResult(response.result);
    },
  };
}
function verifyEvidence(insight, project, includeLesson = true) {
  assert.equal(insight.evidenceVersion, 1);
  assert.deepEqual(insight.sourceMemoryIds, ["fact-alpha"]);
  assert.deepEqual(insight.sourceLessonIds, includeLesson ? [`lesson-${project}-selected`] : []);
  assert.deepEqual(insight.sourceCrystalIds, ["crystal-selected"]);
  assert.equal(insight.project, `reflection-${project}`);
}
async function scenario(name, run) {
  log(`RUN ${name}`);
  const start = Date.now();
  try {
    await run();
    results.push({ name, status: "pass", ms: Date.now() - start });
    log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "fail", ms: Date.now() - start, error: error.message });
    log(`FAIL ${name}: ${error.message}`);
  }
}
async function main() {
  await pickPorts();
  await startModel();
  await install();
  await startDaemon();
  await startBridge();
  for (const mode of ["missing", "forged", "duplicate", "malformed"]) {
    await scenario(`reject-${mode}-evidence`, async () => {
      await seed(); modelMode = mode;
      const result = await rest("/reflect", { project: "reflection-a", maxClusters: 1 });
      assert.equal(result.newInsights, 0, JSON.stringify(result));
      assert.equal(result.reinforced, 0);
      if (mode === "malformed") {
        assert.equal(result.failedClusters, 1, JSON.stringify(result));
        assert.equal(result.success, false);
      } else assert(result.rejectedInsights >= 1, JSON.stringify(result));
      assert.equal((await rest("/insights")).insights.length, 0);
    });
  }
  await scenario("source-changed-during-generation", async () => {
    await seed(); modelMode = "stale";
    const result = await rest("/reflect", { project: "reflection-a", maxClusters: 1 });
    assert.equal(result.newInsights, 0, JSON.stringify(result));
    assert.equal(result.rejectedInsights, 1, JSON.stringify(result));
    assert.equal((await rest("/insights")).insights.length, 0);
  });
  await scenario("provider-failure-is-visible", async () => {
    await seed(); modelMode = "provider-failure";
    const result = await rest("/reflect", { project: "reflection-a", maxClusters: 1 });
    assert.equal(result.newInsights, 0);
    assert.equal(result.failedClusters, 1, JSON.stringify(result));
    assert.equal(result.success, false);
    assert.equal((await rest("/insights")).insights.length, 0);
  });
  await scenario("empty-output-is-not-provider-failure", async () => {
    await seed(); modelMode = "empty";
    const result = await rest("/reflect", { project: "reflection-a", maxClusters: 1 });
    assert.equal(result.newInsights, 0);
    assert.equal(result.failedClusters, 0);
    assert.equal((await rest("/insights")).insights.length, 0);
  });
  await scenario("rest-citations-project-identity-and-reinforcement", async () => {
    await seed(); modelMode = "shared-evidence";
    for (const project of ["a", "b"]) {
      const result = await rest("/reflect", { project: `reflection-${project}`, maxClusters: 1 });
      assert.equal(result.newInsights, 1, JSON.stringify(result));
      assert.equal(result.reinforced, 0);
      const insights = (await rest(`/insights?project=reflection-${project}`)).insights;
      assert.equal(insights.length, 1); verifyEvidence(insights[0], project, false);
    }
    const insights = (await rest("/insights")).insights;
    assert.equal(insights.length, 2);
    assert.notEqual(insights[0].id, insights[1].id);
    const result = await rest("/reflect", { project: "reflection-a", maxClusters: 1 });
    assert.equal(result.newInsights, 0); assert.equal(result.reinforced, 1);
    const reinforced = (await rest("/insights?project=reflection-a")).insights[0];
    verifyEvidence(reinforced, "a", false); assert.equal(reinforced.reinforcements, 1);
  });
  await scenario("daemon-mcp-citations", async () => {
    await seed(); modelMode = "valid";
    const result = await directTool("memory_reflect", { project: "reflection-a", maxClusters: 1 });
    assert.equal(result.newInsights, 1, JSON.stringify(result));
    const listed = await directTool("memory_insight_list", { project: "reflection-a" });
    assert.equal(listed.insights.length, 1); verifyEvidence(listed.insights[0], "a");
  });
  await scenario("packed-stdio-citations-and-restart-persistence", async () => {
    await seed(); modelMode = "valid";
    const result = await bridge.call("memory_reflect", { project: "reflection-a", maxClusters: 1 });
    assert.equal(result.newInsights, 1, JSON.stringify(result));
    const listed = await bridge.call("memory_insight_list", { project: "reflection-a" });
    assert.equal(listed.insights.length, 1); verifyEvidence(listed.insights[0], "a");
    const before = (await rest("/insights?project=reflection-a")).insights;
    await stopDaemon(); await startDaemon();
    const after = (await rest("/insights?project=reflection-a")).insights;
    assert.deepEqual(after, before);
    const throughBridge = await bridge.call("memory_insight_list", { project: "reflection-a" });
    assert.deepEqual(throughBridge.insights, before);
  });
  await scenario("installed-package-unchanged", async () => assert.equal(packageDigest(), packageBefore));
}

try { await main(); }
catch (error) { results.push({ name: "setup", status: "fail", error: error.stack }); log(`FAIL setup: ${error.message}`); }
finally {
  if (bridge) { bridge.child.stdin.end(); kill(bridge.child.pid); }
  if (daemon) await stopDaemon().catch((error) => results.push({ name: "graceful-cleanup", status: "fail", error: error.message }));
  rememberPids();
  for (const pid of ownedPids) kill(pid, "SIGKILL");
  for (const child of children) kill(child.pid, "SIGKILL");
  modelServer?.closeAllConnections();
  if (modelServer?.listening) await new Promise((resolve) => modelServer.close(resolve));
  await sleep(100);
  const ports = port ? await Promise.all([...daemonPorts(), modelPort].filter(Boolean).map(async (value) => ({ port: value, closed: await portFree(value) }))) : [];
  if (ports.some((entry) => !entry.closed)) results.push({ name: "ports-closed", status: "fail", details: ports });
  const passed = results.length > 0 && results.every((result) => result.status === "pass");
  writeFileSync(join(out, "model-requests.json"), JSON.stringify(modelRequests, null, 2) + "\n");
  writeFileSync(join(out, "wire.json"), JSON.stringify(wire, null, 2) + "\n");
  const summary = { passed, artifact, node: process.version, platform: `${platform()}-${arch()}`, scope: "Unmodified packed CLI and standalone MCP, pinned engine, generated local secret, deterministic local model. Validates citation identity, not semantic entailment or project input filtering.", results, ports, runtimeRetained: options.keep ? root : null };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  if (!options.keep) rmSync(root, { recursive: true, force: true });
  log(`${passed ? "PASS" : "FAIL"}: ${results.filter((result) => result.status === "pass").length}/${results.length} scenarios; receipts: ${out}`);
  if (!passed) process.exitCode = 1;
}
