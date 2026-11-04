import { describe, expect, it, vi } from "vitest";
import type {
  CompressedObservation,
  RawObservation,
  Session,
  Memory,
} from "../src/types.js";
import { registerEvictFunction } from "../src/functions/evict.js";
import { KV } from "../src/state/schema.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { currentAuditScope } from "./helpers/mocks.js";
import {
  indexObservationSession,
  lookupObservationSession,
} from "../src/state/obs-index.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The recovered-session consolidation pass is gated on isConsolidationEnabled
// (keyless installs skip it); force it on so these tests exercise the pass.
vi.mock("../src/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config.js")>()),
  isConsolidationEnabled: () => true,
}));

type Store = Map<string, Map<string, unknown>>;
type Handler = (payload: unknown) => unknown | Promise<unknown>;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeSession(id: string): Session {
  return {
    id,
    project: "agentmemory",
    cwd: "/repo/agentmemory",
    startedAt: daysAgo(31),
    status: "active",
    observationCount: 1,
  };
}

function makeObservation(sessionId: string): CompressedObservation {
  return {
    id: "obs_1",
    sessionId,
    timestamp: daysAgo(31),
    type: "decision",
    title: "Chose sqlite storage",
    facts: ["Use sqlite for local state"],
    narrative: "The session chose sqlite for local state.",
    concepts: ["sqlite"],
    files: ["src/state/kv.ts"],
    importance: 8,
  };
}

function makeRawObservation(sessionId: string): RawObservation {
  return {
    id: "raw_1",
    sessionId,
    timestamp: daysAgo(31),
    hookType: "post_tool_use",
    toolName: "Edit",
    raw: { file_path: "src/state/kv.ts" },
  };
}

function mockKV(store: Store, listFailures: Set<string> = new Set()) {
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      if (listFailures.has(scope)) {
        throw new Error(`list failed for ${scope}`);
      }
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const handlers = new Map<string, Handler>();
  const calls: Array<{ function_id: string; payload: unknown }> = [];
  return {
    calls,
    sdk: {
      registerFunction: (functionId: string, handler: Handler) => {
        handlers.set(functionId, handler);
      },
      trigger: async (input: { function_id: string; payload: unknown }) => {
        calls.push(input);
        const handler = handlers.get(input.function_id);
        if (!handler) throw new Error(`missing handler: ${input.function_id}`);
        return handler(input.payload);
      },
    },
  };
}

function storeForObservations(
  sessionId: string,
  observations: Array<CompressedObservation | RawObservation>,
): Store {
  const session = makeSession(sessionId);
  return new Map([
    [KV.sessions, new Map([[session.id, session]])],
    [KV.summaries, new Map()],
    [
      KV.observations(session.id),
      new Map(observations.map((observation) => [observation.id, observation])),
    ],
    [KV.config, new Map()],
    [KV.audit, new Map()],
  ]);
}

function storeForObservedSession(sessionId: string): Store {
  return storeForObservations(sessionId, [makeObservation(sessionId)]);
}

describe("mem::evict stale sessions", () => {
  it("runs session recovery before deleting a stale observed session", async () => {
    const sessionId = "ses_stale";
    const store = storeForObservedSession(sessionId);
    const kv = mockKV(store);
    const { sdk, calls } = mockSdk();
    await kv.set(KV.summaryRepairs, sessionId, { sessionId, token: "old-repair", dueAt: 0, attempts: 0 });

    registerEvictFunction(sdk as never, kv as never);
    sdk.registerFunction("event::session::stopped", async (payload) => {
      // Recovery must pass skipConsolidation so the per-session fan-out is
      // suppressed (evict runs a single corpus-wide pass afterwards).
      expect(payload).toEqual({ sessionId, skipConsolidation: true });
      expect(await kv.get(KV.sessions, sessionId)).toMatchObject({
        id: sessionId,
      });
      return { success: true };
    });
    sdk.registerFunction("mem::consolidate-pipeline", () => ({
      success: true,
    }));
    sdk.registerFunction("mem::auto-crystallize", () => ({ success: true }));

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { staleSessions: number };

    expect(result.staleSessions).toBe(1);
    expect(await kv.get(KV.sessions, sessionId)).toBeNull();
    expect(await kv.get(KV.summaryRepairs, sessionId)).toBeNull();
    const audits = await kv.list<{
      details: { reason: string };
    }>(currentAuditScope());
    expect(audits[0].details.reason).toBe(
      "stale_session_recovered_then_evicted",
    );
    expect(calls.map((call) => call.function_id)).toContain(
      "event::session::stopped",
    );
    expect(calls.map((call) => call.function_id)).toContain(
      "mem::consolidate-pipeline",
    );
  });

  it("drops the reverse-index entries of an evicted session's observations", async () => {
    const sessionId = "ses_stale_indexed";
    const store = storeForObservedSession(sessionId);
    const kv = mockKV(store);
    const { sdk } = mockSdk();

    registerEvictFunction(sdk as never, kv as never);
    sdk.registerFunction("event::session::stopped", async () => ({
      success: true,
    }));
    sdk.registerFunction("mem::consolidate-pipeline", () => ({
      success: true,
    }));
    sdk.registerFunction("mem::auto-crystallize", () => ({ success: true }));

    const observations = await kv.list<CompressedObservation>(
      KV.observations(sessionId),
    );
    expect(observations.length).toBeGreaterThan(0);
    for (const o of observations) {
      await indexObservationSession(kv as never, o.id, sessionId);
    }

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { staleSessions: number };

    expect(result.staleSessions).toBe(1);
    for (const o of observations) {
      expect(await lookupObservationSession(kv as never, o.id)).toBeNull();
    }
  });

  it("bounds consolidation to one pass regardless of how many stale sessions are recovered", async () => {
    // Regression (P1): before the skipConsolidation guard, N recovered
    // sessions each triggered a forced full-corpus consolidate + crystallize
    // via the session::stopped fan-out, on top of evict's final pass — an
    // N+1 amplification of an expensive LLM path. Recovery must stay O(1).
    const ids = ["ses_a", "ses_b", "ses_c"];
    const store: Store = new Map([
      [
        KV.sessions,
        new Map(ids.map((id) => [id, makeSession(id)])),
      ],
      [KV.summaries, new Map()],
      [KV.config, new Map()],
      [KV.audit, new Map()],
    ]);
    for (const id of ids) {
      store.set(
        KV.observations(id),
        new Map([["obs_1", makeObservation(id)]]),
      );
    }
    const kv = mockKV(store);
    const { sdk, calls } = mockSdk();

    registerEvictFunction(sdk as never, kv as never);
    const stoppedPayloads: unknown[] = [];
    sdk.registerFunction("event::session::stopped", (payload) => {
      stoppedPayloads.push(payload);
      return { success: true };
    });
    sdk.registerFunction("mem::consolidate-pipeline", () => ({ success: true }));
    sdk.registerFunction("mem::auto-crystallize", () => ({ success: true }));

    await sdk.trigger({ function_id: "mem::evict", payload: {} });

    // session::stopped fires once per recovered session, each suppressing its
    // own fan-out...
    expect(stoppedPayloads).toHaveLength(3);
    for (const p of stoppedPayloads) {
      expect(p).toMatchObject({ skipConsolidation: true });
    }
    // ...and the corpus-wide consolidation + crystallization run exactly once.
    const fnIds = calls.map((c) => c.function_id);
    expect(fnIds.filter((f) => f === "mem::consolidate-pipeline")).toHaveLength(1);
    expect(fnIds.filter((f) => f === "mem::auto-crystallize")).toHaveLength(1);
  });

  it("does not delete a session restarted while eviction waits for publication", async () => {
    const sessionId = "ses_restarted";
    const kv = mockKV(storeForObservations(sessionId, []));
    const { sdk } = mockSdk();
    registerEvictFunction(sdk as never, kv as never);
    const list = vi.spyOn(kv, "list");
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const restarted = { ...makeSession(sessionId), startedAt: new Date().toISOString() };
    const repair = { sessionId, token: "new-repair", dueAt: 0, attempts: 0 };
    const publishing = withKeyedLock(`obs:${sessionId}`, async () => {
      entered(); await gate;
      await kv.set(KV.sessions, sessionId, restarted);
      await kv.set(KV.summaryRepairs, sessionId, repair);
    });
    await ready;
    const evicting = sdk.trigger({ function_id: "mem::evict", payload: {} });
    try {
      await vi.waitFor(() => expect(list).toHaveBeenCalledWith(KV.observations(sessionId)));
      expect(await kv.get(KV.sessions, sessionId)).not.toBeNull();
    } finally { release(); await publishing; }
    expect(await evicting).toMatchObject({ staleSessions: 0 });
    expect(await kv.get(KV.sessions, sessionId)).toEqual(restarted);
    expect(await kv.get(KV.summaryRepairs, sessionId)).toEqual(repair);
  });

  it("keeps a stale observed session when recovery fails", async () => {
    const sessionId = "ses_unrecovered";
    const store = storeForObservedSession(sessionId);
    const kv = mockKV(store);
    const { sdk, calls } = mockSdk();

    registerEvictFunction(sdk as never, kv as never);
    sdk.registerFunction("event::session::stopped", () => ({
      success: false,
      error: "no_provider",
    }));

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { staleSessions: number };

    expect(result.staleSessions).toBe(0);
    expect(await kv.get(KV.sessions, sessionId)).toMatchObject({
      id: sessionId,
    });
    expect(calls.map((call) => call.function_id)).toContain(
      "event::session::stopped",
    );
    expect(calls.map((call) => call.function_id)).not.toContain(
      "mem::consolidate-pipeline",
    );
  });

  it("keeps a stale session when observation scanning fails", async () => {
    const sessionId = "ses_scan_failed";
    const store = storeForObservedSession(sessionId);
    const kv = mockKV(store, new Set([KV.observations(sessionId)]));
    const { sdk, calls } = mockSdk();

    registerEvictFunction(sdk as never, kv as never);
    sdk.registerFunction("event::session::stopped", () => ({
      success: true,
    }));

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { staleSessions: number };

    expect(result.staleSessions).toBe(0);
    expect(await kv.get(KV.sessions, sessionId)).toMatchObject({
      id: sessionId,
    });
    expect(calls.map((call) => call.function_id)).not.toContain(
      "event::session::stopped",
    );
  });

  it("keeps a stale session that only has raw observations", async () => {
    const sessionId = "ses_raw_only";
    const store = storeForObservations(sessionId, [
      makeRawObservation(sessionId),
    ]);
    const kv = mockKV(store);
    const { sdk, calls } = mockSdk();

    registerEvictFunction(sdk as never, kv as never);
    sdk.registerFunction("event::session::stopped", () => ({
      success: true,
    }));

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { staleSessions: number };

    expect(result.staleSessions).toBe(0);
    expect(await kv.get(KV.sessions, sessionId)).toMatchObject({
      id: sessionId,
    });
    expect(calls.map((call) => call.function_id)).not.toContain(
      "event::session::stopped",
    );
  });
});

describe("mem::evict memory cleanup", () => {
  function makeEvictMemory(overrides: Partial<Memory>): Memory {
    return {
      id: "mem_1",
      createdAt: daysAgo(31),
      updatedAt: daysAgo(31),
      type: "fact",
      title: "Evicted memory",
      content: "evicted",
      concepts: [],
      files: [],
      sessionIds: ["ses_1"],
      strength: 1,
      version: 1,
      isLatest: true,
      ...overrides,
    };
  }

  function makeEvictFacet(id: string, targetId: string) {
    return {
      id,
      targetId,
      targetType: "memory" as const,
      dimension: "probe",
      value: "value",
      createdAt: daysAgo(1),
    };
  }

  function registerEvictStubs(
    sdk: ReturnType<typeof mockSdk>["sdk"],
    kv: ReturnType<typeof mockKV>,
  ) {
    registerEvictFunction(sdk as never, kv as never);
    sdk.registerFunction("event::session::stopped", () => ({
      success: true,
    }));
    sdk.registerFunction("mem::consolidate-pipeline", () => ({
      success: true,
    }));
    sdk.registerFunction("mem::auto-crystallize", () => ({ success: true }));
  }

  it("removes facets that point at an expired memory", async () => {
    const kv = mockKV(new Map());
    const { sdk } = mockSdk();

    const memory = makeEvictMemory({ id: "mem_expired", forgetAfter: daysAgo(1) });
    const survivor = makeEvictMemory({ id: "mem_survivor" });
    await kv.set(KV.memories, memory.id, memory);
    await kv.set(KV.memories, survivor.id, survivor);
    await kv.set(KV.facets, "fct_1", makeEvictFacet("fct_1", memory.id));
    await kv.set(KV.facets, "fct_2", makeEvictFacet("fct_2", memory.id));
    await kv.set(KV.facets, "fct_3", makeEvictFacet("fct_3", survivor.id));

    registerEvictStubs(sdk, kv);
    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { expiredMemories: number };

    expect(result.expiredMemories).toBe(1);
    const remaining = await kv.list<{ id: string }>(KV.facets);
    expect(remaining.map((f) => f.id)).toEqual(["fct_3"]);
  });

  it("removes facets that point at an old non-latest memory", async () => {
    const kv = mockKV(new Map());
    const { sdk } = mockSdk();

    const memory = makeEvictMemory({
      id: "mem_stale",
      createdAt: daysAgo(120),
      updatedAt: daysAgo(120),
      isLatest: false,
    });
    const survivor = makeEvictMemory({ id: "mem_survivor" });
    await kv.set(KV.memories, memory.id, memory);
    await kv.set(KV.memories, survivor.id, survivor);
    await kv.set(KV.facets, "fct_1", makeEvictFacet("fct_1", memory.id));
    await kv.set(KV.facets, "fct_2", makeEvictFacet("fct_2", survivor.id));

    registerEvictStubs(sdk, kv);
    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { nonLatestMemories: number };

    expect(result.nonLatestMemories).toBe(1);
    const remaining = await kv.list<{ id: string }>(KV.facets);
    expect(remaining.map((f) => f.id)).toEqual(["fct_2"]);
  });

  it("keeps facets in dryRun", async () => {
    const kv = mockKV(new Map());
    const { sdk } = mockSdk();

    const memory = makeEvictMemory({ id: "mem_expired", forgetAfter: daysAgo(1) });
    await kv.set(KV.memories, memory.id, memory);
    await kv.set(KV.facets, "fct_1", makeEvictFacet("fct_1", memory.id));

    registerEvictStubs(sdk, kv);
    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: { dryRun: true },
    })) as { expiredMemories: number };

    expect(result.expiredMemories).toBe(1);
    expect(await kv.list(KV.facets)).toHaveLength(1);
  });
});
