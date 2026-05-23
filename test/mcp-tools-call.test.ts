import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import { getAllTools } from "../src/mcp/tools-registry.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  const triggerCalls: Array<{ function_id: string; payload: unknown }> = [];
  const triggerOverrides = new Map<string, Function>();
  return {
    triggerCalls,
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      triggerCalls.push({ function_id: id, payload });
      if (triggerOverrides.has(id)) return triggerOverrides.get(id)!(payload);
      return { success: true, id, payload };
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(name: string, args: Record<string, unknown>) {
  return {
    body: { name, arguments: args },
    headers: {},
    query_params: {},
  };
}

describe("MCP tools call dispatch", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);
  });

  it("honors operation as a memory_search scope alias", async () => {
    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = await fn(makeReq("memory_search", { operation: "semantic", query: "auth", limit: "5" }));

    expect(result.status_code).toBe(200);
    expect(sdk.triggerCalls.at(-1)).toEqual({
      function_id: "mem::smart-search",
      payload: { query: "auth", expandIds: [], limit: 5 },
    });
  });

  it("dispatches crystal list without requiring actionIds", async () => {
    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = await fn(makeReq("crystal", { operation: "list", project: "app", limit: "3" }));

    expect(result.status_code).toBe(200);
    expect(sdk.triggerCalls.at(-1)).toEqual({
      function_id: "mem::crystal-list",
      payload: { project: "app", sessionId: undefined, limit: 3 },
    });
  });

  it("normalizes bulk insightIds for insight delete", async () => {
    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = await fn(makeReq("insight", { operation: "delete", insightIds: "ins_1, ins_2", reason: "cleanup" }));

    expect(result.status_code).toBe(200);
    expect(sdk.triggerCalls.slice(-2)).toEqual([
      { function_id: "mem::insight-delete", payload: { insightId: "ins_1", reason: "cleanup" } },
      { function_id: "mem::insight-delete", payload: { insightId: "ins_2", reason: "cleanup" } },
    ]);
  });

  it("passes operation_filter to audit query", async () => {
    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = await fn(makeReq("admin", { operation: "audit", operation_filter: "delete", limit: 7 }));

    expect(result.status_code).toBe(200);
    expect(sdk.triggerCalls.at(-1)).toEqual({
      function_id: "mem::audit-query",
      payload: { operation: "delete", limit: 7 },
    });
  });

  it("validates lesson list and trims strengthen IDs", async () => {
    const fn = sdk.getFunction("mcp::tools::call")!;
    const badSource = await fn(makeReq("lesson", { operation: "list", source: "bogus" }));
    expect(badSource.status_code).toBe(400);

    const strengthened = await fn(makeReq("lesson", { operation: "strengthen", lessonId: "  les_1  " }));
    expect(strengthened.status_code).toBe(200);
    expect(sdk.triggerCalls.at(-1)).toEqual({
      function_id: "mem::lesson-strengthen",
      payload: { lessonId: "les_1" },
    });
  });

  it("does not globally require query for memory_search schema or title for sketch schema", () => {
    const tools = getAllTools();
    expect(tools.find((t) => t.name === "memory_search")!.inputSchema.required).toBeUndefined();
    expect(tools.find((t) => t.name === "sketch")!.inputSchema.required).toEqual(["operation"]);
  });
});
