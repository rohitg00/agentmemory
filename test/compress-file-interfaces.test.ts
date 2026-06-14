import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/auth.js", () => ({
  timingSafeCompare: (a: string, b: string) => a === b,
}));

vi.mock("../src/config.js", async () => {
  const actual = await vi.importActual<typeof import("../src/config.js")>("../src/config.js");
  return {
    ...actual,
    getAgentId: () => undefined,
    isAgentScopeIsolated: () => false,
    detectEmbeddingProvider: () => false,
    detectLlmProviderKind: () => "none",
  };
});

vi.mock("iii-sdk", () => ({
  TriggerAction: { Void: () => ({}) },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import { registerApiTriggers } from "../src/triggers/api.js";

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
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(body: unknown) {
  return { body, headers: {}, query_params: {} };
}

describe("compress-file REST endpoint", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let compressFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sdk = mockSdk();
    const kv = mockKV();
    compressFile = vi.fn(async ({ filePath }: { filePath: string }) => ({
      success: false,
      error: "filePath must be inside an allowed compress-file root",
      filePath,
    }));
    sdk.registerFunction("mem::compress-file", compressFile);
    registerApiTriggers(sdk as never, kv as never);
  });

  it("rejects missing filePath before calling the function", async () => {
    const fn = sdk.getFunction("api::compress-file")!;

    const result = await fn(makeReq({ filePath: "   " })) as {
      status_code: number;
      body: { error: string };
    };

    expect(result.status_code).toBe(400);
    expect(result.body.error).toContain("filePath");
    expect(compressFile).not.toHaveBeenCalled();
  });

  it("returns function-level root denial unchanged", async () => {
    const fn = sdk.getFunction("api::compress-file")!;

    const result = await fn(makeReq({ filePath: " /outside/notes.md " })) as {
      status_code: number;
      body: { success: boolean; error: string; filePath: string };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.success).toBe(false);
    expect(result.body.error).toContain("allowed compress-file root");
    expect(result.body.filePath).toBe("/outside/notes.md");
  });
});

describe("compress-file MCP tool", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let compressFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sdk = mockSdk();
    const kv = mockKV();
    compressFile = vi.fn(async ({ filePath }: { filePath: string }) => ({
      success: false,
      error: "filePath must be inside an allowed compress-file root",
      filePath,
    }));
    sdk.registerFunction("mem::compress-file", compressFile);
    registerMcpEndpoints(sdk as never, kv as never);
  });

  it("rejects missing filePath before calling the function", async () => {
    const call = sdk.getFunction("mcp::tools::call")!;

    const result = await call(makeReq({
      name: "memory_compress_file",
      arguments: { filePath: "   " },
    })) as { status_code: number; body: { error: string } };

    expect(result.status_code).toBe(400);
    expect(result.body.error).toContain("filePath");
    expect(compressFile).not.toHaveBeenCalled();
  });

  it("returns function-level root denial as MCP content", async () => {
    const call = sdk.getFunction("mcp::tools::call")!;

    const result = await call(makeReq({
      name: "memory_compress_file",
      arguments: { filePath: " /outside/notes.md " },
    })) as {
      status_code: number;
      body: { content: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const parsed = JSON.parse(result.body.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("allowed compress-file root");
    expect(parsed.filePath).toBe("/outside/notes.md");
  });
});
