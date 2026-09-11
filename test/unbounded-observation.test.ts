import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  let listCallCount = 0;
  return {
    store,
    getListCallCount: () => listCallCount,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    update: async (scope: string, key: string, updates: Array<{ path: string; value: unknown }>) => {
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
      listCallCount++;
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  const triggered: Array<{ id: string; payload: unknown }> = [];
  return {
    fns,
    triggered,
    registerFunction: (
      idOrOpts: string | { id: string },
      fn: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
    },
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown; action?: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      triggered.push({ id, payload });
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

describe("Ticket 03: Unbounded Observation Ingestion Pipeline", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("successfully ingests past 500 observations without dropping or erroring", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);

    const sid = "sess-long-running";

    // Ingest 505 observations
    for (let i = 1; i <= 505; i++) {
      const res = (await sdk.trigger("mem::observe", {
        sessionId: sid,
        hookType: "command_executed",
        project: "test-proj",
        cwd: "/test",
        timestamp: new Date().toISOString(),
        data: { tool_name: "bash", tool_input: `echo ${i}` },
      })) as { success: boolean; observationId?: string; error?: string };

      expect(res.success).toBe(true);
      expect(res.error).toBeUndefined();
    }

    // Verify session metadata tracked counts
    const session = await kv.get<{ observationCount: number; uncompactedCount: number }>(
      "mem:sessions",
      sid,
    );
    expect(session).toBeDefined();
    expect(session?.observationCount).toBe(505);
    expect(session?.uncompactedCount).toBe(505);

    // Verify kv.list was NOT called repeatedly on every ingest
    expect(kv.getListCallCount()).toBe(0);
  });
});
