import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerSessionSweepFunction } from "../src/functions/session-sweep.js";
import type { AuditEntry, Session } from "../src/types.js";
import { auditMonthOf } from "../src/functions/audit.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { KV } from "../src/state/schema.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    update: async (
      scope: string,
      key: string,
      ops: Array<{ type: "set"; path: string; value: unknown }>,
    ): Promise<void> => {
      const bucket = store.get(scope)?.get(key) as Record<string, unknown> | undefined;
      if (!bucket) return;
      for (const op of ops) bucket[op.path] = op.value;
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

function mockSdk() {
  const functions = new Map<string, Function>();
  const triggers: Array<{ function_id: string; payload: unknown }> = [];
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      triggers.push(input);
      const fn = functions.get(input.function_id);
      if (!fn) return undefined;
      return fn(input.payload);
    },
    triggers,
  };
}

function session(partial: Partial<Session>): Session {
  return {
    id: "s1",
    project: "/proj",
    cwd: "/proj",
    startedAt: new Date().toISOString(),
    status: "active",
    observationCount: 0,
    ...partial,
  };
}

const nowMs = Date.now();
const H = 60 * 60 * 1000;

describe("mem::session-sweep", () => {
  let kv: ReturnType<typeof mockKV>;
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    vi.unstubAllEnvs();
    kv = mockKV();
    sdk = mockSdk();
    registerSessionSweepFunction(sdk as never, kv as never);
  });

  it("marks stale active sessions as abandoned with endedAt", async () => {
    kv.set(KV.sessions, "s-old", session({ id: "s-old", updatedAt: new Date(nowMs - 30 * H).toISOString() }));
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const updated = await kv.get<Session>(KV.sessions, "s-old");
    expect(updated!.status).toBe("abandoned");
    expect(updated!.endedAt).toBeTruthy();
    expect(sweep.abandoned).toBe(1);
    expect(sweep.success).toBe(true);
  });

  it("falls back to startedAt when the session has no heartbeat", async () => {
    kv.set(KV.sessions, "s-nobeat", session({ id: "s-nobeat", startedAt: new Date(nowMs - 48 * H).toISOString() }));
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const updated = await kv.get<Session>(KV.sessions, "s-nobeat");
    expect(updated!.status).toBe("abandoned");
    expect(sweep.abandoned).toBe(1);
  });

  it("leaves fresh active sessions untouched", async () => {
    kv.set(KV.sessions, "s-fresh", session({ id: "s-fresh", updatedAt: new Date(nowMs - 2 * H).toISOString() }));
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const updated = await kv.get<Session>(KV.sessions, "s-fresh");
    expect(updated!.status).toBe("active");
    expect(sweep.abandoned).toBe(0);
  });

  it("leaves completed sessions untouched", async () => {
    kv.set(KV.sessions, "s-done", session({ id: "s-done", status: "completed", updatedAt: new Date(nowMs - 48 * H).toISOString() }));
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const updated = await kv.get<Session>(KV.sessions, "s-done");
    expect(updated!.status).toBe("completed");
    expect(sweep.abandoned).toBe(0);
  });

  it("reports failure when the session scan fails", async () => {
    (kv as any).list = async () => {
      throw new Error("state store down");
    };
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    expect(sweep.success).toBe(false);
    expect(sweep.error).toContain("state store down");
  });

  it("reports failure when the sweep is disabled", async () => {
    vi.stubEnv("AGENTMEMORY_SESSION_SWEEP_ENABLED", "false");
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    expect(sweep.success).toBe(false);
    expect(sweep.abandoned).toBe(0);
  });

  it("respects AGENTMEMORY_SESSION_SWEEP_STALE_HOURS override", async () => {
    vi.stubEnv("AGENTMEMORY_SESSION_SWEEP_STALE_HOURS", "48");
    kv.set(KV.sessions, "s-30h", session({ id: "s-30h", updatedAt: new Date(nowMs - 30 * H).toISOString() }));
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const updated = await kv.get<Session>(KV.sessions, "s-30h");
    expect(updated!.status).toBe("active");
    expect(sweep.abandoned).toBe(0);
  });

  it("rejects non-plain-integer stale-hour values", async () => {
    vi.stubEnv("AGENTMEMORY_SESSION_SWEEP_STALE_HOURS", "1e2");
    kv.set(KV.sessions, "s-2h", session({ id: "s-2h", updatedAt: new Date(nowMs - 2 * H).toISOString() }));
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const updated = await kv.get<Session>(KV.sessions, "s-2h");
    expect(updated!.status).toBe("active");
    expect(sweep.abandoned).toBe(0);
  });

  it("leaves a session alone when activity lands between the scan and the update", async () => {
    kv.set(KV.sessions, "s-race", session({ id: "s-race", updatedAt: new Date(nowMs - 30 * H).toISOString() }));
    const staleSnapshot = [{ ...(await kv.get<Session>(KV.sessions, "s-race"))! }];
    (kv as any).list = async () => {
      await kv.update(KV.sessions, "s-race", [
        { type: "set", path: "updatedAt", value: new Date().toISOString() },
      ]);
      return staleSnapshot;
    };
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const updated = await kv.get<Session>(KV.sessions, "s-race");
    expect(updated!.status).toBe("active");
    expect(updated!.endedAt).toBeUndefined();
    expect(sweep.abandoned).toBe(0);
  });

  it("waits for the obs session lock before marking a session abandoned", async () => {
    kv.set(KV.sessions, "s-locked", session({ id: "s-locked", updatedAt: new Date(nowMs - 30 * H).toISOString() }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = withKeyedLock("obs:s-locked", async () => {
      await gate;
      await kv.update(KV.sessions, "s-locked", [
        { type: "set", path: "updatedAt", value: new Date().toISOString() },
      ]);
    });
    const sweepPromise = (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    await new Promise((r) => setTimeout(r, 10));
    expect((await kv.get<Session>(KV.sessions, "s-locked"))!.status).toBe("active");
    release();
    await holder;
    const sweep = await sweepPromise;
    expect((await kv.get<Session>(KV.sessions, "s-locked"))!.status).toBe("active");
    expect(sweep.abandoned).toBe(0);
  });

  it("counts failed updates and reports a partial sweep", async () => {
    kv.set(KV.sessions, "s-ok", session({ id: "s-ok", updatedAt: new Date(nowMs - 30 * H).toISOString() }));
    kv.set(KV.sessions, "s-bad", session({ id: "s-bad", updatedAt: new Date(nowMs - 30 * H).toISOString() }));
    const realUpdate = kv.update;
    (kv as any).update = async (scope: string, key: string, ops: any) => {
      if (key === "s-bad") throw new Error("write refused");
      return realUpdate(scope, key, ops);
    };
    const sweep = await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    expect(sweep.success).toBe(false);
    expect(sweep.abandoned).toBe(1);
    expect(sweep.failed).toBe(1);
    expect((await kv.get<Session>(KV.sessions, "s-ok"))!.status).toBe("abandoned");
    expect((await kv.get<Session>(KV.sessions, "s-bad"))!.status).toBe("active");
  });

  it("writes one audit entry into the current month scope listing the abandoned sessions", async () => {
    kv.set(KV.sessions, "s-a", session({ id: "s-a", updatedAt: new Date(nowMs - 30 * H).toISOString() }));
    kv.set(KV.sessions, "s-b", session({ id: "s-b", startedAt: new Date(nowMs - 40 * H).toISOString() }));
    kv.set(KV.sessions, "s-live", session({ id: "s-live", updatedAt: new Date().toISOString() }));
    await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const month = auditMonthOf(new Date().toISOString());
    const entries = await kv.list<AuditEntry>(KV.auditMonth(month));
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("session_sweep");
    expect([...entries[0].targetIds].sort()).toEqual(["s-a", "s-b"]);
    const index = await kv.get<{ months: string[] }>(KV.auditMonths, "index");
    expect(index!.months).toContain(month);
  });

  it("writes no audit entry and deletes nothing when no session is stale", async () => {
    kv.set(KV.sessions, "s-live", session({ id: "s-live", updatedAt: new Date().toISOString() }));
    kv.set(KV.sessions, "s-done", session({ id: "s-done", status: "abandoned", updatedAt: new Date(nowMs - 90 * H).toISOString() }));
    await (sdk as any).trigger({ function_id: "mem::session-sweep", payload: {} });
    const month = auditMonthOf(new Date().toISOString());
    expect(await kv.list(KV.auditMonth(month))).toHaveLength(0);
    expect(kv.store.get(KV.sessions)!.size).toBe(2);
    expect(sdk.triggers.map((t) => t.function_id)).toEqual(["mem::session-sweep"]);
  });
});
