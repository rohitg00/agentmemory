import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isProjectIsolationEnabled } from "../src/config.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerSearchFunction, getSearchIndex, setIndexPersistence } from "../src/functions/search.js";
import { registerEnrichFunction } from "../src/functions/enrich.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { KV } from "../src/state/schema.js";
import type { Memory, Session } from "../src/types.js";

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
  const overrides = new Map<string, Function>();
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
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      if (overrides.has(id)) return overrides.get(id)!(payload);
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      overrides.set(id, handler);
    },
  };
}

function makeMemory(id: string, project?: string): Memory {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    type: "fact",
    title: `Title ${id}`,
    content: "shared isolation memory",
    concepts: ["isolation"],
    files: ["src/file.ts"],
    sessionIds: [],
    strength: 7,
    version: 1,
    isLatest: true,
    ...(project !== undefined && { project }),
  };
}

describe("project isolation flag", () => {
  const originalIsolation = process.env["AGENTMEMORY_PROJECT_ISOLATION"];
  const originalProject = process.env["AGENTMEMORY_PROJECT_NAME"];

  beforeEach(() => {
    delete process.env["AGENTMEMORY_PROJECT_ISOLATION"];
    delete process.env["AGENTMEMORY_PROJECT_NAME"];
    getSearchIndex().clear();
    setIndexPersistence(null);
  });

  afterEach(() => {
    getSearchIndex().clear();
    setIndexPersistence(null);
    if (originalIsolation === undefined) delete process.env["AGENTMEMORY_PROJECT_ISOLATION"];
    else process.env["AGENTMEMORY_PROJECT_ISOLATION"] = originalIsolation;
    if (originalProject === undefined) delete process.env["AGENTMEMORY_PROJECT_NAME"];
    else process.env["AGENTMEMORY_PROJECT_NAME"] = originalProject;
  });

  it("reads AGENTMEMORY_PROJECT_ISOLATION as a boolean", () => {
    process.env["AGENTMEMORY_PROJECT_ISOLATION"] = "true";
    expect(isProjectIsolationEnabled()).toBe(true);
    process.env["AGENTMEMORY_PROJECT_ISOLATION"] = "1";
    expect(isProjectIsolationEnabled()).toBe(true);
    process.env["AGENTMEMORY_PROJECT_ISOLATION"] = "false";
    expect(isProjectIsolationEnabled()).toBe(false);
    delete process.env["AGENTMEMORY_PROJECT_ISOLATION"];
    expect(isProjectIsolationEnabled()).toBe(true);
  });

  it("uses AGENTMEMORY_PROJECT_NAME as the resolved project under strict mode", async () => {
    process.env["AGENTMEMORY_PROJECT_ISOLATION"] = "true";
    process.env["AGENTMEMORY_PROJECT_NAME"] = "env-project";

    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::remember", {
      content: "env-backed memory",
    })) as { success: boolean; memory: { project?: string } };

    expect(result.success).toBe(true);
    expect(result.memory.project).toBe("env-project");
  });

  it("preserves global memory behavior when isolation is explicitly off", async () => {
    process.env["AGENTMEMORY_PROJECT_ISOLATION"] = "false";
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::remember", {
      content: "global memory",
    })) as { success: boolean; memory: { project?: string } };

    expect(result.success).toBe(true);
    expect(result.memory.project).toBeUndefined();
  });

  it("rejects writes and reads without a project when isolation is enabled by default", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerRememberFunction(sdk as never, kv as never);
    registerSearchFunction(sdk as never, kv as never);
    registerEnrichFunction(sdk as never, kv as never);
    registerLessonsFunctions(sdk as never, kv as never);
    sdk.overrideTrigger("mem::file-context", async () => ({ context: "" }));

    await expect(
      sdk.trigger("mem::remember", { content: "missing project" }),
    ).rejects.toThrow(/project is required/);
    await expect(
      sdk.trigger("mem::search", { query: "missing project" }),
    ).rejects.toThrow(/project is required/);
    await expect(
      sdk.trigger("mem::enrich", {
        sessionId: "sess_1",
        files: ["src/file.ts"],
      }),
    ).rejects.toThrow(/project is required/);
    await expect(
      sdk.trigger("mem::lesson-save", { content: "lesson without project" }),
    ).rejects.toThrow(/project is required/);
  });

  it("hides legacy unscoped memories from scoped reads when isolation is enabled", async () => {
    process.env["AGENTMEMORY_PROJECT_ISOLATION"] = "true";

    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerSearchFunction(sdk as never, kv as never);

    await kv.set(KV.memories, "mem_global", makeMemory("mem_global"));
    await kv.set(KV.memories, "mem_api", makeMemory("mem_api", "api"));

    const result = (await sdk.trigger("mem::search", {
      query: "shared isolation memory",
      project: "api",
    })) as { project?: string; results: Array<{ observation: { id: string } }> };

    expect(result.project).toBe("api");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].observation.id).toBe("mem_api");
  });
});
