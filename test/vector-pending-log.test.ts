import { describe, it, expect, afterEach, vi } from "vitest";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";
import {
  backfillVectorBacklog,
  getPendingVectorBackfillCount,
  getSearchIndex,
  rebuildKeywordIndex,
  setEmbeddingProvider,
  setIndexPersistence,
  setVectorIndex,
} from "../src/functions/search.js";
import type { CompressedObservation, EmbeddingProvider, Session } from "../src/types.js";

const PENDING_SCOPE = "mem:index:vec-pending";
const INDEX_SCOPE = "mem:index:bm25";

function mockKV(options: { shuffle?: boolean } = {}) {
  const store = new Map<string, Map<string, unknown>>();
  const ops: Array<{ op: "set" | "delete" | "list"; scope: string; key?: string }> = [];
  return {
    store,
    ops,
    get: async <T>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      ops.push({ op: "set", scope, key });
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, JSON.parse(JSON.stringify(data)));
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      ops.push({ op: "delete", scope, key });
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      ops.push({ op: "list", scope });
      const rows = Array.from(store.get(scope)?.values() ?? []);
      if (options.shuffle) rows.reverse();
      return rows as T[];
    },
  };
}

type MockKV = ReturnType<typeof mockKV>;

function v(seed: number): Float32Array {
  return new Float32Array([seed, seed + 0.5, seed + 1]);
}

function pendingRows(kv: MockKV): Map<string, Record<string, unknown>> {
  return (kv.store.get(PENDING_SCOPE) ?? new Map()) as Map<string, Record<string, unknown>>;
}

async function boot(kv: MockKV, dims = 3): Promise<{ vector: VectorIndex; persistence: IndexPersistence }> {
  const vector = new VectorIndex();
  const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 600_000, bucketSize: 4 });
  const loaded = await persistence.load();
  if (loaded.vector && loaded.vector.size > 0) vector.restoreFrom(loaded.vector);
  await persistence.replayPendingLog(dims);
  return { vector, persistence };
}

describe("pending vector log", () => {
  afterEach(() => {
    vi.useRealTimers();
    getSearchIndex().clear();
    setVectorIndex(null);
    setEmbeddingProvider(null);
    setIndexPersistence(null);
  });

  it("writes a compact entry for every added vector and a tombstone for every removal", async () => {
    const kv = mockKV();
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 600_000 });

    vector.add("obs_a", "ses_1", v(1));
    vector.add("mem_b", "ses_2", v(2));
    vector.remove("obs_a");
    await persistence.flushPendingLog();

    const rows = pendingRows(kv);
    expect(rows.size).toBe(2);
    expect(rows.get("obs_a")).toMatchObject({ id: "obs_a", t: 1 });
    expect(rows.get("mem_b")).toMatchObject({ id: "mem_b", s: "ses_2", k: "memory" });
    expect(typeof rows.get("mem_b")!.e).toBe("string");
    expect(rows.get("obs_a")!.q as number).toBeGreaterThan(rows.get("mem_b")!.q as number);
    expect(persistence.status().pendingLog).toBe(2);
  });

  it("does nothing when there is no vector index", async () => {
    const kv = mockKV();
    const persistence = new IndexPersistence(kv as never, null);
    const standalone = new VectorIndex();
    standalone.add("obs_a", "ses_1", v(1));
    await persistence.save();
    const replay = await persistence.replayPendingLog(3);

    expect(kv.store.get(PENDING_SCOPE)).toBeUndefined();
    expect(kv.ops.filter((o) => o.scope === PENDING_SCOPE)).toEqual([]);
    expect(replay.entries).toBe(0);
    expect(persistence.status().pendingLog).toBe(0);
  });

  it("replays adds and removals after a force-kill without any embedding calls", async () => {
    const kv = mockKV();
    const first = await boot(kv);
    first.vector.add("obs_1", "ses_1", v(1));
    first.vector.add("obs_2", "ses_1", v(2));
    await first.persistence.save();
    expect(pendingRows(kv).size).toBe(0);

    first.vector.add("obs_3", "ses_1", v(3));
    first.vector.add("obs_4", "ses_1", v(4));
    first.vector.remove("obs_1");
    await first.persistence.flushPendingLog();
    first.persistence.stop();

    const embed = vi.fn();
    const second = await boot(kv);
    expect(embed).not.toHaveBeenCalled();
    expect([...second.vector.entries()].map(([id]) => id).sort()).toEqual(["obs_2", "obs_3", "obs_4"]);
    expect(Array.from(second.vector.get("obs_3")!.embedding)).toEqual(Array.from(v(3)));
    expect(second.persistence.status().pendingLog).toBe(3);

    await second.persistence.save();
    expect(pendingRows(kv).size).toBe(0);
    const third = await boot(kv);
    expect([...third.vector.entries()].map(([id]) => id).sort()).toEqual(["obs_2", "obs_3", "obs_4"]);
  });

  it("skips logged vectors whose dimension does not match the active provider", async () => {
    const kv = mockKV();
    const first = await boot(kv);
    first.vector.add("obs_ok", "ses_1", v(1));
    first.vector.add("obs_wide", "ses_1", new Float32Array([1, 2, 3, 4]));
    await first.persistence.flushPendingLog();

    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector);
    await persistence.load();
    const replay = await persistence.replayPendingLog(3);
    expect(replay).toMatchObject({ added: 1, skipped: 1 });
    expect(vector.has("obs_wide")).toBe(false);
  });

  it("clears only the entries a snapshot covered", async () => {
    const kv = mockKV();
    let release: () => void = () => undefined;
    let gate: Promise<void> | null = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope !== PENDING_SCOPE && gate) await gate;
        return kv.set(scope, key, data);
      },
    };
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(slow as never, vector, { saveIntervalMs: 600_000 });
    vector.add("obs_before", "ses_1", v(1));
    await persistence.flushPendingLog();

    const saving = persistence.save();
    vector.add("obs_during", "ses_1", v(2));
    await persistence.flushPendingLog();
    gate = null;
    release();
    await saving;

    expect([...pendingRows(kv).keys()]).toEqual(["obs_during"]);
    expect(persistence.status().pendingLog).toBe(1);
  });

  it("keeps every entry when the snapshot write fails", async () => {
    const kv = mockKV();
    const failing = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === INDEX_SCOPE) throw new Error("state write refused");
        return kv.set(scope, key, data);
      },
    };
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(failing as never, vector, { saveIntervalMs: 600_000 });
    vector.add("obs_1", "ses_1", v(1));
    vector.add("obs_2", "ses_1", v(2));
    await persistence.save();

    expect(persistence.status().vector?.lastError).toContain("state write refused");
    expect(pendingRows(kv).size).toBe(2);
    expect(kv.ops.filter((o) => o.op === "delete" && o.scope === PENDING_SCOPE)).toEqual([]);
  });

  it("orders replay by sequence, not by list order, including a full clear", async () => {
    const kv = mockKV({ shuffle: true });
    const first = await boot(kv);
    first.vector.add("obs_old", "ses_1", v(1));
    await first.persistence.save();
    first.vector.add("obs_gone", "ses_1", v(2));
    first.vector.clear();
    first.vector.add("obs_new", "ses_1", v(3));
    first.vector.add("obs_flip", "ses_1", v(4));
    first.vector.remove("obs_flip");
    first.vector.add("obs_flip", "ses_1", v(5));
    await first.persistence.flushPendingLog();

    const second = await boot(kv);
    expect([...second.vector.entries()].map(([id]) => id).sort()).toEqual(["obs_flip", "obs_new"]);
    expect(Array.from(second.vector.get("obs_flip")!.embedding)).toEqual(Array.from(v(5)));

    await second.persistence.save();
    expect(pendingRows(kv).size).toBe(0);
    const third = await boot(kv);
    expect([...third.vector.entries()].map(([id]) => id).sort()).toEqual(["obs_flip", "obs_new"]);
  });

  it("saves early once the log grows past its bound", async () => {
    vi.useFakeTimers();
    const kv = mockKV();
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 600_000 });
    await vi.advanceTimersByTimeAsync(6_000);
    const metaSet = () => kv.ops.some((o) => o.op === "set" && o.key === "vectors:meta");
    for (let i = 0; i < 520; i++) vector.add(`obs_${i}`, "ses_1", v(i));
    expect(metaSet()).toBe(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(persistence.status().saving || metaSet()).toBe(true);
    await persistence.save();
    await persistence.flushPendingLog();

    expect(kv.ops.some((o) => o.op === "set" && o.key === "vectors:meta")).toBe(true);
    expect(pendingRows(kv).size).toBe(0);
  });
});

describe("durable vector backlog", () => {
  afterEach(() => {
    getSearchIndex().clear();
    setVectorIndex(null);
    setEmbeddingProvider(null);
    setIndexPersistence(null);
  });

  function seed(kv: MockKV, count: number, timestamp: string): void {
    const sessionId = "ses_0";
    kv.store.set("mem:sessions", new Map([[sessionId, { id: sessionId, project: "p", cwd: "/tmp", startedAt: timestamp, status: "completed", observationCount: count } as Session]]));
    const scope = new Map<string, unknown>();
    for (let i = 0; i < count; i++) {
      const id = `obs_${String(i).padStart(3, "0")}`;
      scope.set(id, {
        id,
        sessionId,
        timestamp,
        type: "file_edit",
        title: `change ${i}`,
        facts: [],
        narrative: `narrative for change ${i}`,
        concepts: [],
        files: [],
        importance: 5,
      } satisfies CompressedObservation);
    }
    kv.store.set(`mem:obs:${sessionId}`, scope);
  }

  function provider(failAfterCalls: number | null, calls: { n: number }): EmbeddingProvider {
    return {
      name: "stub",
      dimensions: 3,
      embed: async () => new Float32Array([0.1, 0.2, 0.3]),
      embedBatch: async (texts: string[]) => {
        calls.n++;
        if (failAfterCalls !== null && calls.n > failAfterCalls) throw new Error("provider down");
        return texts.map(() => new Float32Array([0.1, 0.2, 0.3]));
      },
    } as EmbeddingProvider;
  }

  it("keeps the backfill marker until the backlog is done and resumes after a restart", async () => {
    process.env.REBUILD_EMBED_BATCH_SIZE = "5";
    try {
      const kv = mockKV();
      seed(kv, 12, "2026-09-02T00:00:00.000Z");

      const first = await boot(kv);
      setVectorIndex(first.vector);
      setIndexPersistence(first.persistence);
      const calls = { n: 0 };
      setEmbeddingProvider(provider(1, calls));
      await first.persistence.markBackfillSince("2026-09-01T00:00:00.000Z");
      const rebuilt = await rebuildKeywordIndex(kv as never, "2026-09-01T00:00:00.000Z");
      expect(rebuilt.vectorJobs).toHaveLength(12);

      const run = await backfillVectorBacklog(rebuilt.vectorJobs, { batchSize: 5, pauseMs: 0 });
      expect(run).toMatchObject({ added: 5, complete: false, remaining: 7 });
      expect(getPendingVectorBackfillCount()).toBe(7);
      expect(await first.persistence.readBackfillMarker()).toBe("2026-09-01T00:00:00.000Z");
      await first.persistence.flushPendingLog();
      first.persistence.stop();

      await first.persistence.markBackfillSince("2026-09-03T00:00:00.000Z");
      expect(await first.persistence.readBackfillMarker()).toBe("2026-09-01T00:00:00.000Z");

      getSearchIndex().clear();
      const second = await boot(kv);
      expect(second.vector.size).toBe(5);
      setVectorIndex(second.vector);
      setIndexPersistence(second.persistence);
      const resumedCalls = { n: 0 };
      setEmbeddingProvider(provider(null, resumedCalls));
      const since = await second.persistence.readBackfillMarker();
      const resumed = await rebuildKeywordIndex(kv as never, since);
      expect(resumed.vectorJobs).toHaveLength(7);

      const done = await backfillVectorBacklog(resumed.vectorJobs, { batchSize: 5, pauseMs: 0 });
      expect(done).toMatchObject({ added: 7, complete: true, remaining: 0 });
      expect(second.vector.size).toBe(12);
      expect(resumedCalls.n).toBe(2);
      await second.persistence.clearBackfillMarker();
      expect(await second.persistence.readBackfillMarker()).toBeNull();
    } finally {
      delete process.env.REBUILD_EMBED_BATCH_SIZE;
    }
  });

  it("does not cap incremental recovery at AGENTMEMORY_VECTOR_BACKFILL_MAX", async () => {
    process.env.AGENTMEMORY_VECTOR_BACKFILL_MAX = "4";
    try {
      const kv = mockKV();
      seed(kv, 10, "2026-09-02T00:00:00.000Z");
      setVectorIndex(new VectorIndex());
      setEmbeddingProvider(provider(null, { n: 0 }));
      const rebuilt = await rebuildKeywordIndex(kv as never, "2026-09-01T00:00:00.000Z");
      expect(rebuilt.vectorJobs).toHaveLength(10);
      const run = await backfillVectorBacklog(rebuilt.vectorJobs, { pauseMs: 0 });
      expect(run).toMatchObject({ added: 10, complete: true });
    } finally {
      delete process.env.AGENTMEMORY_VECTOR_BACKFILL_MAX;
    }
  });
});
