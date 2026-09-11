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

describe("Ticket 02: Dual-Lookup Fallback for Memory Recall", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to legacy un-scoped project records when canonical projectKey has no records yet", async () => {
    const { registerContextFunction } = await import("../src/functions/context.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerContextFunction(sdk as never, kv as never, 2000);

    // Seed legacy records under project "Monolith"
    await kv.set("mem:sessions", "legacy-sess-1", {
      id: "legacy-sess-1",
      project: "Monolith",
      cwd: "/work/Monolith",
      startedAt: "2026-08-01T10:00:00.000Z",
      status: "active",
      observationCount: 10,
    });
    await kv.set("mem:summaries", "legacy-sess-1", {
      id: "sum-1",
      sessionId: "legacy-sess-1",
      project: "Monolith",
      title: "Legacy Monolith Refactor",
      narrative: "Migrated database layers",
      keyDecisions: ["Use PostgreSQL"],
      filesModified: ["db.go"],
      createdAt: "2026-08-01T11:00:00.000Z",
    });

    // Query with new canonical project key "github.com-myorg-monolith"
    const result = (await sdk.trigger("mem::context", {
      sessionId: "new-sess-1",
      project: "github.com-myorg-monolith",
      project_display_name: "Monolith",
    })) as { context: string };

    expect(result.context).toContain("Legacy Monolith Refactor");
    expect(result.context).toContain("Use PostgreSQL");
  });
});
