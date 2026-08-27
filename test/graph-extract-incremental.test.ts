import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CompressedObservation } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/config.js", () => ({
  getAgentId: vi.fn(() => undefined),
  isConsolidationEnabled: vi.fn(() => false),
  getConsolidationCooldownMs: vi.fn(() => 300000),
}));

vi.mock("../src/functions/slots.js", () => ({
  isReflectEnabled: vi.fn(() => false),
}));

import { registerEventTriggers } from "../src/triggers/events.js";

// /agentmemory/session/end is posted by Claude Code's per-turn Stop hook, so
// event::session::stopped runs on EVERY agent turn — not once per session.
// It used to hand mem::graph-extract the session's entire observation list
// each time, and persistGraphDelta takes the 3-call MERGE path for every node
// and edge it has already seen, so turn N re-merged turns 1..N-1. Engine
// invocations were quadratic in turn count, and per #843 nothing written via
// kv.set is ever evicted from the iii engine, so that was quadratic permanent
// heap. These tests pin the extract to the observations captured since the
// last successful extract.

const SID = "ses_1";

function obs(id: string, timestamp: string): CompressedObservation {
  return {
    id,
    sessionId: SID,
    timestamp,
    type: "conversation",
    title: id,
    facts: [],
    narrative: id,
    concepts: [],
    files: [],
    importance: 0.5,
  };
}

// A KV that persists writes, so the watermark survives between simulated
// per-turn stops the way the real session record does.
function persistentKV() {
  const store = new Map<string, Map<string, unknown>>();
  const scope = (s: string) => {
    if (!store.has(s)) store.set(s, new Map());
    return store.get(s)!;
  };
  return {
    store,
    scope,
    get: vi.fn(async (s: string, k: string) => scope(s).get(k) ?? null),
    set: vi.fn(async (s: string, k: string, v: unknown) => {
      scope(s).set(k, v);
      return v;
    }),
    delete: vi.fn(async (s: string, k: string) => {
      scope(s).delete(k);
    }),
    update: vi.fn(
      async (
        s: string,
        k: string,
        ops: Array<{ type: string; path: string; value?: unknown }>,
      ) => {
        const cur = (scope(s).get(k) ?? {}) as Record<string, unknown>;
        for (const op of ops) if (op.type === "set") cur[op.path] = op.value;
        scope(s).set(k, cur);
        return cur;
      },
    ),
    list: vi.fn(async (s: string) => [...scope(s).values()]),
  };
}

type StoppedHandler = (data: {
  sessionId: string;
  skipConsolidation?: boolean;
}) => Promise<unknown>;

function mockSdk(opts?: { rejectGraphExtract?: () => boolean }) {
  const handlers = new Map<string, StoppedHandler>();
  const trigger = vi.fn(
    async (input: { function_id: string; payload?: unknown }) => {
      if (
        input.function_id === "mem::graph-extract" &&
        opts?.rejectGraphExtract?.()
      ) {
        throw new Error("dispatch refused");
      }
      if (input.function_id === "mem::summarize") {
        return { summary: "s", sessionId: SID };
      }
      return { ok: true };
    },
  );
  return {
    sdk: {
      registerFunction: (id: string, h: StoppedHandler) => handlers.set(id, h),
      registerTrigger: () => {},
      trigger,
    },
    handlers,
    trigger,
  };
}

// Every batch handed to mem::graph-extract, as arrays of observation ids.
function batches(trigger: ReturnType<typeof vi.fn>): string[][] {
  return trigger.mock.calls
    .filter((c) => (c[0] as { function_id: string }).function_id === "mem::graph-extract")
    .map((c) =>
      (
        (c[0] as { payload: { observations: CompressedObservation[] } }).payload
          .observations ?? []
      ).map((o) => o.id),
    );
}

function harness(opts?: { rejectGraphExtract?: () => boolean }) {
  const kv = persistentKV();
  const { sdk, handlers, trigger } = mockSdk(opts);
  registerEventTriggers(sdk as never, kv as never);
  const stopped = handlers.get("event::session::stopped")!;
  kv.scope("mem:sessions").set(SID, {
    id: SID,
    project: "p",
    cwd: "/p",
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    observationCount: 0,
  });
  const land = (...os: CompressedObservation[]) => {
    for (const o of os) kv.scope(`mem:obs:${SID}`).set(o.id, o);
  };
  const drop = (id: string) => kv.scope(`mem:obs:${SID}`).delete(id);
  const stop = () => stopped({ sessionId: SID });
  const session = () =>
    kv.scope("mem:sessions").get(SID) as Record<string, unknown>;
  return { kv, trigger, stop, land, drop, session };
}

describe("event::session::stopped graph-extract is incremental", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands each turn only the observations captured since the last extract", async () => {
    const h = harness();

    h.land(obs("a", "2026-01-01T00:00:01.000Z"), obs("b", "2026-01-01T00:00:02.000Z"));
    await h.stop();
    h.land(obs("c", "2026-01-01T00:00:03.000Z"));
    await h.stop();
    h.land(obs("d", "2026-01-01T00:00:04.000Z"));
    await h.stop();

    expect(batches(h.trigger)).toEqual([["a", "b"], ["c"], ["d"]]);
  });

  it("keeps total dispatched observations linear in turn count, not quadratic", async () => {
    // Pre-fix, 8 turns of one observation each dispatched 1+2+…+8 = 36
    // observations (and 36 merge passes downstream). Incremental sends 8.
    const h = harness();
    for (let i = 1; i <= 8; i++) {
      h.land(obs(`o${i}`, `2026-01-01T00:00:0${i}.000Z`));
      await h.stop();
    }
    const dispatched = batches(h.trigger).reduce((n, b) => n + b.length, 0);
    expect(dispatched).toBe(8);
  });

  it("does not dispatch graph-extract at all when no new observations landed", async () => {
    const h = harness();
    h.land(obs("a", "2026-01-01T00:00:01.000Z"));
    await h.stop();
    await h.stop();
    await h.stop();

    expect(batches(h.trigger)).toEqual([["a"]]);
  });

  it("records the watermark as a matched (timestamp, digest) pair on the session", async () => {
    const h = harness();
    h.land(obs("a", "2026-01-01T00:00:01.000Z"), obs("b", "2026-01-01T00:00:02.000Z"));
    await h.stop();

    expect(h.session()).toMatchObject({
      graphExtractedAt: "2026-01-01T00:00:02.000Z",
      graphExtractedDigest: expect.any(String),
    });
  });
});

// The fallback branch. Most of these assert the PRE-FIX behaviour (extract
// everything) on purpose, so they pass against unmodified source by
// construction — their job is to kill mutations that would make the watermark
// silently skip an observation.
describe("graph-extract watermark never skips an observation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts the whole session on the first stop, when no watermark exists", async () => {
    const h = harness();
    h.land(
      obs("a", "2026-01-01T00:00:01.000Z"),
      obs("b", "2026-01-01T00:00:02.000Z"),
      obs("c", "2026-01-01T00:00:03.000Z"),
    );
    await h.stop();
    expect(batches(h.trigger)).toEqual([["a", "b", "c"]]);
  });

  it("re-extracts everything when an observation lands out of order below the watermark", async () => {
    // mem::compress is fire-and-forget, so a slow compression writes an older
    // timestamp after a newer one was already extracted. Without the count
    // tripwire that observation would never reach the graph.
    const h = harness();
    h.land(obs("a", "2026-01-01T00:00:01.000Z"), obs("c", "2026-01-01T00:00:03.000Z"));
    await h.stop();

    h.land(obs("b", "2026-01-01T00:00:02.000Z"), obs("d", "2026-01-01T00:00:04.000Z"));
    await h.stop();

    expect(batches(h.trigger)[1]).toEqual(["a", "c", "b", "d"]);
  });

  it("re-extracts everything when two observations share the watermark timestamp", async () => {
    const h = harness();
    h.land(obs("a", "2026-01-01T00:00:01.000Z"));
    await h.stop();
    h.land(obs("b", "2026-01-01T00:00:01.000Z"));
    await h.stop();

    expect(batches(h.trigger)[1]).toEqual(["a", "b"]);
  });

  it("falls back to the whole session when the watermark is half-written", async () => {
    const h = harness();
    h.kv.scope("mem:sessions").set(SID, {
      id: SID,
      project: "p",
      cwd: "/p",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "active",
      observationCount: 0,
      graphExtractedAt: "2026-01-01T00:00:01.000Z",
      // graphExtractedDigest deliberately missing
    });
    h.land(obs("a", "2026-01-01T00:00:01.000Z"), obs("b", "2026-01-01T00:00:02.000Z"));
    await h.stop();

    expect(batches(h.trigger)).toEqual([["a", "b"]]);
  });

  it("falls back to the whole session when the stored pair is inconsistent", async () => {
    // Interleaved stops only ever write (at, digest) as a matched snapshot
    // from one run, but a torn or stale pair must still degrade to a full
    // extract rather than skip anything.
    const h = harness();
    h.kv.scope("mem:sessions").set(SID, {
      id: SID,
      project: "p",
      cwd: "/p",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "active",
      observationCount: 0,
      graphExtractedAt: "2026-01-01T00:00:03.000Z",
      graphExtractedDigest: 123456,
    });
    h.land(
      obs("a", "2026-01-01T00:00:01.000Z"),
      obs("b", "2026-01-01T00:00:04.000Z"),
    );
    await h.stop();

    expect(batches(h.trigger)).toEqual([["a", "b"]]);
  });

  it("re-extracts everything when a deletion and a late arrival share a millisecond", async () => {
    // evict's per-project cap (evict.ts) is age- and status-independent, so it
    // can delete an observation from the session that is still being appended
    // to. When a late compression lands in the same window AND carries the
    // same timestamp, size and any timestamp-derived checksum both net to
    // zero — only the observation ids tell the two sets apart.
    const h = harness();
    h.land(
      obs("a", "2026-01-01T00:00:01.000Z"),
      obs("c", "2026-01-01T00:00:03.000Z"),
      obs("e", "2026-01-01T00:00:05.000Z"),
    );
    await h.stop();

    h.drop("c"); // evicted
    h.land(obs("b", "2026-01-01T00:00:03.000Z")); // compressed late, same ms

    await h.stop();

    expect(batches(h.trigger)[1]).toEqual(["a", "e", "b"]);
  });

  it("leaves the watermark unset when the extract dispatch fails, so the next stop retries", async () => {
    let refuse = true;
    const h = harness({ rejectGraphExtract: () => refuse });

    h.land(obs("a", "2026-01-01T00:00:01.000Z"), obs("b", "2026-01-01T00:00:02.000Z"));
    await h.stop();
    expect(h.session().graphExtractedAt).toBeUndefined();

    refuse = false;
    await h.stop();

    expect(batches(h.trigger)[1]).toEqual(["a", "b"]);
    expect(h.session()).toMatchObject({
      graphExtractedDigest: expect.any(String),
    });
  });
});
