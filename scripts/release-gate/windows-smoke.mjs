#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const options = { out: null, tarball: null, keep: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (["--out", "--tarball"].includes(arg)) {
    assert(process.argv[i + 1] && !process.argv[i + 1].startsWith("--"), `${arg} requires a path`);
    options[arg.slice(2)] = resolve(process.argv[++i]);
  } else if (arg === "--keep") options.keep = true;
  else if (arg === "--help") {
    console.log("Usage: node scripts/release-gate/windows-smoke.mjs [--out empty-dir] [--tarball file.tgz] [--keep]\nBuilds, packs, installs and starts agentmemory under Windows Worker Compose, then stops it cleanly.");
    process.exit(0);
  } else throw new Error(`Unknown argument ${arg}`);
}
if (options.out && existsSync(options.out)) assert.equal(readdirSync(options.out).length, 0, "--out must be empty; existing evidence is never overwritten");
const out = options.out ?? mkdtempSync(join(tmpdir(), "agentmemory-windows-smoke-out-"));
mkdirSync(out, { recursive: true });
const root = mkdtempSync(join(tmpdir(), "agentmemory-windows-smoke-"));
const home = join(root, "home"), dataDir = join(root, "data"), pkgDir = join(root, "pkg");
for (const dir of [home, dataDir, pkgDir]) mkdirSync(dir, { recursive: true });
const results = [];
const children = new Set();
let artifactCli = null;
let worker = null;
const step = async (name, fn) => {
  try {
    results.push({ name, ok: true, ...(await fn()) });
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack ?? error).slice(0, 4000) });
    throw error;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const nodeBase = process.execPath;

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...opts.env }, cwd: opts.cwd ?? repo });
  return { status: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

const baseEnv = () => ({
  HOME: home,
  USERPROFILE: home,
  APPDATA: join(home, "AppData", "Roaming"),
  CI: "1",
  NO_COLOR: "1",
  AGENTMEMORY_DATA_DIR: dataDir,
  AGENTMEMORY_RUNTIME_DIR: join(root, "runtime"),
  III_REST_PORT: "3911",
  III_VIEWER_PORT: "3913",
  III_ENGINE_PORT: "49950",
  III_ENGINE_URL: "ws://127.0.0.1:49950",
  III_NAMESPACE: "agentmemory-3911",
  III_TELEMETRY_ENABLED: "false",
  OTEL_ENABLED: "false",
  EMBEDDING_PROVIDER: "none",
});

await step("build", () => {
  if (!options.tarball) {
    const build = run(npmCmd, ["run", "build"], { cwd: repo });
    assert.equal(build.status, 0, `npm run build failed: ${build.stderr.slice(-400)}`);
    const packDir = mkdtempSync(join(tmpdir(), "am-win-pack-"));
    const pack = run(npmCmd, ["pack", "--pack-destination", packDir], { cwd: repo });
    assert.equal(pack.status, 0, `npm pack failed: ${pack.stderr.slice(-400)}`);
    const tgz = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
    assert(tgz, "npm pack produced no tarball");
    options.tarball = join(packDir, tgz);
  }
  return { tarball: options.tarball };
});

await step("install", () => {
  const install = run(npmCmd, ["install", "--prefix", pkgDir, options.tarball, "--no-audit", "--no-fund"], { env: { CI: "1" } });
  assert.equal(install.status, 0, `npm install failed: ${install.stderr.slice(-400)}`);
  artifactCli = join(pkgDir, "node_modules", "@agentmemory", "agentmemory", "dist", "cli.mjs");
  assert(existsSync(artifactCli), `installed CLI missing at ${artifactCli}`);
  return { cli: artifactCli };
});


const getJson = (path) => new Promise((resolvePromise, reject) => {
  http.get({ host: "127.0.0.1", port: 3911, path, timeout: 4000 }, (res) => {
    let body = "";
    res.on("data", (c) => { body += c; });
    res.on("end", () => { try { resolvePromise(JSON.parse(body)); } catch { resolvePromise({ raw: body }); } });
  }).on("error", reject).on("timeout", function () { this.destroy(new Error("timeout")); });
});

async function startWorker() {
  worker = spawn(nodeBase, [artifactCli, "--port", "3911", "--data-dir", dataDir], {
    env: baseEnv(), cwd: root, detached: !isWindows, stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(worker);
  worker.text = "";
  const log = (chunk) => { worker.text = (worker.text + chunk).slice(-2_000_000); writeFileSync(join(out, "worker.log"), worker.text); };
  worker.stdout.on("data", log);
  worker.stderr.on("data", log);
  const t0 = Date.now();
  for (;;) {
    if (worker.exitCode !== null) throw new Error(`worker exited early:\n${worker.text.slice(-2000)}`);
    try { const livez = await getJson("/agentmemory/livez"); if (livez.status === "ok") return { waitedMs: Date.now() - t0 }; } catch {}
    if (Date.now() - t0 > 300_000) throw new Error(`livez timeout:\n${worker.text.slice(-2000)}`);
    await sleep(2000);
  }
}

function cli(...args) {
  return run(nodeBase, [artifactCli, ...args], { env: baseEnv(), cwd: root });
}

function leftoverProcesses() {
  if (!isWindows) return [];
  const ps = spawnSync("powershell.exe", [
    "-NoProfile", "-Command",
    `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${root.replace(/'/g, "''")}*' } | Select-Object -ExpandProperty ProcessId`,
  ], { encoding: "utf8" });
  return (ps.stdout ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function collectEvidence() {
  const skip = (path) => /secret|\.env$/i.test(path);
  for (const [source, target] of [
    [join(dataDir, "compose"), "compose"],
    [join(dataDir, "compose-state"), "compose-state"],
    [join(home, ".agentmemory"), "agentmemory-home"],
  ]) {
    if (!existsSync(source)) continue;
    try { cpSync(source, join(out, target), { recursive: true, filter: (path) => !skip(path) }); } catch {}
  }
}

let failure = null;
try {
await step("start", async () => startWorker());
await step("status lists workers", async () => {
  const res = cli("status", "--port", "3911");
  writeFileSync(join(out, "status.txt"), res.stdout + res.stderr);
  const workers = res.stdout.split(/\r?\n/).slice(res.stdout.split(/\r?\n/).findIndex((line) => line.trim() === "Compose workers:") + 1);
  assert(res.stdout.includes("Compose workers:"), `agentmemory status printed no Compose workers section:\n${res.stdout.slice(-800)}`);
  for (const name of ["state", "http", "agentmemory"]) {
    assert(workers.some((line) => line.trim().startsWith(`${name}:`)), `agentmemory status missing worker ${name}:\n${res.stdout.slice(-800)}`);
  }
  return { status: res.status };
});
await step("second start does not lose project ownership", async () => {
  const res = spawnSync(nodeBase, [artifactCli, "--port", "3911", "--data-dir", dataDir], {
    encoding: "utf8", env: baseEnv(), cwd: root, timeout: 60_000,
  });
  const combined = (res.stdout ?? "") + (res.stderr ?? "");
  writeFileSync(join(out, "second-start.txt"), combined);
  assert(!combined.includes("Could not verify the managed Compose project"), combined.slice(-800));
  return { status: res.status ?? "timeout" };
});
collectEvidence();
await step("stop cleans up", async () => {
  const stop = cli("stop", "--port", "3911");
  assert.equal(stop.status, 0, `stop failed: ${(stop.stdout + stop.stderr).slice(-400)}`);
  try { worker?.kill(); } catch {}
  await sleep(4000);
  const leftovers = leftoverProcesses();
  assert.equal(leftovers.length, 0, `leftover processes: ${leftovers.join(",")}`);
  return { leftovers: leftovers.length };
});
await step("restart reaches livez", async () => startWorker());
await step("final stop", async () => {
  const stop = cli("stop", "--port", "3911");
  assert.equal(stop.status, 0, `final stop failed: ${(stop.stdout + stop.stderr).slice(-400)}`);
  try { worker?.kill(); } catch {}
  return {};
});

} catch (error) {
  failure = error;
} finally {
  collectEvidence();
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  for (const c of children) { try { c.kill(); } catch {} }
  if (!options.keep && !failure) rmSync(root, { recursive: true, force: true });
}
if (failure) {
  console.error(`windows-smoke failed; artifacts in ${out}`);
  throw failure;
}
console.log(`windows-smoke: ${results.length} steps passed, artifacts in ${out}`);
