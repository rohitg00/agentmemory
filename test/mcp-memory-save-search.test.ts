import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerRememberFunction } from "../src/functions/remember.js";
import { getSearchIndex, registerSearchFunction } from "../src/functions/search.js";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { HybridSearch } from "../src/state/hybrid-search.js";

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

function makeReq(body?: unknown) {
  return {
    body,
    headers: {},
    query_params: {},
  };
}

describe("MCP saved standalone memories", () => {
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    getSearchIndex().clear();
    sdk = mockSdk();
    const kv = mockKV();
    const bm25 = getSearchIndex();
    const hybridSearch = new HybridSearch(bm25, null, null, kv as never);

    registerRememberFunction(sdk as never, kv as never);
    registerSearchFunction(sdk as never, kv as never);
    registerSmartSearchFunction(sdk as never, kv as never, (query, limit) =>
      hybridSearch.search(query, limit),
    );
    registerMcpEndpoints(sdk as never, kv as never);
  });

  it("makes memory_save facts immediately retrievable through memory_recall", async () => {
    const call = sdk.getFunction("mcp::tools::call")!;
    const saved = (await call(makeReq({
      name: "memory_save",
      arguments: { content: "silver tractor violin" },
    }))) as { status_code: number; body: { content: Array<{ text: string }> } };
    const savedBody = JSON.parse(saved.body.content[0].text) as {
      success: boolean;
      memory: { id: string; content: string };
    };

    const recalled = (await call(makeReq({
      name: "memory_recall",
      arguments: { query: "silver tractor violin" },
    }))) as { status_code: number; body: { content: Array<{ text: string }> } };
    const recallBody = JSON.parse(recalled.body.content[0].text) as {
      results: Array<{ observation: { id: string; narrative: string } }>;
    };

    expect(saved.status_code).toBe(200);
    expect(savedBody.memory.content).toBe("silver tractor violin");
    expect(recalled.status_code).toBe(200);
    expect(recallBody.results[0]?.observation.id).toBe(savedBody.memory.id);
    expect(recallBody.results[0]?.observation.narrative).toBe(
      "silver tractor violin",
    );
  });

  it("makes memory_save facts immediately retrievable through memory_smart_search in BM25-only mode", async () => {
    const call = sdk.getFunction("mcp::tools::call")!;
    const saved = (await call(makeReq({
      name: "memory_save",
      arguments: { content: "silver tractor violin" },
    }))) as { body: { content: Array<{ text: string }> } };
    const savedBody = JSON.parse(saved.body.content[0].text) as {
      memory: { id: string; content: string };
    };

    const searched = (await call(makeReq({
      name: "memory_smart_search",
      arguments: { query: "silver tractor violin" },
    }))) as { status_code: number; body: { content: Array<{ text: string }> } };
    const searchBody = JSON.parse(searched.body.content[0].text) as {
      mode: string;
      results: Array<{ obsId: string; title: string }>;
    };

    expect(searched.status_code).toBe(200);
    expect(searchBody.mode).toBe("compact");
    expect(searchBody.results[0]?.obsId).toBe(savedBody.memory.id);
    expect(searchBody.results[0]?.title).toBe(savedBody.memory.content);

    const expanded = (await call(makeReq({
      name: "memory_smart_search",
      arguments: {
        query: "silver tractor violin",
        expandIds: savedBody.memory.id,
      },
    }))) as { status_code: number; body: { content: Array<{ text: string }> } };
    const expandedBody = JSON.parse(expanded.body.content[0].text) as {
      mode: string;
      results: Array<{ observation: { id: string; narrative: string } }>;
    };

    expect(expanded.status_code).toBe(200);
    expect(expandedBody.mode).toBe("expanded");
    expect(expandedBody.results[0]?.observation.id).toBe(savedBody.memory.id);
    expect(expandedBody.results[0]?.observation.narrative).toBe(
      savedBody.memory.content,
    );
  });
});
