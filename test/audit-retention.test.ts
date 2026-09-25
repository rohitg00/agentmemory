import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

const AUDIT = "mem:audit";

async function writeN(recordAudit: Function, kv: ReturnType<typeof mockKV>, n: number) {
  for (let i = 0; i < n; i++) {
    await recordAudit(kv, "observe", "mem::observe", [`t${i}`]);
  }
}

describe("audit log retention", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AGENTMEMORY_AUDIT_MAX;
  });

  afterEach(() => {
    delete process.env.AGENTMEMORY_AUDIT_MAX;
  });

  // The trim runs every 100 writes, so the log is bounded at max + one interval
  // rather than exactly max — the point is that it stops growing without limit.
  it("keeps the log bounded near AGENTMEMORY_AUDIT_MAX and drops the oldest rows", async () => {
    process.env.AGENTMEMORY_AUDIT_MAX = "150";
    const { recordAudit } = await import("../src/functions/audit.js");
    const kv = mockKV();

    await writeN(recordAudit, kv, 260);

    const rows = Array.from(kv.store.get(AUDIT)!.values()) as Array<{
      timestamp: string;
      targetIds: string[];
    }>;
    expect(rows.length).toBeLessThanOrEqual(150 + 100);
    expect(rows.length).toBeLessThan(260);
    // the survivors are the newest ones
    const kept = new Set(rows.flatMap((r) => r.targetIds));
    expect(kept.has("t259")).toBe(true);
    expect(kept.has("t0")).toBe(false);
  });

  it("does not trim when the log is under the bound", async () => {
    process.env.AGENTMEMORY_AUDIT_MAX = "500";
    const { recordAudit } = await import("../src/functions/audit.js");
    const kv = mockKV();

    await writeN(recordAudit, kv, 120);

    expect(kv.store.get(AUDIT)!.size).toBe(120);
  });

  it("treats 0 as unbounded, preserving the pre-existing behaviour", async () => {
    process.env.AGENTMEMORY_AUDIT_MAX = "0";
    const { recordAudit } = await import("../src/functions/audit.js");
    const kv = mockKV();

    await writeN(recordAudit, kv, 250);

    expect(kv.store.get(AUDIT)!.size).toBe(250);
  });

  it("still returns the entry when trimming fails", async () => {
    process.env.AGENTMEMORY_AUDIT_MAX = "10";
    const { recordAudit } = await import("../src/functions/audit.js");
    const kv = mockKV();
    const broken = { ...kv, list: async () => { throw new Error("kv down"); } };

    let last;
    for (let i = 0; i < 120; i++) {
      last = await recordAudit(broken as never, "observe", "mem::observe", [`t${i}`]);
    }
    expect(last?.id).toBeTruthy();
  });
});
