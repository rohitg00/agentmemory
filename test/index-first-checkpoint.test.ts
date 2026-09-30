import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexPersistence, vectorBucketScope } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { scheduleIndexSave, setEmbeddingProvider, setIndexPersistence, setVectorIndex, vectorIndexAddGuarded } from "../src/functions/search.js";

const INDEX_SCOPE = "mem:index:bm25";
const META_KEY = "vectors:meta";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const writes: Array<{ scope: string; key: string }> = [];
  return {
    store,
    writes,
    get: async <T>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      writes.push({ scope, key });
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => { store.get(scope)?.delete(key); },
    list: async <T>(scope: string): Promise<T[]> => Array.from(store.get(scope)?.values() ?? []) as T[],
  };
}

function add(vector: VectorIndex, id: string): void {
  vector.add(id, "ses_1", new Float32Array([1, 0.5, 0.25]));
}

describe("first vector checkpoint", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    setIndexPersistence(null);
    setEmbeddingProvider(null);
    setVectorIndex(null);
    vi.useRealTimers();
  });

  it.each([false, true])("schedules a lone vector only after its slow embedding commits (callback=%s)", async (withCommit) => {
    const kv = mockKV();
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 600_000 });
    let finish!: (embedding: Float32Array) => void;
    const embed = vi.fn(() => new Promise<Float32Array>((resolve) => { finish = resolve; }));
    setVectorIndex(vector);
    setIndexPersistence(persistence);
    setEmbeddingProvider({ name: "test", dimensions: 3, embed, embedBatch: vi.fn() });
    scheduleIndexSave();
    const insertion = vectorIndexAddGuarded("obs_1", "ses_1", "one captured observation", { kind: "observation", logId: "obs_1" }, withCommit ? (embedding) => {
      vector.add("obs_1", "ses_1", embedding);
      return true;
    } : undefined);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(kv.writes).toHaveLength(0);
    finish(new Float32Array([1, 0.5, 0.25]));
    await expect(insertion).resolves.toBe(true);
    expect(persistence.status().firstCheckpointPending).toBe(true);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(kv.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).vector?.size).toBe(1);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("recovers the first burst after its early checkpoint, leaving later changes batched", async () => {
    const kv = mockKV();
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 600_000 });
    for (let i = 0; i < 100; i++) {
      add(vector, `obs_${i}`);
      persistence.scheduleSave();
    }
    expect(persistence.status().firstCheckpointPending).toBe(true);
    expect(Date.parse(persistence.status().nextSaveAt!) - Date.now()).toBe(5_000);
    await vi.advanceTimersByTimeAsync(4_999);
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).state).toBe("none");
    expect(kv.writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    const loaded = await new IndexPersistence(kv as never, new VectorIndex()).load();
    expect(loaded.vector?.size).toBe(100);
    expect(loaded.vector?.get("obs_99")?.embedding).toEqual(vector.get("obs_99")?.embedding);
    expect(persistence.status()).toMatchObject({ firstCheckpointPending: false, pendingChanges: 0, nextSaveAt: null });
    expect(kv.writes).toHaveLength(101);

    add(vector, "obs_later");
    persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(599_999);
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).vector?.size).toBe(100);
    expect(persistence.status().pendingChanges).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).vector?.size).toBe(101);
    expect(kv.writes).toHaveLength(103);
  });

  it("respects a save interval shorter than five seconds", async () => {
    const kv = mockKV();
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 1_000 });
    add(vector, "obs_1");
    persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(999);
    expect(kv.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).vector?.size).toBe(1);
  });

  it("retains the configured interval when a checkpoint was loaded", async () => {
    const kv = mockKV();
    const previous = new VectorIndex();
    add(previous, "obs_old");
    await new IndexPersistence(kv as never, previous).save();
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 60_000 });
    vector.restoreFrom((await persistence.load()).vector!);
    kv.writes.length = 0;
    add(vector, "obs_new");
    persistence.scheduleSave();
    expect(persistence.status().firstCheckpointPending).toBe(false);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(kv.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(kv.writes.map((write) => write.key)).toEqual(["obs_new", META_KEY]);
  });

  it("does not treat an empty flush as the first vector checkpoint", async () => {
    const kv = mockKV();
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 60_000 });
    await persistence.save();
    expect(kv.writes).toHaveLength(0);
    expect(persistence.status().vector?.lastSavedAt).toBeNull();
    add(vector, "obs_1");
    persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).vector?.size).toBe(1);
  });

  it.each(["entry", "metadata"])("retries a failed first %s write at the normal interval", async (failure) => {
    const kv = mockKV();
    let fail = true;
    const failingKV = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (fail && (failure === "metadata" ? key === META_KEY : scope === vectorBucketScope(0))) {
          throw new Error("state write unavailable");
        }
        return kv.set(scope, key, data);
      },
    };
    const vector = new VectorIndex();
    add(vector, "obs_1");
    const persistence = new IndexPersistence(failingKV as never, vector, { saveIntervalMs: 60_000 });
    persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(persistence.status()).toMatchObject({ firstCheckpointPending: true, pendingChanges: 1 });
    expect(persistence.status().vector?.lastSavedAt).toBeNull();
    expect(await kv.get(INDEX_SCOPE, META_KEY)).toBeNull();
    const writesAfterFailure = kv.writes.length;
    fail = false;
    await vi.advanceTimersByTimeAsync(59_999);
    expect(kv.writes).toHaveLength(writesAfterFailure);
    await vi.advanceTimersByTimeAsync(1);
    expect(persistence.status()).toMatchObject({ firstCheckpointPending: false, pendingChanges: 0 });
    expect(persistence.status().vector?.lastError).toBeNull();
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).vector?.size).toBe(1);
  });

  it("keeps a later metadata failure pending even with an existing checkpoint", async () => {
    const kv = mockKV();
    let fail = false;
    const failingKV = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (fail && key === META_KEY) throw new Error("metadata unavailable");
        return kv.set(scope, key, data);
      },
    };
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(failingKV as never, vector, { bucketSize: 1, saveIntervalMs: 60_000 });
    add(vector, "obs_1");
    await persistence.save();
    add(vector, "obs_2");
    fail = true;
    await persistence.save();
    expect(persistence.status().pendingChanges).toBe(1);
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).vector?.size).toBe(1);
    fail = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await new IndexPersistence(kv as never, new VectorIndex()).load()).vector?.size).toBe(2);
    expect(persistence.status().pendingChanges).toBe(0);
  });
});
