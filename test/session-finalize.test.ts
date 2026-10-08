import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  FINALIZE_DUE_KEY,
  clearSessionFinalize,
  registerSessionFinalizeFunction,
  scheduleSessionFinalize,
} from "../src/functions/session-finalize.js";
import { KV } from "../src/state/schema.js";
import type { Session } from "../src/types.js";

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
      ops: Array<{ type: "set" | "remove"; path: string; value?: unknown }>,
    ): Promise<void> => {
      const row = store.get(scope)?.get(key) as Record<string, unknown> | undefined;
      if (!row) return;
      for (const op of ops) {
        if (op.type === "remove") delete row[op.path];
        else row[op.path] = op.value;
      }
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  const triggers: Array<{ function_id: string; payload: unknown }> = [];
  return {
    triggers,
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      triggers.push(input);
      const fn = functions.get(input.function_id);
      return fn ? fn(input.payload) : undefined;
    },
  };
}

const nowMs = Date.UTC(2026, 9, 8, 12, 0, 0);
const MIN = 60_000;
const IDLE_MS = 120_000;

function session(partial: Partial<Session>): Session {
  return {
    id: "s1",
    project: "/proj",
    cwd: "/proj",
    startedAt: new Date(nowMs - 60 * MIN).toISOString(),
    status: "active",
    observationCount: 4,
    ...partial,
  };
}

function stoppedTriggers(sdk: ReturnType<typeof mockSdk>) {
  return sdk.triggers.filter((t) => t.function_id === "event::session::stopped");
}

describe("mem::session-finalize", () => {
  let kv: ReturnType<typeof mockKV>;
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("AGENTMEMORY_FINALIZE_IDLE_MS", String(IDLE_MS));
    kv = mockKV();
    sdk = mockSdk();
    registerSessionFinalizeFunction(sdk as never, kv as never);
  });

  it("keeps every due entry in one config record", async () => {
    await scheduleSessionFinalize(kv as never, "s1", nowMs + MIN);
    await scheduleSessionFinalize(kv as never, "s2", nowMs + 2 * MIN);
    expect(await kv.get(KV.config, FINALIZE_DUE_KEY)).toEqual({ s1: nowMs + MIN, s2: nowMs + 2 * MIN });

    await clearSessionFinalize(kv as never, "s1");
    expect(await kv.get(KV.config, FINALIZE_DUE_KEY)).toEqual({ s2: nowMs + 2 * MIN });
  });

  it("completes an idle session once its entry is due and publishes the stopped lifecycle", async () => {
    await kv.set(KV.sessions, "s1", session({ updatedAt: new Date(nowMs - 3 * MIN).toISOString() }));
    await scheduleSessionFinalize(kv as never, "s1", nowMs - 1);

    const result = await sdk.trigger({ function_id: "mem::session-finalize", payload: { now: nowMs } });

    expect(result).toMatchObject({ success: true, due: 1, finalized: 1, rescheduled: 0, dropped: 0 });
    const updated = await kv.get<Session>(KV.sessions, "s1");
    expect(updated!.status).toBe("completed");
    expect(updated!.endedAt).toBe(new Date(nowMs).toISOString());
    expect(stoppedTriggers(sdk)).toEqual([
      expect.objectContaining({ function_id: "event::session::stopped", payload: { sessionId: "s1" } }),
    ]);
    expect(await kv.get(KV.config, FINALIZE_DUE_KEY)).toEqual({});
  });

  it("pushes a session that was active after its entry was written to the next idle window", async () => {
    const activeAt = nowMs - 30_000;
    await kv.set(KV.sessions, "s1", session({ updatedAt: new Date(activeAt).toISOString() }));
    await scheduleSessionFinalize(kv as never, "s1", nowMs - 1);

    const result = await sdk.trigger({ function_id: "mem::session-finalize", payload: { now: nowMs } });

    expect(result).toMatchObject({ finalized: 0, rescheduled: 1 });
    expect((await kv.get<Session>(KV.sessions, "s1"))!.status).toBe("active");
    expect(await kv.get(KV.config, FINALIZE_DUE_KEY)).toEqual({ s1: activeAt + IDLE_MS });
    expect(stoppedTriggers(sdk)).toHaveLength(0);
  });

  it("drops entries for sessions that are already completed or gone", async () => {
    await kv.set(
      KV.sessions,
      "done",
      session({ id: "done", status: "completed", updatedAt: new Date(nowMs - 10 * MIN).toISOString() }),
    );
    await scheduleSessionFinalize(kv as never, "done", nowMs - 1);
    await scheduleSessionFinalize(kv as never, "missing", nowMs - 1);

    const result = await sdk.trigger({ function_id: "mem::session-finalize", payload: { now: nowMs } });

    expect(result).toMatchObject({ finalized: 0, dropped: 2 });
    expect(await kv.get(KV.config, FINALIZE_DUE_KEY)).toEqual({});
    expect(stoppedTriggers(sdk)).toHaveLength(0);
  });

  it("leaves entries that are not due yet untouched", async () => {
    await kv.set(KV.sessions, "s1", session({ updatedAt: new Date(nowMs - 10 * MIN).toISOString() }));
    await scheduleSessionFinalize(kv as never, "s1", nowMs + MIN);

    const result = await sdk.trigger({ function_id: "mem::session-finalize", payload: { now: nowMs } });

    expect(result).toMatchObject({ due: 1, finalized: 0, rescheduled: 0, dropped: 0 });
    expect((await kv.get<Session>(KV.sessions, "s1"))!.status).toBe("active");
    expect(await kv.get(KV.config, FINALIZE_DUE_KEY)).toEqual({ s1: nowMs + MIN });
  });

  it("finalizes from the stored record alone, so a restart does not lose pending sessions", async () => {
    await kv.set(KV.sessions, "s1", session({ updatedAt: new Date(nowMs - 10 * MIN).toISOString() }));
    await scheduleSessionFinalize(kv as never, "s1", nowMs - 1);

    const restarted = mockSdk();
    registerSessionFinalizeFunction(restarted as never, kv as never);
    const result = await restarted.trigger({ function_id: "mem::session-finalize", payload: { now: nowMs } });

    expect(result).toMatchObject({ finalized: 1 });
    expect(stoppedTriggers(restarted)).toHaveLength(1);
  });
});
