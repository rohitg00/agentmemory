#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

assert(process.argv[2], "Pass the packed fs-watcher tarball");
const root = mkdtempSync(join(tmpdir(), "agentmemory-watcher-gate-"));
const home = join(root, "home");
const watched = join(root, "watched");
mkdirSync(home);
mkdirSync(watched);
const env = { PATH: process.env.PATH, HOME: home, LANG: "C.UTF-8", npm_config_cache: join(root, "cache") };
const received = [];
let child;
let output = "";
let exited = false;
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  received.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
  response.writeHead(200, { "content-type": "application/json" });
  response.end("{}");
});
async function until(check) {
  const deadline = Date.now() + 15_000;
  while (!check()) {
    assert(!exited, `Installed watcher exited early: ${output}`);
    assert(Date.now() < deadline, `Installed watcher timed out: ${output}`);
    await sleep(50);
  }
}
try {
  execFileSync("npm", ["install", "--prefix", root, "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund", resolve(process.argv[2])], { env, stdio: "inherit", timeout: 120_000 });
  const binary = join(root, "node_modules/@agentmemory/fs-watcher/bin.mjs");
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  child = spawn(process.execPath, [binary, watched], {
    cwd: home,
    env: { ...env, AGENTMEMORY_URL: `http://127.0.0.1:${server.address().port}`, AGENTMEMORY_SECRET: "release-gate-fixture", AGENTMEMORY_PROJECT_NAME: "release-gate", AGENTMEMORY_SESSION_ID: "release-gate-session" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.once("exit", () => { exited = true; });
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  await until(() => output.includes("[fs-watcher] watching"));
  writeFileSync(join(watched, "fixture.txt"), "Packaged watcher capture fixture\n");
  await until(() => received.some((event) => event.body.data?.content?.includes("Packaged watcher capture fixture")));
  const event = received.find((entry) => entry.body.data?.content?.includes("Packaged watcher capture fixture"));
  assert.equal(event.url, "/agentmemory/observe");
  assert.equal(event.authorization, "Bearer release-gate-fixture");
  assert.equal(event.body.project, "release-gate");
  assert.equal(event.body.sessionId, "release-gate-session");
  const exit = once(child, "exit", { signal: AbortSignal.timeout(5000) });
  child.kill("SIGTERM");
  assert.deepEqual(await exit, [0, null], "Installed watcher did not stop cleanly");
  console.log("PASS packaged filesystem watcher: capture, credentials, scope, shutdown");
} finally {
  child?.kill("SIGKILL");
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  rmSync(root, { recursive: true, force: true });
}
