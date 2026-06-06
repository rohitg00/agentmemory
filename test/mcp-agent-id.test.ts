import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";

function mockKV() {
  return {
    get: async () => null,
    set: async <T>(_scope: string, _key: string, data: T): Promise<T> => data,
    delete: async () => {},
    list: async () => [],
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
      const handler = triggerOverrides.get(id);
      if (!handler) throw new Error(`No trigger override: ${id}`);
      return handler(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(body: unknown) {
  return { body, headers: {}, query_params: {} };
}

describe("MCP agentId forwarding", () => {
  const originalAgentId = process.env.AGENT_ID;
  const originalAgentmemoryAgentId = process.env.AGENTMEMORY_AGENT_ID;
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.AGENT_ID;
    delete process.env.AGENTMEMORY_AGENT_ID;
    sdk = mockSdk();
    registerMcpEndpoints(sdk as never, mockKV() as never);
  });

  afterEach(() => {
    if (originalAgentId === undefined) delete process.env.AGENT_ID;
    else process.env.AGENT_ID = originalAgentId;
    if (originalAgentmemoryAgentId === undefined) delete process.env.AGENTMEMORY_AGENT_ID;
    else process.env.AGENTMEMORY_AGENT_ID = originalAgentmemoryAgentId;
  });

  it("passes AGENTMEMORY_AGENT_ID to memory_save", async () => {
    process.env.AGENTMEMORY_AGENT_ID = "mcp-profile";
    let payload: Record<string, unknown> | undefined;
    sdk.overrideTrigger("mem::remember", async (data: Record<string, unknown>) => {
      payload = data;
      return { success: true };
    });

    const fn = sdk.getFunction("mcp::tools::call")!;
    await fn(makeReq({ name: "memory_save", arguments: { content: "remember this" } }));

    expect(payload?.agentId).toBe("mcp-profile");
  });

  it("passes AGENTMEMORY_AGENT_ID to memory_smart_search", async () => {
    process.env.AGENTMEMORY_AGENT_ID = "mcp-profile";
    let payload: Record<string, unknown> | undefined;
    sdk.overrideTrigger("mem::smart-search", async (data: Record<string, unknown>) => {
      payload = data;
      return { results: [] };
    });

    const fn = sdk.getFunction("mcp::tools::call")!;
    await fn(makeReq({ name: "memory_smart_search", arguments: { query: "auth" } }));

    expect(payload?.agentId).toBe("mcp-profile");
  });
});
