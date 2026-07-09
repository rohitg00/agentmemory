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

describe("mem::remember — CJK dedup", () => {
  let sdk: ReturnType<typeof makeMockSdk>;
  let kv: ReturnType<typeof makeMockKV>;

  beforeEach(() => {
    sdk = makeMockSdk();
    kv = makeMockKV();
    getSearchIndex().clear();
    setIndexPersistence(null);
    registerRememberFunction(sdk as never, kv as never);
  });

  it("supersedes a pure Chinese duplicate preference", async () => {
    const first = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "使用代码审查来确保代码质量",
        type: "preference",
      },
    }) as { memory: { id: string } };

    const second = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "使用代码审查来确保代码质量",
        type: "preference",
      },
    }) as { memory: { id: string; supersedes: string[] } };

    expect(second.memory.supersedes).toContain(first.memory.id);

    const original = await kv.get<{ isLatest: boolean }>(KV.memories, first.memory.id);
    expect(original?.isLatest).toBe(false);
  });

  it("supersedes a mixed Chinese/English duplicate preference", async () => {
    const first = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "preference: 使用 eslint 进行代码检查",
        type: "preference",
      },
    }) as { memory: { id: string } };

    const second = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "使用 eslint 进行代码检查 preference",
        type: "preference",
      },
    }) as { memory: { id: string; supersedes: string[] } };

    expect(second.memory.supersedes).toContain(first.memory.id);
  });

  it("does not supersede related but distinct Chinese preferences", async () => {
    const first = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "使用代码审查来确保质量",
        type: "preference",
      },
    }) as { memory: { id: string } };

    const second = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "使用持续集成来确保部署",
        type: "preference",
      },
    }) as { memory: { id: string; supersedes: string[] } };

    expect(second.memory.supersedes).toHaveLength(0);

    const original = await kv.get<{ isLatest: boolean }>(KV.memories, first.memory.id);
    expect(original?.isLatest).toBe(true);
  });

  it("does not supersede negation conflict (English do vs do-not)", async () => {
    const first = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "always use strict mode in JavaScript files",
        type: "preference",
      },
    }) as { memory: { id: string } };

    const second = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "do not use strict mode in JavaScript files",
        type: "preference",
      },
    }) as { memory: { id: string; supersedes: string[] } };

    expect(second.memory.supersedes).toHaveLength(0);

    const original = await kv.get<{ isLatest: boolean }>(KV.memories, first.memory.id);
    expect(original?.isLatest).toBe(true);
  });

  it("does not supersede negation conflict (Chinese 不要 vs affirmative)", async () => {
    const first = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "使用 var 声明变量",
        type: "preference",
      },
    }) as { memory: { id: string } };

    const second = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "不要使用 var 声明变量",
        type: "preference",
      },
    }) as { memory: { id: string; supersedes: string[] } };

    expect(second.memory.supersedes).toHaveLength(0);

    const original = await kv.get<{ isLatest: boolean }>(KV.memories, first.memory.id);
    expect(original?.isLatest).toBe(true);
  });

  it("respects project isolation for CJK dedup", async () => {
    const first = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "使用代码审查来确保质量",
        type: "preference",
        project: "api",
      },
    }) as { memory: { id: string } };

    const second = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "使用代码审查来确保质量",
        type: "preference",
        project: "web",
      },
    }) as { memory: { id: string; supersedes: string[] } };

    expect(second.memory.supersedes).toHaveLength(0);

    const original = await kv.get<{ isLatest: boolean }>(KV.memories, first.memory.id);
    expect(original?.isLatest).toBe(true);
  });
});