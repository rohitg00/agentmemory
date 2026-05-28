import { describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    TriggerAction: {
      ...actual.TriggerAction,
      Void: vi.fn(() => ({ type: "void" })),
    },
  };
});

import { vi } from "vitest";
import { registerRememberFunction } from "../src/functions/remember.js";
import { getSearchIndex, setIndexPersistence } from "../src/functions/search.js";

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
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown; action?: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) return {};
      return fn(input.payload);
    },
  };
}

describe("mem::remember — project field stamping", () => {
  beforeEach(() => {
    getSearchIndex().clear();
    setIndexPersistence(null);
  });

  afterEach(() => {
    setIndexPersistence(null);
  });

  it("persists project on the saved memory when provided", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "express-jwt requires trimmed Bearer token",
        type: "bug",
        files: ["src/middleware/auth.ts"],
        project: "api",
      },
    }) as { success: boolean; memory: { id: string; project?: string } };

    expect(result.success).toBe(true);
    expect(result.memory.project).toBe("api");

    const stored = await kv.get<{ project?: string }>("mem:memories", result.memory.id);
    expect(stored?.project).toBe("api");
  });

  it("leaves project undefined when not provided (backward-compat)", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "some unscoped memory" },
    }) as { success: boolean; memory: { id: string; project?: string } };

    expect(result.success).toBe(true);
    expect(result.memory.project).toBeUndefined();
  });

  it("trims whitespace from the project value", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "padded project name", project: "  api  " },
    }) as { success: boolean; memory: { project?: string } };

    expect(result.memory.project).toBe("api");
  });

  it("treats a blank project string the same as no project", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "blank project string", project: "   " },
    }) as { success: boolean; memory: { project?: string } };

    expect(result.memory.project).toBeUndefined();
  });
});

describe("mem::remember — cross-project dedup isolation", () => {
  beforeEach(() => {
    getSearchIndex().clear();
    setIndexPersistence(null);
  });

  afterEach(() => {
    setIndexPersistence(null);
  });

  it("does not supersede a memory from a different project even when content is similar", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    // Save a memory in project "api"
    const first = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use express-jwt middleware for token validation in this project",
        type: "pattern",
        project: "api",
      },
    }) as { memory: { id: string; isLatest: boolean; project?: string } };

    // Save a near-identical memory in project "web" — should NOT supersede the api one
    const second = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use express-jwt middleware for token validation in this project",
        type: "pattern",
        project: "web",
      },
    }) as { memory: { id: string; supersedes: string[]; project?: string } };

    expect(second.memory.project).toBe("web");
    expect(second.memory.supersedes).toHaveLength(0);

    // The api memory must still be isLatest
    const apiMemory = await kv.get<{ isLatest: boolean }>("mem:memories", first.memory.id);
    expect(apiMemory?.isLatest).toBe(true);
  });

  it("still supersedes within the same project when content is similar", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const first = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use express-jwt middleware for token validation in this project",
        type: "pattern",
        project: "api",
      },
    }) as { memory: { id: string } };

    const second = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use express-jwt middleware for token validation in this project",
        type: "pattern",
        project: "api",
      },
    }) as { memory: { supersedes: string[] } };

    expect(second.memory.supersedes).toContain(first.memory.id);

    const original = await kv.get<{ isLatest: boolean }>("mem:memories", first.memory.id);
    expect(original?.isLatest).toBe(false);
  });

  it("allows an unscoped memory to be superseded by a scoped one (legacy compat)", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    // Existing legacy memory with no project
    const legacy = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use express-jwt middleware for token validation in this project",
        type: "pattern",
      },
    }) as { memory: { id: string } };

    // New scoped memory — should supersede the legacy unscoped one
    const scoped = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use express-jwt middleware for token validation in this project",
        type: "pattern",
        project: "api",
      },
    }) as { memory: { supersedes: string[] } };

    expect(scoped.memory.supersedes).toContain(legacy.memory.id);
  });

  it("allows a scoped memory to be superseded by an unscoped one (legacy compat)", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const scoped = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use express-jwt middleware for token validation in this project",
        type: "pattern",
        project: "api",
      },
    }) as { memory: { id: string } };

    // Unscoped write — should still supersede since one side has no project
    const unscoped = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use express-jwt middleware for token validation in this project",
        type: "pattern",
      },
    }) as { memory: { supersedes: string[] } };

    expect(unscoped.memory.supersedes).toContain(scoped.memory.id);
  });
});
