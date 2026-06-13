import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/config.js", () => ({
  getAgentId: () => undefined,
  isAgentScopeIsolated: () => false,
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
      if (triggerOverrides.has(id)) return triggerOverrides.get(id)!(payload);
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

function makeReq(body?: unknown) {
  return {
    body,
    headers: {},
    query_params: {},
  };
}

describe("MCP project scoping", () => {
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    sdk = mockSdk();
    registerMcpEndpoints(sdk as never, mockKV() as never);
  });

  it("memory_recall forwards project to mem::search", async () => {
    let receivedPayload: Record<string, unknown> | undefined;
    sdk.overrideTrigger("mem::search", async (payload: Record<string, unknown>) => {
      receivedPayload = payload;
      return { format: "compact", results: [] };
    });

    const call = sdk.getFunction("mcp::tools::call")!;
    const result = await call(makeReq({
      name: "memory_recall",
      arguments: {
        query: "worktree auth decision",
        limit: 5,
        format: "compact",
        project: "git:repo-main",
      },
    })) as { status_code: number };

    expect(result.status_code).toBe(200);
    expect(receivedPayload).toMatchObject({
      query: "worktree auth decision",
      limit: 5,
      format: "compact",
      project: "git:repo-main",
    });
  });
});
