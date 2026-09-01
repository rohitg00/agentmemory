import { describe, expect, it, vi } from "vitest";
import type {
  CompressedObservation,
  RawObservation,
  Session,
} from "../src/types.js";
import { registerEvictFunction } from "../src/functions/evict.js";
import { KV } from "../src/state/schema.js";

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

    registerEvictFunction(sdk as never, kv as never);
    sdk.registerFunction("event::session::stopped", async (payload) => {
      // skipConsolidation suppresses the per-session fan-out (evict runs a
      // single corpus-wide pass afterwards). awaitGraphExtract makes the
      // handler wait for extraction, so it cannot write its mark after the
      // delete below orphans it.
      expect(payload).toEqual({
        sessionId,
        skipConsolidation: true,
        awaitGraphExtract: true,
      });
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
    const audits = await kv.list<{
      details: { reason: string };
    }>(KV.audit);
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

  // #1063/#978: KV.graphExtractMarks is introduced by mem::graph-extract's
  // change-detection gate and must be reclaimed when a stale session is
  // fully evicted - otherwise the per-session mark outlives the session
  // it belongs to.
  it("clears the graph-extract change-detection marks when a stale session is evicted (#1063, #978)", async () => {
    const sessionId = "ses_stale_graph";
    const store = storeForObservedSession(sessionId);
    store.set(
      KV.graphExtractMarks(sessionId),
      new Map([
        [
          "current",
          { fingerprint: "gfx_aaaaaaaaaaaaaaaa", llm: true, at: Date.now() },
        ],
      ]),
    );
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

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { staleSessions: number };

    expect(result.staleSessions).toBe(1);
    const remaining = await kv.list(KV.graphExtractMarks(sessionId));
    expect(remaining).toHaveLength(0);
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

// #1063/#978: removing an observation changes the session's observation
// set, so the fingerprint recorded against its old membership is stale.
// mem::evict runs repeatedly against active sessions - whole-session
// delete never fires for those - so nothing else would ever reclaim the
// mark. These tests prove both per-observation eviction paths flush the
// touched session's marks once per pass, and that a dryRun pass flushes
// nothing.
describe("mem::evict per-observation eviction graph-extract marks reclamation (#1063, #978)", () => {
  function graphMarkEntry(fingerprint: string) {
    return { fingerprint, llm: true, at: Date.now() };
  }

  // Young startedAt keeps this session out of the stale-session branch
  // above (age <= staleSessionDays), so only the low-importance path is
  // exercised.
  function storeForLowImportanceEviction(sessionId: string): Store {
    const staleObs: CompressedObservation = {
      ...makeObservation(sessionId),
      id: "obs_low_importance",
      timestamp: daysAgo(200),
      importance: 1,
    };
    const store = storeForObservations(sessionId, [staleObs]);
    store.get(KV.sessions)!.set(sessionId, {
      ...makeSession(sessionId),
      startedAt: daysAgo(1),
    });
    store.set(
      KV.graphExtractMarks(sessionId),
      new Map([["current", graphMarkEntry("gfx_a")]]),
    );
    return store;
  }

  it("flushes the touched session's graph-extract marks after a low-importance eviction pass", async () => {
    const sessionId = "ses_low_importance_graph";
    const store = storeForLowImportanceEviction(sessionId);
    const kv = mockKV(store);
    const { sdk } = mockSdk();
    registerEvictFunction(sdk as never, kv as never);

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { lowImportanceObs: number };

    expect(result.lowImportanceObs).toBe(1);
    const remaining = await kv.list(KV.graphExtractMarks(sessionId));
    expect(remaining).toHaveLength(0);
  });

  it("does not flush the graph-extract marks on a dry run", async () => {
    const sessionId = "ses_low_importance_graph_dry";
    const store = storeForLowImportanceEviction(sessionId);
    const kv = mockKV(store);
    const { sdk } = mockSdk();
    registerEvictFunction(sdk as never, kv as never);

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: { dryRun: true },
    })) as { lowImportanceObs: number };

    // Still counted for reporting, but nothing actually deleted or flushed.
    expect(result.lowImportanceObs).toBe(1);
    expect(
      await kv.get(KV.observations(sessionId), "obs_low_importance"),
    ).not.toBeNull();
    const remaining = await kv.list(KV.graphExtractMarks(sessionId));
    expect(remaining).toHaveLength(1);
  });

  it("flushes the touched session's graph-extract marks after a project-cap eviction pass", async () => {
    const sessionId = "ses_cap_graph";
    const obsA: CompressedObservation = {
      ...makeObservation(sessionId),
      id: "obs_a",
      importance: 1,
    };
    const obsB: CompressedObservation = {
      ...makeObservation(sessionId),
      id: "obs_b",
      importance: 9,
    };
    const store = storeForObservations(sessionId, [obsA, obsB]);
    store.get(KV.sessions)!.set(sessionId, {
      ...makeSession(sessionId),
      startedAt: daysAgo(1),
    });
    store.set(KV.config, new Map([["eviction", { maxObservationsPerProject: 1 }]]));
    store.set(
      KV.graphExtractMarks(sessionId),
      new Map([["current", graphMarkEntry("gfx_b")]]),
    );
    const kv = mockKV(store);
    const { sdk } = mockSdk();
    registerEvictFunction(sdk as never, kv as never);

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { capEvictions: number };

    expect(result.capEvictions).toBe(1);
    // The lower-importance observation (obsA) is the one capped away.
    expect(await kv.get(KV.observations(sessionId), "obs_a")).toBeNull();
    expect(await kv.get(KV.observations(sessionId), "obs_b")).not.toBeNull();
    const remaining = await kv.list(KV.graphExtractMarks(sessionId));
    expect(remaining).toHaveLength(0);
  });
});
