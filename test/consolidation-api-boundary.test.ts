import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/auth.js", () => ({
  timingSafeCompare: (a: string, b: string) => a === b,
}));

vi.mock("iii-sdk", () => ({
  TriggerAction: {
    Void: () => ({ type: "void" }),
  },
}));

vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual<typeof import("../src/config.js")>(
    "../src/config.js",
  );
  return {
    ...actual,
    detectEmbeddingProvider: () => false,
    detectLlmProviderKind: () => "none",
    getAgentId: () => undefined,
    isAgentScopeIsolated: () => false,
    isConsolidationEnabled: () => false,
  };
});

import { registerApiTriggers } from "../src/triggers/api.js";

function mockKV() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(async () => []),
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: vi.fn(),
    trigger: vi.fn(
      async (
        idOrInput: string | { function_id: string; payload: unknown },
        data?: unknown,
      ) => {
        const id =
          typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
        const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
        const fn = functions.get(id);
        if (!fn) throw new Error(`No function: ${id}`);
        return fn(payload);
      },
    ),
    getFunction: (id: string) => functions.get(id),
  };
}

describe("POST /agentmemory/consolidate-pipeline boundary", () => {
  it("does not forward external force to the internal consolidation function", async () => {
    const sdk = mockSdk();
    sdk.registerFunction("mem::consolidate-pipeline", async (payload: unknown) => ({
      success: false,
      skipped: true,
      payload,
    }));
    registerApiTriggers(sdk as never, mockKV() as never);

    const handler = sdk.getFunction("api::consolidate-pipeline");
    expect(handler).toBeDefined();

    const result = (await handler!({
      headers: {},
      body: {
        tier: "all",
        project: "git:repo",
        force: true,
        ignored: "field",
      },
    })) as {
      status_code: number;
      body: { payload: Record<string, unknown> };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.payload).toEqual({
      tier: "all",
      project: "git:repo",
    });
  });
});
