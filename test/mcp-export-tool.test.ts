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
    body: { name: "memory_export", arguments: args },
    headers: {},
    query_params: {},
  }) as Promise<{ status_code: number; body: unknown }>;
}

describe("memory_export MCP tool", () => {
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    sdk = mockSdk();
    registerMcpEndpoints(sdk as never, mockKV() as never);
  });

  it("forwards the paging arguments to mem::export", async () => {
    let seen: unknown;
    sdk.overrideTrigger("mem::export", (payload: unknown) => {
      seen = payload;
      return { version: "0.9.28", sessions: [], memories: [] };
    });

    await callTool(sdk, {
      maxSessions: 100,
      offset: 200,
      collectionLimit: 300,
      collectionOffset: 400,
    });

    expect(seen).toEqual({
      maxSessions: 100,
      offset: 200,
      collectionLimit: 300,
      collectionOffset: 400,
    });
  });

  it("drops arguments that are not usable page bounds", async () => {
    let seen: unknown;
    sdk.overrideTrigger("mem::export", (payload: unknown) => {
      seen = payload;
      return { version: "0.9.28", sessions: [], memories: [] };
    });

    await callTool(sdk, {
      maxSessions: 0,
      offset: -1,
      collectionLimit: "many",
      collectionOffset: 1.5,
    });

    expect(seen).toEqual({});
  });

  it("forwards the collections allowlist as given", async () => {
    let seen: unknown;
    sdk.overrideTrigger("mem::export", (payload: unknown) => {
      seen = payload;
      return { version: "0.9.28", sessions: [], memories: [] };
    });

    await callTool(sdk, { collections: "memories,lessons" });

    expect(seen).toEqual({ collections: "memories,lessons" });
  });

  it("keeps an empty allowlist distinguishable from an absent one", async () => {
    const seen: unknown[] = [];
    sdk.overrideTrigger("mem::export", (payload: unknown) => {
      seen.push(payload);
      return { version: "0.9.28", sessions: [], memories: [] };
    });

    await callTool(sdk, { collections: "" });
    await callTool(sdk, {});

    // An empty selection means "no collections" downstream, so dropping it
    // here would silently turn it into a full dump.
    expect(seen).toEqual([{ collections: "" }, {}]);
  });

  it("still returns a normal export as 200", async () => {
    sdk.overrideTrigger("mem::export", () => ({
      version: "0.9.28",
      sessions: [],
      memories: [],
    }));

    const result = await callTool(sdk, {});

    expect(result.status_code).toBe(200);
    expect(result.body).toHaveProperty("content");
  });
});
