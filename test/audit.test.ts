import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { recordAudit, queryAudit } from "../src/functions/audit.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
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

describe("Audit Functions", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("recordAudit creates an entry with proper fields", async () => {
    const entry = await recordAudit(
      kv as never,
      "observe",
      "mem::compress",
      ["obs_1", "obs_2"],
      { count: 2 },
      0.85,
      "user-1",
    );

    expect(entry.id).toMatch(/^aud_/);
    expect(entry.timestamp).toBeDefined();
    expect(entry.operation).toBe("observe");
    expect(entry.functionId).toBe("mem::compress");
    expect(entry.targetIds).toEqual(["obs_1", "obs_2"]);
    expect(entry.details).toEqual({ count: 2 });
    expect(entry.qualityScore).toBe(0.85);
    expect(entry.userId).toBe("user-1");
  });

  it("queryAudit returns entries sorted by timestamp desc", async () => {
    await recordAudit(kv as never, "observe", "fn1", ["a"], {});
    await new Promise((r) => setTimeout(r, 10));
    await recordAudit(kv as never, "delete", "fn2", ["b"], {});

    const entries = await queryAudit(kv as never);
    expect(entries.length).toBe(2);
    expect(
      new Date(entries[0].timestamp).getTime(),
    ).toBeGreaterThanOrEqual(new Date(entries[1].timestamp).getTime());
  });

  it("queryAudit filters by operation", async () => {
    await recordAudit(kv as never, "observe", "fn1", [], {});
    await recordAudit(kv as never, "delete", "fn2", [], {});
    await recordAudit(kv as never, "observe", "fn3", [], {});

    const entries = await queryAudit(kv as never, { operation: "observe" });
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.operation === "observe")).toBe(true);
  });

  it("queryAudit filters by dateFrom/dateTo", async () => {
    const early = await recordAudit(kv as never, "observe", "fn1", [], {});
    await new Promise((r) => setTimeout(r, 20));
    const late = await recordAudit(kv as never, "delete", "fn2", [], {});

    const entries = await queryAudit(kv as never, {
      dateFrom: late.timestamp,
    });
    expect(entries.length).toBe(1);
    expect(entries[0].operation).toBe("delete");

    const entriesBefore = await queryAudit(kv as never, {
      dateTo: early.timestamp,
    });
    expect(entriesBefore.length).toBe(1);
    expect(entriesBefore[0].operation).toBe("observe");
  });

  it("queryAudit respects limit", async () => {
    for (let i = 0; i < 10; i++) {
      await recordAudit(kv as never, "observe", `fn${i}`, [], {});
    }

    const entries = await queryAudit(kv as never, { limit: 3 });
    expect(entries.length).toBe(3);
  });
});
