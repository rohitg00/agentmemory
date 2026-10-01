import { afterAll, describe, expect, it } from "vitest";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { rewriteBundledConfig } from "../src/cli/engine-launch.js";
import { III_PINNED_VERSION } from "../src/version.js";

const root = resolve(__dirname, "..");
const engineBin = process.env.AGENTMEMORY_TEST_III;
const children = new Set<ChildProcess>();
let sandbox: string;

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(force);
  children.delete(child);
}

afterAll(async () => {
  await Promise.all([...children].map(stop));
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

async function unusedPorts() {
  const listeners = Array.from({ length: 4 }, () => createServer());
  try {
    await Promise.all(listeners.map((s) => new Promise<void>((done, reject) => s.once("error", reject).listen(0, "127.0.0.1", done))));
    return listeners.map((s) => (s.address() as { port: number }).port);
  } finally {
    await Promise.all(listeners.map((s) => new Promise<void>((done) => s.close(() => done()))));
  }
}

function launch(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd, env, stdio: "pipe" });
  children.add(child);
  let diagnostic = "";
  child.stderr.on("data", (data) => { diagnostic = (diagnostic + data).slice(-6000); });
  return { child, diagnostic: () => diagnostic };
}

function mcp(script: string, cwd: string, env: NodeJS.ProcessEnv) {
  const { child, diagnostic } = launch(process.execPath, [script], cwd, env);
  let id = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  const fail = () => {
    for (const wait of pending.values()) { clearTimeout(wait.timer); wait.reject(new Error(diagnostic() || "MCP exited")); }
    pending.clear();
  };
  child.once("error", fail);
  child.once("exit", fail);
  createInterface({ input: child.stdout }).on("line", (line) => {
    const value = JSON.parse(line);
    const wait = pending.get(value.id);
    if (wait) { clearTimeout(wait.timer); pending.delete(value.id); wait.resolve(value); }
  });
  const request = (method: string, params = {}): Promise<any> => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { pending.delete(next); reject(new Error(`MCP timed out: ${method}`)); }, 20_000);
    pending.set(next, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: next, method, params }) + "\n");
  });
  const tool = async (name: string, args = {}) => {
    const reply = await request("tools/call", { name, arguments: args });
    expect(reply.error).toBeUndefined();
    expect(reply.result.isError, JSON.stringify(reply.result)).not.toBe(true);
    return JSON.parse(reply.result.content[0].text);
  };
  return { child, request, tool };
}

describe.skipIf(!engineBin)("local plugin against the pinned iii daemon", () => {
  it("captures hooks, shares memory with the Claude MCP entry point, persists across restart, and fails visibly on outage", async () => {
    // vitest.config.ts isolates user configuration for the entire test process.
    expect(homedir()).toContain("agentmemory-test-home-");
    expect(execFileSync(engineBin!, ["--version"], { encoding: "utf8" }).trim()).toBe(III_PINNED_VERSION);
    sandbox = mkdtempSync(join(tmpdir(), "agentmemory-live-plugin-"));
    const [restPort, streamPort, viewerPort, enginePort] = await unusedPorts();
    const base = `http://127.0.0.1:${restPort}`;
    const secret = "isolated-smoke-secret";
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TMPDIR", "TEMP", "LANG"].includes(key)));
    const env = { ...inherited, AGENTMEMORY_URL: base, AGENTMEMORY_SECRET: secret,
      III_ENGINE_URL: `ws://127.0.0.1:${enginePort}`, III_REST_PORT: String(restPort), III_STREAM_PORT: String(streamPort),
      III_VIEWER_PORT: String(viewerPort), III_TELEMETRY_ENABLED: "false", AGENTMEMORY_RUNTIME_DIR: join(sandbox, "runtime"),
      AGENTMEMORY_AUTO_COMPRESS: "false", AGENTMEMORY_INJECT_CONTEXT: "false", AGENTMEMORY_TOOLS: "all" };
    const config = rewriteBundledConfig(readFileSync(join(root, "iii-config.yaml"), "utf8"), homedir(), process.execPath, join(root, "dist/index.mjs"), {
      dataDir: join(sandbox, "state"), saveIntervalMs: 250, ports: { restPort, streamPort, viewerPort, enginePort },
    });
    writeFileSync(join(sandbox, "iii.yaml"), config);
    const daemon = async () => {
      const engine = launch(engineBin!, ["-c", join(sandbox, "iii.yaml"), "--no-update-check"], sandbox, env);
      engine.child.stdout.resume();
      const worker = launch(process.execPath, [join(root, "dist/index.mjs")], sandbox, env);
      worker.child.stdout.resume();
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${base}/agentmemory/mcp/tools`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(1000) });
          if (res.ok) return { engine: engine.child, worker: worker.child };
        } catch {}
        if (engine.child.exitCode !== null || worker.child.exitCode !== null) break;
        await delay(250);
      }
      throw new Error(`Daemon failed to become ready:\n${engine.diagnostic()}\n${worker.diagnostic()}`);
    };
    let running = await daemon();
    const packaged = join(root, "dist/plugins/agentmemory-codex-local");
    const codex = mcp(join(packaged, "scripts/plugin-bridge.mjs"), packaged, env);
    const claude = mcp(join(root, "dist/standalone.mjs"), sandbox, env);
    for (const client of [codex, claude]) await client.request("initialize", { protocolVersion: "2025-11-25" });
    expect((await codex.request("tools/list")).result.tools).toHaveLength(54);
    expect((await codex.request("resources/list")).result.resources).toHaveLength(3);
    expect((await codex.request("resources/templates/list")).result.resourceTemplates).toHaveLength(3);
    expect((await codex.request("prompts/list")).result.prompts).toHaveLength(3);
    const token = `pluginprobe${Date.now()}`;
    const saved = await codex.tool("memory_save", { content: `${token}: use cursor pagination to avoid offset scans.`, concepts: token, project: "smoke-alpha" });
    expect(JSON.stringify(await claude.tool("memory_smart_search", { query: token }))).toContain(token);
    const savedByClaude = await claude.tool("memory_save", { content: `${token} shared handoff from Claude.`, concepts: token });
    expect(JSON.stringify(await codex.tool("memory_smart_search", { query: token }))).toContain("shared handoff");
    const cwd = join(sandbox, "smoke-alpha");
    mkdirSync(cwd);
    const sessionId = `ses_${token}`;
    const hook = async (name: string, input: Record<string, unknown>) => {
      const { child } = launch(process.execPath, [join(packaged, `scripts/${name}.mjs`)], cwd, env);
      child.stdout.resume();
      const exit = new Promise<number | null>((done) => child.once("exit", done));
      child.stdin.end(JSON.stringify({ session_id: sessionId, cwd, ...input }));
      expect(await exit).toBe(0);
    };
    await hook("session-start", {});
    await hook("post-tool-use", { tool_name: "exec_command", tool_input: { cmd: "cat sample.txt" }, tool_response: "synthetic captured output" });
    await hook("stop", {});
    const sessions = JSON.stringify(await codex.tool("memory_sessions"));
    expect(sessions).toContain(sessionId);
    expect(sessions).toContain("completed");
    expect(sessions).toMatch(/observationCount["\\]*\s*:\s*[1-9]/);
    await codex.tool("memory_lesson_save", { content: `${token} run tests once in CI.`, project: "smoke-alpha" });
    expect(JSON.stringify(await codex.tool("memory_lesson_recall", { query: token, project: "smoke-alpha" }))).toContain("run tests once");
    const status = await codex.request("resources/read", { uri: "agentmemory://status" });
    expect(status.result.contents[0].uri).toBe("agentmemory://status");
    const prompt = await codex.request("prompts/get", { name: "recall_context", arguments: { task_description: token } });
    expect(prompt.result.messages.length).toBeGreaterThan(0);
    await delay(1000);
    await stop(running.worker);
    await stop(running.engine);
    const failed = await codex.request("tools/call", { name: "memory_save", arguments: { content: "must not fallback" } });
    expect(failed.result.isError).toBe(true);
    running = await daemon();
    expect(JSON.stringify(await codex.tool("memory_smart_search", { query: token }))).toContain(token);
    const ids = [saved.id ?? saved.memory?.id, savedByClaude.id ?? savedByClaude.memory?.id];
    expect(ids.every((id) => typeof id === "string")).toBe(true);
    await codex.tool("memory_governance_delete", { memoryIds: ids.join(","), reason: "synthetic smoke cleanup" });
    const remaining = JSON.stringify(await codex.tool("memory_smart_search", { query: token }));
    for (const id of ids) expect(remaining).not.toContain(id);
    await stop(codex.child);
    await stop(claude.child);
    await stop(running.worker);
    await stop(running.engine);
  }, 90_000);
});
