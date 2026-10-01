import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import { getAllTools } from "../src/mcp/tools-registry.js";

const root = resolve(__dirname, "..");
const secret = "synthetic-review-secret";
const requests: Array<{ path: string; method: string; body: any }> = [];
let server: Server;
let url: string;
let extracted: string;
let mode: "ok" | "unauthorized" | "invalid-json" | "redirect" = "ok";
let child: ChildProcessWithoutNullStreams;
let request: (method: string, params?: Record<string, unknown>) => Promise<any>;

function startBridge() {
  const config = JSON.parse(readFileSync(join(extracted, ".mcp.json"), "utf8")).mcpServers.agentmemory;
  child = spawn(config.command, config.args, {
    cwd: resolve(extracted, config.cwd),
    env: { ...process.env, AGENTMEMORY_URL: url, AGENTMEMORY_SECRET: secret },
    stdio: "pipe",
  });
  let id = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      waiter.resolve(message);
    }
  });
  child.on("exit", () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Bridge exited before responding"));
    }
    pending.clear();
  });
  request = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => {
      pending.delete(next);
      reject(new Error(`Timed out: ${method}`));
    }, 5000);
    pending.set(next, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: next, method, params }) + "\n");
  });
}

beforeAll(async () => {
  execFileSync(process.execPath, ["scripts/plugins/package-codex.mjs"], { cwd: root });
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  extracted = mkdtempSync(join(tmpdir(), "agentmemory plugin with spaces "));
  execFileSync("unzip", ["-q", join(root, `dist/plugins/agentmemory-codex-local-${version}.zip`), "-d", extracted]);
  server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    requests.push({ path: req.url!, method: req.method!, body });
    res.setHeader("content-type", "application/json");
    if (mode === "unauthorized" || req.headers.authorization !== `Bearer ${secret}`) {
      res.writeHead(401).end(JSON.stringify({ error: secret }));
      return;
    }
    if (mode === "invalid-json") { res.end("invalid JSON"); return; }
    if (mode === "redirect") { res.writeHead(302, { location: "/leak" }).end(); return; }
    switch (req.url) {
      case "/agentmemory/mcp/tools": res.end(JSON.stringify({ tools: getAllTools() })); break;
      case "/agentmemory/mcp/call":
        res.end(JSON.stringify({ content: [{ type: "text", text: "result" }], structuredContent: body, isError: body.name === "fail" })); break;
      case "/agentmemory/mcp/resources":
        res.end(JSON.stringify({ resources: [
          { uri: "agentmemory://status", name: "Status", mimeType: "application/json" },
          { uri: "agentmemory://project/{name}/profile", name: "Profile", mimeType: "application/json" },
        ] })); break;
      case "/agentmemory/mcp/resources/read":
        res.end(JSON.stringify({ contents: [{ uri: body.uri, mimeType: "application/json", text: "{}" }] })); break;
      case "/agentmemory/mcp/prompts": res.end(JSON.stringify({ prompts: [{ name: "recall_context" }] })); break;
      case "/agentmemory/mcp/prompts/get":
        res.end(JSON.stringify({ messages: [{ role: "user", content: { type: "text", text: body.arguments.task_description } }] })); break;
      default: res.writeHead(404).end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  startBridge();
}, 20_000);

afterAll(async () => {
  child?.kill();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (extracted) rmSync(extracted, { recursive: true, force: true });
});

describe("packaged local Codex MCP over real stdio and HTTP", () => {
  it("loads from an extracted path with spaces and negotiates capabilities", async () => {
    const message = await request("initialize", { protocolVersion: "2025-06-18" });
    expect(message.result.protocolVersion).toBe("2025-06-18");
    expect(message.result.capabilities).toEqual({ tools: {}, resources: {}, prompts: {} });
    expect((await request("ping")).result).toEqual({});
  });

  it("lists the daemon's complete tool schemas without a static fallback", async () => {
    expect((await request("tools/list")).result.tools).toEqual(getAllTools());
  });

  it("preserves arguments and structured tool results without projecting fields", async () => {
    const params = { name: "memory_smart_search", arguments: { project: "/review/alpha", expandIds: ["id1"], query: "pagination", customFutureField: true } };
    expect((await request("tools/call", params)).result.structuredContent).toEqual(params);
    expect(requests.at(-1)).toEqual({ method: "POST", path: "/agentmemory/mcp/call", body: params });
  });

  it("preserves a daemon's tool error instead of claiming success", async () => {
    expect((await request("tools/call", { name: "fail" })).result.isError).toBe(true);
  });

  it("separates resource templates from concrete resources", async () => {
    expect((await request("resources/list")).result.resources).toEqual([
      { uri: "agentmemory://status", name: "Status", mimeType: "application/json" },
    ]);
    expect((await request("resources/templates/list")).result.resourceTemplates).toEqual([
      { uriTemplate: "agentmemory://project/{name}/profile", name: "Profile", mimeType: "application/json" },
    ]);
  });

  it("reads resources using the daemon's POST route", async () => {
    expect((await request("resources/read", { uri: "agentmemory://status" })).result.contents[0].uri).toBe("agentmemory://status");
    expect(requests.at(-1)?.method).toBe("POST");
  });

  it("lists and retrieves prompts without losing their arguments", async () => {
    expect((await request("prompts/list")).result.prompts[0].name).toBe("recall_context");
    const result = await request("prompts/get", { name: "recall_context", arguments: { task_description: "resume alpha" } });
    expect(result.result.messages[0].content.text).toBe("resume alpha");
  });

  it("returns protocol errors for unsupported methods and missing parameters", async () => {
    expect((await request("unknown")).error.code).toBe(-32601);
    expect((await request("tools/call")).error.code).toBe(-32602);
    expect((await request("resources/read")).error.code).toBe(-32602);
  });

  it("reports auth failures without leaking response bodies or using a fallback", async () => {
    mode = "unauthorized";
    try {
      const result = await request("tools/call", { name: "memory_save", arguments: { content: "probe" } });
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].text).toContain("HTTP 401");
      expect(JSON.stringify(result)).not.toContain(secret);
      expect((await request("tools/list")).error).toBeDefined();
    } finally { mode = "ok"; }
  });

  it("reports malformed daemon responses as failures", async () => {
    mode = "invalid-json";
    try {
      expect((await request("tools/call", { name: "memory_save" })).result.isError).toBe(true);
    } finally { mode = "ok"; }
  });

  it("does not follow redirects or retry a write", async () => {
    mode = "redirect";
    const before = requests.length;
    try {
      expect((await request("tools/call", { name: "memory_save" })).result.isError).toBe(true);
      expect(requests.length - before).toBe(1);
    } finally { mode = "ok"; }
  });

  it("returns a visible outage error and reconnects after recovery", async () => {
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const result = await request("tools/call", { name: "memory_save" });
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain("No fallback store was used");
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
    expect((await request("tools/list")).result.tools).toEqual(getAllTools());
  });
});

describe("Codex release packaging", () => {
  it("includes the listing, icon, onboarding, and only Codex hook dependencies", () => {
    const manifest = JSON.parse(readFileSync(join(extracted, ".codex-plugin/plugin.json"), "utf8"));
    expect(manifest.mcpServers).toBe("./.mcp.json");
    for (const path of [manifest.hooks, manifest.interface.logo, manifest.interface.composerIcon,
      manifest.extensions["com.openai"].onboardingSkill]) expect(existsSync(join(extracted, path))).toBe(true);
    expect(manifest.interface.shortDescription.length).toBeLessThanOrEqual(30);
    expect(readdirSync(join(extracted, "scripts"))).toHaveLength(7);
    expect(existsSync(join(extracted, ".claude-plugin"))).toBe(false);
    expect(existsSync(join(extracted, "plugin.json"))).toBe(false);
  });

  it("excludes lifecycle hooks from the review ZIP but retains MCP and skills", () => {
    const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    const archive = join(root, `dist/plugins/agentmemory-codex-review-${version}.zip`);
    const listing = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" });
    expect(listing).not.toMatch(/^hooks\//m);
    expect(listing).not.toContain("scripts/session-start.mjs");
    expect(listing).toContain(".mcp.json");
    expect(listing).toContain("skills/agentmemory-config/SKILL.md");
    const manifest = JSON.parse(execFileSync("unzip", ["-p", archive, ".codex-plugin/plugin.json"], { encoding: "utf8" }));
    expect(manifest.hooks).toBeUndefined();
    expect(manifest.mcpServers).toBe("./.mcp.json");
  });
});
