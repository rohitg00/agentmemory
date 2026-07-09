import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(),
  deleteAccessLog: vi.fn(),
}));

vi.mock("../src/config.js", () => ({
  getAgentId: () => undefined,
  isAgentScopeIsolated: () => false,
}));

import { registerRememberFunction } from "../src/functions/remember.js";
import { getSearchIndex, setIndexPersistence } from "../src/functions/search.js";
import { KV } from "../src/state/schema.js";

function makeMockKV() {
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

function makeMockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) return {};
      return fn(input.payload);
    },
  };
}

describe("mem::update — memory versioning (#1018)", () => {
  let sdk: ReturnType<typeof makeMockSdk>;
  let kv: ReturnType<typeof makeMockKV>;

  beforeEach(() => {
    sdk = makeMockSdk();
    kv = makeMockKV();
    getSearchIndex().clear();
    setIndexPersistence(null);
    registerRememberFunction(sdk as never, kv as never);
  });

  it("updates an existing memory and increments version", async () => {
    const saved = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "Pipeline: 3 stages",
        type: "architecture",
        concepts: ["pipeline"],
      },
    }) as { memory: { id: string; version: number; content: string } };

    expect(saved.memory.version).toBe(1);

    const updated = await sdk.trigger({
      function_id: "mem::update",
      payload: {
        memoryId: saved.memory.id,
        content: "Pipeline: 5 stages",
      },
    }) as {
      success: boolean;
      memory: { id: string; version: number; content: string; isLatest: boolean };
    };

    expect(updated.success).toBe(true);
    expect(updated.memory.id).toBe(saved.memory.id);
    expect(updated.memory.version).toBe(2);
    expect(updated.memory.content).toBe("Pipeline: 5 stages");
    expect(updated.memory.isLatest).toBe(true);
  });

  it("preserves the original memory ID (in-place update)", async () => {
    const saved = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "original content", type: "fact" },
    }) as { memory: { id: string } };

    const updated = await sdk.trigger({
      function_id: "mem::update",
      payload: { memoryId: saved.memory.id, content: "updated content" },
    }) as { memory: { id: string } };

    expect(updated.memory.id).toBe(saved.memory.id);
  });

  it("preserves fields not provided in the update", async () => {
    const saved = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "use eslint for linting",
        type: "preference",
        concepts: ["eslint", "linting"],
        files: ["package.json"],
        project: "frontend",
      },
    }) as { memory: { id: string } };

    const updated = await sdk.trigger({
      function_id: "mem::update",
      payload: {
        memoryId: saved.memory.id,
        content: "use eslint and prettier for linting",
      },
    }) as {
      memory: {
        type: string;
        concepts: string[];
        files: string[];
        project: string;
      };
    };

    // type, concepts, files, project should be preserved
    expect(updated.memory.type).toBe("preference");
    expect(updated.memory.concepts).toEqual(["eslint", "linting"]);
    expect(updated.memory.files).toEqual(["package.json"]);
    expect(updated.memory.project).toBe("frontend");
  });

  it("overwrites type and concepts when provided", async () => {
    const saved = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "deploy on merge to main",
        type: "workflow",
        concepts: ["deploy"],
      },
    }) as { memory: { id: string } };

    const updated = await sdk.trigger({
      function_id: "mem::update",
      payload: {
        memoryId: saved.memory.id,
        content: "deploy on merge to main with approval",
        type: "pattern",
        concepts: ["deploy", "approval", "ci-cd"],
      },
    }) as { memory: { type: string; concepts: string[] } };

    expect(updated.memory.type).toBe("pattern");
    expect(updated.memory.concepts).toEqual(["deploy", "approval", "ci-cd"]);
  });

  it("returns error for non-existent memory ID", async () => {
    const result = await sdk.trigger({
      function_id: "mem::update",
      payload: { memoryId: "mem_nonexistent", content: "new content" },
    }) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("memory not found");
  });

  it("returns error when memoryId is missing", async () => {
    const result = await sdk.trigger({
      function_id: "mem::update",
      payload: { content: "new content" },
    }) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("memoryId is required");
  });

  it("returns error when content is missing", async () => {
    const saved = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "original", type: "fact" },
    }) as { memory: { id: string } };

    const result = await sdk.trigger({
      function_id: "mem::update",
      payload: { memoryId: saved.memory.id },
    }) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("content is required");
  });

  it("can be called multiple times, incrementing version each time", async () => {
    const saved = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "v1 content", type: "fact" },
    }) as { memory: { id: string } };

    const u1 = await sdk.trigger({
      function_id: "mem::update",
      payload: { memoryId: saved.memory.id, content: "v2 content" },
    }) as { memory: { version: number } };
    expect(u1.memory.version).toBe(2);

    const u2 = await sdk.trigger({
      function_id: "mem::update",
      payload: { memoryId: saved.memory.id, content: "v3 content" },
    }) as { memory: { version: number } };
    expect(u2.memory.version).toBe(3);
  });

  it("does not create a duplicate memory (same ID, not a new one)", async () => {
    const saved = await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "original", type: "fact" },
    }) as { memory: { id: string } };

    await sdk.trigger({
      function_id: "mem::update",
      payload: { memoryId: saved.memory.id, content: "updated" },
    });

    const allMemories = await kv.list<{ id: string }>(KV.memories);
    // Should still be exactly 1 memory — no duplicate
    expect(allMemories).toHaveLength(1);
  });
});