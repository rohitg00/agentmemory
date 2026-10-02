import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type Kv = ReturnType<typeof mockKV>;

function payload(marker: string, sessionId = "ses_capture") {
  return {
    hookType: "post_tool_use",
    sessionId,
    project: "proj",
    cwd: "/work/proj",
    timestamp: new Date().toISOString(),
    data: { tool_name: "Bash", tool_input: { command: `echo ${marker}` }, tool_output: marker },
  };
}

async function boot(kv: Kv, options: { restPort?: number; durableAfterMs?: number } = {}) {
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { DedupMap } = await import("../src/functions/dedup.js");
  const sdk = mockSdk({ looseTrigger: true });
  const dedup = new DedupMap();
  registerObserveFunction(sdk as never, kv as never, dedup);
  const controller = registerCaptureFunctions(sdk as never, kv as never, options);
  const capture = (p: unknown, eventId?: string) =>
    sdk.trigger("mem::capture", { payload: p, eventId }) as Promise<Record<string, unknown>>;
  return { sdk, controller, capture, dedup };
}

function observations(kv: Kv, sessionId = "ses_capture") {
  return [...(kv.store.get(KV.observations(sessionId))?.values() ?? [])] as Array<{ id: string; eventId?: string }>;
}

function inbox(kv: Kv) {
  return [...(kv.store.get(KV.captureInbox)?.values() ?? [])] as Array<Record<string, unknown>>;
}

describe("durable capture", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS", "1000");
    vi.stubEnv("AGENTMEMORY_CAPTURE_MAX_ATTEMPTS", "3");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("stores an event once and answers a second delivery with the same observation", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    const first = await capture(payload("m1"), "evc_000000000001");
    const second = await capture(payload("m1"), "evc_000000000001");
    expect(first).toMatchObject({ status: "accepted", state: "completed" });
    expect(second).toMatchObject({ status: "duplicate", deduplicated: true, observationId: first.observationId });
    expect(observations(kv)).toHaveLength(1);
    expect(inbox(kv)).toHaveLength(0);
  });

  it("collapses concurrent deliveries of the same event", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    const results = await Promise.all(Array.from({ length: 8 }, () => capture(payload("m2"), "evc_000000000002")));
    expect(results.filter((r) => r.status === "accepted")).toHaveLength(1);
    expect(results.filter((r) => r.status === "duplicate")).toHaveLength(7);
    expect(observations(kv)).toHaveLength(1);
  });

  it("keeps distinct events with identical content", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    await capture(payload("same"), "evh_000000000003");
    await capture(payload("same"), "evh_000000000004");
    expect(observations(kv)).toHaveLength(2);
  });

  it("still deduplicates a replay after a restart", async () => {
    const kv = mockKV();
    const before = await boot(kv);
    const first = await before.capture(payload("restart"), "evc_000000000005");
    before.dedup.stop();
    vi.resetModules();
    const after = await boot(kv);
    const replay = await after.capture(payload("restart"), "evc_000000000005");
    expect(replay).toMatchObject({ status: "duplicate", observationId: first.observationId });
    expect(observations(kv)).toHaveLength(1);
  });

  it("reuses the observation id when the event record was lost in a crash", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    const body = payload("lost-event-record");
    const first = await capture(body, "evc_000000000021");
    for (const [scope, entries] of kv.store) {
      if (scope.startsWith("mem:capture:events:")) entries.clear();
    }
    const resent = await capture(body, "evc_000000000021");
    expect(resent).toMatchObject({ status: "accepted", state: "completed", observationId: first.observationId });
    expect(observations(kv)).toHaveLength(1);
    expect(observations(kv)[0]!.id).toBe(first.observationId);
  });

  it("stores the observation again when the event record survived a crash but the observation did not", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    const body = payload("lost-observation");
    const first = await capture(body, "evc_000000000022");
    kv.store.get(KV.observations("ses_capture"))!.clear();
    const resent = await capture(body, "evc_000000000022");
    expect(resent).toMatchObject({ status: "accepted", state: "completed", observationId: first.observationId });
    expect(observations(kv).map((o) => o.id)).toEqual([first.observationId]);
    const again = await capture(body, "evc_000000000022");
    expect(again).toMatchObject({ status: "duplicate", observationId: first.observationId });
    expect(observations(kv)).toHaveLength(1);
  });

  it("restores a lost vector when a re-sent event finds its observation already stored", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    const search = await import("../src/functions/search.js");
    const { VectorIndex } = await import("../src/state/vector-index.js");
    const vectors = new VectorIndex();
    const embed = vi.fn(async () => new Float32Array([1, 0, 0]));
    search.setVectorIndex(vectors);
    search.setEmbeddingProvider({ name: "test", dimensions: 3, embed, embedBatch: async (t: string[]) => t.map(() => new Float32Array([1, 0, 0])) } as never);
    try {
      const body = payload("lost-vector");
      const first = await capture(body, "evc_000000000023");
      const id = first.observationId as string;
      expect(vectors.has(id)).toBe(true);
      vectors.remove(id);
      search.getSearchIndex().remove(id);
      for (const [scope, entries] of kv.store) {
        if (scope.startsWith("mem:capture:events:")) entries.clear();
      }
      const resent = await capture(body, "evc_000000000023");
      expect(resent).toMatchObject({ status: "accepted", observationId: id });
      expect(vectors.has(id)).toBe(true);
      expect(vectors.size).toBe(1);
      expect(search.getSearchIndex().has(id)).toBe(true);
      expect(embed).toHaveBeenCalledTimes(2);
      await capture(body, "evc_000000000023");
      expect(embed).toHaveBeenCalledTimes(2);
      vectors.remove(id);
      const duplicate = await capture(body, "evc_000000000023");
      expect(duplicate).toMatchObject({ status: "duplicate", observationId: id });
      expect(vectors.has(id)).toBe(true);
      expect(embed).toHaveBeenCalledTimes(3);
      expect(observations(kv)).toHaveLength(1);
    } finally {
      search.setVectorIndex(null);
      search.setEmbeddingProvider(null);
    }
  });

  it("scrubs credentials before an event waits in the inbox", async () => {
    const kv = mockKV();
    const { sdk, capture } = await boot(kv);
    sdk.fns.set("mem::observe", async () => {
      throw new Error("state write timed out");
    });
    const body = payload("scrub");
    body.data.tool_output = "cloned https://deploy:hunter2secret@git.example.com/repo.git";
    await capture(body, "evc_000000000024");
    const stored = JSON.stringify(inbox(kv));
    expect(stored).not.toContain("hunter2secret");
    expect(stored).toContain("[REDACTED_SECRET]");
  });

  it("derives the observation id from the event key and its timestamp", async () => {
    const { observationIdFor } = await import("../src/functions/capture.js");
    const key = "cap_0123456789abcdef0123456789abcdef01234567";
    const at = "2026-10-02T06:58:06.512Z";
    expect(observationIdFor(key, at, 1)).toBe(observationIdFor(key, at, 2));
    expect(observationIdFor(key, at, 1)).toBe(`obs_${Date.parse(at).toString(36)}_0123456789ab`);
    expect(observationIdFor(key, "not a time", Date.UTC(2026, 0, 1))).toBe(`obs_${Date.UTC(2026, 0, 1).toString(36)}_0123456789ab`);
  });

  it("scopes event ids by project and session", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    await capture(payload("a", "ses_a"), "evc_000000000006");
    const other = await capture(payload("a", "ses_b"), "evc_000000000006");
    expect(other.status).toBe("accepted");
  });

  it("keeps the 5-minute content dedup for clients that send no event id", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    expect((await capture(payload("legacy"))).status).toBe("accepted");
    expect((await capture(payload("legacy"))).status).toBe("duplicate");
    expect(observations(kv)).toHaveLength(1);
  });

  it("retries a failed write, survives a restart and stores it once", async () => {
    const kv = mockKV();
    const first = await boot(kv);
    const observe = first.sdk.fns.get("mem::observe")!;
    first.sdk.fns.set("mem::observe", async () => {
      throw new Error("state write timed out");
    });
    const accepted = await first.capture(payload("flaky"), "evc_000000000007");
    expect(accepted).toMatchObject({ status: "accepted", state: "retrying", attempts: 1, error: "state write timed out" });
    expect(inbox(kv)).toHaveLength(1);
    expect(observations(kv)).toHaveLength(0);
    first.sdk.fns.set("mem::observe", observe);

    vi.resetModules();
    const second = await boot(kv);
    vi.useFakeTimers({ now: Date.now() + 5_000, toFake: ["Date"] });
    const swept = await second.controller.sweep();
    expect(swept).toMatchObject({ processed: 1, recovered: 1 });
    expect(observations(kv)).toHaveLength(1);
    expect(observations(kv)[0]!.id).toBe(accepted.observationId);
    expect(inbox(kv)).toHaveLength(0);
    const replay = await second.capture(payload("flaky"), "evc_000000000007");
    expect(replay).toMatchObject({ status: "duplicate", observationId: accepted.observationId });
  });

  it("waits for the backoff before retrying", async () => {
    const kv = mockKV();
    const { sdk, capture, controller } = await boot(kv);
    const observe = sdk.fns.get("mem::observe")!;
    sdk.fns.set("mem::observe", async () => {
      throw new Error("boom");
    });
    await capture(payload("backoff"), "evc_000000000008");
    sdk.fns.set("mem::observe", observe);
    expect(await controller.sweep()).toMatchObject({ processed: 0 });
    expect(observations(kv)).toHaveLength(0);
  });

  it("moves an event to dead letters after the last attempt and can retry it on request", async () => {
    const kv = mockKV();
    const { sdk, capture, controller } = await boot(kv);
    const observe = sdk.fns.get("mem::observe")!;
    sdk.fns.set("mem::observe", async () => {
      throw new Error("disk full");
    });
    await capture(payload("dead"), "evc_000000000009");
    for (let i = 1; i <= 3; i++) {
      vi.useFakeTimers({ now: Date.now() + i * 60_000, toFake: ["Date"] });
      await controller.sweep();
    }
    const [rec] = inbox(kv);
    expect(rec).toMatchObject({ status: "dead", attempts: 3, lastError: "disk full" });
    const status = await controller.status();
    expect(status.inbox).toMatchObject({ dead: 1, pending: 0, retrying: 0, lastError: "disk full" });
    expect(status.sinceStart.deadLettered).toBe(1);

    sdk.fns.set("mem::observe", observe);
    expect(await controller.sweep()).toMatchObject({ processed: 0 });
    const retried = await sdk.trigger("mem::capture-retry", { all: true });
    expect(retried).toMatchObject({ matched: 1, recovered: 1 });
    expect(observations(kv)).toHaveLength(1);
    expect(inbox(kv)).toHaveLength(0);
  });

  it("dead-letters a permanent rejection without retrying it", async () => {
    const kv = mockKV();
    const { sdk, capture } = await boot(kv);
    sdk.fns.set("mem::observe", async () => ({ success: false, error: "Session observation limit reached (1)" }));
    const result = await capture(payload("limit"), "evc_000000000010");
    expect(result).toMatchObject({ status: "rejected", retryable: false });
    expect(inbox(kv)[0]).toMatchObject({ status: "dead", attempts: 1 });
  });

  it("finishes an event that crashed before it was processed", async () => {
    const kv = mockKV();
    const { controller } = await boot(kv);
    await kv.set(KV.captureInbox, "cap_00aa", {
      key: "cap_00aa",
      eventId: "evc_000000000011",
      eventSource: "client",
      sessionId: "ses_capture",
      project: "proj",
      hookType: "post_tool_use",
      observationId: "obs_mfabcdef_00aa0000aaaa",
      status: "pending",
      attempts: 0,
      acceptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payload: payload("stranded"),
    });
    expect(await controller.sweep()).toMatchObject({ processed: 1, recovered: 1 });
    expect(observations(kv).map((o) => o.id)).toEqual(["obs_mfabcdef_00aa0000aaaa"]);
    expect(inbox(kv)).toHaveLength(0);
  });

  it("does not write a second observation when the crash came after the write", async () => {
    const kv = mockKV();
    const { capture, controller, sdk } = await boot(kv);
    const done = await capture(payload("after-write"), "evc_000000000012");
    const [eventScope] = [...kv.store.keys()].filter((k) => k.startsWith("mem:capture:events:"));
    const completed = [...kv.store.get(eventScope!)!.values()][0] as Record<string, unknown>;
    kv.store.get(eventScope!)!.clear();
    await kv.set(KV.captureInbox, completed.key as string, {
      ...completed,
      eventSource: "client",
      hookType: "post_tool_use",
      status: "pending",
      attempts: 1,
      updatedAt: new Date().toISOString(),
      payload: payload("after-write"),
    });
    const observeCalls = vi.fn(sdk.fns.get("mem::observe")!);
    sdk.fns.set("mem::observe", observeCalls);
    await controller.sweep();
    expect(observeCalls).toHaveBeenCalledTimes(1);
    expect(await observeCalls.mock.results[0]!.value).toMatchObject({ observationId: done.observationId, existing: true });
    expect(observations(kv)).toHaveLength(1);
    expect(inbox(kv)).toHaveLength(0);
  });

  it("prunes event ids past the retention window and old dead letters", async () => {
    const kv = mockKV();
    vi.stubEnv("AGENTMEMORY_CAPTURE_DEDUP_HOURS", "1");
    const { capture, controller } = await boot(kv);
    await capture(payload("old"), "evc_000000000013");
    vi.useFakeTimers({ now: Date.now() + 2 * 3600_000, toFake: ["Date"] });
    await capture(payload("new"), "evc_000000000014");
    expect(await controller.prune()).toBe(1);
    const replayOld = await capture(payload("old"), "evc_000000000013");
    expect(replayOld.status).toBe("accepted");
  });

  it("rejects new events while the inbox is full so hooks keep them", async () => {
    vi.stubEnv("AGENTMEMORY_CAPTURE_INBOX_MAX", "1");
    const kv = mockKV();
    const { sdk, capture } = await boot(kv);
    sdk.fns.set("mem::observe", async () => {
      throw new Error("down");
    });
    await capture(payload("one"), "evc_000000000015");
    const full = await capture(payload("two"), "evc_000000000016");
    expect(full).toMatchObject({ status: "rejected", retryable: true });
  });

  it("drains the local spool at boot without storing an event twice", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "am-cap-")), "capture-spool");
    vi.stubEnv("AGENTMEMORY_CAPTURE_SPOOL_DIR", dir);
    const { appendSpool } = await import("../src/capture/spool.js");
    const kv = mockKV();
    const { capture, controller } = await boot(kv, { restPort: 4811 });
    await capture(payload("arrived"), "evc_000000000017");
    appendSpool("http://127.0.0.1:4811", "evc_000000000017", payload("arrived"), "timeout", { dir });
    appendSpool("http://127.0.0.1:4811", "evc_000000000018", payload("offline"), "unreachable", { dir });
    const results = await controller.drainLocalSpool();
    expect(results[0]).toMatchObject({ claimed: 2, delivered: 1, duplicates: 1, remaining: 0 });
    expect(observations(kv)).toHaveLength(2);
    const status = await controller.status();
    expect(status.spool[0]).toMatchObject({ records: 0 });
    expect(status.lastBootDrain).toMatchObject({ delivered: 1, duplicates: 1 });
  });
});

describe("observe response codes", () => {
  it("maps capture results to HTTP status codes", async () => {
    const { captureStatusCode, captureResponseBody } = await import("../src/triggers/api.js");
    expect(captureStatusCode({ status: "accepted", state: "completed", eventId: "e", observationId: "o", attempts: 1 })).toBe(201);
    expect(captureStatusCode({ status: "accepted", state: "retrying", eventId: "e", observationId: "o", attempts: 1, nextAttemptAt: "", error: "x" })).toBe(202);
    expect(captureStatusCode({ status: "duplicate", state: "completed", eventId: "e", observationId: "o", deduplicated: true })).toBe(200);
    expect(captureStatusCode({ status: "rejected", eventId: "e", error: "x", retryable: true })).toBe(503);
    expect(captureStatusCode({ status: "rejected", eventId: "e", error: "x", retryable: false })).toBe(422);
    expect(captureResponseBody({ status: "rejected", eventId: "e", error: "x", retryable: false })).toMatchObject({ success: false });
  });
});

describe("capture status problems", () => {
  it("reports dead letters, pending retries, spooled events and recent drops", async () => {
    const { evaluateStatus } = await import("../src/functions/status.js");
    const report = evaluateStatus({
      now: new Date(),
      version: "0",
      engineVersion: "0",
      uptimeSeconds: 1,
      stateBackend: "file",
      ports: { rest: 4811, streams: null, viewer: null },
      health: null,
      circuitBreaker: null,
      functionMetrics: [],
      provider: "noop",
      embeddingProvider: "none",
      flags: [],
      index: {
        bm25Documents: 0,
        vectorDocuments: null,
        observationsIndexed: 0,
        missingObservations: 0,
        sessions: 0,
        bm25Incomplete: false,
        pendingVectorBackfill: 0,
      },
      graph: null,
      graphExtractionEnabled: false,
      auditLegacy: null,
      capture: {
        policy: { maxAttempts: 5, retryIntervalMs: 10_000, dedupRetentionHours: 168, inboxMax: 10_000, deadMax: 1000, eventsMax: 100_000 },
        inbox: { pending: 0, retrying: 2, dead: 1, oldestAcceptedAt: null, nextAttemptAt: null, lastError: "disk full" },
        sinceStart: { accepted: 3, completed: 0, duplicates: 0, retried: 2, recovered: 0, deadLettered: 1, rejected: 0, pruned: 0 },
        lastSweepAt: null,
        lastPruneAt: null,
        lastBootDrain: null,
        spool: [
          {
            enabled: true,
            path: "/x/local-4811.jsonl",
            records: 4,
            bytes: 2000,
            oldestAt: null,
            maxBytes: 5 * 1024 * 1024,
            maxAgeHours: 168,
            stats: { spooled: 4, dropped: 2, droppedBytes: 900, expired: 0, delivered: 0, duplicates: 0, rejected: 0, lastDropAt: new Date().toISOString(), lastDropReason: "full" },
          },
        ],
      },
    });
    const codes = report.problems.map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(["capture-dead-letters", "capture-retrying", "capture-spool-waiting", "capture-spool-dropped"]));
    expect(report.capture?.inbox?.dead).toBe(1);
    expect(report.problems.find((p) => p.code === "capture-dead-letters")!.fix).toContain("http://localhost:4811/agentmemory/capture/retry");
  });
});

describe("acceptance durability across a restart", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function sentRecords(dir: string): Array<{ eventId: string; bootId?: string }> {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.includes(".sent-"))
      .flatMap((f) => readFileSync(join(dir, f), "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  }

  it("tells clients its boot id and save window on every accepted response", async () => {
    const kv = mockKV();
    const { controller } = await boot(kv, { restPort: 4812, durableAfterMs: 3500 });
    const mark = controller.durability();
    expect(mark.bootId).toMatch(/^[0-9a-f]{24}$/);
    expect(mark.durableAfterMs).toBe(3500);
    const { captureResponseBody } = await import("../src/triggers/api.js");
    const body = captureResponseBody({ status: "accepted", state: "completed", eventId: "e", observationId: "o", attempts: 1 }, mark);
    expect(body).toMatchObject({ bootId: mark.bootId, durableAfterMs: 3500 });
    expect(typeof body["acceptedAt"]).toBe("string");
    expect(captureResponseBody({ status: "rejected", eventId: "e", error: "x", retryable: true }, mark)["bootId"]).toBeUndefined();
    const second = await boot(mockKV(), { restPort: 4812, durableAfterMs: 3500 });
    expect(second.controller.durability().bootId).not.toBe(mark.bootId);
  });

  it("uses the engine save interval plus a margin for the file store and a short fixed window for redis", async () => {
    const { captureDurableAfterMs } = await import("../src/cli/engine-config.js");
    expect(captureDurableAfterMs("file", ["save_interval_ms: 2000"])).toBe(3500);
    expect(captureDurableAfterMs("file", [])).toBe(6500);
    expect(captureDurableAfterMs("redis", ["save_interval_ms: 2000"])).toBe(1500);
  });

  it("re-sends observations a client kept from the previous boot and keeps them under the new boot", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "am-cap-")), "capture-spool");
    vi.stubEnv("AGENTMEMORY_CAPTURE_SPOOL_DIR", dir);
    const { retainSent } = await import("../src/capture/spool.js");
    retainSent("http://127.0.0.1:4813", "evc_lostinflush01", payload("lost-in-flush"), { bootId: "cccccccccccccccccccccccc", durableAfterMs: 3500 }, { dir });
    const kv = mockKV();
    const { controller } = await boot(kv, { restPort: 4813, durableAfterMs: 3500 });
    const results = await controller.drainLocalSpool();
    expect(results[0]).toMatchObject({ claimed: 1, delivered: 1, remaining: 0 });
    expect(observations(kv)).toHaveLength(1);
    const kept = sentRecords(dir);
    expect(kept.map((r) => r.eventId)).toEqual(["evc_lostinflush01"]);
    expect(kept[0]!.bootId).toBe(controller.durability().bootId);
    expect((await controller.status()).spool[0]).toMatchObject({ records: 0, retained: 1 });
  });
});
