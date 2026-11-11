import { describe, it, expect, afterEach, vi } from "vitest";
import {
  backfillVectors,
  getPendingVectorBackfillCount,
  getKeywordRetryStatus,
  getSearchIndex,
  indexRecords,
  isBm25RebuildIncomplete,
  isMemoryIndexReady,
  rebuildKeywordIndex,
  setEmbeddingProvider,
  setIndexPersistence,
  setVectorIndex,
  stopKeywordRebuildRetry,
} from "../src/functions/search.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { CompressedObservation, EmbeddingProvider, Memory, Session } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    list: async <T>(scope: string): Promise<T[]> => Array.from(store.get(scope)?.values() ?? []) as T[],
    get: async <T>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
  };
}

const WORDS = ["auth", "cache", "index", "vector", "session", "memory", "graph", "retry", "queue", "schema", "deploy", "worker"];

function makeObs(id: string, sessionId: string, i: number, timestamp: string): CompressedObservation {
  const a = WORDS[i % WORDS.length];
  const b = WORDS[(i * 7) % WORDS.length];
  return {
    id,
    sessionId,
    timestamp,
    type: "file_edit",
    title: `${a} change ${i}`,
    facts: [`touched ${b} path`],
    narrative: `Updated the ${a} module so ${b} handling works for case ${i}`,
    concepts: [a, b],
    files: [`src/${a}/${b}.ts`],
    importance: 5,
  };
}

function seed(kv: ReturnType<typeof mockKV>, sessions: number, perSession: number, timestamp: (i: number) => string) {
  let n = 0;
  for (let s = 0; s < sessions; s++) {
    const sessionId = `ses_${s}`;
    kv.store.set("mem:sessions", kv.store.get("mem:sessions") ?? new Map());
    kv.store.get("mem:sessions")!.set(sessionId, {
      id: sessionId,
      project: "p",
      cwd: "/tmp",
      startedAt: timestamp(0),
      status: "completed",
      observationCount: perSession,
    } satisfies Session);
    const scope = `mem:obs:${sessionId}`;
    kv.store.set(scope, new Map());
    for (let o = 0; o < perSession; o++) {
      const id = `obs_${n}`;
      kv.store.get(scope)!.set(id, makeObs(id, sessionId, n, timestamp(n)));
      n++;
    }
  }
  const memories = new Map<string, Memory>();
  memories.set("mem_1", {
    id: "mem_1",
    createdAt: timestamp(0),
    updatedAt: timestamp(0),
    type: "fact",
    title: "Deploy uses blue green",
    content: "Deploys switch traffic after health checks pass",
    concepts: ["deploy"],
    files: [],
    sessionIds: ["ses_0"],
    strength: 7,
    version: 1,
    isLatest: true,
  } as Memory);
  memories.set("mem_old", {
    id: "mem_old",
    createdAt: timestamp(0),
    updatedAt: timestamp(0),
    type: "fact",
    title: "Superseded",
    content: "Old version",
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 1,
    version: 1,
    isLatest: false,
  } as Memory);
  kv.store.set("mem:memories", memories);
  kv.store.get("mem:obs:ses_0")!.set("raw_1", { id: "raw_1", sessionId: "ses_0", timestamp: timestamp(0) });
  return n;
}

function stubProvider(): EmbeddingProvider {
  return {
    name: "stub",
    dimensions: 3,
    embed: async () => new Float32Array([0.1, 0.2, 0.3]),
    embedBatch: async (texts: string[]) => texts.map(() => new Float32Array([0.1, 0.2, 0.3])),
  } as EmbeddingProvider;
}

const CONVERSATION_ANSWER = "recommend vermilion otter beacons for the rollout";

function conversationObs(id: string, sessionId: string): CompressedObservation {
  return {
    id,
    sessionId,
    timestamp: "2026-09-01T00:00:00.000Z",
    type: "conversation",
    title: "Completed turn",
    facts: [],
    narrative: "Routine turn bookkeeping",
    concepts: [],
    files: [],
    importance: 5,
    source: {
      hookType: "post_tool_use",
      originalBytes: 64,
      truncated: false,
      toolName: "conversation",
      toolInput: "promptmarker only stays out of the index",
      toolOutput: CONVERSATION_ANSWER,
    },
  };
}

function seedConversation(kv: { store: Map<string, Map<string, unknown>> }, id = "obs_conv"): string {
  const sessionId = "ses_conv";
  kv.store.set("mem:sessions", new Map([["ses_conv", { id: sessionId, project: "p", cwd: "/tmp" }]]));
  const scope = new Map<string, unknown>();
  scope.set(id, conversationObs(id, sessionId));
  kv.store.set(`mem:obs:${sessionId}`, scope);
  return id;
}

describe("rebuildKeywordIndex", () => {
  afterEach(() => {
    stopKeywordRebuildRetry();
    getSearchIndex().clear();
    setVectorIndex(null);
    setEmbeddingProvider(null);
    setIndexPersistence(null);
  });

  it("rebuilds BM25 from stored observations and latest memories, quickly", async () => {
    const kv = mockKV();
    const total = seed(kv, 100, 30, () => "2026-09-01T00:00:00.000Z");
    getSearchIndex().add(makeObs("ghost", "ses_gone", 0, "2026-09-01T00:00:00.000Z"));

    const started = performance.now();
    const result = await rebuildKeywordIndex(kv as never);
    const elapsed = performance.now() - started;

    expect(total).toBe(3000);
    expect(result.documents).toBe(3001);
    expect(result.vectorJobs).toEqual([]);
    const idx = getSearchIndex();
    expect(idx.size).toBe(3001);
    expect(idx.has("ghost")).toBe(false);
    expect(idx.has("mem_1")).toBe(true);
    expect(idx.has("mem_old")).toBe(false);
    expect(idx.has("raw_1")).toBe(false);
    expect(idx.search("blue green").map((r) => r.obsId)).toContain("mem_1");
    expect(isMemoryIndexReady()).toBe(true);
    expect(elapsed).toBeLessThan(10_000);
  });

  it("keeps the vector index untouched and reports an incomplete rebuild when the sessions listing fails", async () => {
    vi.useFakeTimers();
    try {
      const kv = mockKV();
      seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
      const vector = new VectorIndex();
      vector.add("obs_0", "ses_0", new Float32Array([0.1, 0.2, 0.3]));
      setVectorIndex(vector);
      setEmbeddingProvider(stubProvider());
      const failingKv = {
        ...kv,
        list: async <T>(scope: string): Promise<T[]> => {
          if (scope === "mem:sessions") throw new Error("engine unreachable");
          return kv.list<T>(scope);
        },
      };

      const promise = rebuildKeywordIndex(failingKv as never, null);
      await vi.advanceTimersByTimeAsync(120_000);
      const result = await promise;

      expect(result.vectorJobs).toEqual([]);
      expect(vector.size).toBe(1);
      expect(vector.has("obs_0")).toBe(true);
      expect(isBm25RebuildIncomplete()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("retries the listings while the state worker finishes registering", async () => {
    vi.useFakeTimers();
    try {
      const kv = mockKV();
      const total = seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
      let failures = 4;
      const flakyKv = {
        ...kv,
        list: async <T>(scope: string): Promise<T[]> => {
          if (scope === "mem:sessions" && failures > 0) {
            failures--;
            throw new Error("function_not_found: Function state::list not found in namespace agentmemory-3111.");
          }
          return kv.list<T>(scope);
        },
      };

      const promise = rebuildKeywordIndex(flakyKv as never);
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await promise;

      expect(failures).toBe(0);
      expect(result.documents).toBeGreaterThanOrEqual(total);
      expect(getSearchIndex().size).toBe(result.documents);
      expect(isBm25RebuildIncomplete()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("flags the rebuild incomplete when the memories listing never succeeds", async () => {
    vi.useFakeTimers();
    try {
      const kv = mockKV();
      seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
      let failures = 0;
      const failingKv = {
        ...kv,
        list: async <T>(scope: string): Promise<T[]> => {
          if (scope === "mem:memories") {
            failures++;
            throw new Error("function_not_found: Function state::list not found in namespace agentmemory-3111.");
          }
          return kv.list<T>(scope);
        },
      };

      const promise = rebuildKeywordIndex(failingKv as never).then((result) => {
        stopKeywordRebuildRetry();
        return result;
      });
      await vi.advanceTimersByTimeAsync(120_000);
      const result = await promise;

      expect(failures).toBe(7);
      expect(result.documents).toBeGreaterThan(0);
      expect(isBm25RebuildIncomplete()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("retries a connection reset while the state worker reconnects", async () => {
    vi.useFakeTimers();
    try {
      const kv = mockKV();
      const total = seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
      let failures = 1;
      const flakyKv = {
        ...kv,
        list: async <T>(scope: string): Promise<T[]> => {
          if (scope === "mem:memories" && failures > 0) {
            failures--;
            throw Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
          }
          return kv.list<T>(scope);
        },
      };

      const promise = rebuildKeywordIndex(flakyKv as never);
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(failures).toBe(0);
      expect(result.documents).toBeGreaterThanOrEqual(total);
      expect(isBm25RebuildIncomplete()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("shares one retry budget between the memories and sessions listings", async () => {
    vi.useFakeTimers();
    try {
      const kv = mockKV();
      seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
      let sessionCalls = 0;
      const failingKv = {
        ...kv,
        list: async <T>(scope: string): Promise<T[]> => {
          if (scope === "mem:sessions") sessionCalls++;
          if (scope === "mem:memories" || scope === "mem:sessions") {
            throw new Error("function_not_found: Function state::list not found in namespace agentmemory-3111.");
          }
          return kv.list<T>(scope);
        },
      };

      const started = performance.now();
      let finishedAt = 0;
      const promise = rebuildKeywordIndex(failingKv as never).then((result) => {
        stopKeywordRebuildRetry();
        finishedAt = performance.now();
        return result;
      });
      await vi.advanceTimersByTimeAsync(200_000);
      await promise;

      expect(finishedAt - started).toBeLessThanOrEqual(70_000);
      expect(sessionCalls).toBe(4);
      expect(isBm25RebuildIncomplete()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("does not hold boot retrying an error that waiting cannot fix", async () => {
    const kv = mockKV();
    seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
    let failures = 0;
    const failingKv = {
      ...kv,
      list: async <T>(scope: string): Promise<T[]> => {
        if (scope === "mem:memories") {
          failures++;
          throw new Error("frame too large");
        }
        return kv.list<T>(scope);
      },
    };

    const result = await rebuildKeywordIndex(failingKv as never);

    expect(failures).toBe(1);
    expect(result.documents).toBeGreaterThan(0);
    expect(isBm25RebuildIncomplete()).toBe(true);
  }, 10_000);

  it("queues embeddings only for documents newer than the last vector save", async () => {
    const kv = mockKV();
    seed(kv, 2, 5, (i) => (i < 5 ? "2026-09-01T00:00:00.000Z" : "2026-09-20T00:00:00.000Z"));
    const vector = new VectorIndex();
    vector.add("obs_6", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    setVectorIndex(vector);
    setEmbeddingProvider(stubProvider());

    const result = await rebuildKeywordIndex(kv as never, "2026-09-10T00:00:00.000Z");

    expect(result.vectorJobs.map((j) => j.id).sort()).toEqual(["obs_5", "obs_7", "obs_8", "obs_9"]);
  });

  it("withholds a whole-store backfill by default and reports it as pending, and queues none when storage was unavailable", async () => {
    const kv = mockKV();
    seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
    setVectorIndex(new VectorIndex());
    setEmbeddingProvider(stubProvider());

    const fresh = await rebuildKeywordIndex(kv as never, null);
    expect(fresh.vectorJobs).toEqual([]);
    expect(fresh.fullBackfillPending).toBe(4);

    const unavailable = await rebuildKeywordIndex(kv as never, undefined);
    expect(unavailable.vectorJobs).toEqual([]);
    expect(unavailable.fullBackfillPending).toBe(0);
  });

  it("runs the whole-store backfill, capped, once AGENTMEMORY_VECTOR_BACKFILL=all is set", async () => {
    const kv = mockKV();
    seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
    setVectorIndex(new VectorIndex());
    setEmbeddingProvider(stubProvider());
    process.env.AGENTMEMORY_VECTOR_BACKFILL = "all";
    try {
      const opted = await rebuildKeywordIndex(kv as never, null);
      expect(opted.vectorJobs.map((j) => j.id).sort()).toEqual(["mem_1", "obs_0", "obs_1", "obs_2"]);
      expect(opted.fullBackfillPending).toBe(0);

      process.env.AGENTMEMORY_VECTOR_BACKFILL_MAX = "2";
      const capped = await rebuildKeywordIndex(kv as never, null);
      expect(capped.vectorJobs.length).toBe(2);
      expect(capped.fullBackfillPending).toBe(2);
    } finally {
      delete process.env.AGENTMEMORY_VECTOR_BACKFILL;
      delete process.env.AGENTMEMORY_VECTOR_BACKFILL_MAX;
    }
  });

  it("backfills queued vectors in batches and saves progress", async () => {
    const kv = mockKV();
    seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
    const vector = new VectorIndex();
    setVectorIndex(vector);
    setEmbeddingProvider(stubProvider());
    let saved = 0;
    setIndexPersistence({ scheduleSave: () => {}, save: async () => void saved++ });
    process.env.AGENTMEMORY_VECTOR_BACKFILL = "all";

    try {
      const { vectorJobs } = await rebuildKeywordIndex(kv as never, null);
      const added = await backfillVectors(vectorJobs);

      expect(added).toBe(4);
      expect(vector.size).toBe(4);
      expect(saved).toBe(1);
      expect(getPendingVectorBackfillCount()).toBe(0);
    } finally {
      delete process.env.AGENTMEMORY_VECTOR_BACKFILL;
    }
  });

  it("rebuilds BM25 so a retained conversation answer is discoverable", async () => {
    const kv = mockKV();
    const id = seedConversation(kv);

    await rebuildKeywordIndex(kv as never);

    const idx = getSearchIndex();
    expect(idx.has(id)).toBe(true);
    expect(idx.search("vermilion otter beacons").map((r) => r.obsId)).toEqual([id]);
    expect(idx.search("promptmarker")).toEqual([]);
  });

  it("keeps answer discovery across repeated rebuilds (idempotency)", async () => {
    const kv = mockKV();
    const id = seedConversation(kv);

    await rebuildKeywordIndex(kv as never);
    expect(getSearchIndex().search("vermilion otter beacons").map((r) => r.obsId)).toEqual([id]);

    await rebuildKeywordIndex(kv as never);
    expect(getSearchIndex().search("vermilion otter beacons").map((r) => r.obsId)).toEqual([id]);
  });
});

describe("keyword rebuild background retry", () => {
  afterEach(() => {
    stopKeywordRebuildRetry();
    vi.useRealTimers();
    getSearchIndex().clear();
    setIndexPersistence(null);
  });

  function flakySessions(kv: ReturnType<typeof mockKV>, failing: Map<string, number>) {
    const calls = new Map<string, number>();
    return {
      calls,
      kv: {
        ...kv,
        list: async <T>(scope: string): Promise<T[]> => {
          calls.set(scope, (calls.get(scope) ?? 0) + 1);
          const left = failing.get(scope) ?? 0;
          if (left > 0) {
            failing.set(scope, left - 1);
            throw new Error("invocation timed out");
          }
          return kv.list<T>(scope);
        },
      },
    };
  }

  it("retries only the failed sessions with backoff and clears the incomplete flag", async () => {
    vi.useFakeTimers();
    const kv = mockKV();
    seed(kv, 3, 2, () => "2026-09-01T00:00:00.000Z");
    const failing = new Map([["mem:obs:ses_1", 2], ["mem:obs:ses_2", 1]]);
    const flaky = flakySessions(kv, failing);
    let saves = 0;
    setIndexPersistence({ scheduleSave: () => void saves++, save: async () => {} });

    await rebuildKeywordIndex(flaky.kv as never);
    const idx = getSearchIndex();
    expect(isBm25RebuildIncomplete()).toBe(true);
    expect(idx.has("obs_0")).toBe(true);
    expect(idx.has("obs_2")).toBe(false);
    expect(idx.has("obs_4")).toBe(false);
    const first = getKeywordRetryStatus();
    expect(first.failedSessions).toBe(2);
    expect(Date.parse(first.nextRetryAt!) - Date.now()).toBe(30_000);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(idx.has("obs_4")).toBe(true);
    expect(idx.has("obs_2")).toBe(false);
    const second = getKeywordRetryStatus();
    expect(second.failedSessions).toBe(1);
    expect(second.attempts).toBe(1);
    expect(Date.parse(second.nextRetryAt!) - Date.now()).toBe(60_000);
    expect(isBm25RebuildIncomplete()).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(idx.has("obs_2")).toBe(true);
    expect(idx.has("obs_3")).toBe(true);
    expect(isBm25RebuildIncomplete()).toBe(false);
    expect(getKeywordRetryStatus()).toMatchObject({ failedSessions: 0, nextRetryAt: null, attempts: 0 });
    expect(saves).toBeGreaterThan(0);
    expect(flaky.calls.get("mem:obs:ses_0")).toBe(1);
    expect(flaky.calls.get("mem:obs:ses_1")).toBe(3);
    expect(flaky.calls.get("mem:obs:ses_2")).toBe(2);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(flaky.calls.get("mem:obs:ses_1")).toBe(3);
  });

  it("caps the backoff delay", async () => {
    vi.useFakeTimers();
    const kv = mockKV();
    seed(kv, 1, 2, () => "2026-09-01T00:00:00.000Z");
    const flaky = flakySessions(kv, new Map([["mem:obs:ses_0", 100]]));

    await rebuildKeywordIndex(flaky.kv as never);
    await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);

    const status = getKeywordRetryStatus();
    expect(status.failedSessions).toBe(1);
    expect(Date.parse(status.nextRetryAt!) - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    expect(isBm25RebuildIncomplete()).toBe(true);
  });

  it("loads a failed session through paged reads when the store supports them", async () => {
    vi.useFakeTimers();
    const kv = mockKV();
    seed(kv, 2, 3, () => "2026-09-01T00:00:00.000Z");
    const pageSizes: number[] = [];
    const pagedKv = {
      ...kv,
      list: async <T>(scope: string): Promise<T[]> => {
        if (scope === "mem:obs:ses_1") throw new Error("frame too large");
        return kv.list<T>(scope);
      },
      iterate: async function* <T>(scope: string, opts: { pageSize?: number } = {}): AsyncGenerator<T[]> {
        pageSizes.push(opts.pageSize ?? 0);
        const values = await kv.list<T>(scope);
        for (let i = 0; i < values.length; i += opts.pageSize ?? 200) yield values.slice(i, i + (opts.pageSize ?? 200));
      },
    };

    await rebuildKeywordIndex(pagedKv as never);
    expect(getKeywordRetryStatus().failedSessions).toBe(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getSearchIndex().has("obs_5")).toBe(true);
    expect(isBm25RebuildIncomplete()).toBe(false);
    expect(pageSizes).toContain(200);
  });

  it("never runs two retries at once", async () => {
    vi.useFakeTimers();
    const kv = mockKV();
    seed(kv, 2, 2, () => "2026-09-01T00:00:00.000Z");
    let calls = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    let release: (() => void) | null = null;
    const slowKv = {
      ...kv,
      list: async <T>(scope: string): Promise<T[]> => {
        if (scope !== "mem:obs:ses_1") return kv.list<T>(scope);
        calls++;
        if (calls === 1) throw new Error("invocation timed out");
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => { release = resolve; });
        inFlight--;
        return kv.list<T>(scope);
      },
    };

    await rebuildKeywordIndex(slowKv as never);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getKeywordRetryStatus()).toMatchObject({ running: true, nextRetryAt: null });
    await vi.advanceTimersByTimeAsync(12 * 60 * 60_000);
    expect(calls).toBe(2);
    expect(maxInFlight).toBe(1);

    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(isBm25RebuildIncomplete()).toBe(false);
    expect(getSearchIndex().has("obs_2")).toBe(true);
    expect(getKeywordRetryStatus().running).toBe(false);
  });

  it("drops a pending retry when a new full rebuild starts or on shutdown", async () => {
    vi.useFakeTimers();
    const kv = mockKV();
    seed(kv, 2, 2, () => "2026-09-01T00:00:00.000Z");
    const flaky = flakySessions(kv, new Map([["mem:obs:ses_1", 1]]));

    await rebuildKeywordIndex(flaky.kv as never);
    expect(getKeywordRetryStatus().failedSessions).toBe(1);
    await rebuildKeywordIndex(flaky.kv as never);
    expect(isBm25RebuildIncomplete()).toBe(false);
    expect(getKeywordRetryStatus()).toMatchObject({ failedSessions: 0, nextRetryAt: null });

    flaky.calls.clear();
    const failing = new Map([["mem:obs:ses_1", 1]]);
    const again = flakySessions(kv, failing);
    await rebuildKeywordIndex(again.kv as never);
    expect(getKeywordRetryStatus().nextRetryAt).not.toBeNull();
    stopKeywordRebuildRetry();
    expect(getKeywordRetryStatus().nextRetryAt).toBeNull();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(again.calls.get("mem:obs:ses_1")).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries the memories and session listings when they failed at boot", async () => {
    vi.useFakeTimers();
    const kv = mockKV();
    seed(kv, 2, 2, () => "2026-09-01T00:00:00.000Z");
    let down = true;
    const downKv = {
      ...kv,
      list: async <T>(scope: string): Promise<T[]> => {
        if (down && (scope === "mem:sessions" || scope === "mem:memories")) throw new Error("frame too large");
        return kv.list<T>(scope);
      },
    };

    await rebuildKeywordIndex(downKv as never);
    expect(getSearchIndex().size).toBe(0);
    expect(isMemoryIndexReady()).toBe(false);
    expect(getKeywordRetryStatus()).toMatchObject({ sessionListPending: true, memoriesPending: true });

    down = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getSearchIndex().has("mem_1")).toBe(true);
    expect(getSearchIndex().has("obs_3")).toBe(true);
    expect(isMemoryIndexReady()).toBe(true);
    expect(isBm25RebuildIncomplete()).toBe(false);
  });
});

describe("rebuild/backfill embed text includes concepts", () => {
  const CJK_CONCEPT = "登录超时";

  function zhConceptObs(): CompressedObservation {
    return {
      id: "obs_cjk",
      sessionId: "ses_cjk",
      timestamp: "2026-09-01T00:00:00.000Z",
      type: "file_edit",
      title: "Adjusted keepalive settings",
      facts: ["Raised the keepalive limit"],
      narrative: "Raised the keepalive limit so long requests survive",
      concepts: [CJK_CONCEPT, "keepalive"],
      files: ["src/net/keepalive.ts"],
      importance: 5,
    };
  }

  function zhConceptMemory(): Memory {
    return {
      id: "mem_cjk",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      type: "fact",
      title: "Keepalive fix",
      content: "Raise the keepalive limit for long requests",
      concepts: [CJK_CONCEPT],
      files: [],
      sessionIds: ["ses_cjk"],
      strength: 5,
      version: 1,
      isLatest: true,
    } as Memory;
  }

  function recordingProvider(embeddedTexts: string[]): EmbeddingProvider {
    return {
      name: "recording",
      dimensions: 3,
      embed: async (text: string) => {
        embeddedTexts.push(text);
        return new Float32Array([0.1, 0.2, 0.3]);
      },
      embedBatch: async (texts: string[]) => {
        embeddedTexts.push(...texts);
        return texts.map(() => new Float32Array([0.1, 0.2, 0.3]));
      },
    } as EmbeddingProvider;
  }

  it("indexRecords embeds concepts for observations and memories", async () => {
    const embeddedTexts: string[] = [];
    setVectorIndex(new VectorIndex());
    setEmbeddingProvider(recordingProvider(embeddedTexts));

    await indexRecords([zhConceptObs()], [zhConceptMemory()]);

    expect(embeddedTexts.length).toBe(2);
    expect(embeddedTexts.find((t) => t.startsWith("Adjusted keepalive settings"))).toContain(CJK_CONCEPT);
    expect(embeddedTexts.find((t) => t.startsWith("Keepalive fix"))).toContain(CJK_CONCEPT);
  });

  it("keyword rebuild backfill jobs embed concepts for observations and memories", async () => {
    const kv = mockKV();
    kv.store.set("mem:sessions", new Map([["ses_cjk", { id: "ses_cjk", project: "p", cwd: "/tmp" }]]));
    const obsScope = new Map<string, unknown>();
    obsScope.set("obs_cjk", zhConceptObs());
    kv.store.set("mem:obs:ses_cjk", obsScope);
    kv.store.set("mem:memories", new Map([["mem_cjk", zhConceptMemory()]]));

    setVectorIndex(new VectorIndex());
    const embeddedTexts: string[] = [];
    setEmbeddingProvider(recordingProvider(embeddedTexts));
    process.env.AGENTMEMORY_VECTOR_BACKFILL = "all";
    try {
      const { vectorJobs } = await rebuildKeywordIndex(kv as never, null);
      expect(vectorJobs.map((j) => j.id).sort()).toEqual(["mem_cjk", "obs_cjk"]);
      expect(vectorJobs.find((j) => j.id === "obs_cjk")!.text).toContain(CJK_CONCEPT);
      expect(vectorJobs.find((j) => j.id === "mem_cjk")!.text).toContain(CJK_CONCEPT);
    } finally {
      delete process.env.AGENTMEMORY_VECTOR_BACKFILL;
    }
  });
});
