import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cli = process.env.AGENTMEMORY_TEST_COPILOT;
const sdk = process.env.AGENTMEMORY_TEST_COPILOT_SDK;
if (!cli || !sdk) {
  console.error("Set AGENTMEMORY_TEST_COPILOT to the Copilot executable and AGENTMEMORY_TEST_COPILOT_SDK to its bundled copilot-sdk/index.js. Run npm run build first.");
  process.exit(1);
}
const { CopilotClient, RuntimeConnection, approveAll } = await import(pathToFileURL(resolve(sdk)).href);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = realpathSync(mkdtempSync(join(tmpdir(), "agentmemory copilot native ")));
const work = join(root, "project");
const plugin = join(root, "plugin with spaces");
const sample = "copilot synthetic capture verification";
const context = "SYNTHETIC_SESSION_CONTEXT";
mkdirSync(work);
writeFileSync(join(work, "sample.txt"), sample);
cpSync(join(repo, "plugin"), plugin, { recursive: true });
const requests = [];
const modelRequests = [];
const server = createServer(async (req, res) => {
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/agentmemory/")) {
      requests.push({ path: req.url, body });
      if (req.url.endsWith("/mcp/tools")) return res.end(JSON.stringify({ tools: [] }));
      return res.end(JSON.stringify({ context, accepted: true }));
    }
    modelRequests.push(body);
    const done = modelRequests.length > 1;
    const message = done
      ? { role: "assistant", content: "Synthetic test completed." }
      : { role: "assistant", content: null, tool_calls: [{ id: "call_synthetic", type: "function",
          function: { name: "view", arguments: JSON.stringify({ path: join(work, "sample.txt") }) } }] };
    res.end(JSON.stringify({ id: "synthetic", object: "chat.completion", created: 1, model: "synthetic",
      choices: [{ index: 0, message, finish_reason: done ? "stop" : "tool_calls" }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
  } catch {
    res.writeHead(500);
    res.end('{}');
  }
});
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ["PATH", "TMPDIR", "TEMP", "SYSTEMROOT", "LANG"].includes(key)));
Object.assign(env, { HOME: root, USERPROFILE: root, COPILOT_HOME: join(root, ".copilot"),
  COPILOT_CACHE_HOME: join(root, "cache"), COPILOT_AUTO_UPDATE: "false", AGENTMEMORY_INJECT_CONTEXT: "true",
  AGENTMEMORY_DATA_DIR: join(root, "capture") });
let client;
let session;
try {
  await new Promise((done, reject) => server.once("error", reject).listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  env.AGENTMEMORY_URL = base;
  console.log(execFileSync(cli, ["--version"], { env, encoding: "utf8", timeout: 30_000 }).trim());
  execFileSync(cli, ["plugin", "install", plugin], { env, cwd: work, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
  const servers = JSON.parse(execFileSync(cli, ["mcp", "list", "--json"], { env, cwd: work, encoding: "utf8", timeout: 30_000 }));
  assert.equal(servers.mcpServers.agentmemory.command, "node");
  assert.match(servers.mcpServers.agentmemory.args[0], /scripts\/plugin-bridge\.mjs$/);
  const skills = JSON.parse(execFileSync(cli, ["skill", "list", "--json"], { env, cwd: work, encoding: "utf8", timeout: 30_000 }));
  const pluginSkills = skills.filter((skill) => skill.source === "plugin");
  assert.ok(pluginSkills.some((skill) => skill.name === "remember"));
  client = new CopilotClient({ connection: RuntimeConnection.forStdio({ path: cli }),
    baseDirectory: env.COPILOT_HOME, workingDirectory: work, useLoggedInUser: false, env, logLevel: "error" });
  await client.start();
  session = await client.createSession({ model: "synthetic", provider: { type: "openai", baseUrl: `${base}/v1` },
    workingDirectory: work, enableFileHooks: true, enableConfigDiscovery: true,
    availableTools: ["view"], streaming: false, onPermissionRequest: approveAll });
  const result = await session.sendAndWait("Read sample.txt using view.", 30_000);
  assert.equal(result?.data?.content, "Synthetic test completed.");
  await session.disconnect();
  session = undefined;
  assert.equal(modelRequests.length, 2);
  assert.ok(JSON.stringify(modelRequests).includes(context), "SessionStart context must reach the model");
  assert.ok(requests.some((r) => r.path === "/agentmemory/mcp/tools"), "the bundled MCP bridge must connect");
  const start = requests.find((r) => r.path === "/agentmemory/session/start");
  assert.ok(start);
  for (const type of ["prompt_submit", "post_tool_use"]) {
    const observation = requests.find((r) => r.body.hookType === type);
    assert.ok(observation, `missing ${type} capture`);
    assert.equal(observation.body.sessionId, start.body.sessionId);
    if (type === "post_tool_use") assert.equal(observation.body.data.tool_output, sample);
  }
  assert.ok(requests.some((r) => r.path === "/agentmemory/session/end"));
  console.log(`PASS: native plugin install, ${pluginSkills.length} plugin skills, bundled MCP, SessionStart context, prompt/tool capture, and session end. Synthetic model and capture server only.`);
} finally {
  if (session) await session.disconnect();
  if (client) await client.stop();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  rmSync(root, { recursive: true, force: true });
}
