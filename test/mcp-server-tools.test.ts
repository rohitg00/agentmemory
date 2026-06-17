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

describe("MCP tool call handlers", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);
  });

  it("forwards project from memory_recall to mem::search (#926)", async () => {
    let receivedPayload: Record<string, unknown> | undefined;
    sdk.overrideTrigger("mem::search", async (payload: Record<string, unknown>) => {
      receivedPayload = payload;
      return { results: [] };
    });

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(
      makeReq({
        name: "memory_recall",
        arguments: {
          query: "auth",
          project: " api ",
        },
      }),
    )) as { status_code: number };

    expect(result.status_code).toBe(200);
    expect(receivedPayload).toMatchObject({
      query: "auth",
      project: "api",
    });
  });

  it("forwards project from memory_smart_search to mem::smart-search (#926)", async () => {
    let receivedPayload: Record<string, unknown> | undefined;
    sdk.overrideTrigger("mem::smart-search", async (payload: Record<string, unknown>) => {
      receivedPayload = payload;
      return { mode: "compact", results: [] };
    });

    const fn = sdk.getFunction("mcp::tools::call")!;
    const result = (await fn(
      makeReq({
        name: "memory_smart_search",
        arguments: {
          query: "auth",
          limit: 5,
          project: " api ",
        },
      }),
    )) as { status_code: number };

    expect(result.status_code).toBe(200);
    expect(receivedPayload).toMatchObject({
      query: "auth",
      limit: 5,
      project: "api",
    });
  });
});
