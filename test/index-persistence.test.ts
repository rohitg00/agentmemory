import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IndexPersistence, vectorBucketScope } from "../src/state/index-persistence.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { CompressedObservation } from "../src/types.js";

const INDEX_SCOPE = "mem:index:bm25";
const META_KEY = "vectors:meta";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const ops: Array<{ op: "set" | "delete" | "list"; scope: string; key?: string }> = [];
  return {
    store,
    ops,
    get: async <T>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      ops.push({ op: "set", scope, key });
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      ops.push({ op: "delete", scope, key });
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      ops.push({ op: "list", scope });
      return Array.from(store.get(scope)?.values() ?? []) as T[];
    },
  };
}

type MockKV = ReturnType<typeof mockKV>;

function vec(values: number[]): Float32Array {
  return new Float32Array(values);
}

function vectorWith(entries: Array<[string, number[]]>): VectorIndex {
  const index = new VectorIndex();
  for (const [id, values] of entries) index.add(id, `ses_${id}`, vec(values));
  return index;
}

function bucketSets(kv: MockKV): Array<{ scope: string; key?: string }> {
  return kv.ops.filter((o) => o.op === "set" && o.scope.startsWith(`${INDEX_SCOPE}:vec:`));
}

function obs(id: string): CompressedObservation {
  return {
    id,
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "file_edit",
    title: `title ${id}`,
    facts: [],
    narrative: `narrative ${id}`,
    concepts: [],
    files: [],
    importance: 5,
  };
}

async function writeLegacyVectorSnapshot(
  kv: MockKV,
  vector: VectorIndex,
  options: { generation?: string; monolithic?: boolean; shardChars?: number } = {},
): Promise<void> {
  const serialized = vector.serialize();
  if (options.monolithic) {
    await kv.set(INDEX_SCOPE, "vectors", serialized);
    return;
  }
  const generation = options.generation ?? "idx_mfabcd12_aaaaaaaaaaaa";
  const size = options.shardChars ?? 40;
  const shards: Array<{ scope: string; key: string; chars: number }> = [];
  for (let offset = 0, i = 0; offset < serialized.length; offset += size, i++) {
    const scope = `${INDEX_SCOPE}:vectors:${generation}:${String(i).padStart(5, "0")}`;
    const chunk = serialized.slice(offset, offset + size);
    await kv.set(scope, "data", chunk);
    shards.push({ scope, key: "data", chars: chunk.length });
  }
  await kv.set(INDEX_SCOPE, "vectors:manifest", { v: 1, generation, shards, chars: serialized.length });
}

async function writeLegacyBm25Snapshot(kv: MockKV): Promise<void> {
  const bm25 = new SearchIndex();
  bm25.add(obs("obs_legacy"));
  const serialized = bm25.serialize();
  const scope = `${INDEX_SCOPE}:bm25:idx_mfabcd12_bbbbbbbbbbbb:00000`;
  await kv.set(scope, "data", serialized);
  await kv.set(INDEX_SCOPE, "data:manifest", {
    v: 1,
    generation: "idx_mfabcd12_bbbbbbbbbbbb",
    shards: [{ scope, key: "data", chars: serialized.length }],
    chars: serialized.length,
  });
}

function expectSameVectors(actual: VectorIndex | null, expected: VectorIndex): void {
  expect(actual).not.toBeNull();
  expect(actual!.size).toBe(expected.size);
  for (const [id, entry] of expected.entries()) {
    const loaded = actual!.get(id);
    expect(loaded?.sessionId).toBe(entry.sessionId);
    expect(Array.from(loaded!.embedding)).toEqual(Array.from(entry.embedding));
  }
}

describe("IndexPersistence bucketed vector storage", () => {
  let kv: MockKV;

  beforeEach(() => {
    kv = mockKV();
  });

  it("fills buckets in insertion order and rolls to a new one at the cap", async () => {
    const vector = vectorWith([
      ["obs_a", [0.1, 0.2, 0.3]],
      ["obs_b", [0.4, 0.5, 0.6]],
      ["obs_c", [0.7, 0.8, 0.9]],
    ]);
    await new IndexPersistence(kv as never, vector, { bucketSize: 2 }).save();

    expect(kv.store.get(vectorBucketScope(0))?.has("obs_a")).toBe(true);
    expect(kv.store.get(vectorBucketScope(0))?.has("obs_b")).toBe(true);
    expect(kv.store.get(vectorBucketScope(1))?.has("obs_c")).toBe(true);
    const meta = await kv.get<{ v: number; bucketCount: number; count: number }>(INDEX_SCOPE, META_KEY);
    expect(meta).toMatchObject({ v: 3, bucketCount: 2, count: 3 });

    const loaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 2 }).load();
    expect(loaded.state).toBe("buckets");
    expectSameVectors(loaded.vector, vector);
    expect(loaded.vector!.pendingChanges).toBe(0);
  });

  it("writes only the bucket entry of a single added vector", async () => {
    const vector = vectorWith([
      ["obs_a", [0.1, 0.2, 0.3]],
      ["obs_b", [0.4, 0.5, 0.6]],
    ]);
    const persistence = new IndexPersistence(kv as never, vector, { bucketSize: 16 });
    await persistence.save();
    kv.ops.length = 0;

    vector.add("obs_new", "ses_new", vec([1, 0, 0]));
    await persistence.save();

    const writes = bucketSets(kv);
    expect(writes).toEqual([{ op: "set", scope: vectorBucketScope(0), key: "obs_new" }]);
  });

  it("does not write when nothing changed", async () => {
    const vector = vectorWith([["obs_a", [0.1, 0.2, 0.3]]]);
    const persistence = new IndexPersistence(kv as never, vector, { bucketSize: 16 });
    await persistence.save();
    kv.ops.length = 0;

    await persistence.save();

    expect(kv.ops.filter((o) => o.op !== "list")).toEqual([]);
  });

  it("removes deleted vectors from their bucket", async () => {
    const vector = vectorWith([
      ["obs_a", [0.1, 0.2, 0.3]],
      ["obs_b", [0.4, 0.5, 0.6]],
    ]);
    const persistence = new IndexPersistence(kv as never, vector, { bucketSize: 16 });
    await persistence.save();

    vector.remove("obs_a");
    await persistence.save();

    expect(kv.ops).toContainEqual({ op: "delete", scope: vectorBucketScope(0), key: "obs_a" });
    const loaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();
    expect(loaded.vector!.has("obs_a")).toBe(false);
    expect(loaded.vector!.has("obs_b")).toBe(true);
  });

  it("a delete touches only the bucket that owns the id, in a multi-bucket store", async () => {
    const vector = vectorWith(
      Array.from({ length: 5 }, (_, i) => [`obs_${i}`, [i, i + 1, i + 2]] as [string, number[]]),
    );
    const persistence = new IndexPersistence(kv as never, vector, { bucketSize: 2 });
    await persistence.save();
    kv.ops.length = 0;

    vector.remove("obs_2");
    await persistence.save();

    const touched = new Set(kv.ops.filter((o) => o.scope.startsWith(`${INDEX_SCOPE}:vec:`)).map((o) => o.scope));
    expect(touched).toEqual(new Set([vectorBucketScope(1)]));
    expect(kv.ops).toContainEqual({ op: "delete", scope: vectorBucketScope(1), key: "obs_2" });
  });

  it("clearing the index deletes every persisted vector", async () => {
    const vector = vectorWith([
      ["obs_a", [0.1, 0.2, 0.3]],
      ["obs_b", [0.4, 0.5, 0.6]],
    ]);
    const persistence = new IndexPersistence(kv as never, vector, { bucketSize: 16 });
    await persistence.save();

    vector.clear();
    vector.add("obs_c", "ses_c", vec([0, 1, 0]));
    await persistence.save();

    const loaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();
    expect([...loaded.vector!.entries()].map(([id]) => id)).toEqual(["obs_c"]);
  });

  it("keeps failed writes pending and retries them on the next save", async () => {
    const vector = vectorWith([["obs_a", [0.1, 0.2, 0.3]]]);
    let fail = true;
    const flakyKv = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (fail && scope.startsWith(`${INDEX_SCOPE}:vec:`)) throw new Error("state::set timed out");
        return kv.set(scope, key, data);
      },
    };
    const persistence = new IndexPersistence(flakyKv as never, vector, { bucketSize: 16 });

    await expect(persistence.save()).resolves.toBeUndefined();
    const failed = persistence.status();
    expect(failed.vector?.lastError).toBe("1 of 1 vector writes failed: state::set timed out");
    expect(failed.pendingChanges).toBe(1);
    expect(await kv.get(INDEX_SCOPE, META_KEY)).toBeNull();

    fail = false;
    await persistence.save();
    expect(persistence.status().vector?.lastError).toBeNull();
    expect(persistence.status().pendingChanges).toBe(0);
    const loaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();
    expectSameVectors(loaded.vector, vector);
  });

  it("a save after many vectors added over several waves touches only the currently open bucket", async () => {
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { bucketSize: 100 });

    for (let i = 0; i < 950; i++) vector.add(`obs_${i}`, "ses_1", vec([i, 0, 0]));
    await persistence.save();
    expect(kv.store.get(vectorBucketScope(9))?.size).toBe(50);
    for (let bucket = 0; bucket <= 8; bucket++) expect(kv.store.get(vectorBucketScope(bucket))?.size).toBe(100);
    kv.ops.length = 0;

    for (let i = 950; i < 1000; i++) vector.add(`obs_${i}`, "ses_1", vec([i, 0, 0]));
    await persistence.save();
    let touched = new Set(kv.ops.filter((o) => o.scope.startsWith(`${INDEX_SCOPE}:vec:`)).map((o) => o.scope));
    expect(touched).toEqual(new Set([vectorBucketScope(9)]));
    expect(kv.store.get(vectorBucketScope(9))?.size).toBe(100);
    kv.ops.length = 0;

    vector.add("obs_1000", "ses_1", vec([1000, 0, 0]));
    await persistence.save();
    touched = new Set(kv.ops.filter((o) => o.scope.startsWith(`${INDEX_SCOPE}:vec:`)).map((o) => o.scope));
    expect(touched).toEqual(new Set([vectorBucketScope(10)]));
  });

  it("a smaller bucket size configured later opens a new bucket instead of moving existing data", async () => {
    const vector = vectorWith(
      Array.from({ length: 4 }, (_, i) => [`obs_${i}`, [i, i + 1, i + 2]] as [string, number[]]),
    );
    await new IndexPersistence(kv as never, vector, { bucketSize: 4 }).save();
    for (let i = 0; i < 4; i++) expect(kv.store.get(vectorBucketScope(0))?.has(`obs_${i}`)).toBe(true);

    const reloaded = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, reloaded, { bucketSize: 2 });
    const loaded = await persistence.load();
    reloaded.restoreFrom(loaded.vector!);
    kv.ops.length = 0;

    reloaded.add("obs_new", "ses_new", vec([9, 9, 9]));
    await persistence.save();

    const touched = new Set(kv.ops.filter((o) => o.scope.startsWith(`${INDEX_SCOPE}:vec:`)).map((o) => o.scope));
    expect(touched).toEqual(new Set([vectorBucketScope(1)]));
    for (let i = 0; i < 4; i++) expect(kv.store.get(vectorBucketScope(0))?.has(`obs_${i}`)).toBe(true);
  });

  it("detects a partial bucket set against the saved count and reports it in status", async () => {
    const vector = vectorWith(
      Array.from({ length: 4 }, (_, i) => [`obs_${i}`, [i, i + 1, i + 2]] as [string, number[]]),
    );
    await new IndexPersistence(kv as never, vector, { bucketSize: 2 }).save();
    kv.store.get(vectorBucketScope(1))?.clear();

    const persistence = new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 2 });
    const loaded = await persistence.load();

    expect(loaded.state).toBe("buckets");
    expect(loaded.vector!.size).toBe(2);
    expect(loaded.expectedCount).toBe(4);
    expect(persistence.status().vectorCountShortfall).toEqual({ expected: 4, loaded: 2 });
  });

  it("reports storage as unavailable when the metadata read fails", async () => {
    const failingKv = {
      ...kv,
      get: async () => {
        throw new Error("engine down");
      },
    };
    const loaded = await new IndexPersistence(failingKv as never, new VectorIndex(), { bucketSize: 16 }).load();
    expect(loaded).toEqual({ vector: null, state: "unavailable", savedAt: null });
  });

  it("treats a missing store as empty, including adapters that return undefined", async () => {
    const undefinedKv = { ...kv, get: async () => undefined };
    const loaded = await new IndexPersistence(undefinedKv as never, new VectorIndex(), { bucketSize: 16 }).load();
    expect(loaded).toEqual({ vector: null, state: "none", savedAt: null });
  });
});

describe("IndexPersistence migration from the single-string format", () => {
  let kv: MockKV;

  beforeEach(() => {
    kv = mockKV();
  });

  it("migrates a sharded vector snapshot into buckets and removes the old shards", async () => {
    const legacy = vectorWith([
      ["obs_a", [0.1, 0.2, 0.3]],
      ["obs_b", [0.4, 0.5, 0.6]],
      ["obs_c", [0.7, 0.8, 0.9]],
    ]);
    await writeLegacyVectorSnapshot(kv, legacy, { generation: "idx_mfabcd12_aaaaaaaaaaaa" });
    await writeLegacyBm25Snapshot(kv);

    const loaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();

    expect(loaded.state).toBe("migrated");
    expect(loaded.savedAt).toBe(new Date(parseInt("mfabcd12", 36)).toISOString());
    expectSameVectors(loaded.vector, legacy);
    expect(loaded.vector!.pendingChanges).toBe(0);
    expect(await kv.get(INDEX_SCOPE, "vectors:manifest")).toBeNull();
    expect(await kv.get(INDEX_SCOPE, "data:manifest")).toBeNull();
    for (const [scope, entries] of kv.store) {
      if (scope.includes(":vectors:") || scope.includes(":bm25:idx_")) expect(entries.size).toBe(0);
    }

    const reloaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();
    expect(reloaded.state).toBe("buckets");
    expectSameVectors(reloaded.vector, legacy);
  });

  it("removes the old BM25 shards when missing keys read back as undefined, as the engine SDK returns them", async () => {
    const baseGet = kv.get;
    kv.get = (async <T>(scope: string, key: string) => {
      const value = await baseGet<T>(scope, key);
      return value === null ? undefined : value;
    }) as typeof kv.get;
    const legacy = vectorWith([["obs_a", [0.1, 0.2, 0.3]]]);
    await writeLegacyVectorSnapshot(kv, legacy, { generation: "idx_mfabcd12_bbbbbbbbbbbb" });
    await writeLegacyBm25Snapshot(kv);

    const loaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();

    expect(loaded.state).toBe("migrated");
    expect(await kv.get(INDEX_SCOPE, "data:manifest")).toBeUndefined();
    expect(await kv.get(INDEX_SCOPE, "vectors:manifest")).toBeUndefined();
    for (const [scope, entries] of kv.store) {
      if (scope.includes(":vectors:") || scope.includes(":bm25:idx_")) expect(entries.size).toBe(0);
    }
  });

  it("migrates a monolithic vector snapshot", async () => {
    const legacy = vectorWith([["obs_a", [0.1, 0.2, 0.3]]]);
    await writeLegacyVectorSnapshot(kv, legacy, { monolithic: true });

    const loaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();

    expect(loaded.state).toBe("migrated");
    expectSameVectors(loaded.vector, legacy);
    expect(await kv.get(INDEX_SCOPE, "vectors")).toBeNull();
  });

  it("leaves an unreadable legacy snapshot in place and writes nothing", async () => {
    const legacy = vectorWith([["obs_a", [0.1, 0.2, 0.3]]]);
    await writeLegacyVectorSnapshot(kv, legacy);
    const manifest = await kv.get<{ shards: Array<{ scope: string; key: string }> }>(INDEX_SCOPE, "vectors:manifest");
    await kv.delete(manifest!.shards[0].scope, manifest!.shards[0].key);
    kv.ops.length = 0;

    const loaded = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();

    expect(loaded.state).toBe("unavailable");
    expect(await kv.get(INDEX_SCOPE, "vectors:manifest")).not.toBeNull();
    expect(kv.ops.filter((o) => o.op === "set" || o.op === "delete")).toEqual([]);
  });

  it("keeps the legacy snapshot when migration writes fail and finishes on a later save", async () => {
    const legacy = vectorWith([
      ["obs_a", [0.1, 0.2, 0.3]],
      ["obs_b", [0.4, 0.5, 0.6]],
    ]);
    await writeLegacyVectorSnapshot(kv, legacy);
    let fail = true;
    const flakyKv = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (fail && scope.startsWith(`${INDEX_SCOPE}:vec:`)) throw new Error("write failed");
        return kv.set(scope, key, data);
      },
    };

    const live = new VectorIndex();
    const persistence = new IndexPersistence(flakyKv as never, live, { bucketSize: 16 });
    const loaded = await persistence.load();
    expect(loaded.state).toBe("unavailable");
    expectSameVectors(loaded.vector, legacy);
    expect(await kv.get(INDEX_SCOPE, "vectors:manifest")).not.toBeNull();
    expect(await kv.get(INDEX_SCOPE, META_KEY)).toBeNull();

    live.restoreFrom(loaded.vector!);
    fail = false;
    await persistence.save();

    const next = await new IndexPersistence(kv as never, new VectorIndex(), { bucketSize: 16 }).load();
    expect(next.state).toBe("buckets");
    expectSameVectors(next.vector, legacy);
    expect(await kv.get(INDEX_SCOPE, "vectors:manifest")).toBeNull();
  });

  it("without vector search, removes only the old BM25 snapshot", async () => {
    const legacy = vectorWith([["obs_a", [0.1, 0.2, 0.3]]]);
    await writeLegacyVectorSnapshot(kv, legacy);
    await writeLegacyBm25Snapshot(kv);

    const loaded = await new IndexPersistence(kv as never, null, { bucketSize: 16 }).load();

    expect(loaded).toEqual({ vector: null, state: "none", savedAt: null });
    expect(await kv.get(INDEX_SCOPE, "data:manifest")).toBeNull();
    expect(await kv.get(INDEX_SCOPE, "vectors:manifest")).not.toBeNull();
  });
});

describe("IndexPersistence scheduling", () => {
  let kv: MockKV;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = mockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scheduled saves never raise unhandled rejections", async () => {
    const failingKv = {
      ...kv,
      set: vi.fn(async () => {
        const err = new Error("TIMEOUT: invocation timed out after 30000ms") as Error & { code?: string };
        err.code = "TIMEOUT";
        throw err;
      }),
    };
    const vector = vectorWith([["obs_a", [0.1, 0.2, 0.3]]]);
    const persistence = new IndexPersistence(failingKv as never, vector, { saveIntervalMs: 5000, bucketSize: 16 });
    let unhandled = false;
    const onUnhandled = () => {
      unhandled = true;
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      persistence.scheduleSave();
      await vi.advanceTimersByTimeAsync(5000);
      expect(failingKv.set).toHaveBeenCalled();
      expect(unhandled).toBe(false);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("stop clears the pending timer", async () => {
    const vector = vectorWith([["obs_a", [0.1, 0.2, 0.3]]]);
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 5000, bucketSize: 16 });
    persistence.scheduleSave();
    persistence.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await kv.get(INDEX_SCOPE, META_KEY)).toBeNull();
  });
});
