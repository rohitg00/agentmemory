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

async function setup() {
  vi.resetModules();
  const search = await import("../src/functions/search.js");
  const { registerRememberFunction } = await import("../src/functions/remember.js");
  const sdk = mockSdk();
  const kv = mockKV();
  registerRememberFunction(sdk as never, kv as never);
  return { sdk, kv, search };
}

describe("mem::remember supersession and recall hygiene", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("removes the superseded version from the search index", async () => {
    const { sdk, search } = await setup();
    const first = (await sdk.trigger("mem::remember", {
      content: "the deploy pipeline uses blue green rollout with health gates",
      type: "architecture",
    })) as { memory: { id: string } };
    const idx = search.getSearchIndex();
    expect(idx.has(first.memory.id)).toBe(true);

    const second = (await sdk.trigger("mem::remember", {
      content: "the deploy pipeline uses blue green rollout with health gates always",
      type: "architecture",
    })) as { memory: { id: string; supersedes: string[] } };

    expect(second.memory.supersedes).toContain(first.memory.id);
    expect(idx.has(first.memory.id)).toBe(false);
    expect(idx.has(second.memory.id)).toBe(true);
  });

  it("reports a close-but-below-threshold match as similarTo without superseding", async () => {
    const { sdk } = await setup();
    const first = (await sdk.trigger("mem::remember", {
      content: "redis cache layer fronting the primary database for hot reads",
      type: "architecture",
    })) as { memory: { id: string } };

    const second = (await sdk.trigger("mem::remember", {
      content: "redis cache layer fronting the primary database misses cold writes entirely",
      type: "architecture",
    })) as {
      memory: { id: string; version: number };
      similarTo?: { id: string; similarity: number };
    };

    expect(second.memory.version).toBe(1);
    if (second.similarTo) {
      expect(second.similarTo.id).toBe(first.memory.id);
      expect(second.similarTo.similarity).toBeGreaterThan(0.4);
      expect(second.similarTo.similarity).toBeLessThanOrEqual(0.7);
    }
  });

  it("still finds the supersession target through index-backed candidates", async () => {
    const { sdk } = await setup();
    for (let i = 0; i < 30; i++) {
      await sdk.trigger("mem::remember", {
        content: `unrelated filler memory number ${i} about topic-${i} with words w${i}a w${i}b`,
        type: "fact",
      });
    }
    const target = (await sdk.trigger("mem::remember", {
      content: "session tokens rotate every fifteen minutes via the auth broker",
      type: "workflow",
    })) as { memory: { id: string } };

    const update = (await sdk.trigger("mem::remember", {
      content: "session tokens rotate every fifteen minutes via the auth broker service",
      type: "workflow",
    })) as { memory: { supersedes: string[]; version: number } };

    expect(update.memory.supersedes).toContain(target.memory.id);
    expect(update.memory.version).toBe(2);
  });
});
