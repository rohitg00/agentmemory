import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const removedFromBm25: string[] = [];
const removedFromVector: string[] = [];

vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({
    remove: (id: string) => {
      removedFromBm25.push(id);
    },
    add: () => {},
  }),
  vectorIndexAddGuarded: async () => false,
  vectorIndexRemove: (id: string) => {
    removedFromVector.push(id);
  },
}));

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
    update: async () => {},
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
    fns,
    registerFunction: (idOrOpts: string | { id: string }, fn: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
    },
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
    triggerVoid: () => {},
  };
}

const SESSION = "ses_capped";
const SCOPE = `mem:obs:${SESSION}`;

function seed(kv: ReturnType<typeof mockKV>, rows: Array<{ id: string; importance?: number; ts: string }>) {
  for (const row of rows) {
    kv.store.set(SCOPE, kv.store.get(SCOPE) ?? new Map());
    kv.store.get(SCOPE)!.set(row.id, {
      id: row.id,
      sessionId: SESSION,
      timestamp: row.ts,
      hookType: "post_tool_use",
      importance: row.importance,
      raw: {},
    });
  }
}

async function observeOnce(sdk: ReturnType<typeof mockSdk>, text: string) {
  return (await sdk.trigger("mem::observe", {
    sessionId: SESSION,
    hookType: "post_tool_use",
    timestamp: new Date().toISOString(),
    data: { tool_name: "Bash", tool_input: { command: text } },
  })) as { success?: boolean; observationId?: string; error?: string };
}

describe("session observation cap evicts instead of refusing", () => {
  beforeEach(() => {
    vi.resetModules();
    removedFromBm25.length = 0;
    removedFromVector.length = 0;
  });

  it("accepts the new observation at the cap and drops the least valuable row", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, undefined, 3);

    seed(kv, [
      { id: "obs_keep_high", importance: 9, ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_evict_low", importance: 1, ts: "2026-01-02T00:00:00.000Z" },
      { id: "obs_keep_mid", importance: 5, ts: "2026-01-03T00:00:00.000Z" },
    ]);

    const result = await observeOnce(sdk, "the newest command");

    expect(result.observationId).toBeTruthy();
    expect(result.error).toBeUndefined();

    const ids = Array.from(kv.store.get(SCOPE)!.keys());
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain("obs_evict_low");
    expect(ids).toContain("obs_keep_high");
    expect(ids).toContain("obs_keep_mid");
  });

  it("evicts the oldest row when importance ties, and clears it from both indexes", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, undefined, 2);

    seed(kv, [
      { id: "obs_older", importance: 4, ts: "2026-01-01T00:00:00.000Z" },
      { id: "obs_newer", importance: 4, ts: "2026-02-01T00:00:00.000Z" },
    ]);

    await observeOnce(sdk, "another command");

    const ids = Array.from(kv.store.get(SCOPE)!.keys());
    expect(ids).not.toContain("obs_older");
    expect(ids).toContain("obs_newer");
    expect(removedFromBm25).toContain("obs_older");
    expect(removedFromVector).toContain("obs_older");
  });

  it("leaves capture untouched when the session is under the cap", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, undefined, 10);

    seed(kv, [{ id: "obs_only", importance: 1, ts: "2026-01-01T00:00:00.000Z" }]);

    await observeOnce(sdk, "still room");

    expect(Array.from(kv.store.get(SCOPE)!.keys())).toContain("obs_only");
    expect(removedFromBm25).toHaveLength(0);
  });
});
