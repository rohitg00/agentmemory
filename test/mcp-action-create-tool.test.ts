import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
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
  const overrides = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      functions.set(
        typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id,
        handler,
      );
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      if (overrides.has(id)) return overrides.get(id)!(payload);
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      overrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function callTool(sdk: ReturnType<typeof mockSdk>, args: unknown) {
  const fn = sdk.getFunction("mcp::tools::call")!;
  return fn({
    body: { name: "memory_action_create", arguments: args },
    headers: {},
    query_params: {},
  }) as Promise<{ status_code: number; body: unknown }>;
}

describe("memory_action_create MCP tool", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let seen: Record<string, unknown> | undefined;

  beforeEach(() => {
    sdk = mockSdk();
    registerMcpEndpoints(sdk as never, mockKV() as never);
    seen = undefined;
    sdk.overrideTrigger("mem::action-create", (payload: Record<string, unknown>) => {
      seen = payload;
      return { success: true };
    });
  });

  it("records the calling agent as the action creator", async () => {
    await callTool(sdk, { title: "Ship it", agentId: "agent-a" });
    expect(seen?.createdBy).toBe("agent-a");
  });

  it("rejects a non-string agentId without creating an action", async () => {
    const res = await callTool(sdk, { title: "Ship it", agentId: 42 });
    expect(res.status_code).toBe(400);
    expect(seen).toBeUndefined();
  });

  it("rejects an agentId longer than 128 characters instead of shortening it", async () => {
    const res = await callTool(sdk, { title: "Ship it", agentId: "a".repeat(129) });
    expect(res.status_code).toBe(400);
    expect(seen).toBeUndefined();
    await callTool(sdk, { title: "Ship it", agentId: "a".repeat(128) });
    expect(seen?.createdBy).toBe("a".repeat(128));
  });

  it("lists agentId in the tool schema", async () => {
    const { getAllTools } = await import("../src/mcp/tools-registry.js");
    const tool = getAllTools().find((t) => t.name === "memory_action_create")!;
    expect(Object.keys(tool.inputSchema.properties as object)).toContain("agentId");
  });
});
