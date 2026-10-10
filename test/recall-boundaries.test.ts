import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/mcp/transport.js", () => ({
  createStdioTransport: () => ({ start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("../src/config.js", async (original) => ({
  ...await original<typeof import("../src/config.js")>(),
  getStandalonePersistPath: () => undefined,
}));

import * as config from "../src/config.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { handleToolCall } from "../src/mcp/standalone.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";
import { resetHandleForTests, setLivezProbe } from "../src/mcp/rest-proxy.js";
import { getAllTools } from "../src/mcp/tools-registry.js";

type Handler = (req: unknown) => Promise<{ status_code: number; body: any }>;

function endpoints(result: unknown = { results: [] }) {
  const handlers = new Map<string, Handler>();
  const kv = new InMemoryKV();
  const trigger = vi.fn(async () => result);
  const sdk = {
    registerFunction: (name: string, handler: Handler) => handlers.set(name, handler),
    registerTrigger: vi.fn(), trigger, on: vi.fn(),
  };
  registerApiTriggers(sdk as never, kv as never);
  registerMcpEndpoints(sdk as never, kv as never);
  const call = (name: string, body: unknown) => handlers.get(name)!({
    method: "POST", headers: { "content-type": "application/json" }, query_params: {}, body,
  });
  return { call, trigger };
}

beforeEach(() => {
  vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "shared");
  vi.stubEnv("AGENT_ID", "");
  vi.stubEnv("AGENTMEMORY_URL", "http://127.0.0.1:3111");
  vi.stubEnv("AGENTMEMORY_FORCE_PROXY", "");
  resetHandleForTests();
});
afterEach(() => {
  resetHandleForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("recall request boundaries", () => {
  it.each(["project", "agentId"])("rejects malformed %s filters instead of broadening REST recall", async (field) => {
    const { call, trigger } = endpoints();
    for (const name of ["api::search", "api::smart-search"]) {
      for (const value of [null, 42, [], {}]) {
        const result = await call(name, { query: "context", targetLayer: "memory", [field]: value });
        expect(result.status_code).toBe(400);
        expect(result.body.error).toContain(field);
      }
    }
    expect(trigger).not.toHaveBeenCalled();
  });

  it.each(["query", "sessionId", "source", "includeLessons"])("rejects malformed smart-search %s before dispatch", async (field) => {
    const { call, trigger } = endpoints();
    const result = await call("api::smart-search", { expandIds: ["mem_recover"], [field]: {} });
    expect(result.status_code).toBe(400);
    expect(result.body.error).toContain(field);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("rejects malformed expansion requests rather than crashing or silently dropping entries", async () => {
    const { call, trigger } = endpoints();
    const invalid = [null, "mem_a", {}, [null], [1], [""], [" "], [{}], [{ obsId: 3 }],
      [{ obsId: "mem_a", sessionId: 3 }], [{ obsId: "mem_a", sessionId: " " }]];
    for (const expandIds of invalid) {
      const result = await call("api::smart-search", { query: "context", expandIds });
      expect(result.status_code).toBe(400);
      expect(result.body.error).toContain("expandIds");
    }
    expect((await call("api::smart-search", { query: " ", expandIds: [] })).status_code).toBe(400);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("normalizes valid expansion IDs and optional session hints while preserving recovery without a query", async () => {
    const { call, trigger } = endpoints();
    const result = await call("api::smart-search", {
      expandIds: [" mem_first ", { obsId: " mem_second " }, { obsId: " obs_third ", sessionId: " ses_one " }],
      targetLayer: "memory", project: "/alpha", agentId: "agent-a", includeLessons: false,
    });
    expect(result.status_code).toBe(200);
    expect(trigger).toHaveBeenCalledWith({ function_id: "mem::smart-search", payload: expect.objectContaining({
      query: undefined, expandIds: ["mem_first", "mem_second", { obsId: "obs_third", sessionId: "ses_one" }],
      targetLayer: "memory", project: "/alpha", agentId: "agent-a", includeLessons: false,
    }) });
  });

  it.each(["memory_recall", "memory_smart_search"])("advertises the exact layer enum for %s", (name) => {
    const tool = getAllTools().find((entry) => entry.name === name)!;
    expect(tool.inputSchema.properties.targetLayer.enum).toEqual(["all", "memory", "observation"]);
    expect(tool.inputSchema.properties).toHaveProperty("project");
    expect(tool.inputSchema.properties).toHaveProperty("agentId");
    if (name === "memory_smart_search") expect(tool.inputSchema.required ?? []).not.toContain("query");
  });

  it.each([null, "", "Memory", "lesson", "insight", [], {}, 1])("rejects invalid targetLayer %j before dispatch at REST and MCP", async (targetLayer) => {
    const { call, trigger } = endpoints();
    for (const name of ["api::search", "api::smart-search"]) {
      const result = await call(name, { query: "context", targetLayer });
      expect(result.status_code).toBe(400);
      expect(result.body.error).toContain("targetLayer");
    }
    for (const name of ["memory_recall", "memory_smart_search"]) {
      const result = await call("mcp::tools::call", { name, arguments: { query: "context", targetLayer } });
      expect(result.status_code).toBe(400);
      expect(result.body.error).toContain("targetLayer");
    }
    expect(trigger).not.toHaveBeenCalled();
  });

  it.each(["all", "memory", "observation"])("forwards %s with recall scope and preserves narrative metadata", async (targetLayer) => {
    const response = {
      format: "narrative", text: "1. preview", results: [{ obsId: "mem_one", content_truncated: true }],
      tokens_used: 100, tokens_budget: 100, truncated: true, matched_count: 2,
      excluded_by_budget: 1, excluded_results: [{ obsId: "mem_two", sessionId: "memory", title: "second" }],
    };
    const { call, trigger } = endpoints(response);
    const args = { query: "context", limit: 2, format: "narrative", token_budget: 100,
      targetLayer, project: "/alpha", cwd: "/alpha/worktree", agentId: "agent-a" };
    const rest = await call("api::search", args);
    expect(rest.body).toEqual(response);
    expect(trigger).toHaveBeenLastCalledWith({ function_id: "mem::search", payload: args });
    const mcp = await call("mcp::tools::call", { name: "memory_recall", arguments: args });
    expect(JSON.parse(mcp.body.content[0].text)).toEqual(response);
    expect(trigger).toHaveBeenLastCalledWith({ function_id: "mem::search", payload: args });
  });

  it("preserves smart expansion hints, scopes and diagnostics fields without capping before layer filtering", async () => {
    const { call, trigger } = endpoints();
    const expandIds = Array.from({ length: 25 }, (_, index) => ({ obsId: `obs_${index}`, sessionId: "ses_one" }));
    expandIds.push({ obsId: "mem_recover", sessionId: "memory" });
    const args = { expandIds, limit: 5, project: "/alpha", agentId: "agent-a", sessionId: "ses_current",
      source: "agent", includeLessons: false, targetLayer: "memory" };
    expect((await call("api::smart-search", args)).status_code).toBe(200);
    expect(trigger).toHaveBeenLastCalledWith({ function_id: "mem::smart-search", payload: { ...args, query: undefined } });
    expect((await call("mcp::tools::call", { name: "memory_smart_search", arguments: args })).status_code).toBe(200);
    expect(trigger).toHaveBeenLastCalledWith({ function_id: "mem::smart-search", payload: { ...args, query: undefined } });
  });

  it("defaults omitted targetLayer to all at both REST routes", async () => {
    const { call, trigger } = endpoints();
    for (const name of ["api::search", "api::smart-search"]) {
      await call(name, { query: "context" });
      expect(trigger).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ targetLayer: "all" }) }));
    }
  });
});

describe("standalone recall boundaries", () => {
  it("forwards recall and smart search scopes, layer and expansion to the daemon", async () => {
    setLivezProbe(async () => ({ ok: true, status: 200, statusText: "OK" }));
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(init?.body, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const recall = { query: "context", limit: 4, format: "narrative", token_budget: 200, targetLayer: "memory",
      project: "/alpha", cwd: "/alpha/worktree", agentId: "agent-a" };
    expect(JSON.parse((await handleToolCall("memory_recall", recall)).content[0].text)).toEqual(recall);
    const smart = { limit: 4, targetLayer: "observation", project: "/alpha", agentId: "agent-a",
      expandIds: [{ obsId: "obs_a", sessionId: "ses_a" }], sessionId: "ses_current", source: "agent", includeLessons: false };
    expect(JSON.parse((await handleToolCall("memory_smart_search", smart)).content[0].text)).toEqual(smart);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:3111/agentmemory/search", "http://127.0.0.1:3111/agentmemory/smart-search",
    ]);
  });

  it.each(["memory_recall", "memory_smart_search"])("rejects invalid layers for %s without invoking a daemon route", async (tool) => {
    setLivezProbe(async () => ({ ok: true, status: 200, statusText: "OK" }));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const targetLayer of [null, "", "Memory", "lesson", [], 1]) {
      await expect(handleToolCall(tool, { query: "context", targetLayer }, new InMemoryKV())).rejects.toThrow("targetLayer");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("filters local durable memories before limits and returns no observations", async () => {
    setLivezProbe(async () => ({ ok: false, status: 0, statusText: "offline" }));
    const kv = new InMemoryKV();
    await handleToolCall("memory_save", { content: "context wrong project", project: "/beta", agentId: "agent-a" }, kv);
    await handleToolCall("memory_save", { content: "context wrong agent", project: "/alpha", agentId: "agent-b" }, kv);
    const saved = JSON.parse((await handleToolCall("memory_save", {
      content: "context selected memory", project: "/alpha", agentId: "agent-a",
    }, kv)).content[0].text).saved;
    for (const tool of ["memory_recall", "memory_smart_search"]) {
      const args = { query: "context", project: "/alpha", agentId: "agent-a", limit: 1, targetLayer: "memory" };
      const result = JSON.parse((await handleToolCall(tool, args, kv)).content[0].text);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].layer).toBe("memory");
      if (tool === "memory_smart_search") {
        expect(result.results[0].obsId).toBe(saved);
        expect(result.results[0].sessionId).toBe("memory");
      }
      expect(JSON.stringify(result.results[0])).toContain(saved);
      const observations = JSON.parse((await handleToolCall(tool, { ...args, targetLayer: "observation" }, kv)).content[0].text);
      expect(observations.results).toEqual([]);
    }
  });

  it("discloses a tiny budget and recovers excluded local memory content by id", async () => {
    setLivezProbe(async () => ({ ok: false, status: 0, statusText: "offline" }));
    const kv = new InMemoryKV();
    const content = `context ${"long memory body ".repeat(100)}`;
    const saved = JSON.parse((await handleToolCall("memory_save", { content, project: "/alpha" }, kv)).content[0].text).saved;
    for (const format of ["full", "compact", "narrative"]) {
      const result = JSON.parse((await handleToolCall("memory_recall", {
        query: "context", format, token_budget: 1, targetLayer: "memory", project: "/alpha",
      }, kv)).content[0].text);
      expect(result).toMatchObject({ format, results: [], truncated: true, matched_count: 1, excluded_by_budget: 1, tokens_budget: 1 });
      expect(result.excluded_results[0].obsId).toBe(saved);
      expect(result.minimum_budget).toBeGreaterThan(1);
      const expanded = JSON.parse((await handleToolCall("memory_smart_search", {
        expandIds: result.excluded_results.map((entry: { obsId: string }) => entry.obsId).join(","),
        project: "/alpha", targetLayer: "memory",
      }, kv)).content[0].text);
      expect(expanded.mode).toBe("expanded");
      expect(expanded.results[0].observation.narrative).toBe(content);
      expect(expanded.results[0].layer).toBe("memory");
    }
  });

  it("clips oversized local recall within budget and preserves complete stored content", async () => {
    setLivezProbe(async () => ({ ok: false, status: 0, statusText: "offline" }));
    const kv = new InMemoryKV();
    const content = `context ${"recovery detail ".repeat(1000)}`;
    await handleToolCall("memory_save", { content }, kv);
    for (const format of ["full", "narrative"]) {
      const result = JSON.parse((await handleToolCall("memory_recall", {
        query: "context", format, token_budget: 200, targetLayer: "memory",
      }, kv)).content[0].text);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].content_truncated).toBe(true);
      expect(result.truncated).toBe(true);
      expect(result.tokens_used).toBeLessThanOrEqual(200);
      expect(result.matched_count).toBe(1);
    }
    expect((await kv.list<{ content: string }>("mem:memories"))[0].content).toBe(content);
  });

  it("fails closed without an agent in isolated fallback and honors a wildcard", async () => {
    setLivezProbe(async () => ({ ok: false, status: 0, statusText: "offline" }));
    const kv = new InMemoryKV();
    await handleToolCall("memory_save", { content: "context shared" }, kv);
    vi.spyOn(config, "isAgentScopeIsolated").mockReturnValue(true);
    await expect(handleToolCall("memory_recall", { query: "context" }, kv)).rejects.toThrow("requires an agentId");
    const result = JSON.parse((await handleToolCall("memory_recall", { query: "context", agentId: "*" }, kv)).content[0].text);
    expect(result.results).toHaveLength(1);
  });
});
