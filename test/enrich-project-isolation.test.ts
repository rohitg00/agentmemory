import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerEnrichFunction } from "../src/functions/enrich.js";
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
  const triggerOverrides = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : (idOrInput as { payload: unknown }).payload;
      if (triggerOverrides.has(id)) return triggerOverrides.get(id)!(payload);
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
  };
}

function makeBugMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_bug_1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "bug",
    title: "express-jwt whitespace bug",
    content: "express-jwt throws 401 when Authorization header has extra whitespace after Bearer",
    concepts: ["auth", "jwt"],
    files: ["src/middleware/auth.ts"],
    sessionIds: ["sess-api-001"],
    strength: 8,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

describe("mem::enrich — project isolation for bug memories", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerEnrichFunction(sdk as never, kv as never);
    sdk.overrideTrigger("mem::file-context", async () => ({ context: "" }));
    sdk.overrideTrigger("mem::search", async () => ({ results: [] }));
  });

  it("does not surface a scoped bug memory when caller project differs", async () => {
    await kv.set("mem:memories", "mem_bug_1", makeBugMemory({ project: "api" }));

    const result = await sdk.trigger("mem::enrich", {
      sessionId: "sess-web-001",
      files: ["src/middleware/auth.ts"],
      project: "web",
    }) as { context: string };

    expect(result.context).not.toContain("agentmemory-past-errors");
    expect(result.context).not.toContain("express-jwt");
  });

  it("surfaces a scoped bug memory when caller project matches", async () => {
    await kv.set("mem:memories", "mem_bug_1", makeBugMemory({ project: "api" }));

    const result = await sdk.trigger("mem::enrich", {
      sessionId: "sess-api-001",
      files: ["src/middleware/auth.ts"],
      project: "api",
    }) as { context: string };

    expect(result.context).toContain("agentmemory-past-errors");
    expect(result.context).toContain("express-jwt");
  });

  it("surfaces an unscoped (legacy) bug memory regardless of caller project", async () => {
    await kv.set("mem:memories", "mem_bug_1", makeBugMemory({ project: undefined }));

    const result = await sdk.trigger("mem::enrich", {
      sessionId: "sess-web-001",
      files: ["src/middleware/auth.ts"],
      project: "web",
    }) as { context: string };

    // Unscoped memories remain visible everywhere for backward-compat
    expect(result.context).toContain("agentmemory-past-errors");
    expect(result.context).toContain("express-jwt");
  });

  it("surfaces an unscoped bug memory when caller provides no project", async () => {
    await kv.set("mem:memories", "mem_bug_1", makeBugMemory({ project: undefined }));

    const result = await sdk.trigger("mem::enrich", {
      sessionId: "sess-api-001",
      files: ["src/middleware/auth.ts"],
    }) as { context: string };

    expect(result.context).toContain("agentmemory-past-errors");
  });

  it("surfaces a scoped bug memory when caller provides no project", async () => {
    await kv.set("mem:memories", "mem_bug_1", makeBugMemory({ project: "api" }));

    // No project on the caller — guard does not engage, memory is visible
    const result = await sdk.trigger("mem::enrich", {
      sessionId: "sess-api-001",
      files: ["src/middleware/auth.ts"],
    }) as { context: string };

    expect(result.context).toContain("agentmemory-past-errors");
  });

  it("isolates multiple memories from different projects correctly", async () => {
    await kv.set("mem:memories", "mem_api", makeBugMemory({
      id: "mem_api",
      project: "api",
      title: "express-jwt whitespace",
      content: "express-jwt whitespace issue",
      files: ["src/middleware/auth.ts"],
    }));
    await kv.set("mem:memories", "mem_web", makeBugMemory({
      id: "mem_web",
      project: "web",
      title: "nextauth cookie",
      content: "nextauth cookie domain mismatch",
      files: ["src/middleware/auth.ts"],
    }));

    const apiResult = await sdk.trigger("mem::enrich", {
      sessionId: "sess-api-001",
      files: ["src/middleware/auth.ts"],
      project: "api",
    }) as { context: string };

    expect(apiResult.context).toContain("express-jwt");
    expect(apiResult.context).not.toContain("nextauth");

    const webResult = await sdk.trigger("mem::enrich", {
      sessionId: "sess-web-001",
      files: ["src/middleware/auth.ts"],
      project: "web",
    }) as { context: string };

    expect(webResult.context).toContain("nextauth");
    expect(webResult.context).not.toContain("express-jwt");
  });

  it("only includes latest bug memories, respecting project scope", async () => {
    await kv.set("mem:memories", "mem_old", makeBugMemory({
      id: "mem_old",
      project: "api",
      title: "old express bug",
      content: "old express auth bug now fixed",
      files: ["src/middleware/auth.ts"],
      isLatest: false,
    }));
    await kv.set("mem:memories", "mem_new", makeBugMemory({
      id: "mem_new",
      project: "api",
      title: "new express bug",
      content: "new express auth edge case",
      files: ["src/middleware/auth.ts"],
      isLatest: true,
    }));

    const result = await sdk.trigger("mem::enrich", {
      sessionId: "sess-api-001",
      files: ["src/middleware/auth.ts"],
      project: "api",
    }) as { context: string };

    expect(result.context).toContain("new express bug");
    expect(result.context).not.toContain("old express auth bug");
  });
});

describe("mem::enrich — project forwarded to mem::search", () => {
  it("passes project to the search trigger when provided", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerEnrichFunction(sdk as never, kv as never);

    let capturedSearchPayload: Record<string, unknown> = {};
    sdk.overrideTrigger("mem::file-context", async () => ({ context: "" }));
    sdk.overrideTrigger("mem::search", async (payload: unknown) => {
      capturedSearchPayload = payload as Record<string, unknown>;
      return { results: [] };
    });

    await sdk.trigger("mem::enrich", {
      sessionId: "sess-api-001",
      files: ["src/middleware/auth.ts"],
      project: "api",
    });

    expect(capturedSearchPayload.project).toBe("api");
  });

  it("does not pass project to search when caller provides none", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerEnrichFunction(sdk as never, kv as never);

    let capturedSearchPayload: Record<string, unknown> = {};
    sdk.overrideTrigger("mem::file-context", async () => ({ context: "" }));
    sdk.overrideTrigger("mem::search", async (payload: unknown) => {
      capturedSearchPayload = payload as Record<string, unknown>;
      return { results: [] };
    });

    await sdk.trigger("mem::enrich", {
      sessionId: "sess-api-001",
      files: ["src/middleware/auth.ts"],
    });

    expect(capturedSearchPayload.project).toBeUndefined();
  });
});
