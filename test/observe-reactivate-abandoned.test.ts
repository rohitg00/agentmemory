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
    update: async (
      scope: string,
      key: string,
      updates: Array<{ path: string; value: unknown }>,
    ): Promise<void> => {
      const m = store.get(scope);
      if (!m) return;
      const v = (m.get(key) as Record<string, unknown>) ?? {};
      for (const u of updates) v[u.path] = u.value;
      m.set(key, v);
    },
    delete: async (scope: string, key: string): Promise<void> => {
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
    registerTrigger: () => {},
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

function seedSession(store: Map<string, Map<string, unknown>>, id: string, status: string) {
  if (!store.has("mem:sessions")) store.set("mem:sessions", new Map());
  store.get("mem:sessions")!.set(id, {
    id,
    project: "/home/user/myrepo",
    cwd: "/home/user/myrepo",
    startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    status,
    observationCount: 3,
  });
}

describe("observe reactivates abandoned sessions (#1410)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sets an abandoned session back to active and clears endedAt on new activity", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const sdk = mockSdk();
    const kv = mockKV();
    seedSession(kv.store, "ses_reactivated", "abandoned");
    registerObserveFunction(sdk as never, kv as never);

    await sdk.trigger("mem::observe", {
      sessionId: "ses_reactivated",
      project: "/home/user/myrepo",
      cwd: "/home/user/myrepo",
      hookType: "post_tool_use",
      timestamp: new Date().toISOString(),
      data: { tool_name: "Read", tool_input: { file_path: "x.ts" } },
    });

    const session = kv.store.get("mem:sessions")!.get("ses_reactivated") as Record<string, unknown>;
    expect(session.status).toBe("active");
    expect(session.endedAt).toBeNull();
    expect(session.observationCount).toBe(4);
  });

  it("does not touch the status of an active session", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const sdk = mockSdk();
    const kv = mockKV();
    seedSession(kv.store, "ses_active", "active");
    registerObserveFunction(sdk as never, kv as never);

    await sdk.trigger("mem::observe", {
      sessionId: "ses_active",
      project: "/home/user/myrepo",
      cwd: "/home/user/myrepo",
      hookType: "post_tool_use",
      timestamp: new Date().toISOString(),
      data: { tool_name: "Read", tool_input: { file_path: "y.ts" } },
    });

    const session = kv.store.get("mem:sessions")!.get("ses_active") as Record<string, unknown>;
    expect(session.status).toBe("active");
    expect(session.endedAt).toBeUndefined();
    expect(session.observationCount).toBe(4);
  });
});
