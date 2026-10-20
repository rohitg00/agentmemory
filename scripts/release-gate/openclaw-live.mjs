#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { createRecordingProxy } from "./http-proxy.mjs";

const options = { node: process.execPath, model: "openai/gpt-6-luna" };
for (let i = 2; i < process.argv.length; i++) {
  const name = process.argv[i].replace(/^--/, "");
  assert(["package-root", "node", "engine", "openclaw-cli", "codex-auth", "out", "model"].includes(name), `Unknown option ${name}`);
  assert(process.argv[i + 1], `Missing value for ${name}`);
  options[name] = name === "model" ? process.argv[++i] : resolve(process.argv[++i]);
}
for (const name of ["package-root", "engine", "openclaw-cli", "codex-auth", "out"]) assert(options[name], `--${name} is required`);
assert(options.model.startsWith("openai/"), "This gate uses native OpenAI OAuth");
const root = options.out;
assert(!existsSync(root), "Use a fresh output directory");
mkdirSync(root, { recursive: true, mode: 0o700 });
const privateRoot = join(root, "private");
const home = join(privateRoot, "host");
const state = join(home, ".openclaw");
const workspace = join(home, "workspace");
const backendHome = join(privateRoot, "backend");
for (const path of [workspace, state, backendHome, join(root, "tmp")]) mkdirSync(path, { recursive: true, mode: 0o700 });
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const originalAuthHash = hash(options["codex-auth"]);
const sourceAuth = JSON.parse(readFileSync(options["codex-auth"], "utf8"));
const access = sourceAuth.tokens?.access_token;
assert(typeof access === "string" && access.split(".").length === 3, "Expected existing Codex OAuth access token");
const claims = JSON.parse(Buffer.from(access.split(".")[1], "base64url"));
assert(claims.exp * 1000 - Date.now() > 30 * 60 * 1000, "Access token is near expiry; this gate never refreshes credentials");
const redactions = Object.values(sourceAuth.tokens || {}).filter((value) => typeof value === "string" && value);
const redact = (value) => redactions.reduce((text, secret) => text.split(secret).join("[redacted]"), String(value)).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]");
const pkg = options["package-root"];
const cli = join(pkg, "dist/cli.mjs");
const plugin = join(pkg, "integrations/openclaw");
const packageHashes = Object.fromEntries([cli, join(plugin, "plugin.mjs"), join(plugin, "openclaw.plugin.json")].map((path) => [path, hash(path)]));
const hostVersion = JSON.parse(readFileSync(join(dirname(options["openclaw-cli"]), "package.json"), "utf8")).version;
const runId = randomBytes(6).toString("hex");
const project = `live-openclaw-${runId}`;
const phrase = `CEDAR-${randomBytes(5).toString("hex").toUpperCase()}`;
const window = `W${randomBytes(5).toString("hex").toUpperCase()}`;
const topic = `Aster ${runId} release rehearsal`;
const decoyProject = `DECOY-PROJECT-${randomBytes(5).toString("hex").toUpperCase()}`;
const decoyAgent = `DECOY-AGENT-${randomBytes(5).toString("hex").toUpperCase()}`;
const backendSecret = randomBytes(24).toString("hex");
const wire = [];
const checks = [];
const children = new Set();
let scenario = "setup";
let backendProcess, enginePid, proxy;
let sourceObservationId;
const modelEvents = join(root, "model-events.jsonl");
const transportEvents = join(root, "transport-events.jsonl");
const transportObserver = join(privateRoot, "transport-observer.mjs");
const baseEnv = (dir) => ({ HOME: dir, USERPROFILE: dir, PATH: `${dirname(options.node)}:/opt/homebrew/bin:/usr/bin:/bin`, TMPDIR: join(root, "tmp"), NO_COLOR: "1", CI: "1" });
const env = { ...baseEnv(home), OPENCLAW_HOME: home, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: join(state, "openclaw.json"), CODEX_HOME: join(home, "empty-codex"), AGENTMEMORY_PROJECT_NAME: project, AGENTMEMORY_SECRET: backendSecret };
function kill(pid) { try { process.kill(-pid, "SIGKILL"); } catch {} try { process.kill(pid, "SIGKILL"); } catch {} }
process.on("exit", () => { for (const pid of children) kill(pid); rmSync(privateRoot, { recursive: true, force: true }); });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
async function run(args, runEnv, cwd, name, timeout = 120000) {
  return new Promise((done) => {
    const child = spawn(options.node, args, { env: runEnv, cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child.pid); let output = "";
    child.stdout.on("data", (data) => { output += data; }); child.stderr.on("data", (data) => { output += data; });
    child.on("error", (error) => { output += error.message; });
    const timer = setTimeout(() => kill(child.pid), timeout);
    child.on("close", (code) => { clearTimeout(timer); children.delete(child.pid); const safe = redact(output); writeFileSync(join(root, `${name}.log`), safe); done({ code, output: safe }); });
  });
}
async function waitFor(fn, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { try { if (await fn()) return; } catch {} await new Promise((done) => setTimeout(done, 200)); }
  throw new Error("Timed out waiting for isolated service or captured observation");
}
async function portFree(port) {
  return new Promise((done) => { const server = net.createServer(); server.once("error", () => done(false)); server.listen(port, "127.0.0.1", () => server.close(() => done(true))); });
}
let base;
for (let i = 0; i < 200; i++) {
  const candidate = 12000 + Math.floor(Math.random() * 6500);
  if ((await Promise.all([candidate, candidate + 1, candidate + 2, candidate + 3, candidate + 6353, candidate + 46023].map(portFree))).every(Boolean)) { base = candidate; break; }
}
assert(base, "No free isolated port block");
const ports = [base, base + 1, base + 2, base + 3, base + 6353, base + 46023];
const backendUrl = `http://127.0.0.1:${base}`;
async function backend(path, body, method = "POST") {
  const result = await fetch(`${backendUrl}/agentmemory/${path}`, { method, headers: { authorization: `Bearer ${backendSecret}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  assert(result.ok, `${path}: HTTP ${result.status}`); return result.json();
}
async function startBackend() {
  mkdirSync(join(backendHome, ".agentmemory/bin"), { recursive: true });
  copyFileSync(options.engine, join(backendHome, ".agentmemory/bin/iii")); chmodSync(join(backendHome, ".agentmemory/bin/iii"), 0o755);
  const fd = openSync(join(root, "backend.log"), "a");
  backendProcess = spawn(options.node, [cli, "--port", String(base), "--data-dir", join(root, "backend-data")], { env: { ...baseEnv(backendHome), AGENTMEMORY_SECRET: backendSecret, AGENTMEMORY_AUTO_COMPRESS: "false", III_TELEMETRY_ENABLED: "false", NODE_ENV: "test" }, cwd: backendHome, detached: true, stdio: ["ignore", fd, fd] });
  closeSync(fd); children.add(backendProcess.pid);
  await waitFor(async () => (await fetch(`${backendUrl}/agentmemory/health`, { headers: { authorization: `Bearer ${backendSecret}` }, signal: AbortSignal.timeout(2000) })).ok);
  const pidFile = join(backendHome, ".agentmemory/iii.pid");
  if (existsSync(pidFile)) { enginePid = Number(readFileSync(pidFile, "utf8")); children.add(enginePid); }
}
async function stopBackend() {
  if (!backendProcess) return;
  await run([cli, "stop", "--port", String(base)], { ...baseEnv(backendHome), AGENTMEMORY_DATA_DIR: join(root, "backend-data") }, backendHome, "backend-stop");
  kill(backendProcess.pid); if (enginePid) kill(enginePid);
  await waitFor(async () => (await Promise.all(ports.slice(0, 6).map(portFree))).every(Boolean));
}
async function check(name, fn) {
  try { const detail = await fn(); checks.push({ name, success: true, ...detail }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, success: false, error: redact(error.message) }); console.log(`FAIL ${name}: ${redact(error.message)}`); throw error; }
}
const readJsonLines = (path) => existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
const readEvents = () => readJsonLines(modelEvents);
async function turn(name, prompt, runEnv = env) {
  scenario = name; const start = wire.length; const eventStart = readEvents().length; const transportStart = readJsonLines(transportEvents).length;
  const sessionId = `${project}-${name}`;
  const result = await run([options["openclaw-cli"], "agent", "--local", "--agent", "main", "--session-id", sessionId, "--message", prompt, "--json", "--thinking", "low", "--timeout", "90"], { ...runEnv, NODE_OPTIONS: `--import=${transportObserver}` }, home, name);
  assert.equal(result.code, 0, result.output.slice(-1800));
  const events = readEvents().slice(eventStart);
  const inputs = events.filter((item) => item.name === "llm_input");
  const outputs = events.filter((item) => item.name === "llm_output");
  assert(inputs.length > 0, "Native model input was not observed");
  const model = options.model.slice("openai/".length);
  assert(inputs.every((item) => item.provider === "openai" && item.model === model), "Native host selected a different provider/model");
  assert(outputs.some((item) => item.provider === "openai" && item.model === model), "Requested model did not produce the observed output");
  assert(events.some((item) => item.name === "model_call_ended" && item.provider === "openai" && item.model === model && item.outcome === "completed"), "Requested model did not report a completed provider call");
  const transports = readJsonLines(transportEvents).slice(transportStart);
  assert(transports.some((item) => item.event === "response" && item.status === 200), "Successful native HTTP model request was not observed");
  const answer = outputs.flatMap((item) => item.assistantTexts || []).join("\n");
  assert(answer, "Native model produced no recorded answer");
  for (const value of [phrase, window, decoyProject, decoyAgent]) assert(!JSON.stringify(inputs.map((item) => item.historyMessages)).includes(value), "Fresh session leaked a withheld value through history");
  const captured = wire.slice(start).find((item) => item.path.endsWith("/observe") && item.status === 201);
  assert(captured, "Completed real model turn was not automatically captured");
  assert(captured.body.sessionId && captured.body.agentId, "Native capture must carry a scoped session and agent identity"); assert.equal(captured.body.project, project); assert.equal(captured.body.cwd, workspace);
  let observations;
  await waitFor(async () => { observations = await backend(`observations?sessionId=${encodeURIComponent(captured.body.sessionId)}`, undefined, "GET"); return observations.observations?.some((item) => item.id === captured.response.observationId && item.agentId === captured.body.agentId); });
  writeFileSync(join(root, `${name}-observations.json`), JSON.stringify(observations, null, 2));
  writeFileSync(join(root, `${name}-answer.txt`), answer + "\n");
  return { events, inputs, answer, captured, calls: wire.slice(start) };
}
try {
  await check("native access-only OAuth import", async () => {
    const agentDir = join(state, "agents/main/agent"); mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "auth-profiles.json"), JSON.stringify({ version: 1, profiles: { "openai:live": { type: "oauth", provider: "openai", access, refresh: "", expires: claims.exp * 1000, accountId: sourceAuth.tokens.account_id } } }), { mode: 0o600 });
    writeFileSync(env.OPENCLAW_CONFIG_PATH, JSON.stringify({ agents: { defaults: { workspace, model: { primary: options.model }, models: { [options.model]: { agentRuntime: { id: "openclaw" } } } } }, tools: { deny: ["*"] }, update: { checkOnStart: false } }));
    const result = await run([options["openclaw-cli"], "doctor", "--fix", "--yes", "--non-interactive"], env, home, "auth-import");
    assert.equal(result.code, 0, "Native auth migration failed; inspect sanitized auth-import.log");
    assert(result.output.includes("Migrated auth profile JSON"), "Native host did not confirm auth import");
    return { refreshCredentialSupplied: false };
  });
  writeFileSync(transportObserver, `import {appendFileSync,readFileSync,existsSync} from 'node:fs';
const path=${JSON.stringify(transportEvents)};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.hostname==='auth.openai.com'&&/token$/.test(url.pathname))throw new Error('OAuth token refresh disabled by live test');
  if(url.hostname==='chatgpt.com'&&url.pathname.endsWith('/responses')){
    const previous=existsSync(path)?readFileSync(path,'utf8').split('\\n').filter(line=>line.includes('"event":"request"')).length:0;
    if(previous>=6)throw new Error('Live test HTTP model request budget exceeded');
    const id=previous+1;appendFileSync(path,JSON.stringify({event:'request',id,host:url.hostname,path:url.pathname})+'\\n');
    const response=await nativeFetch(input,init);
    appendFileSync(path,JSON.stringify({event:'response',id,status:response.status})+'\\n');
    return response;
  }
  return nativeFetch(input,init);
};
`);
  await startBackend();
  proxy = http.createServer(createRecordingProxy({ backendUrl, record: (receipt) => {
    const item = { scenario, ...receipt };
    wire.push(item); appendFileSync(join(root, "backend-wire.jsonl"), JSON.stringify(item) + "\n");
  } }));
  await new Promise((done) => proxy.listen(0, "127.0.0.1", done)); ports.push(proxy.address().port);
  const connectorEnv = { ...env, AGENTMEMORY_URL: `http://127.0.0.1:${proxy.address().port}`, AGENTMEMORY_SECRET: backendSecret };
  await check("packaged connector installs native plugin and skills idempotently", async () => {
    const before = readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8");
    const dry = await run([cli, "connect", "openclaw", "--no-guidelines", "--dry-run"], connectorEnv, home, "connect-dry");
    assert.equal(dry.code, 0, dry.output);
    assert.equal(readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"), before);
    assert(!existsSync(join(state, "extensions/agentmemory")));
    const connected = await run([cli, "connect", "openclaw", "--no-guidelines"], connectorEnv, home, "connect");
    assert.equal(connected.code, 0, connected.output);
    assert.equal(hash(join(state, "extensions/agentmemory/plugin.mjs")), hash(join(plugin, "plugin.mjs")));
    assert(existsSync(join(state, "extensions/agentmemory/skills/remember/SKILL.md")));
    const installed = readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8");
    assert(!installed.includes(backendSecret), "Connector embedded backend credentials in native config");
    assert.equal(JSON.parse(installed).agents.defaults.model.primary, options.model);
    const repeated = await run([cli, "connect", "openclaw", "--no-guidelines"], connectorEnv, home, "connect-repeat");
    assert.equal(repeated.code, 0, repeated.output);
    assert.equal(readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"), installed);
  });
  const recorder = join(state, "extensions/agentmemory-live-recorder"); mkdirSync(recorder, { recursive: true });
  writeFileSync(join(recorder, "package.json"), JSON.stringify({ name: "agentmemory-live-recorder", version: "0.0.0", type: "module", openclaw: { extensions: ["./plugin.mjs"] } }));
  writeFileSync(join(recorder, "openclaw.plugin.json"), JSON.stringify({ id: "agentmemory-live-recorder", name: "Live test observation", configSchema: { type: "object", additionalProperties: false } }));
  writeFileSync(join(recorder, "plugin.mjs"), `import {appendFileSync,readFileSync,existsSync} from 'node:fs';\nconst path=${JSON.stringify(modelEvents)};\nexport default {id:'agentmemory-live-recorder',register(api){for(const name of ['llm_input','llm_output','model_call_ended'])api.on(name,event=>{const {runId,sessionId,provider,model,systemPrompt,prompt,historyMessages,assistantTexts,usage,outcome,api:protocol}=event;appendFileSync(path,JSON.stringify({name,runId,sessionId,provider,model,systemPrompt,prompt,historyMessages,assistantTexts,usage,outcome,api:protocol})+'\\n');if(name==='llm_input'&&readFileSync(path,'utf8').split('\\n').filter(line=>line.includes('"name":"llm_input"')).length>6)process.exit(97);});}};\n`);
  writeFileSync(join(workspace, "AGENTS.md"), "This is an isolated synthetic memory test. Give concise answers based on the user's current message and recalled context. Do not access tools or files.\n");
  const config = JSON.parse(readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
  config.agents.defaults.skipBootstrap = true;
  config.agents.defaults.models[options.model].params = { transport: "sse" };
  config.auth = { order: { openai: ["openai:live"] } };
  config.plugins.allow = [...new Set([...(config.plugins.allow || []), "agentmemory", "openai", "agentmemory-live-recorder"])];
  config.plugins.entries.openai = { enabled: true };
  config.plugins.entries["agentmemory-live-recorder"] = { enabled: true, hooks: { allowConversationAccess: true } };
  config.plugins.entries.agentmemory.config = { ...config.plugins.entries.agentmemory.config, base_url: `http://127.0.0.1:${proxy.address().port}` };
  delete config.mcp;
  writeFileSync(env.OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
  const validated = await run([options["openclaw-cli"], "config", "validate", "--json"], env, home, "config-validate");
  assert.equal(validated.code, 0, validated.output.slice(-1500));
  await check("real conversation automatically captures synthetic decision", async () => {
    const result = await turn("capture", `For the ${topic}, we decided the exact launch phrase is ${phrase} and the maintenance window identifier is ${window}. Please acknowledge by repeating these two values in one sentence.`);
    assert(result.answer.includes(phrase) && result.answer.includes(window), "Real model acknowledgement omitted the synthetic facts");
    assert(JSON.stringify(result.captured.body).includes(phrase) && JSON.stringify(result.captured.body).includes(window));
    sourceObservationId = result.captured.response.observationId;
    await backend("remember", { content: `${topic}: launch phrase ${decoyProject}; maintenance window WRONG-PROJECT.`, type: "fact", project: `${project}-foreign`, agentId: result.captured.body.agentId });
    await backend("remember", { content: `${topic}: launch phrase ${decoyAgent}; maintenance window WRONG-AGENT.`, type: "fact", project, agentId: "other-agent" });
    return { sourceObservationId, model: result.inputs[0].model, provider: result.inputs[0].provider };
  });
  const recallPrompt = `For the ${topic}, what exact launch phrase and maintenance window identifier did we decide? Use the recalled decision, answer in one sentence, and say unknown if no decision is available.`;
  assert(!recallPrompt.includes(phrase) && !recallPrompt.includes(window));
  const verifyRecall = async (name) => {
    const result = await turn(name, recallPrompt);
    const input = JSON.stringify(result.inputs);
    assert(input.includes(phrase) && input.includes(window), "Captured facts absent from native model input");
    assert(!input.includes(decoyProject) && !input.includes(decoyAgent), "Foreign scoped facts leaked into model input");
    assert(result.answer.includes(phrase) && result.answer.includes(window), "Real model failed to recall the exact facts");
    assert(result.calls.some((item) => item.path.endsWith("smart-search") && item.body.expandIds?.some((entry) => entry.obsId === sourceObservationId)), "Recall did not expand the original captured observation");
    return { sourceObservationId, capturedObservationId: result.captured.response.observationId, model: result.inputs[0].model, provider: result.inputs[0].provider };
  };
  await check("fresh session recalls captured facts without history or scoped decoys", () => verifyRecall("fresh-recall"));
  await stopBackend(); await startBackend();
  await check("fresh session recalls the original captured observation after daemon restart", () => verifyRecall("restart-recall"));
  await check("separate profile in the same workspace excludes another profile's memory", async () => {
    const otherState = join(home, ".openclaw-foreign"); mkdirSync(otherState, { recursive: true });
    const otherEnv = { ...connectorEnv, OPENCLAW_STATE_DIR: otherState, OPENCLAW_CONFIG_PATH: join(otherState, "openclaw.json") };
    const otherConfig = structuredClone(config);
    delete otherConfig.plugins; delete otherConfig.skills;
    writeFileSync(otherEnv.OPENCLAW_CONFIG_PATH, JSON.stringify(otherConfig, null, 2));
    const otherAgent = join(otherState, "agents/main/agent"); mkdirSync(otherAgent, { recursive: true });
    writeFileSync(join(otherAgent, "auth-profiles.json"), JSON.stringify({ version: 1, profiles: { "openai:live": { type: "oauth", provider: "openai", access, refresh: "", expires: claims.exp * 1000, accountId: sourceAuth.tokens.account_id } } }), { mode: 0o600 });
    const imported = await run([options["openclaw-cli"], "doctor", "--fix", "--yes", "--non-interactive"], otherEnv, home, "foreign-auth-import");
    assert.equal(imported.code, 0, imported.output);
    assert(imported.output.includes("Migrated auth profile JSON"));
    const connected = await run([cli, "connect", "openclaw", "--no-guidelines"], otherEnv, home, "foreign-connect");
    assert.equal(connected.code, 0, connected.output);
    const installed = JSON.parse(readFileSync(otherEnv.OPENCLAW_CONFIG_PATH, "utf8"));
    installed.plugins.allow = [...new Set([...(installed.plugins.allow || []), "agentmemory", "openai", "agentmemory-live-recorder"])];
    installed.plugins.entries.openai = { enabled: true };
    installed.plugins.entries["agentmemory-live-recorder"] = config.plugins.entries["agentmemory-live-recorder"];
    installed.plugins.load = { paths: [recorder] };
    installed.plugins.entries.agentmemory.config = { base_url: `http://127.0.0.1:${proxy.address().port}` };
    delete installed.mcp;
    writeFileSync(otherEnv.OPENCLAW_CONFIG_PATH, JSON.stringify(installed, null, 2));
    const answer = await turn("foreign-profile", recallPrompt, otherEnv);
    assert(/unknown/i.test(answer.answer), "Foreign profile did not report missing memory");
    for (const value of [phrase, window, decoyProject, decoyAgent]) {
      assert(!JSON.stringify(answer.inputs).includes(value), "Foreign profile received another profile's evidence");
      assert(!answer.answer.includes(value), "Foreign profile answered with another profile's evidence");
    }
    const ownCapture = wire.find((item) => item.scenario === "capture" && item.path.endsWith("/observe") && item.status === 201);
    assert.notEqual(answer.captured.body.agentId, ownCapture.body.agentId);
    return { profileAgentIdsDistinct: true, sharedWorkspace: true };
  });
  await check("primary profile still recalls its facts after a foreign profile turn", () => verifyRecall("primary-after-foreign"));
} catch (error) {
  if (!checks.some((item) => !item.success)) checks.push({ name: "gate setup", success: false, error: redact(error.message) });
} finally {
  await stopBackend().catch(() => {});
  for (const pid of children) kill(pid);
  if (proxy) { proxy.closeAllConnections(); await new Promise((done) => proxy.close(done)); }
  for (const [path, before] of Object.entries(packageHashes)) checks.push({ name: `package unchanged: ${path.slice(pkg.length + 1)}`, success: hash(path) === before });
  checks.push({ name: "original credential store unchanged", success: hash(options["codex-auth"]) === originalAuthHash });
  rmSync(privateRoot, { recursive: true, force: true });
  checks.push({ name: "temporary credentials removed", success: !existsSync(privateRoot) });
  checks.push({ name: "all owned ports closed", success: (await Promise.all(ports.map(portFree))).every(Boolean) });
  const summary = { hostVersion, node: process.version, requestedModel: options.model, packageHashes, checks, passed: checks.filter((item) => item.success).length, failed: checks.filter((item) => !item.success).length, logicalModelCalls: readEvents().filter((item) => item.name === "llm_input").length, httpModelRequests: readJsonLines(transportEvents).filter((item) => item.event === "request").length, coverage: "Real native OpenAI OAuth model conversations; packaged connector setup, automatic capture, profile isolation and scoped fresh-session recall. No channels, personal transcripts, refresh-token use or external messages." };
  writeFileSync(join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, logicalModelCalls: summary.logicalModelCalls, httpModelRequests: summary.httpModelRequests }));
  process.exitCode = summary.failed ? 1 : 0;
}
