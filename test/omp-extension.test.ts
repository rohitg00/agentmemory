import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as zod from "zod";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import agentmemoryExtension from "../integrations/omp/index.ts";
import { spoolSummary } from "../src/capture/spool.js";
import { resolveSecret } from "../integrations/omp/security.ts";

// The host dispatches heterogeneous event/tool signatures; this test double
// intentionally uses any at that boundary so tests can supply partial events.
const shutdowns: (() => Promise<unknown>)[] = [];
function extension() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const tools = new Map<string, any>();
  const ctx = {
    cwd: "/workspace/project-alpha",
    sessionManager: { getSessionFile: () => "/sessions/first.jsonl", getSessionId: () => "first" },
    ui: { setStatus: vi.fn(), notify: vi.fn() },
  };
  agentmemoryExtension({
    zod,
    on: (name: string, handler: any) => handlers.set(name, handler),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: vi.fn(),
  } as any);
  shutdowns.push(() => handlers.get("session_shutdown")!({}));
  return { handlers, tools, ctx };
}

describe("omp extension", () => {
  let fixtureHome: string;
  beforeEach(() => {
    fixtureHome = mkdtempSync(join(tmpdir(), "omp-extension-"));
    vi.stubEnv("HOME", fixtureHome);
    vi.stubEnv("AGENTMEMORY_CAPTURE_SPOOL_DIR", join(fixtureHome, "spool"));
    vi.stubEnv("AGENTMEMORY_URL", "http://127.0.0.1:43392");
    vi.stubEnv("AGENTMEMORY_SECRET", "");
    vi.stubEnv("AGENTMEMORY_PROJECT_NAME", "");
    vi.stubEnv("AGENTMEMORY_CREDENTIAL_MODE", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "healthy", results: [] }))));
  });

  afterEach(async () => {
    vi.mocked(fetch).mockImplementation(async () => Response.json({ status: "healthy" }));
    await Promise.all(shutdowns.splice(0).map(stop => stop()));
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(fixtureHome, { recursive: true, force: true });
  });

  it("preserves the host's system prompt blocks", async () => {
    const { handlers, ctx } = extension();
    const result = await handlers.get("before_agent_start")!({ prompt: "hello", systemPrompt: ["first policy", "second policy"] }, ctx);
    expect(result.systemPrompt).toEqual(["first policy", "second policy", expect.stringContaining("memory_search")]);
  });

  it("scopes saved and recalled memories to the host workspace", async () => {
    const { handlers, tools, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    await tools.get("memory_save").execute("save", { content: "Use pnpm" });
    await tools.get("memory_search").execute("search", { query: "package manager" });
    await handlers.get("before_agent_start")!({ prompt: "package manager", systemPrompt: [] }, ctx);
    const calls = vi.mocked(fetch).mock.calls;
    for (const [url, options] of calls.filter(([url]) => /remember|smart-search/.test(String(url)))) {
      expect(JSON.parse(options!.body as string), String(url)).toMatchObject({ project: "project-alpha" });
    }
    expect(JSON.parse(calls.find(([url]) => String(url).endsWith("session/start"))![1]!.body as string)).toMatchObject({ cwd: ctx.cwd });
  });

  it("leaves complete tool output available to the model", async () => {
    const { handlers } = extension();
    const messages = [{ role: "toolResult", content: [{ type: "text", text: "x".repeat(12000) + "important final lines" }] }];
    const result = await handlers.get("context")!({ messages });
    expect(result?.messages ?? messages).toEqual(messages);
  });

  it("starts an independent session after a host session switch", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    const result = { toolName: "read", input: { path: "same.txt" }, content: [{ type: "text", text: "same output" }] };
    handlers.get("tool_result")!(result);
    ctx.sessionManager.getSessionFile = () => "/sessions/second.jsonl";
    ctx.sessionManager.getSessionId = () => "second";
    await handlers.get("session_switch")?.({ reason: "new" }, ctx);
    handlers.get("tool_result")!(result);
    const posts = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("observe")).map(([,options]) => JSON.parse(options!.body as string));
    expect(posts.map(post => post.sessionId)).toEqual(["first", "second"]);
  });

  it("awaits finalization before shutdown returns without starting long consolidation jobs", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    const order: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url) => {
      order.push(String(url).split("/agentmemory/")[1]);
      await new Promise(resolve => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ success: true }));
    });
    await handlers.get("session_shutdown")!({});
    expect(order).toEqual(["session/end"]);
  });

  it("finalizes the previous session before registering a switched session", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    vi.mocked(fetch).mockClear();
    ctx.sessionManager.getSessionId = () => "second";
    await handlers.get("session_switch")!({ reason: "new" }, ctx);
    const lifecycle = vi.mocked(fetch).mock.calls
      .filter(([url]) => /session\/(start|end)$/.test(String(url)))
      .map(([url, options]) => [String(url).split("/agentmemory/")[1], JSON.parse(options!.body as string).sessionId]);
    expect(lifecycle).toEqual([["session/end", "first"], ["session/start", "second"]]);
  });

  it("authenticates to the local daemon using its saved secret", async () => {
    const home = mkdtempSync(join(tmpdir(), "omp-auth-"));
    try {
      vi.stubEnv("HOME", home);
      vi.stubEnv("AGENTMEMORY_SECRET", "");
      mkdirSync(join(home, ".agentmemory"));
      writeFileSync(join(home, ".agentmemory", "secret"), "local-fixture-secret\n");
      const { tools } = extension();
      await tools.get("memory_health").execute();
      expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toMatchObject({ Authorization: "Bearer local-fixture-secret" });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it.each([[5, 5, 5], [2, 5, 5], [0, 8, 3], [8, 8, 10], [1, 0, 5], [0, 0, 5]])(
    "shares the result limit across %i memories and %i lessons (limit %i)", async (memories, lessons, limit) => {
      const results = Array.from({ length: memories }, (_, i) => ({ title: `Memory ${i}`, narrative: "fact" }));
      const learned = Array.from({ length: lessons }, (_, i) => ({ content: `Lesson ${i}` }));
      vi.mocked(fetch).mockImplementation(async url => Response.json(String(url).endsWith("health")
        ? { status: "healthy" } : { results, lessons: learned }));
      const { tools, handlers, ctx } = extension();
      const result = await tools.get("memory_search").execute("search", { query: "facts", limit });
      expect(result.details.results).toEqual(results.slice(0, limit));
      expect(result.details.lessons).toEqual(learned.slice(0, Math.max(0, limit - memories)));
      expect(result.content[0].text.split("\n").filter((line: string) => line.startsWith("- "))).toHaveLength(Math.min(memories + lessons, limit));
      const recall = await handlers.get("before_agent_start")!({ prompt: "facts", systemPrompt: [] }, ctx);
      expect((recall.message?.content || "").split("\n").filter((line: string) => line.startsWith("- "))).toHaveLength(Math.min(memories + lessons, 5));
    },
  );

  it.each(["", "0", "1"])("blocks remote plaintext credentials regardless of HTTPS setting %s", setting => {
    vi.stubEnv("AGENTMEMORY_REQUIRE_HTTPS", setting);
    vi.stubEnv("AGENTMEMORY_URL", "http://memory.example.test");
    vi.stubEnv("AGENTMEMORY_SECRET", "remote-fixture");
    expect(() => extension()).toThrow("Use HTTPS or an SSH tunnel");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends explicit HTTPS credentials without following redirects", async () => {
    vi.stubEnv("AGENTMEMORY_URL", "https://memory.example.test");
    vi.stubEnv("AGENTMEMORY_SECRET", "remote-fixture");
    const { tools } = extension();
    await tools.get("memory_health").execute();
    expect(fetch).toHaveBeenCalledWith("https://memory.example.test/agentmemory/health", expect.objectContaining({
      redirect: "error", headers: { Authorization: "Bearer remote-fixture" },
    }));
  });

  it("includes recalled lessons even when no observations match", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => new Response(JSON.stringify(String(url).endsWith("health")
      ? { status: "healthy" }
      : { results: [], lessons: [{ content: "Prefer cobalt labels", confidence: 0.9 }] })));
    const { handlers, tools, ctx } = extension();
    const result = await tools.get("memory_search").execute("search", { query: "labels" });
    expect(result.content[0].text).toContain("Prefer cobalt labels");
    const prompt = await handlers.get("before_agent_start")!({ prompt: "labels", systemPrompt: [] }, ctx);
    expect(prompt.message).toMatchObject({ customType: "agentmemory-recall", content: expect.stringContaining("Prefer cobalt labels"), display: false });
    expect(prompt.systemPrompt.join("\n")).not.toContain("Prefer cobalt labels");
  });

  it("continues capture and recall while the server reports degraded health", async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ status: "degraded", results: [] })));
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    await handlers.get("before_agent_start")!({ prompt: "hello", systemPrompt: [] }, ctx);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("session/start"))).toBe(true);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("smart-search"))).toBe(true);
  });

  it("distinguishes failed searches from empty search results", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const { tools } = extension();
    const result = await tools.get("memory_search").execute("search", { query: "hello" });
    expect(result.details.ok).toBe(false);
    expect(result.content[0].text).toContain("Failed to search");
  });

  it("does not store embedded image data in tool captures", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    handlers.get("tool_result")!({ toolName: "read", input: {}, content: [{ type: "text", text: "screenshot: data:image/png;base64,aGVsbG8=" }] });
    const payload = JSON.parse(vi.mocked(fetch).mock.lastCall![1]!.body as string);
    expect(payload.data.tool_output).toBe("screenshot: [image data]");
  });

  it("captures failed tools as failures for server-side error recall", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    handlers.get("tool_result")!({ toolName: "read", input: { path: "missing.ts" }, content: [{ type: "text", text: "not found" }], isError: true });
    const payload = JSON.parse(vi.mocked(fetch).mock.lastCall![1]!.body as string);
    expect(payload.hookType).toBe("post_tool_failure");
    expect(payload.data.is_error).toBe(true);
  });

  it("accepts stored credentials on the full loopback range in strict HTTPS mode", async () => {
    vi.stubEnv("AGENTMEMORY_REQUIRE_HTTPS", "1");
    vi.stubEnv("AGENTMEMORY_URL", "http://127.0.0.2:3111");
    mkdirSync(join(fixtureHome, ".agentmemory"));
    writeFileSync(join(fixtureHome, ".agentmemory", "secret"), "loopback-fixture");
    const { tools } = extension();
    await tools.get("memory_health").execute();
    expect(vi.mocked(fetch).mock.lastCall?.[1]?.headers).toMatchObject({ Authorization: "Bearer loopback-fixture" });
  });

  it("never discovers local credentials for a remote URL or explicit-only client", () => {
    const home = mkdtempSync(join(tmpdir(), "omp-auth-"));
    try {
      vi.stubEnv("HOME", home);
      mkdirSync(join(home, ".agentmemory"));
      writeFileSync(join(home, ".agentmemory", "secret"), "local-fixture-secret");
      expect(resolveSecret("https://remote.example")).toBe("");
      expect(resolveSecret("http://127.0.0.1", "explicit-fixture")).toBe("explicit-fixture");
      vi.stubEnv("AGENTMEMORY_CREDENTIAL_MODE", "explicit");
      expect(resolveSecret("http://127.0.0.1")).toBe("");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("preserves compaction instructions while adding fetched memory context", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ context: "compaction memory" })));
    await handlers.get("session_before_compact")!({ customInstructions: "keep the plan" });
    expect(await handlers.get("session.compacting")!({ sessionId: "first" })).toEqual({ context: ["compaction memory"] });
  });

  it("injects optional enrichment as a valid custom message without changing tool content", async () => {
    vi.stubEnv("AGENTMEMORY_INJECT_CONTEXT", "1");
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    handlers.get("tool_call")!({ toolName: "read", input: { path: "sample.ts" } });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ context: "file convention" })));
    const messages = [{ role: "user", content: "read sample" }];
    const result = await handlers.get("context")!({ messages });
    expect(result.messages[0]).toEqual(messages[0]);
    expect(result.messages[1]).toMatchObject({ role: "custom", customType: "agentmemory-context", content: expect.stringContaining("file convention"), display: false });
  });

  it("bounds a stalled finalization request within the host shutdown deadline", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason));
    }));
    const started = Date.now();
    await handlers.get("session_shutdown")!({});
    expect(Date.now() - started).toBeLessThan(1900);
  });
  it("captures prompts, failed tools and final replies while the daemon is offline", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx);
    await handlers.get("before_agent_start")!({ prompt: "offline work", systemPrompt: [] }, ctx);
    handlers.get("tool_result")!({ toolName: "read", toolCallId: "offline-tool", input: {}, content: [{ type: "text", text: "missing" }], isError: true });
    handlers.get("agent_end")!({ messages: [{ role: "assistant", content: "offline reply" }] });
    await handlers.get("session_shutdown")!({});
    expect(spoolSummary(process.env.AGENTMEMORY_URL!).records).toBe(3);
  });

  it("filters memory tools and configured exclusions without changing model-visible results", async () => {
    vi.stubEnv("AGENTMEMORY_CAPTURE_DENY", "bash");
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx); vi.mocked(fetch).mockClear();
    for (const toolName of ["memory_save", "mcp__agentmemory__memory_search", "mcp__agentmemory_memory_sessions", "bash"]) {
      expect(handlers.get("tool_result")!({ toolName, input: {}, content: [{ type: "text", text: "original" }] })).toBeUndefined();
    }
    handlers.get("tool_result")!({ toolName: "write", input: { path: "xd://mcp__agentmemory_memory_sessions", content: "{}" }, content: [{ type: "text", text: "recalled session" }] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps distinct identical tool calls and deduplicates redelivery of the same call", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("session_start")!({}, ctx); vi.mocked(fetch).mockClear();
    const event = { toolName: "read", input: {}, content: [{ type: "text", text: "same" }] };
    for (const toolCallId of ["one", "two", "two"]) handlers.get("tool_result")!({ ...event, toolCallId });
    const posts = vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(options!.body as string));
    expect(posts).toHaveLength(2); expect(posts[0].eventId).not.toBe(posts[1].eventId);
  });

  it("redacts capture before truncation without modifying original tool output", async () => {
    vi.stubEnv("AGENTMEMORY_CAPTURE_OUTPUT_MAX", "100");
    const { handlers, ctx } = extension(); await handlers.get("session_start")!({}, ctx);
    const event = { toolName: "read", input: { clientSecret: "short-secret" }, content: [{ type: "text", text: "<private>" + "secret".repeat(100) + "</private> safe suffix" }] };
    handlers.get("tool_result")!(event);
    const payload = JSON.parse(vi.mocked(fetch).mock.lastCall![1]!.body as string);
    expect(payload.data.tool_output).toBe("[REDACTED] safe suffix");
    expect(payload.data.tool_input).not.toContain("short-secret");
    expect(event.content[0].text).toContain("<private>");
  });
  it("scrubs secrets in metadata and input keys before any request reaches the wire", async () => {
    const secret = "ghp_" + "a".repeat(36);
    vi.stubEnv("AGENTMEMORY_PROJECT_NAME", secret);
    const { handlers, ctx } = extension(); ctx.cwd = `/workspace/${secret}`;
    await handlers.get("session_start")!({}, ctx);
    await handlers.get("before_agent_start")!({ prompt: "work", systemPrompt: [] }, ctx);
    const input = { [secret]: "preserved value" };
    handlers.get("tool_result")!({ toolName: "read", input, content: [{ type: "text", text: "done" }] });
    const requests = vi.mocked(fetch).mock.calls.filter(([, options]) => options?.body);
    expect(requests.length).toBeGreaterThan(0);
    for (const [, options] of requests) expect(options!.body).not.toContain(secret);
    const capture = JSON.parse(vi.mocked(fetch).mock.lastCall![1]!.body as string);
    expect(capture).toMatchObject({ project: "[REDACTED_SECRET]", cwd: "/workspace/[REDACTED_SECRET]" });
    expect(JSON.parse(capture.data.tool_input)).toEqual({ "[REDACTED_SECRET]": "preserved value" });
    expect(Object.keys(input)).toEqual([secret]);
    vi.stubEnv("AGENTMEMORY_CAPTURE_OUTPUT_MAX", "100");
    handlers.get("tool_result")!({ toolName: "read", input: { prefix: "x".repeat(60), ...input }, content: [] });
    expect(vi.mocked(fetch).mock.lastCall![1]!.body).not.toContain("ghp_");
  });

  it("does not capture a final reply while OMP is still continuing asynchronously", async () => {
    const { handlers, ctx } = extension();
    await handlers.get("before_agent_start")!({ prompt: "work", systemPrompt: [] }, ctx); vi.mocked(fetch).mockClear();
    const event = { messages: [{ role: "assistant", content: "partial" }] };
    handlers.get("agent_end")!({ ...event, willContinue: true });
    handlers.get("agent_end")!({ ...event, awaitingAsyncWork: true });
    expect(fetch).not.toHaveBeenCalled();
    handlers.get("agent_end")!(event); expect(fetch).toHaveBeenCalledTimes(1);
  });

});
