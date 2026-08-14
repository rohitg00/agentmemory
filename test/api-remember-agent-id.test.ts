import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";

// Mock scaffolding mirrors test/mcp-resources.test.ts:10-66.

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

describe("api::remember forwards agentId", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerApiTriggers(sdk as never, kv as never);
  });

  it("passes a normal-length agentId through to mem::remember", async () => {
    let capturedPayload: unknown;
    sdk.overrideTrigger("mem::remember", async (payload: unknown) => {
      capturedPayload = payload;
      return { id: "mem_1" };
    });
    const fn = sdk.getFunction("api::remember")!;
    const res = await fn(makeReq({ content: "hello", agentId: "pm-agent" }));
    expect(res.status_code).toBe(201);
    expect((capturedPayload as { agentId?: string }).agentId).toBe("pm-agent");
  });

  it("truncates an agentId over 128 chars to exactly 128", async () => {
    let capturedPayload: unknown;
    sdk.overrideTrigger("mem::remember", async (payload: unknown) => {
      capturedPayload = payload;
      return { id: "mem_1" };
    });
    const fn = sdk.getFunction("api::remember")!;
    const longAgentId = "a".repeat(150);
    const res = await fn(makeReq({ content: "hello", agentId: longAgentId }));
    expect(res.status_code).toBe(201);
    const sentAgentId = (capturedPayload as { agentId?: string }).agentId;
    expect(sentAgentId).toBe("a".repeat(128));
    expect(sentAgentId?.length).toBe(128);
  });

  it("leaves agentId out of the payload when missing or empty, without erroring", async () => {
    let capturedMissing: unknown;
    let capturedEmpty: unknown;
    sdk.overrideTrigger("mem::remember", async (payload: unknown) => {
      capturedMissing = payload;
      return { id: "mem_1" };
    });
    const fn = sdk.getFunction("api::remember")!;
    const resMissing = await fn(makeReq({ content: "hello" }));
    expect(resMissing.status_code).toBe(201);
    expect((capturedMissing as { agentId?: string }).agentId).toBeUndefined();
    expect("agentId" in (capturedMissing as object)).toBe(false);

    sdk.overrideTrigger("mem::remember", async (payload: unknown) => {
      capturedEmpty = payload;
      return { id: "mem_1" };
    });
    const resEmpty = await fn(makeReq({ content: "hello", agentId: "   " }));
    expect(resEmpty.status_code).toBe(201);
    expect((capturedEmpty as { agentId?: string }).agentId).toBeUndefined();
    expect("agentId" in (capturedEmpty as object)).toBe(false);
  });
});
