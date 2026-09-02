import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parsePositiveIntervalMs, TIMER_MAX_INTERVAL_MS } from "../src/config.js";
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

// mem::evict is fully implemented (above) but was reachable only from the
// REST handler - the boot scheduler in src/index.ts registers auto-forget,
// lesson-decay, insight-decay, the recent-searches sweep, and consolidation,
// but never eviction. maxObservationsPerProject was therefore never enforced
// on a running deployment: a dry run against the live store reported
// capEvictions: 55,716 against the 10,000 default. This is a structural
// (source-regex) test rather than a behavioural one, matching the idiom
// already used in test/session-end-triggers-graph.test.ts and
// test/events-consolidation.test.ts - the scheduler lives inside main(),
// which connects to an engine and starts servers, so there is no
// proportionate way to unit-test the registration directly.
describe("eviction scheduling", () => {
  const src = readFileSync("src/index.ts", "utf-8");

  it("registers mem::evict on a setInterval, guarded by EVICTION_ENABLED, matching the auto-forget shape", () => {
    // Requires the actual call shape - the EVICTION_ENABLED guard wrapping
    // a setInterval whose body triggers "mem::evict" with { dryRun: false },
    // timed by evictionIntervalMs, and unref'd - so this fails if the
    // registration is removed, or reduced to a comment / dead code that
    // merely mentions the string "mem::evict" without actually wiring it up.
    expect(src).toMatch(
      /if\s*\(\s*process\.env\.EVICTION_ENABLED\s*!==\s*"false"\s*\)\s*\{\s*const\s+evictionTimer\s*=\s*setInterval\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?await\s+sdk\.trigger\(\{\s*function_id:\s*"mem::evict",\s*payload:\s*\{\s*dryRun:\s*false\s*\}\s*\}\);[\s\S]*?\},\s*evictionIntervalMs\);\s*evictionTimer\.unref\(\);/,
    );
  });

  it("logs scheduled eviction sweep completion and failure instead of swallowing both", () => {
    // Silent-failure guard: the timer body must not be a bare
    // `try { await ... } catch {}` - it needs to report what happened.
    expect(src).toMatch(/logger\.info\(\s*"Scheduled eviction sweep complete"/);
    expect(src).toMatch(/logger\.warn\(\s*"Scheduled eviction sweep failed"/);
  });

  it("guards the scheduled sweep against overlapping with itself", () => {
    expect(src).toMatch(/let\s+evictionInFlight\s*=\s*false;/);
    expect(src).toMatch(/if\s*\(\s*evictionInFlight\s*\)\s*\{/);
  });

  it("derives evictionIntervalMs from EVICTION_INTERVAL_MS, defaulting to 6h, guarded against NaN/non-positive values", () => {
    expect(src).toMatch(
      /const\s+evictionIntervalMs\s*=\s*parsePositiveIntervalMs\(\s*process\.env\.EVICTION_INTERVAL_MS,\s*21600000\);/,
    );
  });
});

describe("parsePositiveIntervalMs", () => {
  it("accepts a plain positive decimal integer", () => {
    expect(parsePositiveIntervalMs("21600000", 1)).toBe(21600000);
    expect(parsePositiveIntervalMs(String(TIMER_MAX_INTERVAL_MS), 1)).toBe(
      TIMER_MAX_INTERVAL_MS,
    );
  });

  it("falls back on unset, non-numeric, zero and negative values", () => {
    expect(parsePositiveIntervalMs(undefined, 7)).toBe(7);
    expect(parsePositiveIntervalMs("abc", 7)).toBe(7);
    expect(parsePositiveIntervalMs("0", 7)).toBe(7);
    expect(parsePositiveIntervalMs("-5", 7)).toBe(7);
  });

  it("rejects values parseInt would silently truncate", () => {
    // parseInt("1e3") and parseInt("1.5") are both 1 - a 1ms destructive
    // loop if either were accepted.
    expect(parsePositiveIntervalMs("1e3", 7)).toBe(7);
    expect(parsePositiveIntervalMs("1.5", 7)).toBe(7);
  });

  it("rejects values above Node's 32-bit timer delay ceiling", () => {
    // setInterval coerces delays above 2^31 - 1 to 1ms, so an oversized
    // configured interval would run the sweep every millisecond.
    expect(parsePositiveIntervalMs("2147483648", 7)).toBe(7);
  });
});
