import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    fns,
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
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

describe("Ticket 04: Asynchronous Background Micro-Compaction Worker", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("compacts uncompacted slice into a session checkpoint and advances watermark", async () => {
    const { registerMicroCompactFunction } = await import("../src/functions/micro-compact.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerMicroCompactFunction(sdk as never, kv as never);

    const sid = "ses_micro_compact_test";
    await kv.set("mem:sessions", sid, {
      id: sid,
      project: "agentmemory",
      cwd: "/repo",
      startedAt: new Date().toISOString(),
      observationCount: 210,
      uncompactedCount: 210,
      compactedWatermark: 0,
      status: "active",
    });

    // Seed 210 observations
    for (let i = 0; i < 210; i++) {
      await kv.set(`mem:obs:${sid}`, `obs_${i}`, {
        id: `obs_${i}`,
        sessionId: sid,
        title: `Observation step ${i}`,
        narrative: `Completed task step ${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        files: [`src/file_${i % 5}.ts`],
      });
    }

    const res = (await sdk.trigger("mem::micro-compact", {
      sessionId: sid,
    })) as { success: boolean; checkpointId?: string; newWatermark?: number; remainingUncompacted?: number };

    expect(res.success).toBe(true);
    expect(res.checkpointId).toBeDefined();
    expect(res.newWatermark).toBe(210);
    expect(res.remainingUncompacted).toBe(0);

    const session = await kv.get<{ compactedWatermark: number; uncompactedCount: number }>(
      "mem:sessions",
      sid,
    );
    expect(session?.compactedWatermark).toBe(210);
    expect(session?.uncompactedCount).toBe(0);

    const checkpoints = await kv.list<any>("mem:checkpoints");
    expect(checkpoints.length).toBeGreaterThan(0);
    expect(checkpoints[0].sessionId).toBe(sid);
    expect(checkpoints[0].summary).toContain("Episodic Checkpoint");
  });
});
