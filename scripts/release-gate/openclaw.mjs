#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { assertCommandCompleted, assertSupportedPlatform, assertValidationRejected, killProcess as kill, runCommand } from "./command.mjs";

assertSupportedPlatform();
const options = { hosts: [], node: process.execPath };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--openclaw-cli") options.hosts.push(resolve(process.argv[++i]));
  else if (["--package-root", "--node", "--engine", "--out"].includes(arg)) options[arg.slice(2)] = resolve(process.argv[++i]);
  else throw new Error(`Unknown argument ${arg}`);
}
for (const field of ["package-root", "engine", "out"]) assert(options[field], `--${field} is required`);
assert(options.hosts.length, "At least one --openclaw-cli is required");
const root = options.out;
assert(!existsSync(join(root, "summary.json")), "Use a fresh output directory");
mkdirSync(root, { recursive: true });
const pkg = options["package-root"];
const cli = join(pkg, "dist/cli.mjs");
const plugin = join(pkg, "integrations/openclaw");
const skills = join(pkg, "plugin/skills");
const children = new Set();
const servers = new Set();
const wire = [];
const modelWire = [];
const receipts = [];
const backendHome = join(root, "backend-home");
const secret = randomBytes(24).toString("hex");
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const hashes = Object.fromEntries([cli, join(pkg, "dist/standalone.mjs"), join(plugin, "plugin.mjs"), join(plugin, "openclaw.plugin.json")].map((path) => [path, hash(path)]));
const baseEnv = (home) => ({ HOME: home, USERPROFILE: home, PATH: `${dirname(options.node)}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin`, TMPDIR: join(root, "tmp"), NO_COLOR: "1", CI: "1" });
mkdirSync(join(root, "tmp"), { recursive: true });
async function run(args, env, cwd, name, timeoutMs = 90_000) {
  const result = await runCommand(options.node, args, { env, cwd, children, timeoutMs });
  writeFileSync(join(root, `${name}.log`), result.output);
  assertCommandCompleted(result);
  return result;
}
async function check(name, fn) {
  try { const detail = await fn(); receipts.push({ name, success: true, ...(detail || {}) }); console.log(`PASS ${name}`); }
  catch (error) { receipts.push({ name, success: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
}
async function waitFor(fn, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await fn()) return; } catch {}
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error("Timed out waiting for isolated service");
}
async function listen(handler) {
  const server = http.createServer(handler); servers.add(server);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, port: server.address().port };
}
async function portFree(port) {
  return new Promise((done) => {
    const server = net.createServer(); server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
  });
}
let base;
for (let i = 0; i < 200; i++) {
  const candidate = 12000 + Math.floor(Math.random() * 6500);
  if ((await Promise.all([candidate, candidate + 1, candidate + 2, candidate + 3, candidate + 6353, candidate + 46023].map(portFree))).every(Boolean)) { base = candidate; break; }
}
assert(base, "No isolated port block available");
const backendUrl = `http://127.0.0.1:${base}`;
async function backend(path, body, method = "POST") {
  const response = await fetch(`${backendUrl}/agentmemory/${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
}
let modelMode = "conversation";
let mcpMarker = "NATIVE_MCP_COBALT_9271";
let mcpProject = "native-mcp";
let activeScenario = "";
let modelCalls = 0;
let backendProcess;
let enginePid;
process.on("exit", () => { for (const pid of children) kill(pid); });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
const portBlock = [base, base + 1, base + 2, base + 3, base + 6353, base + 46023];
async function startBackend() {
  mkdirSync(join(backendHome, ".agentmemory/bin"), { recursive: true });
  copyFileSync(options.engine, join(backendHome, ".agentmemory/bin/iii")); chmodSync(join(backendHome, ".agentmemory/bin/iii"), 0o755);
  const fd = openSync(join(root, "backend.log"), "a");
  backendProcess = spawn(options.node, [cli, "--port", String(base), "--data-dir", join(root, "backend-data")], { env: { ...baseEnv(backendHome), AGENTMEMORY_SECRET: secret, AGENTMEMORY_AUTO_COMPRESS: "false", III_TELEMETRY_ENABLED: "false", NODE_ENV: "test", AGENTMEMORY_READY_TIMEOUT_MS: "60000" }, cwd: backendHome, detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd); children.add(backendProcess.pid);
  await waitFor(async () => (await fetch(`${backendUrl}/agentmemory/health`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(2000) })).ok);
  const pidFile = join(backendHome, ".agentmemory/iii.pid");
  if (existsSync(pidFile)) { enginePid = Number(readFileSync(pidFile, "utf8")); children.add(enginePid); }
}
async function stopBackend() {
  await run([cli, "stop", "--port", String(base)], { ...baseEnv(backendHome), AGENTMEMORY_DATA_DIR: join(root, "backend-data") }, backendHome, "backend-stop");
  if (backendProcess) kill(backendProcess.pid);
  if (enginePid) kill(enginePid);
  await waitFor(async () => (await Promise.all(portBlock.map(portFree))).every(Boolean));
}
function objects(value) { return value && typeof value === "object" ? [value, ...Object.values(value).flatMap(objects)] : []; }
const model = await listen(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  const payload = raw ? JSON.parse(raw) : {};
  const record = { scenario: activeScenario, path: req.url, payload };
  modelWire.push(record); appendFileSync(join(root, "model-wire.jsonl"), JSON.stringify(record) + "\n");
  if (!req.url?.endsWith("/chat/completions")) { res.writeHead(404); res.end(); return; }
  const id = `fixture-${++modelCalls}`;
  const toolMessages = (payload.messages || []).filter((message) => message.role === "tool");
  let name, args;
  if (modelMode === "mcp") {
    if (!toolMessages.length) { name = "tool_search"; args = { queries: [{ query: "memory_save", limit: 1 }, { query: "memory_smart_search", limit: 1 }] }; }
    else {
      let parsed;
      try { const text = toolMessages[0].content; parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch {}
      const found = objects(parsed);
      const save = found.find((item) => String(item.id || item.name || "").includes("memory_save"));
      const recall = found.find((item) => String(item.id || item.name || "").includes("memory_smart_search"));
      if (toolMessages.length === 1 && save) { name = "tool_call"; args = { id: save.id || save.name, args: { content: `${mcpMarker} packaged OpenClaw persistence`, type: "fact", project: mcpProject } }; }
      else if (toolMessages.length === 2 && recall) { name = "tool_call"; args = { id: recall.id || recall.name, args: { query: mcpMarker, project: mcpProject, limit: 5 } }; }
    }
  }
  const answer = `Completed packaged native turn ${activeScenario}.`;
  const message = name ? { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] } : { role: "assistant", content: answer };
  if (!payload.stream) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ id, object: "chat.completion", model: "fixture", choices: [{ index: 0, message, finish_reason: name ? "tool_calls" : "stop" }] })); return; }
  res.setHeader("content-type", "text/event-stream");
  const send = (delta, finish_reason) => res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", model: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  send({ role: "assistant", content: "" }, null);
  if (name) send({ tool_calls: [{ index: 0, ...message.tool_calls[0] }] }, null); else send({ content: answer }, null);
  send({}, name ? "tool_calls" : "stop"); res.end("data: [DONE]\n\n");
});
const proxy = await listen(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  const response = await fetch(backendUrl + req.url, { method: req.method, headers: { "content-type": "application/json", ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, ...(raw ? { body: raw } : {}), signal: AbortSignal.timeout(10000) }).catch(() => null);
  const text = response ? await response.text() : "{}";
  const item = { scenario: activeScenario, path: req.url, hasBearer: Boolean(req.headers.authorization), body: raw ? JSON.parse(raw) : null, status: response?.status ?? 502, response: JSON.parse(text) };
  wire.push(item); appendFileSync(join(root, "backend-wire.jsonl"), JSON.stringify(item) + "\n");
  res.writeHead(item.status, { "content-type": "application/json" }); res.end(text);
});
try {
  await startBackend();
  for (let hostIndex = 0; hostIndex < options.hosts.length; hostIndex++) {
    const nativeCli = options.hosts[hostIndex];
    const hostVersion = JSON.parse(readFileSync(join(dirname(nativeCli), "package.json"), "utf8")).version;
    const label = `host-${hostVersion}`;
    const home = join(root, label); const state = join(home, ".openclaw"); const workspace = join(home, `workspace-${hostIndex}`); const project = `workspace-${hostIndex}`;
    mkdirSync(workspace, { recursive: true }); mkdirSync(state, { recursive: true }); mkdirSync(join(home, ".agentmemory"), { recursive: true });
    writeFileSync(join(home, ".agentmemory/secret"), secret, { mode: 0o600 });
    const path = join(state, "openclaw.json");
    const env = { ...baseEnv(home), OPENCLAW_HOME: home, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: path, AGENTMEMORY_URL: `http://127.0.0.1:${proxy.port}`, AGENTMEMORY_SECRET: secret };
    writeFileSync(path, JSON.stringify({ agents: { defaults: { workspace } } }));
    await check(`${label}: packaged connector and native validation`, async () => {
      const before = readFileSync(path, "utf8");
      assert.equal((await run([cli, "connect", "openclaw", "--no-guidelines", "--dry-run"], env, home, `${label}-connect-dry`)).code, 0);
      assert.equal(readFileSync(path, "utf8"), before);
      assert.equal((await run([cli, "connect", "openclaw", "--no-guidelines"], env, home, `${label}-connect`)).code, 0);
      const installed = readFileSync(path, "utf8");
      assert(!JSON.parse(installed).mcp, "Native-only setup unexpectedly enabled shared-backend MCP");
      assert.equal(JSON.parse(installed).plugins.slots.memory, "agentmemory");
      assert.equal((await run([cli, "connect", "openclaw", "--no-guidelines"], env, home, `${label}-connect-repeat`)).code, 0);
      assert.equal(readFileSync(path, "utf8"), installed);
      const validated = await run([nativeCli, "config", "validate", "--json"], env, home, `${label}-validate`);
      assert.equal(validated.code, 0, validated.output.slice(-1000));
      return { hostVersion };
    });
    assert.equal(hash(join(state, "extensions/agentmemory/plugin.mjs")), hash(join(plugin, "plugin.mjs")));
    const installedConfig = JSON.parse(readFileSync(path, "utf8"));
    const config = {
      plugins: { allow: ["agentmemory"], slots: { memory: "agentmemory" }, entries: { agentmemory: { enabled: true, hooks: { allowConversationAccess: true }, config: { base_url: `http://127.0.0.1:${proxy.port}`, min_confidence: 0, fallback_on_error: true } } } },
      agents: { defaults: { workspace, model: { primary: "fixture/fixture" }, models: { "fixture/fixture": {} } } },
      models: { providers: { fixture: { baseUrl: `http://127.0.0.1:${model.port}/v1`, apiKey: "synthetic-local-only", api: "openai-completions", models: [{ id: "fixture", name: "Local integration fixture", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } },
      skills: installedConfig.skills,
    };
    const saveConfig = () => writeFileSync(path, JSON.stringify(config, null, 2)); saveConfig();
    const turn = async (name, message = "NEBULA_ALPHA_429", extraEnv = {}) => {
      activeScenario = `${label}-${name}`; const wi = wire.length; const mi = modelWire.length;
      const result = await run([nativeCli, "agent", "--local", "--agent", "main", "--session-id", activeScenario, "--message", message, "--json", "--timeout", "30"], { ...env, ...extraEnv }, home, activeScenario);
      assert.equal(result.code, 0, result.output.slice(-1000));
      return { ...result, calls: wire.slice(wi), models: modelWire.slice(mi), session: activeScenario };
    };
    const warmup = await turn("identity", "Acknowledge isolated setup in one short sentence.");
    const warmupCapture = warmup.calls.find((call) => call.path.endsWith("observe") && call.status < 300);
    assert(warmupCapture?.body.agentId, "Native capture has no profile-scoped agent identity");
    const ownAgentId = warmupCapture.body.agentId;
    await backend("remember", { content: "NEBULA_ALPHA_429 ".repeat(8) + "The complete deployment code is COBALT-9271.", type: "fact", project, agentId: ownAgentId });
    await backend("remember", { content: "NEBULA_ALPHA_429 forbidden OTHER_PROJECT_SECRET", type: "fact", project: "other-project", agentId: ownAgentId });
    await backend("remember", { content: "NEBULA_ALPHA_429 forbidden OTHER_AGENT_SECRET", type: "fact", project, agentId: "other-agent" });
    await check(`${label}: native full recall, scoped capture and skills`, async () => {
      const result = await turn("lifecycle");
      const prompt = JSON.stringify(result.models);
      assert(prompt.includes("COBALT-9271"), "Full recalled content missing from model request");
      assert(!prompt.includes("OTHER_PROJECT_SECRET")); assert(!prompt.includes("OTHER_AGENT_SECRET"));
      assert(prompt.includes("memory-discipline"), "Skills absent from native prompt");
      const searches = result.calls.filter((call) => call.path.endsWith("smart-search"));
      assert.equal(searches.length, 2, "Recall must use one compact request and one expansion");
      assert(searches.every((call) => call.body.project === project && call.body.agentId === ownAgentId && call.status === 200 && call.hasBearer));
      const captured = result.calls.find((call) => call.path.endsWith("observe"));
      assert(captured && captured.status < 300, "Native capture not accepted");
      assert(captured.body.sessionId); assert.equal(captured.body.cwd, workspace); assert.equal(captured.body.project, project);
      await waitFor(async () => (await backend(`observations?sessionId=${encodeURIComponent(captured.body.sessionId)}`, undefined, "GET")).observations?.some((item) => item.agentId === ownAgentId));
      const listed = await run([nativeCli, "skills", "list", "--json"], env, home, `${label}-skills`);
      assert.equal(listed.code, 0);
      const bundledNames = readdirSync(skills).filter((name) => existsSync(join(skills, name, "SKILL.md")));
      for (const name of bundledNames) assert(listed.output.includes(`"${name}"`), `Skill ${name} missing`);
      return { skills: bundledNames.length, captureStatus: captured.status };
    });
    await check(`${label}: wrong credentials are visible and can recover`, async () => {
      const result = await turn("bad-auth", "Check rejected credentials.", { AGENTMEMORY_SECRET: "synthetic-invalid" }); assert(result.calls.some((call) => call.status === 401)); assert(result.output.includes("HTTP 401"));
      const recovered = await turn("auth-recovered"); assert(recovered.calls.some((call) => call.path.endsWith("observe") && call.status < 300));
    });
    await check(`${label}: named profile credentials do not fall back and recover`, async () => {
      config.plugins.entries.agentmemory.config.secret_env = "AGENTMEMORY_NATIVE_TEST_SECRET"; saveConfig();
      try {
        const missing = await turn("profile-secret-missing");
        assert(missing.calls.some((call) => call.status === 401), "Missing profile secret fell back to a different credential");
        assert(!missing.calls.some((call) => call.path.endsWith("observe") && call.status < 300));
        const recovered = await turn("profile-secret-recovered", "Verify profile credential recovery.", { AGENTMEMORY_NATIVE_TEST_SECRET: secret });
        assert(recovered.calls.some((call) => call.path.endsWith("observe") && call.status < 300));
      } finally { delete config.plugins.entries.agentmemory.config.secret_env; saveConfig(); }
    });
    await check(`${label}: zero budget and disabled hooks`, async () => {
      config.plugins.entries.agentmemory.config.token_budget = 0; saveConfig();
      const limited = await turn("zero-budget"); assert(!limited.calls.some((call) => call.path.endsWith("smart-search"))); assert(limited.calls.some((call) => call.path.endsWith("observe")));
      config.plugins.entries.agentmemory.config.enabled = false; saveConfig();
      try { assert.equal((await turn("disabled")).calls.length, 0); }
      finally { delete config.plugins.entries.agentmemory.config.enabled; delete config.plugins.entries.agentmemory.config.token_budget; saveConfig(); }
    });
    await check(`${label}: native validator rejects invalid limits`, async () => {
      config.plugins.entries.agentmemory.config.min_confidence = 1.1; saveConfig();
      try { assertValidationRejected(await run([nativeCli, "config", "validate", "--json"], env, home, `${label}-invalid-limits`)); }
      finally { config.plugins.entries.agentmemory.config.min_confidence = 0; saveConfig(); }
    });
    await check(`${label}: denied conversation capture`, async () => {
      config.plugins.entries.agentmemory.hooks.allowConversationAccess = false; saveConfig();
      try { const denied = await turn("denied"); assert(!denied.calls.some((call) => call.path.endsWith("observe") || call.path.endsWith("session/start"))); }
      finally { config.plugins.entries.agentmemory.hooks.allowConversationAccess = true; saveConfig(); }
    });
    await check(`${label}: denied prompt injection`, async () => {
      config.plugins.entries.agentmemory.hooks.allowPromptInjection = false; saveConfig();
      try {
        const denied = await turn("denied-prompt");
        assert(!denied.calls.some((call) => call.path.endsWith("smart-search")));
        assert(!JSON.stringify(denied.models).includes("COBALT-9271"));
        assert(denied.calls.some((call) => call.path.endsWith("observe") && call.status < 300));
      } finally { delete config.plugins.entries.agentmemory.hooks.allowPromptInjection; saveConfig(); }
    });
    await check(`${label}: offline fallback and restart preserve recall`, async () => {
      await stopBackend();
      const offline = await turn("offline");
      assert(offline.output.includes("HTTP 502"), "Outage must be visible while the native turn continues");
      await startBackend();
      const result = await turn("restart"); assert(JSON.stringify(result.models).includes("COBALT-9271"));
    });
    if (hostIndex === options.hosts.length - 1) {
      await check(`${label}: native MCP executes packaged save and search`, async () => {
        const connected = await run([cli, "connect", "openclaw", "--no-guidelines", "--with-mcp"], env, home, `${label}-connect-mcp`);
        assert.equal(connected.code, 0, connected.output);
        config.mcp = JSON.parse(readFileSync(path, "utf8")).mcp;
        assert.equal(config.mcp.servers.agentmemory.env.AGENTMEMORY_FORCE_PROXY, "1");
        assert(config.mcp.servers.agentmemory.args.includes(join(pkg, "dist/standalone.mjs")));
        config.mcp.servers.agentmemory.env.AGENTMEMORY_TOOLS = "all";
        config.mcp.servers.agentmemory.env.AGENTMEMORY_URL = backendUrl; saveConfig();
        modelMode = "mcp";
        try {
          const result = await turn("mcp", "Use AgentMemory to save and then recall a test memory.");
          const text = JSON.stringify(result.models);
          assert(text.includes("NATIVE_MCP_COBALT_9271"));
          assert(result.models.some((item) => (item.payload.messages || []).filter((message) => message.role === "tool").length >= 3), "Expected discovery, save and search tool results");
          const saved = await backend("smart-search", { query: "NATIVE_MCP_COBALT_9271", project: "native-mcp" });
          assert(JSON.stringify(saved.results).includes("NATIVE_MCP_COBALT_9271"), "Native MCP save did not persist the requested record");
          assert(saved.results.some((item) => text.includes(item.obsId)), "Saved memory ID absent from native MCP tool results");
        } finally { modelMode = "conversation"; }
      });
      await check(`${label}: native MCP startup rejects invalid credentials without local success`, async () => {
        config.mcp.servers.agentmemory.env.AGENTMEMORY_SECRET = "synthetic-invalid-mcp-only"; saveConfig();
        modelMode = "mcp"; mcpMarker = "UNAUTHORIZED_NATIVE_MCP_SAVE"; mcpProject = "native-mcp-denied";
        try {
          const result = await turn("mcp-denied", "Use AgentMemory to save and then recall a test memory.");
          const toolResponses = result.models.flatMap((item) => (item.payload.messages || []).filter((message) => message.role === "tool")).map((message) => message.content);
          assert(result.output.includes('failed to start server "agentmemory"') && /401 Unauthorized/i.test(result.output), "Native MCP startup must expose authorization failure");
          assert(!JSON.stringify(toolResponses).includes("mcp:agentmemory:"), "Rejected MCP server must not expose callable tools");
          const absent = await backend("smart-search", { query: mcpMarker, project: mcpProject });
          assert.equal(absent.results.length, 0, "Rejected save must not create backend memory");
          assert(!toolResponses.some((text) => /mem_[a-z0-9]/i.test(String(text))), "Rejected save must not report a locally created memory ID");
        } finally { modelMode = "conversation"; delete config.mcp.servers.agentmemory.env.AGENTMEMORY_SECRET; saveConfig(); }
      });
      await check(`${label}: native MCP startup reports offline backend without local success`, async () => {
        await stopBackend();
        modelMode = "mcp"; mcpMarker = "OFFLINE_NATIVE_MCP_SAVE"; mcpProject = "native-mcp-offline";
        try {
          const result = await turn("mcp-offline", "Use AgentMemory to save and then recall a test memory.");
          const toolResponses = result.models.flatMap((item) => (item.payload.messages || []).filter((message) => message.role === "tool")).map((message) => message.content);
          assert(result.output.includes('failed to start server "agentmemory"') && /fetch failed|ECONNREFUSED|connect.*failed/i.test(result.output), "Native MCP startup must expose the unavailable backend");
          assert(!JSON.stringify(toolResponses).includes("mcp:agentmemory:"), "Unavailable MCP server must not expose callable tools");
          assert(!toolResponses.some((text) => /mem_[a-z0-9]/i.test(String(text))), "Offline save must not report a locally created memory ID");
        } finally { modelMode = "conversation"; await startBackend(); }
        const absent = await backend("smart-search", { query: mcpMarker, project: mcpProject });
        assert.equal(absent.results.length, 0, "Failed offline save must not be reported as persisted");
      });
    }
  }
} catch (error) { receipts.push({ name: "gate setup", success: false, error: error.message }); }
finally {
  await stopBackend().catch(() => {});
  for (const pid of children) kill(pid);
  for (const server of servers) { server.closeAllConnections(); await new Promise((done) => server.close(done)); }
  await check("installed package remains unchanged", async () => { for (const [path, before] of Object.entries(hashes)) assert.equal(hash(path), before); });
  await check("all owned ports closed", async () => { assert((await Promise.all([...portBlock, model.port, proxy.port].map(portFree))).every(Boolean)); });
  const summary = { node: process.version, packageVersion: JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version, hashes, receipts, passed: receipts.filter((item) => item.success).length, failed: receipts.filter((item) => !item.success).length, coverage: "Native CLI hosts, deterministic local model, authenticated packed backend; no external model quality or channel delivery claim." };
  writeFileSync(join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  process.exitCode = summary.failed ? 1 : 0;
}
