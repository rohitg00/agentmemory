#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { arch, homedir, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCommandCompleted, assertSupportedPlatform, killProcess, runCommand } from "./command.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const options = { tarball: null, out: null, dependencies: join(repo, "node_modules"), engine: null, skipBuild: false, keep: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (["--tarball", "--out", "--dependencies", "--engine"].includes(arg)) {
    assert(process.argv[i + 1] && !process.argv[i + 1].startsWith("--"), `${arg} requires a path`);
    options[arg.slice(2)] = resolve(process.argv[++i]);
  } else if (arg === "--skip-build") options.skipBuild = true;
  else if (arg === "--keep") options.keep = true;
  else if (arg === "--help") {
    console.log("Usage: node scripts/release-gate/summary-recovery.mjs [--tarball file.tgz] [--out empty-dir] [--dependencies node_modules] [--engine iii] [--skip-build] [--keep]\nTests a freshly extracted npm archive with cached dependencies and a loopback model fixture. No dependency installation or billable model calls.");
    process.exit(0);
  } else throw new Error(`Unknown argument ${arg}`);
}
assertSupportedPlatform();
if (options.out && existsSync(options.out)) assert.equal(readdirSync(options.out).length, 0, "--out must be empty; existing evidence is never overwritten");
const out = options.out ?? mkdtempSync(join(tmpdir(), "agentmemory-summary-gate-"));
mkdirSync(out, { recursive: true });
const root = mkdtempSync(join(tmpdir(), "am-summary-"));
const home = join(root, "home"), runtime = join(home, ".agentmemory"), dataDir = join(root, "data");
const modules = join(root, "runtime/node_modules"), pkgDir = join(modules, "@agentmemory/agentmemory");
const cli = join(pkgDir, "dist/cli.mjs");
for (const directory of [home, runtime, dataDir, pkgDir]) mkdirSync(directory, { recursive: true });
const children = new Set(), daemons = new Set(), ownedPids = new Set();
const artifact = {}, results = [], modelRequests = [], wire = [];
const began = Date.now(), sessionId = "summary-recovery-session", project = "summary-recovery-project";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
let port, modelPort, modelServer, secret, installed, packageBefore, boot = 0;
let heldCompression = null, failSummary = false, phase = "setup";
const markers = { BASE: "RECOVERED_BASE_COBALT", FINAL: "RECOVERED_FINAL_JUNIPER", LATE: "RECOVERED_LATE_QUARTZ" };
function log(message) {
  const line = `[${((Date.now() - began) / 1000).toFixed(1)}s] ${message}`;
  console.log(line); appendFileSync(join(out, "gate.log"), `${line}\n`);
}
function packageManifest() {
  const entries = [];
  function walk(directory, relative = "") {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) walk(join(directory, item.name), name);
      else if (item.isFile()) entries.push([name, sha(join(directory, item.name))]);
    }
  }
  walk(pkgDir); return entries.sort(([a], [b]) => a.localeCompare(b));
}
function cleanEnv() {
  return {
    HOME: home, USERPROFILE: home, PATH: [dirname(process.execPath), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter),
    TMPDIR: tmpdir(), CI: "1", NO_COLOR: "1", LANG: "C.UTF-8", III_TELEMETRY_ENABLED: "false",
    AGENTMEMORY_DATA_DIR: dataDir, AGENTMEMORY_RUNTIME_DIR: runtime,
    III_REST_PORT: String(port), III_VIEWER_PORT: String(port + 2),
    III_ENGINE_PORT: String(port + 46023), AGENTMEMORY_METRICS_PORT: String(port + 6353), AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
    EMBEDDING_PROVIDER: "none", AGENTMEMORY_AUTO_COMPRESS: "true", AGENTMEMORY_FINALIZE_IDLE_MS: "0",
    AGENTMEMORY_SESSION_SWEEP_ENABLED: "false", GRAPH_EXTRACTION_ENABLED: "false", CONSOLIDATION_ENABLED: "false", AGENTMEMORY_REFLECT: "false",
    OPENAI_API_KEY: "summary-gate-synthetic-key", OPENAI_BASE_URL: `http://127.0.0.1:${modelPort}`,
    OPENAI_MODEL: "summary-recovery-fixture", OPENAI_TIMEOUT_MS: "60000",
  };
}
async function command(executable, args, { name = "command", ...settings } = {}) {
  const result = await runCommand(executable, args, { env: cleanEnv(), cwd: root, children, ...settings });
  appendFileSync(join(out, `${name}.log`), result.output);
  assertCommandCompleted(result);
  assert.equal(result.code, 0, `${name}: ${result.output.slice(-3000)}`);
  return result.output;
}
async function poll(label, probe, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  let last;
  do {
    try { const result = await probe(); if (result) return result; } catch (error) { last = error; }
    await sleep(200);
  } while (Date.now() < until);
  throw new Error(`${label} timed out after ${timeoutMs}ms: ${last?.message ?? "condition not met"}`);
}
function portFree(value) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(value, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
const daemonPorts = () => port ? [port, port + 1, port + 2, port + 3, port + 6353, port + 46023] : [];
async function pickPorts() {
  for (let attempt = 0; attempt < 200; attempt++) {
    port = 12000 + Math.floor(Math.random() * 7000);
    if ((await Promise.all(daemonPorts().map(portFree))).every(Boolean)) return;
  }
  port = undefined; throw new Error("No free native engine port block");
}
async function preparePackage() {
  const dependencyRoot = realpathSync(options.dependencies);
  artifact.dependencies = { mode: "cached-symlinks", root: dependencyRoot, freshInstall: false };
  let tarball = options.tarball;
  if (!tarball) {
    const npmEnv = { ...process.env, npm_config_cache: join(root, "npm-cache") };
    if (!options.skipBuild) await command("npm", ["run", "build"], { cwd: repo, env: npmEnv, name: "build", timeoutMs: 600_000 });
    const packDir = join(out, "pack"); mkdirSync(packDir);
    await command("npm", ["pack", "--json", "--pack-destination", packDir], { cwd: repo, env: npmEnv, name: "pack" });
    const archives = readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
    assert.equal(archives.length, 1, "npm pack must produce exactly one archive in the fresh output directory");
    tarball = join(packDir, archives[0]);
  }
  artifact.tarball = tarball; artifact.tarballSha256 = sha(tarball);
  const names = (await command("tar", ["-tzf", tarball], { name: "archive-list" })).trim().split("\n");
  assert(names.every((name) => name.startsWith("package/") && !name.split("/").includes("..")), "Unexpected archive layout");
  await command("tar", ["-xzf", tarball, "--strip-components=1", "-C", pkgDir], { name: "extract" });
  for (const entry of readdirSync(dependencyRoot, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      const target = join(modules, entry.name); mkdirSync(target, { recursive: true });
      for (const name of readdirSync(join(dependencyRoot, entry.name))) {
        if (entry.name === "@agentmemory" && name === "agentmemory") continue;
        symlinkSync(join(dependencyRoot, entry.name, name), join(target, name), "dir");
      }
    } else symlinkSync(join(dependencyRoot, entry.name), join(modules, entry.name), "dir");
  }
  installed = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  artifact.dependencies.iiiSdkVersion = JSON.parse(readFileSync(join(modules, "iii-sdk/package.json"), "utf8")).version;
  assert.equal(artifact.dependencies.iiiSdkVersion, installed.dependencies["iii-sdk"], "Cached iii-sdk must match the packed dependency");
  artifact.version = installed.version; artifact.cliSha256 = sha(cli); artifact.workerSha256 = sha(join(pkgDir, "dist/index.mjs"));
  packageBefore = packageManifest();
  writeFileSync(join(out, "package-manifest.json"), JSON.stringify(packageBefore, null, 2) + "\n");
  const cache = process.env.AGENTMEMORY_GATE_CACHE ?? join(homedir(), ".cache/agentmemory-release-gate");
  const engine = options.engine ?? process.env.AGENTMEMORY_GATE_ENGINE ?? join(cache, `iii-${installed.dependencies["iii-sdk"]}-${platform()}-${arch()}`);
  assert(existsSync(engine), "Cached native engine missing; use --engine or AGENTMEMORY_GATE_ENGINE");
  const version = (await command(engine, ["--version"], { name: "engine-version" })).trim();
  assert(version.includes(installed.dependencies["iii-sdk"]), `Engine mismatch: ${version}`);
  artifact.engine = { version, sha256: sha(engine) };
  mkdirSync(join(runtime, "bin")); copyFileSync(engine, join(runtime, "bin/iii")); chmodSync(join(runtime, "bin/iii"), 0o755);
}
async function startModel() {
  modelServer = http.createServer(async (request, response) => {
    try {
      let raw = ""; for await (const chunk of request) raw += chunk;
      assert.equal(request.method, "POST"); assert.equal(request.url, "/v1/chat/completions");
      const body = JSON.parse(raw);
      const system = body.messages.find((message) => message.role === "system")?.content ?? "";
      const prompt = body.messages.find((message) => message.role === "user")?.content ?? "";
      const compress = system.includes("memory compression engine");
      const summarize = system.includes("session summarizer") || system.includes("partial summaries");
      assert(compress || summarize, `Unexpected model operation: ${system.slice(0, 100)}`);
      const item = { phase, boot, operation: compress ? "compression" : "summary", prompt };
      modelRequests.push(item);
      let content;
      if (compress) {
        const token = prompt.match(/GATE_INPUT_(BASE|FINAL|LATE)\b/)?.[1];
        assert(token, "Compression request lost the retained raw fixture");
        item.token = token;
        if (heldCompression === token) { item.outcome = "held-until-process-termination"; return; }
        const marker = markers[token];
        content = `<observation><type>decision</type><title>${marker}</title><facts><fact>The verified result is ${marker}.</fact></facts><narrative>The local fixture completed processing and verified ${marker} for the recovery scenario.</narrative><concepts><concept>recovery</concept></concepts><files><file>fixture.txt</file></files><importance>8</importance></observation>`;
      } else if (failSummary) {
        item.outcome = "malformed-summary"; content = "Fixture intentionally returns no summary XML.";
      } else {
        const present = Object.values(markers).filter((marker) => prompt.includes(marker));
        const narrative = present.length > 0
          ? `The completed session retained these verified outcomes: ${present.join(", ")}. Each outcome came from a processed observation.`
          : "This observation is still represented by its captured tool output. No completed fixture outcome is available yet.";
        content = `<summary><title>Verified recovery results</title><narrative>${narrative}</narrative><decisions><decision>Retain all verified outcomes across recovery.</decision></decisions><files><file>fixture.txt</file></files><concepts><concept>recovery</concept></concepts></summary>`;
      }
      item.response = content; item.outcome ??= "valid";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
    } catch (error) {
      modelRequests.push({ phase, boot, error: error.message });
      response.writeHead(500, { "content-type": "application/json" }); response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => { modelServer.once("error", reject); modelServer.listen(0, "127.0.0.1", resolve); });
  modelPort = modelServer.address().port;
}
async function rest(path, body, { auth = true, record = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth) headers.authorization = `Bearer ${secret}`;
  const response = await fetch(`http://127.0.0.1:${port}/agentmemory${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  assert(response.status >= 200 && response.status < 300, `${path}: ${response.status} ${text.slice(0, 500)}`);
  const json = JSON.parse(text);
  if (record) wire.push({ phase, boot, path, status: response.status, request: body, response: json });
  return json;
}
function rememberPids() {
  for (const name of ["worker", "iii"]) {
    try {
      const pid = Number(readFileSync(join(runtime, `${name}.pid`), "utf8").trim());
      if (Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid) ownedPids.add(pid);
    } catch {}
  }
  // Process loss takes the whole runtime: Compose, engine and workers. Killing only the
  // recorded pids left the daemon ports open on macOS CI, so collect the tree explicitly.
  try {
    const state = JSON.parse(readFileSync(join(runtime, "engine-state.json"), "utf8"));
    for (const pid of [state.composePid, state.enginePid]) if (Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid) ownedPids.add(pid);
  } catch {}
  try {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" }).split(/\r?\n/).map((row) => row.trim().split(/\s+/).map(Number)).filter((row) => row.length === 2 && row.every(Number.isFinite));
    let changed = true;
    while (changed) { changed = false; for (const [child, parent] of rows) if (ownedPids.has(parent) && !ownedPids.has(child) && child !== process.pid) { ownedPids.add(child); changed = true; } }
  } catch {}
}
async function startDaemon() {
  boot++;
  const child = spawn(process.execPath, [cli, "--port", String(port), "--data-dir", dataDir], { env: cleanEnv(), cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  assert(child.pid, "CLI did not spawn"); daemons.add(child); ownedPids.add(child.pid);
  const record = (chunk) => appendFileSync(join(out, `daemon-${boot}.log`), chunk);
  child.stdout.on("data", record); child.stderr.on("data", record);
  child.once("error", (error) => record(String(error))); child.once("close", () => daemons.delete(child));
  await poll("packaged native daemon startup", async () => {
    const live = await rest("/livez", undefined, { auth: false, record: false });
    return live.viewerPort || live.viewerSkipped;
  }, 90_000);
  secret = readFileSync(join(runtime, "secret"), "utf8").trim(); assert(secret);
  rememberPids(); log(`Native CLI boot ${boot} ready`);
}
async function crashDaemon() {
  // iii FileKV flushes asynchronously; allow its ordinary flush before simulating process loss.
  await sleep(5500); rememberPids();
  for (const pid of ownedPids) killProcess(pid);
  await poll("crashed daemon ports closed", async () => (await Promise.all(daemonPorts().map(portFree))).every(Boolean), 15_000);
  modelServer.closeAllConnections(); ownedPids.clear(); log(`Native CLI boot ${boot} terminated`);
}
function event(token) {
  return { hookType: "post_tool_use", sessionId, project, cwd: root, timestamp: new Date().toISOString(), eventId: `summary-gate-${token.toLowerCase()}`, data: { tool_name: "Bash", tool_input: { command: `printf GATE_INPUT_${token}` }, tool_response: `GATE_INPUT_${token}: tool completed` } };
}
async function snapshot(name) {
  const data = await rest("/export", undefined, { record: false });
  writeFileSync(join(out, `${name}.json`), JSON.stringify(data, null, 2) + "\n"); return data;
}
const observations = (data) => data.observations?.[sessionId] ?? [];
const summaryFor = (data) => data.summaries?.find((summary) => summary.sessionId === sessionId);
async function waitSummary(expected) {
  return poll(`summary contains ${expected.join(", ")}`, async () => {
    const data = await rest("/export", undefined, { record: false });
    const summary = summaryFor(data);
    return summary && expected.every((marker) => summary.narrative.includes(marker)) ? data : false;
  }, 125_000);
}
async function scenario(name, run) {
  phase = name; log(`RUN ${name}`); const start = Date.now();
  try { await run(); results.push({ name, status: "pass", ms: Date.now() - start }); log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: "fail", ms: Date.now() - start, error: error.stack }); throw error; }
}
async function main() {
  await pickPorts(); await startModel(); await preparePackage(); await startDaemon();
  const base = event("BASE"), final = event("FINAL"), late = event("LATE");
  await scenario("pending-compression-and-summary-survive-process-loss", async () => {
    await rest("/session/start", { sessionId, project, cwd: root }); await rest("/observe", base);
    await poll("baseline compression", async () => observations(await rest("/export", undefined, { record: false })).some((row) => row.title === markers.BASE && row.compression?.status === "complete"));
    assert.equal((await rest("/summarize", { sessionId })).success, true);
    await waitSummary([markers.BASE]); heldCompression = "FINAL";
    await rest("/observe", final);
    await poll("final provider request held", () => modelRequests.some((request) => request.token === "FINAL" && request.outcome === "held-until-process-termination"));
    assert.equal((await rest("/session/end", { sessionId, final: true })).ended, true);
    const before = await snapshot("before-compression-crash");
    assert.equal(before.sessions.find((session) => session.id === sessionId)?.status, "completed");
    const pending = observations(before).find((row) => row.compression?.status === "pending");
    assert(pending && JSON.stringify(pending.source).includes("GATE_INPUT_FINAL"), "Pending compression lost retained raw source");
    assert(!summaryFor(before)?.narrative.includes(markers.FINAL), "Final marker must require the blocked provider result");
    await crashDaemon(); heldCompression = null; await startDaemon();
    await waitSummary([markers.BASE, markers.FINAL]);
    const after = await snapshot("after-compression-restart");
    assert.equal(observations(after).length, 2); assert.equal(summaryFor(after).observationCount, 2);
    assert(observations(after).every((row) => row.compression?.status === "complete"));
  });
  await scenario("late-replay-and-summary-failure-recover-without-another-end", async () => {
    failSummary = true; await rest("/observe", late);
    await poll("late compression", async () => observations(await rest("/export", undefined, { record: false })).some((row) => row.title === markers.LATE && row.compression?.status === "complete"));
    await poll("summary provider failure", () => modelRequests.some((request) => request.phase === phase && request.outcome === "malformed-summary"), 65_000);
    await rest("/observe", late); await rest("/observe", final);
    const before = await snapshot("before-summary-crash");
    assert.equal(observations(before).length, 3); assert(!summaryFor(before)?.narrative.includes(markers.LATE));
    await crashDaemon(); failSummary = false; await startDaemon();
    await waitSummary(Object.values(markers));
    const after = await snapshot("after-summary-restart");
    assert.equal(after.sessions.find((session) => session.id === sessionId)?.status, "completed");
    assert.equal(observations(after).length, 3); assert.equal(summaryFor(after).observationCount, 3);
  });
  await scenario("stable-replay-after-restart-is-idempotent", async () => {
    const before = await snapshot("before-duplicate-replay");
    const modelCallsBefore = modelRequests.length;
    const replays = await Promise.all([rest("/observe", base), rest("/observe", final), rest("/observe", late), rest("/observe", late)]);
    assert(replays.every((replay) => replay.status === "duplicate"), "Stable capture IDs must replay as duplicates");
    // Cross an ordinary 30-second recovery tick to catch needless re-summarization.
    await sleep(35_000);
    const after = await snapshot("after-duplicate-replay");
    assert.equal(observations(after).length, 3);
    assert.deepEqual(observations(after).map((row) => row.id).sort(), observations(before).map((row) => row.id).sort());
    assert.deepEqual(summaryFor(after), summaryFor(before));
    assert.equal(modelRequests.length, modelCallsBefore, "Duplicate replays must not schedule more model work");
    assert.equal(wire.filter((entry) => entry.path === "/session/end").length, 1, "Recovery must not depend on a repeated session end");
    assert.equal(wire.filter((entry) => entry.path === "/summarize").length, 1, "Only the initial baseline may explicitly summarize");
    assert(!wire.some((entry) => /retry|repair/.test(entry.path)), "Recovery must use the autonomous runtime path");
    assert(!modelRequests.some((entry) => entry.error), "The fixture rejected an unexpected model request");
  });
  await scenario("installed-package-unchanged", async () => {
    assert.deepEqual(packageManifest(), packageBefore); assert.equal(sha(artifact.tarball), artifact.tarballSha256);
  });
}
function killAll() {
  rememberPids(); for (const pid of ownedPids) killProcess(pid); for (const pid of children) killProcess(pid);
  for (const child of daemons) { killProcess(child.pid); child.stdout.destroy(); child.stderr.destroy(); }
  modelServer?.closeAllConnections();
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => { killAll(); process.exit(1); });
process.once("exit", killAll);
try { await main(); }
catch (error) {
  if (!results.some((result) => result.status === "fail")) results.push({ name: "setup", status: "fail", error: error.stack });
  log(`FAIL: ${error.message}`);
  if (boot && secret) await snapshot("failure-state").catch(() => {});
}
finally {
  if (boot) await command(process.execPath, [cli, "stop", "--port", String(port)], { name: "stop", timeoutMs: 20_000 }).catch((error) => results.push({ name: "graceful-stop", status: "fail", error: error.message }));
  killAll();
  if (modelServer?.listening) await new Promise((resolve) => modelServer.close(resolve));
  await poll("final port cleanup", async () => (await Promise.all([...daemonPorts(), modelPort].filter(Boolean).map(portFree))).every(Boolean), 15_000).catch((error) => results.push({ name: "cleanup", status: "fail", error: error.message }));
  const ports = await Promise.all([...daemonPorts(), modelPort].filter(Boolean).map(async (value) => ({ port: value, closed: await portFree(value) })));
  const passed = results.length > 0 && results.every((result) => result.status === "pass") && ports.every((entry) => entry.closed);
  writeFileSync(join(out, "model-requests.json"), JSON.stringify(modelRequests, null, 2) + "\n");
  writeFileSync(join(out, "wire.json"), JSON.stringify(wire, null, 2) + "\n");
  writeFileSync(join(out, "summary.json"), JSON.stringify({ passed, artifact, node: process.version, platform: `${platform()}-${arch()}`, scope: "Fresh npm archive, cached dependency symlinks, native iii engine, deterministic loopback model. No live model or clean dependency-install claim.", results, ports, boots: boot, modelRequests: modelRequests.length, runtimeRetained: options.keep ? root : null }, null, 2) + "\n");
  process.removeListener("exit", killAll);
  if (!options.keep) rmSync(root, { recursive: true, force: true });
  log(`${passed ? "PASS" : "FAIL"}: receipts ${out}`); if (!passed) process.exitCode = 1;
}
