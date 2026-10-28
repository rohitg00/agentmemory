#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import { arch, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCommandCompleted, assertSupportedPlatform, runCommand } from "./command.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const options = { tarball: null, out: null, dependencies: join(repo, "node_modules"), skipBuild: false, keep: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (["--tarball", "--out", "--dependencies"].includes(arg)) {
    assert(process.argv[i + 1] && !process.argv[i + 1].startsWith("--"), `${arg} requires a path`);
    options[arg.slice(2)] = resolve(process.argv[++i]);
  } else if (arg === "--skip-build") options.skipBuild = true;
  else if (arg === "--keep") options.keep = true;
  else if (arg === "--help") {
    console.log("Usage: node scripts/release-gate/cli-diagnostics.mjs [--tarball file.tgz] [--out empty-dir] [--dependencies node_modules] [--skip-build] [--keep]\nRuns the packed CLI's status and doctor against a loopback flags endpoint for each embeddingProvider shape. No engine, no model calls.");
    process.exit(0);
  } else throw new Error(`Unknown argument ${arg}`);
}
assertSupportedPlatform();
if (options.out && existsSync(options.out)) assert.equal(readdirSync(options.out).length, 0, "--out must be empty; existing evidence is never overwritten");
const out = options.out ?? mkdtempSync(join(tmpdir(), "agentmemory-cli-diagnostics-gate-"));
mkdirSync(out, { recursive: true });
const root = mkdtempSync(join(tmpdir(), "am-cli-diagnostics-"));
const home = join(root, "home"), modules = join(root, "runtime/node_modules"), pkgDir = join(modules, "@agentmemory/agentmemory");
const cli = join(pkgDir, "dist/cli.mjs");
for (const directory of [home, pkgDir]) mkdirSync(directory, { recursive: true });
const children = new Set(), results = [], artifact = {};
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

const CASES = [
  { name: "provider description", flags: { embeddingProvider: "openrouter (1536 dims)" }, label: "openrouter (1536 dims)" },
  { name: "padded provider", flags: { embeddingProvider: "  local (384 dims)  " }, label: "local (384 dims)" },
  { name: "none", flags: { embeddingProvider: "none" }, label: null },
  { name: "padded none", flags: { embeddingProvider: "  none  " }, label: null },
  { name: "empty", flags: { embeddingProvider: "" }, label: null },
  { name: "whitespace", flags: { embeddingProvider: "  \t  " }, label: null },
  { name: "missing", flags: {}, label: null },
  { name: "non-string", flags: { embeddingProvider: 1536 }, label: null },
];
let current = CASES[0];
const server = http.createServer((request, response) => {
  const path = new URL(request.url, "http://loopback").pathname;
  const bodies = {
    "/agentmemory/health": { status: "healthy", version: "gate", health: { memory: { heapUsed: 0 }, uptimeSeconds: 1 } },
    "/agentmemory/sessions": { sessions: [] },
    "/agentmemory/graph/stats": { totalNodes: 0, totalEdges: 0 },
    "/agentmemory/memories": { latestCount: 0 },
    "/agentmemory/diagnostics/followup": {},
    "/agentmemory/config/flags": { provider: "llm", flags: [], ...current.flags },
  };
  const body = bodies[path];
  response.writeHead(body ? 200 : 404, { "content-type": "application/json" });
  response.end(JSON.stringify(body ?? { error: "not found" }));
});

function cleanEnv(url) {
  return {
    HOME: home, USERPROFILE: home, PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter),
    TMPDIR: tmpdir(), CI: "1", NO_COLOR: "1", LANG: "C.UTF-8", III_TELEMETRY_ENABLED: "false", AGENTMEMORY_URL: url,
  };
}
async function command(executable, args, { name, env = cleanEnv(""), cwd = root, timeoutMs = 90_000 }) {
  const result = await runCommand(executable, args, { env, cwd, children, timeoutMs });
  writeFileSync(join(out, `${name}.log`), result.output);
  assertCommandCompleted(result);
  assert.equal(result.code, 0, `${name}: ${result.output.slice(-3000)}`);
  return result.output;
}
async function preparePackage() {
  const dependencyRoot = realpathSync(options.dependencies);
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
  artifact.version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
  artifact.cliSha256 = sha(cli);
}

try {
  await preparePackage();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const entry of CASES) {
    current = entry;
    try {
      const slug = entry.name.replace(/\s+/g, "-");
      const status = await command(process.execPath, [cli, "status"], { name: `status-${slug}`, env: cleanEnv(url) });
      const embeddings = status.split("\n").find((line) => line.includes("Embeddings:")) ?? "";
      if (entry.label) assert(embeddings.includes(`✓ ${entry.label}`), `status must name the provider, got: ${embeddings}`);
      else assert(embeddings.includes("bm25-only") && !embeddings.includes("✓"), `status must report bm25-only, got: ${embeddings}`);
      const doctor = await command(process.execPath, [cli, "doctor", "--dry-run"], { name: `doctor-${slug}`, env: cleanEnv(url) });
      const check = doctor.split("\n").find((line) => line.includes("Embedding provider")) ?? "";
      assert(check.includes(entry.label ? "✓" : "✗"), `doctor must ${entry.label ? "pass" : "fail"} the embedding check, got: ${check}`);
      results.push({ name: entry.name, status: "pass", statusLine: embeddings.trim(), doctorLine: check.trim() });
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      results.push({ name: entry.name, status: "fail", error: error.message });
      console.log(`FAIL ${entry.name}: ${error.message}`);
    }
  }
} catch (error) {
  results.push({ name: "setup", status: "fail", error: error.stack });
  console.log(`FAIL setup: ${error.message}`);
} finally {
  server.closeAllConnections?.();
  if (server.listening) await new Promise((done) => server.close(done));
  const passed = results.length === CASES.length && results.every((result) => result.status === "pass");
  writeFileSync(join(out, "summary.json"), JSON.stringify({ passed, artifact, node: process.version, platform: `${platform()}-${arch()}`, scope: "Packed CLI rendering of synthetic loopback flags responses with cached dependency symlinks. Does not validate provider creation or API reporting. No engine or model.", results, runtimeRetained: options.keep ? root : null }, null, 2) + "\n");
  if (!options.keep) rmSync(root, { recursive: true, force: true });
  console.log(`${passed ? "PASS" : "FAIL"}: receipts ${out}`);
  if (!passed) process.exitCode = 1;
}
