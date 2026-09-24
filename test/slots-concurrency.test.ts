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
      idOrInput: string | { function_id: string; payload: unknown },
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

type Res = {
  success: boolean;
  error?: string;
  rev?: number;
  size?: number;
  free?: number;
  pctUsed?: number;
  contentHash?: string;
  warning?: string;
  current?: { rev: number; contentHash: string };
  entries?: Array<{ operation: string; size: number; preview: string }>;
  restoreWith?: { content: string };
};

async function setup(sizeLimit = 100, content = "base") {
  const { registerSlotsFunctions } = await import("../src/functions/slots.js");
  const sdk = mockSdk();
  const kv = mockKV();
  registerSlotsFunctions(sdk as never, kv as never);
  await kv.set("mem:slots", "shared_index", {
    label: "shared_index",
    content,
    sizeLimit,
    description: "test",
    pinned: true,
    readOnly: false,
    scope: "project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  return { sdk, kv };
}

describe("slot concurrency guard, history and headroom", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reports headroom on read and warns as the slot fills", async () => {
    const { sdk } = await setup(100, "x".repeat(95));
    const res = (await sdk.trigger("mem::slot-get", { label: "shared_index" })) as Res;
    expect(res.size).toBe(95);
    expect(res.free).toBe(5);
    expect(res.pctUsed).toBe(95);
    expect(res.warning).toMatch(/compact it now/);
  });

  it("rejects a replace carrying a stale expectedRev and leaves the content alone", async () => {
    const { sdk } = await setup();
    await sdk.trigger("mem::slot-append", { label: "shared_index", text: "lane A line" });

    const stale = (await sdk.trigger("mem::slot-replace", {
      label: "shared_index",
      content: "lane B rewrote everything",
      expectedRev: 0,
    })) as Res;

    expect(stale.success).toBe(false);
    expect(stale.error).toMatch(/changed since you read it/);
    expect(stale.current?.rev).toBe(1);

    const after = (await sdk.trigger("mem::slot-get", { label: "shared_index" })) as Res & {
      slot: { content: string };
    };
    expect(after.slot.content).toContain("lane A line");
  });

  it("accepts a replace carrying the current rev and bumps it", async () => {
    const { sdk } = await setup();
    const read = (await sdk.trigger("mem::slot-get", { label: "shared_index" })) as Res;
    const res = (await sdk.trigger("mem::slot-replace", {
      label: "shared_index",
      content: "compacted",
      expectedRev: read.rev,
    })) as Res;
    expect(res.success).toBe(true);
    expect(res.rev).toBe((read.rev ?? 0) + 1);
  });

  it("honours expectedHash the same way", async () => {
    const { sdk } = await setup();
    const bad = (await sdk.trigger("mem::slot-replace", {
      label: "shared_index",
      content: "nope",
      expectedHash: "deadbeefdead",
    })) as Res;
    expect(bad.success).toBe(false);

    const read = (await sdk.trigger("mem::slot-get", { label: "shared_index" })) as Res;
    const good = (await sdk.trigger("mem::slot-replace", {
      label: "shared_index",
      content: "yes",
      expectedHash: read.contentHash,
    })) as Res;
    expect(good.success).toBe(true);
  });

  it("keeps a pre-write copy of every mutation and can hand back the undo", async () => {
    const { sdk } = await setup(200, "original");
    await sdk.trigger("mem::slot-append", { label: "shared_index", text: "appended" });
    await sdk.trigger("mem::slot-replace", { label: "shared_index", content: "clobbered" });

    const history = (await sdk.trigger("mem::slot-history", { label: "shared_index" })) as Res;
    expect(history.entries?.map((e) => e.operation)).toEqual(["replace", "append"]);
    expect(history.entries?.[1].preview).toBe("original");

    const restore = (await sdk.trigger("mem::slot-history", {
      label: "shared_index",
      restore: true,
    })) as Res;
    expect(restore.restoreWith?.content).toContain("appended");
  });

  it("writes without an expectation still work, so existing callers are unaffected", async () => {
    const { sdk } = await setup();
    const res = (await sdk.trigger("mem::slot-replace", {
      label: "shared_index",
      content: "no expectation supplied",
    })) as Res;
    expect(res.success).toBe(true);
  });
});
