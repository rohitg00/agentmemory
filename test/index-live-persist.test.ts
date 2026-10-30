import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getSearchIndex, setIndexPersistence } from "../src/functions/search.js";
import { registerObserveFunction } from "../src/functions/observe.js";
import { registerRememberFunction } from "../src/functions/remember.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    update: async (
      scope: string,
      key: string,
      updates: Array<{ path: string; value: unknown }>,
    ) => {
      const m = store.get(scope);
      if (!m) return;
      const v = (m.get(key) as Record<string, unknown>) ?? {};
      for (const u of updates) v[u.path] = u.value;
      m.set(key, v);
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, fn: Function) => {
      fns.set(typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id, fn);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = fns.get(input.function_id);
      return fn ? fn(input.payload) : null;
    },
  };
}

describe("live index writes schedule the persisted snapshot", () => {
  const persistence = { scheduleSave: vi.fn(), save: vi.fn(async () => {}) };

  beforeEach(() => {
    getSearchIndex().clear();
    persistence.scheduleSave.mockClear();
    setIndexPersistence(persistence);
  });

  afterEach(() => {
    setIndexPersistence(null);
  });

  it("after a synthetic observation", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);

    const result = (await sdk.trigger({
      function_id: "mem::observe",
      payload: {
        sessionId: "ses_live",
        project: "agentmemory",
        cwd: "/tmp/agentmemory",
        hookType: "post_tool_use",
        timestamp: new Date().toISOString(),
        data: {
          tool_name: "Bash",
          tool_input: { command: "echo persist-probe" },
          tool_output: "persist-probe output",
        },
      },
    })) as { observationId: string };

    expect(result.observationId).toBeTruthy();
    expect(getSearchIndex().has(result.observationId)).toBe(true);
    expect(persistence.scheduleSave).toHaveBeenCalled();
  });

  it("after a memory save", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = (await sdk.trigger({
      function_id: "mem::remember",
      payload: { content: "persisted snapshot follows every live add", type: "fact" },
    })) as { success: boolean; memory: { id: string } };

    expect(result.success).toBe(true);
    expect(getSearchIndex().has(result.memory.id)).toBe(true);
    expect(persistence.scheduleSave).toHaveBeenCalled();
  });
});
