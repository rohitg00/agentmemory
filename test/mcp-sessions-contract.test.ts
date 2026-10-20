import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";
import { handleToolCall } from "../src/mcp/standalone.js";
import { resetHandleForTests } from "../src/mcp/rest-proxy.js";

type Response = { status_code: number; body: Record<string, unknown> };
type Handler = (request: unknown) => Promise<Response>;
function readPage(response: Response) {
  return JSON.parse((response.body.content as Array<{ text: string }>)[0].text) as {
    sessions: Array<{ id: string }>;
    nextCursor: string | null;
  };
}

function setup() {
  const handlers = new Map<string, Handler>();
  const kv = new InMemoryKV(undefined);
  const sdk = {
    registerFunction: (id: string, handler: Handler) => handlers.set(id, handler),
    registerTrigger: () => {}, on: () => {},
    trigger: async ({ function_id, payload }: { function_id: string; payload: unknown }) => {
      const handler = handlers.get(function_id);
      if (!handler) throw new Error(`Missing function ${function_id}`);
      return handler(payload);
    },
  };
  registerApiTriggers(sdk as never, kv as never, "session-contract-token");
  registerMcpEndpoints(sdk as never, kv as never, "session-contract-token");
  const headers = { authorization: "Bearer session-contract-token" };
  const call = (args: Record<string, unknown>) => handlers.get("mcp::tools::call")!({ headers, body: { name: "memory_sessions", arguments: args } });
  return { kv, call, handlers, headers };
}

describe("session tools across transports", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetHandleForTests(); });

  it("filters before limiting and shares the REST page and summary", async () => {
    const { kv, call, handlers, headers } = setup();
    for (const [id, project, startedAt] of [
      ["older", "app", "2026-01-01"], ["newer", "app", "2026-01-02"], ["foreign", "other", "2026-01-03"],
    ]) await kv.set("mem:sessions", id, { id, project, startedAt, agentId: "agent-a" });
    await kv.set("mem:summaries", "newer", { title: "Fixture summary" });
    const rest = await handlers.get("api::sessions")!({ headers, query_params: { project: "app", limit: "1" } });
    const mcp = await call({ project: "app", limit: 1 });
    expect(mcp.status_code).toBe(200);
    const page = readPage(mcp);
    expect(page).toEqual(rest.body);
    expect(page.sessions.map((s: { id: string }) => s.id)).toEqual(["newer"]);
    expect(page.nextCursor).toBeTypeOf("string");
    const next = await call({ project: "app", limit: 1, cursor: page.nextCursor });
    expect(readPage(next).sessions.map((s) => s.id)).toEqual(["older"]);
  });

  it.each([
    { limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: "1" }, { limit: Infinity }, { limit: null },
    { project: 5 }, { project: " " }, { agentId: [] }, { agentId: "" }, { cursor: "broken" },
  ])("rejects invalid scope or pagination on both MCP paths: %j", async (args) => {
    const { call, kv } = setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline fixture")));
    expect((await call(args)).status_code).toBe(400);
    await expect(handleToolCall("memory_sessions", args, kv)).rejects.toThrow();
  });

  it("keeps scoped ordering, summaries, and pagination in local fallback", async () => {
    const { kv } = setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline fixture")));
    for (const [id, project, agentId] of [["a", "app", "one"], ["b", "app", "one"], ["c", "app", "two"], ["d", "other", "one"]]) {
      await kv.set("mem:sessions", id, { id, project, agentId, startedAt: "2026-01-01" });
    }
    await kv.set("mem:summaries", "b", { title: "Local summary" });
    const first = JSON.parse((await handleToolCall("memory_sessions", { project: "app", agentId: "one", limit: 1 }, kv)).content[0].text);
    expect(first.sessions).toEqual([expect.objectContaining({ id: "b", summary: { title: "Local summary" } })]);
    const second = JSON.parse((await handleToolCall("memory_sessions", { project: "app", agentId: "one", limit: 1, cursor: first.nextCursor }, kv)).content[0].text);
    expect(second.sessions.map((s: { id: string }) => s.id)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
  });

  it.each(["", "  "])("treats a blank continuation cursor as the first page on every transport: %j", async (cursor) => {
    const { kv, call, handlers, headers } = setup();
    await kv.set("mem:sessions", "first", { id: "first", project: "app", startedAt: "2026-01-01" });
    const rest = await handlers.get("api::sessions")!({ headers, query_params: { project: "app", limit: "20", cursor } });
    const mcp = await call({ project: "app", cursor });
    expect(mcp.status_code).toBe(200);
    expect(readPage(mcp)).toEqual(rest.body);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline fixture")));
    const local = JSON.parse((await handleToolCall("memory_sessions", { project: "app", cursor }, kv)).content[0].text);
    expect(local).toEqual(rest.body);
  });

  it("does not disguise a daemon auth failure as empty local session history", async () => {
    const { kv } = setup();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/livez")
      ? new globalThis.Response("ok", { status: 200 })
      : new globalThis.Response("Unauthorized", { status: 401 })));
    await expect(handleToolCall("memory_sessions", { project: "app" }, kv)).rejects.toThrow(/401/);
  });
});
