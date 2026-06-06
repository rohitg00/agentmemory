import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";

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
  const triggerOverrides = new Map<string, Function>();
  return {
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
      if (triggerOverrides.has(id)) {
        return triggerOverrides.get(id)!(payload);
      }
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(body?: unknown, headers?: Record<string, string>) {
  return {
    body,
    headers: headers || {},
    query_params: {},
  };
}

type McpResponse = {
  status_code: number;
  body: {
    error?: string;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
    tools?: Array<{ name: string }>;
  };
};

describe("memory_forget MCP tool (issue #833)", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let forgetPayloads: unknown[];

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);
    forgetPayloads = [];
    sdk.overrideTrigger("mem::forget", (payload: unknown) => {
      forgetPayloads.push(payload);
      return {
        success: true,
        deleted: 3,
        memoriesDeleted: 0,
        observationsDeleted: 1,
        sessionDeleted: true,
      };
    });
  });

  async function callTool(
    args: Record<string, unknown>,
  ): Promise<McpResponse> {
    const handler = sdk.getFunction("mcp::tools::call")!;
    return handler(
      makeReq({ name: "memory_forget", arguments: args }),
    ) as Promise<McpResponse>;
  }

  it("is listed in the MCP tool registry", async () => {
    const handler = sdk.getFunction("mcp::tools::list")!;
    const res = (await handler(makeReq())) as McpResponse;
    expect(res.status_code).toBe(200);
    const names = (res.body.tools ?? []).map((t) => t.name);
    expect(names).toContain("memory_forget");
  });

  it("rejects calls without sessionId or memoryId", async () => {
    const res = await callTool({});
    expect(res.status_code).toBe(400);
    expect(res.body.error).toBe("sessionId or memoryId is required");
    expect(forgetPayloads.length).toBe(0);
  });

  it("rejects observationIds without sessionId", async () => {
    const res = await callTool({ observationIds: "obs_1,obs_2" });
    expect(res.status_code).toBe(400);
    expect(res.body.error).toBe("observationIds requires sessionId");
    expect(forgetPayloads.length).toBe(0);
  });

  it("forwards sessionId-only deletes to mem::forget", async () => {
    const res = await callTool({ sessionId: "ses_1" });
    expect(res.status_code).toBe(200);
    expect(forgetPayloads).toEqual([{ sessionId: "ses_1" }]);
    const text = res.body.content?.[0]?.text ?? "";
    expect(JSON.parse(text)).toMatchObject({
      success: true,
      deleted: 3,
      sessionDeleted: true,
    });
  });

  it("parses comma-separated observationIds", async () => {
    const res = await callTool({
      sessionId: "ses_1",
      observationIds: "obs_1, obs_2 ,obs_3",
    });
    expect(res.status_code).toBe(200);
    expect(forgetPayloads).toEqual([
      { sessionId: "ses_1", observationIds: ["obs_1", "obs_2", "obs_3"] },
    ]);
  });

  it("accepts observationIds as an array", async () => {
    const res = await callTool({
      sessionId: "ses_1",
      observationIds: ["obs_1", "obs_2"],
    });
    expect(res.status_code).toBe(200);
    expect(forgetPayloads).toEqual([
      { sessionId: "ses_1", observationIds: ["obs_1", "obs_2"] },
    ]);
  });

  it("forwards memoryId deletes to mem::forget", async () => {
    const res = await callTool({ memoryId: "mem_1" });
    expect(res.status_code).toBe(200);
    expect(forgetPayloads).toEqual([{ memoryId: "mem_1" }]);
  });

  it("returns an isError content block when mem::forget throws", async () => {
    sdk.overrideTrigger("mem::forget", () => {
      throw new Error("boom");
    });
    const res = await callTool({ sessionId: "ses_1" });
    expect(res.status_code).toBe(200);
    expect(res.body.isError).toBe(true);
    expect(res.body.content?.[0]?.text).toBe("Forget failed");
  });
});
