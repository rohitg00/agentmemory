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

function observePayload(hookType: string, data: unknown) {
  return {
    sessionId: "ses_dedup_test",
    project: "/home/user/myrepo",
    cwd: "/home/user/myrepo",
    hookType,
    timestamp: new Date().toISOString(),
    data,
  };
}

describe("observe dedup for hooks without tool_input (#1173)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("records consecutive prompt_submit observations with different prompts", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, new DedupMap());

    const first = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", { prompt: "ship the helm chart" }),
    )) as { observationId?: string; deduplicated?: boolean };
    const second = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", { prompt: "now fix the failing test" }),
    )) as { observationId?: string; deduplicated?: boolean };

    expect(first.observationId).toBeTruthy();
    expect(second.deduplicated).toBeUndefined();
    expect(second.observationId).toBeTruthy();
  });

  it("still dedups an identical prompt_submit within the TTL window", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, new DedupMap());

    const payload = { prompt: "ship the helm chart" };
    const first = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", payload),
    )) as { observationId?: string };
    const second = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", payload),
    )) as { deduplicated?: boolean };

    expect(first.observationId).toBeTruthy();
    expect(second.deduplicated).toBe(true);
  });

  it("keeps tool_input as the dedup key for tool hooks (response changes still dedup)", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, new DedupMap());

    const first = (await sdk.trigger(
      "mem::observe",
      observePayload("post_tool_use", {
        tool_name: "Bash",
        tool_input: { command: "ls" },
        tool_response: "a.txt",
      }),
    )) as { observationId?: string };
    const second = (await sdk.trigger(
      "mem::observe",
      observePayload("post_tool_use", {
        tool_name: "Bash",
        tool_input: { command: "ls" },
        tool_response: "b.txt",
      }),
    )) as { deduplicated?: boolean };

    expect(first.observationId).toBeTruthy();
    expect(second.deduplicated).toBe(true);
  });
});
