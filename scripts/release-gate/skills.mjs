#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const options = { node: process.execPath };
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  assert(["--package-root", "--engine", "--skills-cli", "--mcp-cli", "--out", "--node"].includes(key), `Unknown argument ${key}`);
  assert(process.argv[i + 1], `Missing value for ${key}`);
  options[key.slice(2)] = resolve(process.argv[++i]);
}
for (const key of ["package-root", "engine", "skills-cli", "out"]) assert(options[key], `--${key} is required`);
const root = options.out;
assert(!existsSync(root), "Use a fresh output directory");
const pkg = options["package-root"];
const cli = join(pkg, "dist/cli.mjs");
const home = join(root, "daemon-home");
const cwd = join(root, "project");
for (const dir of [home, cwd, join(home, ".agentmemory/bin"), join(root, "tmp")]) mkdirSync(dir, { recursive: true });
copyFileSync(options.engine, join(home, ".agentmemory/bin/iii"));
chmodSync(join(home, ".agentmemory/bin/iii"), 0o755);
const baseEnv = (userHome) => ({ HOME: userHome, USERPROFILE: userHome, PATH: `${dirname(options.node)}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin`, XDG_CONFIG_HOME: join(userHome, ".config"), XDG_CACHE_HOME: join(userHome, ".cache"), TMPDIR: join(root, "tmp"), CI: "1", NO_COLOR: "1", DO_NOT_TRACK: "1", III_TELEMETRY_ENABLED: "false" });
const env = { ...baseEnv(home), AGENTMEMORY_TOOLS: "all", AGENTMEMORY_AUTO_COMPRESS: "false", AGENTMEMORY_INJECT_CONTEXT: "false", AGENTMEMORY_READY_TIMEOUT_MS: "60000", AGENTMEMORY_ENGINE_READY_TIMEOUT_MS: "60000" };
const receipts = [];
const children = new Set();
const hashes = Object.fromEntries(["dist/cli.mjs", "dist/standalone.mjs", "integrations/hermes/__init__.py", "integrations/openclaw/plugin.mjs"].map((file) => [file, digest(join(pkg, file))]));
function digest(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function kill(pid, signal = "SIGKILL") { try { process.kill(-pid, signal); } catch {} try { process.kill(pid, signal); } catch {} }
function run(executable, args, childEnv, name, input) {
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { cwd, env: childEnv, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    children.add(child.pid);
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", fail);
    const timeout = setTimeout(() => kill(child.pid), 90000);
    child.on("close", (code) => {
      clearTimeout(timeout); children.delete(child.pid);
      writeFileSync(join(root, `${name}.log`), stdout + stderr);
      if (code === 0) done(stdout); else fail(new Error(`${name} exited ${code}; see ${name}.log`));
    });
    child.stdin.end(input);
  });
}
function portFree(port) {
  return new Promise((done) => {
    const server = net.createServer();
    server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
  });
}
async function waitFor(predicate, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(200); }
  throw new Error("Timed out waiting for isolated daemon");
}
let port, ports;
for (let i = 0; i < 200; i++) {
  const candidate = 12000 + Math.floor(Math.random() * 6000);
  const block = [candidate, candidate + 1, candidate + 2, candidate + 3, candidate + 6353, candidate + 46023];
  if ((await Promise.all(block.map(portFree))).every(Boolean)) { port = candidate; ports = block; break; }
}
assert(port, "No isolated port block available");
const base = `http://127.0.0.1:${port}`;
let secret, daemon, bridge, bridgeError = "";
async function rest(path, body, auth = true) {
  const response = await fetch(`${base}/agentmemory${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${secret}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}
async function check(name, fn) {
  const details = await fn(); receipts.push({ name, success: true, ...(details ?? {}) }); console.log(`PASS ${name}`);
}
function parseMcp(result) {
  assert(!result.error && !result.isError, JSON.stringify(result));
  return JSON.parse(result.content.map((item) => item.text ?? "").join("\n"));
}
let completed = false, failure;
try {
  const sourceSkills = join(pkg, "plugin/skills");
  const names = readdirSync(sourceSkills).filter((name) => existsSync(join(sourceSkills, name, "SKILL.md"))).sort();
  for (const [agent, folder] of [["hermes-agent", ".hermes"], ["openclaw", ".openclaw"]]) {
    await check(`${agent} installs self-contained skills from the package`, async () => {
      const userHome = join(root, agent); mkdirSync(userHome, { recursive: true });
      await run(options.node, [options["skills-cli"], "add", pkg, "--skill", "*", "--agent", agent, "--global", "--yes", "--copy"], baseEnv(userHome), `${agent}-skills-install`);
      for (const name of names) {
        const skillRoot = join(userHome, folder, "skills", name);
        assert(!lstatSync(skillRoot).isSymbolicLink(), `${name} must be an independent copy`);
        assert.equal(digest(join(skillRoot, "SKILL.md")), digest(join(sourceSkills, name, "SKILL.md")));
        const body = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
        for (const ref of body.match(/[\w./-]*TROUBLESHOOTING\.md/g) ?? []) {
          const target = resolve(skillRoot, ref);
          assert(target.startsWith(skillRoot + sep) && existsSync(target), `${name}: broken support reference ${ref}`);
        }
      }
      return { skills: names.length };
    });
  }
  const fd = openSync(join(root, "daemon.log"), "w");
  daemon = spawn(options.node, [cli, "--port", String(port), "--data-dir", join(root, "state")], { cwd, env, detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd); children.add(daemon.pid);
  await waitFor(async () => {
    assert(daemon.signalCode === null && (daemon.exitCode === null || daemon.exitCode === 0), `Daemon launcher exited ${daemon.signalCode ?? daemon.exitCode}`);
    try {
      secret = readFileSync(join(home, ".agentmemory/secret"), "utf8").trim();
      return secret.length > 0 && (await rest("/health")).status === 200;
    } catch { return false; }
  });
  secret = readFileSync(join(home, ".agentmemory/secret"), "utf8").trim();
  assert(secret.length > 0);
  for (const file of ["iii.pid", "worker.pid"]) {
    const path = join(home, ".agentmemory", file);
    if (existsSync(path)) children.add(Number(readFileSync(path, "utf8")));
  }
  await check("REST skill example authenticates with the generated local secret", async () => {
    assert.equal((await rest("/remember", { content: "must not persist without auth" }, false)).status, 401);
    assert.equal((await rest("/smart-search", { query: "auth" }, false)).status, 401);
    const skill = readFileSync(join(sourceSkills, "agentmemory-rest-api/SKILL.md"), "utf8");
    const example = skill.match(/```bash\n([\s\S]*?)```/)[1].replaceAll("http://localhost:3111", base);
    await run("/bin/bash", ["-e"], env, "rest-skill-example", example);
    const found = await rest("/smart-search", { query: "JWT refresh rotation", targetLayer: "memory" });
    assert.equal(found.status, 200);
    assert(JSON.stringify(found.body).includes("JWT refresh rotation"));
  });
  bridge = spawn(options.node, [options["mcp-cli"] || join(pkg, "dist/standalone.mjs")], { cwd, env: { ...env, AGENTMEMORY_URL: base }, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  children.add(bridge.pid);
  let buffer = "", nextId = 1;
  const pending = new Map();
  bridge.stderr.on("data", (chunk) => { bridgeError += chunk; });
  bridge.stdout.on("data", (chunk) => {
    buffer += chunk;
    let boundary;
    while ((boundary = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
      try { const response = JSON.parse(line); pending.get(response.id)?.(response); } catch {}
    }
  });
  const rpc = (method, params) => new Promise((done, fail) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`MCP timeout: ${method}`)); }, 15000);
    pending.set(id, (response) => { clearTimeout(timer); pending.delete(id); response.error ? fail(new Error(JSON.stringify(response.error))) : done(response.result); });
    bridge.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  const call = async (name, args = {}) => parseMcp(await rpc("tools/call", { name, arguments: args }));
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "packaged-skill-contracts", version: "1" } });
  bridge.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  await check("MCP inventory advertises the arguments used by skills", async () => {
    const { tools } = await rpc("tools/list", {});
    for (const name of ["memory_save", "memory_smart_search", "memory_governance_delete", "memory_sessions"]) assert(tools.some((tool) => tool.name === name));
    assert(!tools.some((tool) => tool.name === "memory_observe"));
    const sessionFields = tools.find((tool) => tool.name === "memory_sessions").inputSchema.properties;
    for (const name of ["project", "agentId", "limit", "cursor"]) assert(sessionFields[name]);
    return { tools: tools.length };
  });
  await check("a rejected MCP credential cannot become a successful local save or recall", async () => {
    const userHome = join(root, "wrong-secret-client");
    mkdirSync(userHome, { recursive: true });
    const requests = [
      { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "wrong-secret-fixture", version: "1" } } },
      { id: 2, method: "tools/list", params: {} },
      { id: 3, method: "tools/call", params: { name: "memory_save", arguments: { content: "REJECTED_CREDENTIAL_FIXTURE must not persist" } } },
      { id: 4, method: "tools/call", params: { name: "memory_recall", arguments: { query: "REJECTED_CREDENTIAL_FIXTURE" } } },
    ].map((request) => JSON.stringify({ jsonrpc: "2.0", ...request })).join("\n") + "\n";
    const output = await run(options.node, [options["mcp-cli"] || join(pkg, "dist/standalone.mjs")], {
      ...baseEnv(userHome), AGENTMEMORY_URL: base, AGENTMEMORY_SECRET: "synthetic-intentionally-wrong-credential",
    }, "wrong-secret-mcp", requests);
    const responses = new Map(output.trim().split("\n").map((line) => { const response = JSON.parse(line); return [response.id, response]; }));
    assert.match(responses.get(2)?.error?.message ?? "", /401/);
    for (const id of [3, 4]) {
      assert.equal(responses.get(id)?.result?.isError, true);
      assert.match(JSON.stringify(responses.get(id)?.result?.content), /401/);
    }
    assert(!existsSync(join(userHome, ".agentmemory/standalone.json")), "rejected requests must not create local fallback data");
    const result = await rest("/smart-search", { query: "REJECTED_CREDENTIAL_FIXTURE", targetLayer: "memory" });
    assert(!JSON.stringify(result.body).includes("REJECTED_CREDENTIAL_FIXTURE must not persist"));
  });
  const scope = { project: "skill project/a & branch#1", agentId: "skill-agent/a" };
  const memoryContent = "AMBER_QUASAR_FIXTURE uses violet checkpoint rotation. " + "Fixture implementation details. ".repeat(10) + "Full recall evidence: ORCHID_7291.";
  let memoryId;
  await check("remember and recall preserve project and agent on the wire", async () => {
    const saved = await call("memory_save", { content: memoryContent, concepts: "amber-quasar,violet-checkpoint", files: "src/fixture.ts", ...scope });
    memoryId = saved.id ?? saved.memory?.id; assert(memoryId);
    const recalled = await call("memory_smart_search", { query: "AMBER_QUASAR_FIXTURE", targetLayer: "memory", ...scope });
    assert(JSON.stringify(recalled).includes(memoryId));
    const expanded = await call("memory_smart_search", { expandIds: memoryId, targetLayer: "memory", ...scope });
    assert(JSON.stringify(expanded).includes("ORCHID_7291"));
    const full = await call("memory_recall", { query: "AMBER_QUASAR_FIXTURE", format: "full", token_budget: 1200, targetLayer: "memory", ...scope });
    assert(JSON.stringify(full).includes("ORCHID_7291"));
    const foreign = await call("memory_smart_search", { query: "AMBER_QUASAR_FIXTURE", targetLayer: "memory", ...scope, agentId: "foreign-agent" });
    assert(!JSON.stringify(foreign).includes(memoryId));
    const foreignProject = await call("memory_smart_search", { query: "AMBER_QUASAR_FIXTURE", targetLayer: "memory", ...scope, project: "foreign-project" });
    assert(!JSON.stringify(foreignProject).includes(memoryId));
  });
  await check("session history filters before pagination across REST and both MCP transports", async () => {
    for (const [sessionId, project, agentId] of [["older", scope.project, scope.agentId], ["newer", scope.project, scope.agentId], ["foreign-project", "other", scope.agentId], ["foreign-agent", scope.project, "other"]]) {
      assert.equal((await rest("/session/start", { sessionId, project, agentId, cwd: join(cwd, sessionId) })).status, 200);
      await sleep(10);
    }
    let cursor;
    for (const expected of ["newer", "older"]) {
      const args = { ...scope, limit: 1, ...(cursor ? { cursor } : {}) };
      const direct = await rest("/mcp/call", { name: "memory_sessions", arguments: args });
      assert.equal(direct.status, 200);
      const directPage = parseMcp(direct.body);
      const stdioPage = await call("memory_sessions", args);
      const restPage = await rest(`/sessions?${new URLSearchParams({ ...args, limit: "1" })}`);
      assert.deepEqual(stdioPage, directPage);
      assert.deepEqual(stdioPage, restPage.body);
      assert.deepEqual(stdioPage.sessions.map((item) => item.id), [expected]);
      cursor = stdioPage.nextCursor;
    }
    assert.equal(cursor, null);
    const invalid = await rest("/mcp/call", { name: "memory_sessions", arguments: { project: " " } });
    assert.equal(invalid.status, 400);
  });
  await check("forget uses CSV memory IDs and reports actual deletion counts", async () => {
    const deleted = await call("memory_governance_delete", { memoryIds: `${memoryId},missing-fixture-id`, reason: "Synthetic packaged skill test" });
    assert.equal(deleted.deleted, 1);
    assert.deepEqual(deleted.notFound, ["missing-fixture-id"]);
    assert.equal(deleted.failed, 0);
    const recalled = await call("memory_smart_search", { query: "AMBER_QUASAR_FIXTURE", targetLayer: "memory", ...scope });
    assert(!JSON.stringify(recalled).includes(memoryId));
  });
  completed = true;
} catch (error) { failure = error.stack; process.exitCode = 1; console.error(error.message); }
finally {
  if (bridge) bridge.stdin.end();
  if (daemon) {
    try { await run(options.node, [cli, "stop", "--port", String(port)], { ...env, AGENTMEMORY_URL: base }, "daemon-stop"); } catch {}
  }
  for (const pid of children) if (Number.isInteger(pid) && pid > 1) kill(pid);
  let portsClosed = false;
  try { await waitFor(async () => (await Promise.all(ports.map(portFree))).every(Boolean), 10000); portsClosed = true; } catch {}
  const packageUnchanged = Object.entries(hashes).every(([file, before]) => digest(join(pkg, file)) === before);
  if (!portsClosed || !packageUnchanged) { completed = false; process.exitCode = 1; }
  writeFileSync(join(root, "bridge.stderr.log"), bridgeError);
  writeFileSync(join(root, "summary.json"), JSON.stringify({ completed, packageUnchanged, portsClosed, hashes, receipts, ...(failure ? { failure } : {}) }, null, 2) + "\n");
}
