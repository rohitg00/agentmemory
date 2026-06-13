import { describe, it, expect, beforeEach, vi } from "vitest";

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

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import type { Memory } from "../src/types.js";

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

function makeReq(query_params: Record<string, string> = {}) {
  return { body: {}, headers: {}, query_params };
}

function memory(id: string, content: string, project?: string): Memory {
  return {
    id,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    type: "fact",
    title: content,
    content,
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 7,
    version: 1,
    isLatest: true,
    ...(project !== undefined && { project }),
  };
}

describe("GET /agentmemory/memories project filter", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerApiTriggers(sdk as never, kv as never);

    await kv.set(KV.memories, "mem_main", memory("mem_main", "main repo", "git:repo-main"));
    await kv.set(KV.memories, "mem_other", memory("mem_other", "other repo", "git:repo-other"));
    await kv.set(KV.memories, "mem_legacy", memory("mem_legacy", "legacy unscoped"));
  });

  it("filters memories by project", async () => {
    const fn = sdk.getFunction("api::memories")!;
    const result = await fn(makeReq({ project: "git:repo-main" })) as {
      status_code: number;
      body: { memories: Memory[]; total: number };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.total).toBe(1);
    expect(result.body.memories.map((m) => m.id)).toEqual(["mem_main"]);
  });

  it("applies project filter to count mode", async () => {
    const fn = sdk.getFunction("api::memories")!;
    const result = await fn(makeReq({ project: "git:repo-main", count: "true" })) as {
      status_code: number;
      body: { total: number; latestCount: number };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.total).toBe(1);
    expect(result.body.latestCount).toBe(1);
  });

  it("applies project filter before pagination", async () => {
    const fn = sdk.getFunction("api::memories")!;
    const result = await fn(makeReq({ project: "git:repo-main", limit: "1", offset: "0" })) as {
      status_code: number;
      body: { memories: Memory[]; total: number; limit: number; offset: number };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.total).toBe(1);
    expect(result.body.limit).toBe(1);
    expect(result.body.offset).toBe(0);
    expect(result.body.memories.map((m) => m.id)).toEqual(["mem_main"]);
  });

  it("can include unscoped legacy memories when explicitly requested", async () => {
    const fn = sdk.getFunction("api::memories")!;
    const result = await fn(makeReq({
      project: "git:repo-main",
      includeUnscoped: "true",
    })) as {
      status_code: number;
      body: { memories: Memory[]; total: number };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.total).toBe(2);
    expect(result.body.memories.map((m) => m.id).sort()).toEqual([
      "mem_legacy",
      "mem_main",
    ]);
  });
});
