#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { arch, homedir, platform, tmpdir } from "node:os";
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
const nodeBase = process.execPath;
const npmCli = [
  process.env.npm_execpath,
  join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
].find((candidate) => candidate && candidate.endsWith(".js") && existsSync(candidate));
assert(npmCli, "could not locate npm-cli.js next to this Node binary");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...opts.env }, cwd: opts.cwd ?? repo });
  return { status: res.status ?? -1, stdout: res.stdout ?? "", stderr: `${res.stderr ?? ""}${res.error ? `\n${res.error.message}` : ""}` };
}

const npm = (args, opts) => run(nodeBase, [npmCli, ...args], opts);

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

const III_ASSETS = {
  "darwin:arm64": "iii-aarch64-apple-darwin.tar.gz",
  "darwin:x64": "iii-x86_64-apple-darwin.tar.gz",
  "linux:x64": "iii-x86_64-unknown-linux-gnu.tar.gz",
  "linux:arm64": "iii-aarch64-unknown-linux-gnu.tar.gz",
  "win32:x64": "iii-x86_64-pc-windows-msvc.zip",
  "win32:arm64": "iii-aarch64-pc-windows-msvc.zip",
};

function pinnedSha256(asset) {
  const source = readFileSync(join(repo, "src", "cli", "engine-install.ts"), "utf8");
  const match = source.match(new RegExp(`"${asset.replace(/[.]/g, "\\.")}": "([0-9a-f]{64})"`));
  return match ? match[1] : null;
}

function provisionEngine() {
  const installed = JSON.parse(readFileSync(join(pkgDir, "node_modules", "@agentmemory", "agentmemory", "package.json"), "utf8"));
  const version = installed.dependencies["iii-sdk"];
  const asset = III_ASSETS[`${platform()}:${arch()}`];
  assert(asset, `no iii asset mapping for ${platform()}/${arch()}`);
  const cacheDir = process.env.AGENTMEMORY_GATE_CACHE ?? join(homedir(), ".cache", "agentmemory-release-gate");
  const binary = isWindows ? "iii.exe" : "iii";
  const cached = join(cacheDir, `iii-${version}-${platform()}-${arch()}${isWindows ? ".exe" : ""}`);
  if (!existsSync(cached)) {
    const expected = pinnedSha256(asset);
    assert(expected, `no pinned sha256 for ${asset}`);
    const url = `https://github.com/iii-hq/iii/releases/download/iii/v${version}/${asset}`;
    mkdirSync(cacheDir, { recursive: true });
    const archive = join(cacheDir, asset);
    const dl = run("curl", ["-fsSL", "--connect-timeout", "15", "-o", archive, url]);
    assert.equal(dl.status, 0, `engine download failed: ${dl.stderr.slice(-300)}`);
    const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
    assert.equal(actual, expected, `engine sha256 mismatch: expected ${expected}, got ${actual}`);
    const extract = run("tar", ["-xf", archive, "-C", cacheDir]);
    assert.equal(extract.status, 0, `engine extract failed: ${extract.stderr.slice(-300)}`);
    rmSync(archive, { force: true });
    const extracted = join(cacheDir, binary);
    assert(existsSync(extracted), `${binary} missing after extracting ${asset}: ${readdirSync(cacheDir).join(",")}`);
    renameSync(extracted, cached);
    if (!isWindows) chmodSync(cached, 0o755);
  }
  const binDir = join(home, ".agentmemory", "bin");
  mkdirSync(binDir, { recursive: true });
  copyFileSync(cached, join(binDir, binary));
  if (!isWindows) chmodSync(join(binDir, binary), 0o755);
  return { engine: join(binDir, binary), version, cached };
}

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
  let exited = null;
  worker.on("close", (code) => { exited = code; });
  for (;;) {
    try { const livez = await getJson("/agentmemory/livez"); if (livez.status === "ok") return { waitedMs: Date.now() - t0, cliExit: exited }; } catch {}
    if (exited !== null && exited !== 0) throw new Error(`worker exited ${exited}:\n${worker.text.slice(-2000)}`);
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
    [
      `$byPath = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${root.replace(/'/g, "''")}*' } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`,
      `$byPort = Get-NetTCPConnection -State Listen -LocalPort 3911,3913,49950 -ErrorAction SilentlyContinue | ForEach-Object { "$($_.OwningProcess) port:$($_.LocalPort)" }`,
      `@($byPath) + @($byPort) | Where-Object { $_ }`,
    ].join("; "),
  ], { encoding: "utf8" });
  return (ps.stdout ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function collectEvidence() {
  const wanted = (name) => name === "worker-compose.yaml" || name === "state.json" || name.endsWith(".log");
  const denied = (name) => /secret/i.test(name) || name.endsWith(".env");
  const walk = (dir, sink) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "config") continue;
        walk(path, sink);
      } else if (wanted(entry.name) && !denied(entry.name)) {
        sink.push(path);
      }
    }
  };
  const sources = [join(dataDir, "compose"), join(dataDir, "compose-state"), join(root, "runtime")];
  const copied = [];
  for (const source of sources) {
    if (!existsSync(source)) continue;
    const found = [];
    try { walk(source, found); } catch {}
    for (const file of found) {
      const dest = join(out, `${copied.length}-${file.split(/[\\/]/).pop()}`);
      try { copyFileSync(file, dest); copied.push(file); } catch {}
    }
  }
  return copied;
}

let failure = null;
try {
await step("build", () => {
  if (!options.tarball) {
    const build = npm(["run", "build"], { cwd: repo });
    assert.equal(build.status, 0, `npm run build failed: ${build.stderr.slice(-400)}`);
    const packDir = mkdtempSync(join(tmpdir(), "am-win-pack-"));
    const pack = npm(["pack", "--pack-destination", packDir], { cwd: repo });
    assert.equal(pack.status, 0, `npm pack failed: ${pack.stderr.slice(-400)}`);
    const tgz = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
    assert(tgz, "npm pack produced no tarball");
    options.tarball = join(packDir, tgz);
  }
  return { tarball: options.tarball };
});
await step("install", () => {
  const install = npm(["install", "--prefix", pkgDir, options.tarball, "--no-audit", "--no-fund"], { env: { CI: "1" } });
  assert.equal(install.status, 0, `npm install failed: ${install.stderr.slice(-400)}`);
  artifactCli = join(pkgDir, "node_modules", "@agentmemory", "agentmemory", "dist", "cli.mjs");
  assert(existsSync(artifactCli), `installed CLI missing at ${artifactCli}`);
  return { cli: artifactCli };
});
await step("engine", () => provisionEngine());
await step("start", async () => startWorker());
await step("status lists workers", async () => {
  const res = cli("status", "--port", "3911");
  writeFileSync(join(out, "status.txt"), res.stdout + res.stderr);
  let containers = null;
  const t0 = Date.now();
  for (;;) {
    const stateFiles = [];
    const stateRoot = join(dataDir, "compose-state");
    const findState = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) findState(path);
        else if (entry.name === "state.json") stateFiles.push(path);
      }
    };
    try { findState(stateRoot); } catch {}
    for (const file of stateFiles) {
      try {
        const state = JSON.parse(readFileSync(file, "utf8"));
        containers = state.containers ?? containers;
      } catch {}
    }
    if (containers && ["state", "http", "agentmemory"].every((n) => containers[n]?.status === "ready")) break;
    if (Date.now() - t0 > 90_000) break;
    await sleep(3000);
  }
  assert(containers, `no compose state.json with containers after 90s`);
  for (const name of ["state", "http", "agentmemory"]) {
    assert.equal(containers[name]?.status, "ready", `compose worker ${name} not ready: ${JSON.stringify(containers[name])}`);
  }
  return { cliStatus: res.status };
});
await step("second start does not lose project ownership", async () => {
  const res = spawnSync(nodeBase, [artifactCli, "--port", "3911", "--data-dir", dataDir], {
    encoding: "utf8", env: baseEnv(), cwd: root, timeout: 60_000,
  });
  const combined = (res.stdout ?? "") + (res.stderr ?? "");
  writeFileSync(join(out, "second-start.txt"), combined);
  assert(res.status !== null, `second start timed out:\n${combined.slice(-800)}`);
  assert(!combined.includes("Could not verify the managed Compose project"), combined.slice(-800));
  return { status: res.status };
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
  if (artifactCli && existsSync(artifactCli)) {
    try { cli("stop", "--port", "3911"); } catch {}
    await sleep(2000);
  }
  for (const c of children) { try { c.kill(); } catch {} }
  if (!options.keep && !failure) rmSync(root, { recursive: true, force: true });
}
if (failure) {
  console.error(`windows-smoke failed; artifacts in ${out}`);
  throw failure;
}
console.log(`windows-smoke: ${results.length} steps passed, artifacts in ${out}`);
