import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { CompressedObservation } from "../src/types.js";

const BM25_SCOPE = "mem:index:bm25";
const BM25_LEGACY_KEY = "data";
const BM25_MANIFEST_KEY = "data:manifest";
const VECTOR_LEGACY_KEY = "vectors";
const VECTOR_MANIFEST_KEY = "vectors:manifest";
const VECTOR_BUCKET_SCOPE = "mem:index:bm25:vectors:v2";
// Mirrors the cap isValidBucketEntry enforces at load time.
const MAX_BUCKET_CHUNKS = 10_000;

// Mirrors the production key builder. Chunk keys carry the bucket's content
// hash so a bucket is never overwritten in place.
function chunkKey(bucketKey: string, hash: string, chunk = 0): string {
  return `${bucketKey}:${hash.slice(0, 12)}:${String(chunk).padStart(5, "0")}`;
}

type TestVectorBucketManifest = {
  v: 2;
  layout: number;
  buckets: number;
  chunkChars: number;
  shards: Record<string, { hash: string; chunks: number }>;
};

type TestIndexShardManifest = {
  v: 1;
  generation?: string;
  shards: Array<{ scope: string; key: string; chars: number }>;
  chars: number;
};

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

type MockKV = ReturnType<typeof mockKV>;

function makeObs(
  overrides: Partial<CompressedObservation> = {},
): CompressedObservation {
  return {
    id: "obs_1",
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "file_edit",
    title: "Edit auth middleware",
    subtitle: "JWT validation",
    facts: ["Added token check"],
    narrative: "Modified the auth middleware to validate JWT tokens",
    concepts: ["authentication", "jwt"],
    files: ["src/middleware/auth.ts"],
    importance: 7,
    ...overrides,
  };
}

function makeBm25(id: string, title: string): SearchIndex {
  const bm25 = new SearchIndex();
  bm25.add(makeObs({ id, title, narrative: `${title} narrative` }));
  return bm25;
}

function makeVector(id = "obs_1"): VectorIndex {
  const vector = new VectorIndex();
  vector.add(id, "ses_1", new Float32Array([0.1, 0.2, 0.3]));
  return vector;
}

function seeded(count: number): VectorIndex {
  const vector = new VectorIndex();
  for (let i = 0; i < count; i++) {
    vector.add(`obs_${i}`, "ses_1", new Float32Array([i, i + 1, i + 2]));
  }
  return vector;
}

async function getBm25Manifest(kv: MockKV): Promise<TestIndexShardManifest> {
  const manifest = await kv.get<TestIndexShardManifest>(
    BM25_SCOPE,
    BM25_MANIFEST_KEY,
  );
  expect(manifest).not.toBeNull();
  return manifest!;
}

describe("IndexPersistence", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = mockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves and loads BM25 index round-trip", async () => {
    const bm25 = new SearchIndex();
    bm25.add(makeObs({ id: "obs_1", title: "auth handler" }));

    const persistence = new IndexPersistence(kv as never, bm25, null);
    await persistence.save();

    const loaded = await persistence.load();
    expect(loaded.bm25).not.toBeNull();
    expect(loaded.bm25!.size).toBe(1);
    const results = loaded.bm25!.search("auth");
    expect(results.length).toBe(1);
  });

  it("saves BM25 index shards outside the BM25 metadata scope", async () => {
    const bm25 = new SearchIndex();
    bm25.add(
      makeObs({
        id: "obs_1",
        title: "auth handler ".repeat(40),
        narrative: "JWT middleware validation ".repeat(40),
      }),
    );

    const persistence = new IndexPersistence(kv as never, bm25, null, {
      shardChars: 80,
      createGeneration: () => "gen_bm25",
    });
    await persistence.save();

    const manifest = await getBm25Manifest(kv);
    expect(manifest.generation).toBe("gen_bm25");
    expect(manifest.shards.length).toBeGreaterThan(1);
    expect(manifest.shards[0].scope).toContain(":gen_bm25:");
    await expect(kv.get(BM25_SCOPE, BM25_LEGACY_KEY)).resolves.toBeNull();
    await expect(
      kv.get(manifest.shards[0].scope, manifest.shards[0].key),
    ).resolves.toEqual(expect.any(String));

    const loaded = await persistence.load();
    expect(loaded.bm25).not.toBeNull();
    expect(loaded.bm25!.search("auth").length).toBe(1);
  });

  it("loads legacy monolithic BM25 and vector snapshots", async () => {
    const bm25 = makeBm25("obs_1", "legacy auth handler");
    const vector = makeVector("obs_1");
    await kv.set(BM25_SCOPE, BM25_LEGACY_KEY, bm25.serialize());
    await kv.set(BM25_SCOPE, VECTOR_LEGACY_KEY, vector.serialize());

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();

    expect(loaded.bm25).not.toBeNull();
    expect(loaded.bm25!.search("legacy").length).toBe(1);
    expect(loaded.vector).not.toBeNull();
    expect(loaded.vector!.size).toBe(1);
  });

  it("fails closed instead of falling back when manifest reads fail", async () => {
    const legacy = makeBm25("obs_legacy", "legacy stale snapshot");
    await kv.set(BM25_SCOPE, BM25_LEGACY_KEY, legacy.serialize());
    const failingKv = {
      ...kv,
      get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === BM25_SCOPE && key === BM25_MANIFEST_KEY) {
          throw new Error("manifest backend unavailable");
        }
        return kv.get(scope, key);
      }),
    };

    const loaded = await new IndexPersistence(
      failingKv as never,
      new SearchIndex(),
      null,
    ).load();

    expect(loaded.bm25).toBeNull();
  });

  it("fails closed when legacy snapshot reads fail", async () => {
    const failingKv = {
      ...kv,
      get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === BM25_SCOPE && key === BM25_LEGACY_KEY) {
          throw new Error("legacy backend unavailable");
        }
        return kv.get(scope, key);
      }),
    };

    const loaded = await new IndexPersistence(
      failingKv as never,
      new SearchIndex(),
      null,
    ).load();

    expect(loaded.bm25).toBeNull();
  });

  it("loads sharded manifests that omit optional generation metadata", async () => {
    const bm25 = makeBm25("obs_1", "deterministic shard auth");
    const serialized = bm25.serialize();
    const chunks = [serialized.slice(0, 50), serialized.slice(50)];
    await kv.set("mem:index:bm25:bm25:00000", "data", chunks[0]);
    await kv.set("mem:index:bm25:bm25:00001", "data", chunks[1]);
    await kv.set<TestIndexShardManifest>(BM25_SCOPE, BM25_MANIFEST_KEY, {
      v: 1,
      chars: serialized.length,
      shards: [
        {
          scope: "mem:index:bm25:bm25:00000",
          key: "data",
          chars: chunks[0].length,
        },
        {
          scope: "mem:index:bm25:bm25:00001",
          key: "data",
          chars: chunks[1].length,
        },
      ],
    });

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();

    expect(loaded.bm25).not.toBeNull();
    expect(loaded.bm25!.search("deterministic").length).toBe(1);
  });

  it("saves and loads vector index round-trip", async () => {
    const bm25 = new SearchIndex();
    const vector = makeVector();

    const persistence = new IndexPersistence(kv as never, bm25, vector);
    await persistence.save();

    const loaded = await persistence.load();
    expect(loaded.vector).not.toBeNull();
    expect(loaded.vector!.size).toBe(1);
  });

  it("saves vector index shards outside the BM25 scope", async () => {
    const bm25 = new SearchIndex();
    const vector = new VectorIndex();
    vector.add(
      "obs_1",
      "ses_1",
      new Float32Array(Array.from({ length: 32 }, (_, i) => i)),
    );

    const persistence = new IndexPersistence(kv as never, bm25, vector, {
      shardChars: 40,
      createGeneration: () => "gen_vector",
    });
    await persistence.save();

    const manifest = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    expect(manifest).not.toBeNull();
    expect(manifest!.v).toBe(2);
    const bucketKeys = Object.keys(manifest!.shards);
    expect(bucketKeys.length).toBe(1);
    // shardChars: 40 against a 32-float embedding, so the bucket must still be
    // chunked. Bucketing bounds the rewrite; chunking bounds the payload.
    expect(manifest!.shards[bucketKeys[0]].chunks).toBeGreaterThan(1);
    await expect(kv.get(BM25_SCOPE, VECTOR_LEGACY_KEY)).resolves.toBeNull();
    // Vector payloads live outside the BM25 scope.
    await expect(
      kv.get(
        VECTOR_BUCKET_SCOPE,
        chunkKey(bucketKeys[0], manifest!.shards[bucketKeys[0]].hash),
      ),
    ).resolves.toEqual(expect.any(String));

    const loaded = await persistence.load();
    expect(loaded.vector).not.toBeNull();
    expect(loaded.vector!.size).toBe(1);
  });

  it("persists empty vector snapshots so cleared vectors do not reload", async () => {
    const previousBm25 = makeBm25("obs_old", "alpha previous snapshot");
    const previousVector = makeVector("obs_old");
    await new IndexPersistence(kv as never, previousBm25, previousVector, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();

    const nextBm25 = makeBm25("obs_new", "bravo new snapshot");
    const emptyVector = new VectorIndex();
    await new IndexPersistence(kv as never, nextBm25, emptyVector, {
      shardChars: 80,
      createGeneration: () => "gen_empty",
    }).save();

    const vectorManifest = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    expect(vectorManifest).not.toBeNull();
    expect(vectorManifest!.v).toBe(2);
    // The cleared index publishes a manifest naming no buckets, and the
    // previous bucket is reclaimed rather than left to reload.
    expect(Object.keys(vectorManifest!.shards)).toHaveLength(0);
    await expect(
      kv.list(VECTOR_BUCKET_SCOPE),
    ).resolves.toHaveLength(0);
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("bravo").length).toBe(1);
    expect(loaded.vector).not.toBeNull();
    expect(loaded.vector!.size).toBe(0);
  });

  it("avoids one oversized state::set string payload for persisted indexes", async () => {
    const maxStringPayloadChars = 80;
    const bm25 = new SearchIndex();
    bm25.add(
      makeObs({
        id: "obs_1",
        title: "large persisted snapshot ".repeat(40),
        narrative: "oversized state set reproduction ".repeat(40),
      }),
    );
    const vector = new VectorIndex();
    vector.add(
      "obs_1",
      "ses_1",
      new Float32Array(Array.from({ length: 64 }, (_, i) => i / 10)),
    );
    const guardedKv = {
      ...kv,
      set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (
          typeof data === "string" &&
          data.length > maxStringPayloadChars
        ) {
          throw new Error(`oversized state::set payload: ${scope}/${key}`);
        }
        return kv.set(scope, key, data);
      }),
    };

    await new IndexPersistence(guardedKv as never, bm25, vector, {
      shardChars: maxStringPayloadChars,
      createGeneration: () => "gen_payload_limit",
    }).save();

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("oversized").length).toBe(1);
    expect(loaded.vector!.size).toBe(1);
  });

  it("falls back to the default shard size for fractional values below one", async () => {
    const bm25 = makeBm25("obs_fraction", "fractional shard config");
    let newShardWrites = 0;
    const guardedKv = {
      ...kv,
      set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope.includes(":gen_fraction:")) {
          newShardWrites += 1;
          if (newShardWrites > 3) {
            throw new Error("fractional shard size caused zero-width shards");
          }
        }
        return kv.set(scope, key, data);
      }),
    };

    await new IndexPersistence(guardedKv as never, bm25, null, {
      shardChars: 0.5,
      createGeneration: () => "gen_fraction",
    }).save();

    const manifest = await getBm25Manifest(kv);
    expect(manifest.generation).toBe("gen_fraction");
    expect(manifest.shards.length).toBe(1);
    expect(newShardWrites).toBe(1);
  });

  it("keeps the previous generation when a shard write fails before manifest commit", async () => {
    const previous = makeBm25("obs_old", "alpha previous snapshot");
    await new IndexPersistence(kv as never, previous, null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();
    const previousManifest = await getBm25Manifest(kv);

    let newShardWrites = 0;
    const failingKv = {
      ...kv,
      set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope.includes(":gen_new:")) {
          newShardWrites += 1;
          if (newShardWrites === 2) throw new Error("shard write failed");
        }
        return kv.set(scope, key, data);
      }),
    };

    const next = makeBm25("obs_new", "bravo new snapshot");
    await new IndexPersistence(failingKv as never, next, null, {
      shardChars: 80,
      createGeneration: () => "gen_new",
    }).save();

    await expect(kv.get(BM25_SCOPE, BM25_MANIFEST_KEY)).resolves.toEqual(
      previousManifest,
    );
    await expect(
      kv.get("mem:index:bm25:bm25:gen_new:00000", "data"),
    ).resolves.toBeNull();
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("alpha").length).toBe(1);
    expect(loaded.bm25!.search("bravo").length).toBe(0);
  });

  it("keeps the previous generation when manifest set rejects before commit", async () => {
    const previous = makeBm25("obs_old", "alpha previous snapshot");
    await new IndexPersistence(kv as never, previous, null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();
    const previousManifest = await getBm25Manifest(kv);

    const failingKv = {
      ...kv,
      set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === BM25_SCOPE && key === BM25_MANIFEST_KEY) {
          throw new Error("manifest write failed");
        }
        return kv.set(scope, key, data);
      }),
    };

    const next = makeBm25("obs_new", "bravo new snapshot");
    await new IndexPersistence(failingKv as never, next, null, {
      shardChars: 80,
      createGeneration: () => "gen_new",
    }).save();

    await expect(kv.get(BM25_SCOPE, BM25_MANIFEST_KEY)).resolves.toEqual(
      previousManifest,
    );
    await expect(
      kv.get("mem:index:bm25:bm25:gen_new:00000", "data"),
    ).resolves.toBeNull();
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("alpha").length).toBe(1);
    expect(loaded.bm25!.search("bravo").length).toBe(0);
  });

  it("keeps a generation loadable when manifest set commits before rejecting", async () => {
    const previous = makeBm25("obs_old", "alpha previous snapshot");
    await new IndexPersistence(kv as never, previous, null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();

    const failingKv = {
      ...kv,
      set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === BM25_SCOPE && key === BM25_MANIFEST_KEY) {
          await kv.set(scope, key, data);
          throw new Error("manifest write timed out after commit");
        }
        return kv.set(scope, key, data);
      }),
    };

    const next = makeBm25("obs_new", "bravo new snapshot");
    await new IndexPersistence(failingKv as never, next, null, {
      shardChars: 80,
      createGeneration: () => "gen_new",
    }).save();

    const manifest = await getBm25Manifest(kv);
    expect(manifest.generation).toBe("gen_new");
    await expect(
      kv.get("mem:index:bm25:bm25:gen_new:00000", "data"),
    ).resolves.toEqual(expect.any(String));
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("bravo").length).toBe(1);
  });

  it("deletes a shard that committed before set rejected", async () => {
    const previous = makeBm25("obs_old", "alpha previous snapshot");
    await new IndexPersistence(kv as never, previous, null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();
    const previousManifest = await getBm25Manifest(kv);

    const failingKv = {
      ...kv,
      set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === "mem:index:bm25:bm25:gen_new:00000") {
          await kv.set(scope, key, data);
          throw new Error("state::set timed out after commit");
        }
        return kv.set(scope, key, data);
      }),
    };

    const next = makeBm25("obs_new", "bravo new snapshot");
    await new IndexPersistence(failingKv as never, next, null, {
      shardChars: 80,
      createGeneration: () => "gen_new",
    }).save();

    await expect(kv.get(BM25_SCOPE, BM25_MANIFEST_KEY)).resolves.toEqual(
      previousManifest,
    );
    await expect(
      kv.get("mem:index:bm25:bm25:gen_new:00000", "data"),
    ).resolves.toBeNull();
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("alpha").length).toBe(1);
    expect(loaded.bm25!.search("bravo").length).toBe(0);
  });

  it("loads the new generation even when old generation cleanup fails", async () => {
    const previous = makeBm25("obs_old", "alpha previous snapshot");
    await new IndexPersistence(kv as never, previous, null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();

    const cleanupKv = {
      ...kv,
      delete: vi.fn(async () => {
        throw new Error("cleanup failed");
      }),
    };
    const next = makeBm25("obs_new", "bravo new snapshot");
    await new IndexPersistence(cleanupKv as never, next, null, {
      shardChars: 80,
      createGeneration: () => "gen_new",
    }).save();

    const manifest = await getBm25Manifest(kv);
    expect(manifest.generation).toBe("gen_new");
    expect(cleanupKv.delete).toHaveBeenCalled();
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("bravo").length).toBe(1);
    expect(loaded.bm25!.search("alpha").length).toBe(0);
  });

  it("keeps the previous vector generation when vector save fails after BM25 publish", async () => {
    const previousBm25 = makeBm25("obs_old", "alpha previous snapshot");
    const previousVector = makeVector("obs_old");
    await new IndexPersistence(kv as never, previousBm25, previousVector, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();

    const failingKv = {
      ...kv,
      set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === BM25_SCOPE && key === VECTOR_MANIFEST_KEY) {
          throw new Error("vector manifest write failed");
        }
        return kv.set(scope, key, data);
      }),
    };
    const nextBm25 = makeBm25("obs_new", "bravo new snapshot");
    const nextVector = new VectorIndex();
    nextVector.add("obs_new", "ses_1", new Float32Array([0.4, 0.5, 0.6]));

    await new IndexPersistence(failingKv as never, nextBm25, nextVector, {
      shardChars: 80,
      createGeneration: () => "gen_new",
    }).save();

    await expect(
      kv.get("mem:index:bm25:vectors:gen_new:00000", "data"),
    ).resolves.toBeNull();
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("bravo").length).toBe(1);
    expect(loaded.vector!.size).toBe(1);
    expect(
      loaded.vector!.search(new Float32Array([0.1, 0.2, 0.3]))[0]?.obsId,
    ).toBe("obs_old");
  });

  it("fails closed when a manifest shard is missing", async () => {
    const bm25 = makeBm25("obs_1", "alpha sharded snapshot");
    await new IndexPersistence(kv as never, bm25, null, {
      shardChars: 80,
      createGeneration: () => "gen_missing",
    }).save();
    const manifest = await getBm25Manifest(kv);
    await kv.delete(manifest.shards[0].scope, manifest.shards[0].key);

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();

    expect(loaded.bm25).toBeNull();
  });

  it("fails closed when a manifest shard length mismatches", async () => {
    const bm25 = makeBm25("obs_1", "alpha sharded snapshot");
    await new IndexPersistence(kv as never, bm25, null, {
      shardChars: 80,
      createGeneration: () => "gen_mismatch",
    }).save();
    const manifest = await getBm25Manifest(kv);
    const firstShard = manifest.shards[0];
    const chunk = await kv.get<string>(firstShard.scope, firstShard.key);
    await kv.set(firstShard.scope, firstShard.key, `${chunk}x`);

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();

    expect(loaded.bm25).toBeNull();
  });

  it("fails closed before reading invalid shard descriptors", async () => {
    await kv.set<TestIndexShardManifest>(BM25_SCOPE, BM25_MANIFEST_KEY, {
      v: 1,
      chars: 10,
      shards: [{ scope: "", key: "data", chars: 10 }],
    });
    const guardedKv = {
      ...kv,
      get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === "") {
          throw new Error("invalid shard descriptor was read");
        }
        return kv.get(scope, key);
      }),
    };

    const loaded = await new IndexPersistence(
      guardedKv as never,
      new SearchIndex(),
      null,
    ).load();

    expect(loaded.bm25).toBeNull();
    expect(guardedKv.get).not.toHaveBeenCalledWith("", "data");
  });

  it("scheduleSave debounces multiple calls", async () => {
    const bm25 = new SearchIndex();
    const persistence = new IndexPersistence(kv as never, bm25, null);

    persistence.scheduleSave();
    persistence.scheduleSave();
    persistence.scheduleSave();

    await expect(kv.get(BM25_SCOPE, BM25_MANIFEST_KEY)).resolves.toBeNull();

    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();

    const saved = await kv.get<string>(BM25_SCOPE, BM25_MANIFEST_KEY);
    expect(saved).not.toBeNull();
  });

  it("stop clears the pending timer", async () => {
    const bm25 = new SearchIndex();
    bm25.add(makeObs({ id: "obs_1", title: "auth handler" }));
    const persistence = new IndexPersistence(kv as never, bm25, null);

    persistence.scheduleSave();
    persistence.stop();

    vi.advanceTimersByTime(10000);
    const saved = await kv.get<string>(BM25_SCOPE, BM25_MANIFEST_KEY);
    expect(saved).toBeNull();
  });

  it("returns null indexes when nothing has been saved", async () => {
    const bm25 = new SearchIndex();
    const persistence = new IndexPersistence(kv as never, bm25, null);

    const loaded = await persistence.load();
    expect(loaded.bm25).toBeNull();
    expect(loaded.vector).toBeNull();
  });

  it("scheduled save swallows kv.set rejection without unhandledRejection (#204)", async () => {
    const failingKv = {
      ...mockKV(),
      set: vi.fn(async () => {
        const err = new Error(
          "TIMEOUT: invocation timed out after 30000ms",
        ) as Error & { code?: string; function_id?: string };
        err.code = "TIMEOUT";
        err.function_id = "state::set";
        throw err;
      }),
    };
    const bm25 = new SearchIndex();
    bm25.add(makeObs({ id: "obs_1", title: "auth handler" }));
    const persistence = new IndexPersistence(failingKv as never, bm25, null);

    let unhandled = false;
    const onUnhandled = () => {
      unhandled = true;
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      persistence.scheduleSave();
      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();
      // give microtasks a chance to flush
      await Promise.resolve();
      expect(failingKv.set).toHaveBeenCalled();
      expect(unhandled).toBe(false);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("save() does not throw when kv.set rejects (#204)", async () => {
    const failingKv = {
      ...mockKV(),
      set: vi.fn(async () => {
        throw new Error("TIMEOUT");
      }),
    };
    const bm25 = new SearchIndex();
    bm25.add(makeObs({ id: "obs_1", title: "auth handler" }));
    const persistence = new IndexPersistence(failingKv as never, bm25, null);

    await expect(persistence.save()).resolves.toBeUndefined();
  });

  // #797: first run after upgrading to 0.9.25 crashed with
  // 'TypeError: Cannot read properties of undefined (reading "v")'
  // because some iii-state adapters return `undefined` (not `null`)
  // for a missing key. The load path's `value !== null` check passed
  // undefined to loadManifestData, which then read `undefined.v`.
  it("load() returns null instead of crashing when kv.get returns undefined for the manifest (#797)", async () => {
    const undefinedKv = {
      ...mockKV(),
      get: vi.fn(async () => undefined),
    };
    const persistence = new IndexPersistence(
      undefinedKv as never,
      new SearchIndex(),
      null,
    );

    const loaded = await persistence.load();
    expect(loaded.bm25).toBeNull();
    expect(loaded.vector).toBeNull();
  });

  it("load() does not crash when a manifest row value is the wrong shape (#797)", async () => {
    const wrongShapeKv = {
      ...mockKV(),
      get: vi.fn(async () => "not-a-manifest"),
    };
    const persistence = new IndexPersistence(
      wrongShapeKv as never,
      new SearchIndex(),
      null,
    );

    await expect(persistence.load()).resolves.toBeDefined();
  });
});

// Counts writes landing on vector bucket payload keys, so assertions are about
// payload rewrites rather than manifest bookkeeping.
function countingKV() {
  const inner = mockKV();
  let bucketWrites = 0;
  return {
    ...inner,
    resetCount: () => {
      bucketWrites = 0;
    },
    get bucketWrites() {
      return bucketWrites;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (scope === VECTOR_BUCKET_SCOPE) bucketWrites++;
      return inner.set(scope, key, data);
    },
  };
}

describe("IndexPersistence vector bucketing", () => {
  let kv: ReturnType<typeof countingKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = countingKV();
  });
  afterEach(() => vi.useRealTimers());

  it("writes O(1) buckets when one vector is added, not O(corpus)", async () => {
    const vector = seeded(60);
    const persistence = new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 400,
    });

    await persistence.save();
    expect(kv.bucketWrites).toBeGreaterThan(5);

    vector.add("obs_new", "ses_1", new Float32Array([9, 9, 9]));
    kv.resetCount();
    await persistence.save();

    expect(kv.bucketWrites).toBeLessThanOrEqual(2);
    // Bounding the write count alone does not discriminate: skipping writes
    // that were needed also lowers it. Read the result back.
    const loaded = await persistence.load();
    expect(loaded.vector!.size).toBe(61);
    expect(
      loaded.vector!.search(new Float32Array([9, 9, 9]), 61)
        .some((r) => r.obsId === "obs_new"),
    ).toBe(true);
  });

  // Covers the same-instance case too: saveVectorBuckets holds no state between
  // saves, so a fresh instance and a reused one run the identical path.
  it("rewrites nothing after a restart when nothing changed", async () => {
    const vector = seeded(40);
    await new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 400,
    }).save();

    // Go through the real restart path. Seeding a fresh identical index would
    // skip load() entirely, leaving the thing that actually keeps hashes stable
    // across a restart — deserialize -> mergeSerialized row order -> identical
    // serialised bytes — completely unpinned.
    const reloaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(reloaded.vector!.size).toBe(40);

    kv.resetCount();
    const restarted = new IndexPersistence(
      kv as never,
      new SearchIndex(),
      reloaded.vector,
      { shardChars: 400 },
    );
    await restarted.save();

    expect(kv.bucketWrites).toBe(0);
  });

  it("writes only the removed observation's bucket on delete", async () => {
    const vector = seeded(60);
    const persistence = new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 400,
    });
    await persistence.save();

    // obs_9 shares a bucket with obs_30, so removing it forces that bucket to be
    // REWRITTEN with its surviving member. Removing a bucket's only occupant
    // instead would just reclaim it and never exercise a write at all, which is
    // what this test is supposed to be about.
    vector.remove("obs_9");
    kv.resetCount();
    await persistence.save();

    expect(kv.bucketWrites).toBeLessThanOrEqual(1);
    const loaded = await persistence.load();
    expect(loaded.vector!.size).toBe(59);
    // The bucket-mate must survive the rewrite.
    expect(
      loaded.vector!.search(new Float32Array([30, 31, 32]), 59)
        .some((r) => r.obsId === "obs_30"),
    ).toBe(true);
  });

  it("round-trips every vector through the bucketed format", async () => {
    const vector = seeded(50);
    const persistence = new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 400,
    });
    await persistence.save();

    const loaded = await persistence.load();
    expect(loaded.vector!.size).toBe(50);
    expect(
      loaded.vector!.search(new Float32Array([7, 8, 9]))[0]?.obsId,
    ).toBe("obs_7");
  });

  it("bounds each payload by shardChars even when a bucket is large", async () => {
    // One bucket, many vectors in it: only chunking can bound the payload.
    const vector = new VectorIndex();
    for (let i = 0; i < 40; i++) {
      vector.add(
        `obs_${i}`,
        "ses_1",
        new Float32Array(Array.from({ length: 32 }, (_, n) => n + i)),
      );
    }
    const maxChars = 120;
    const guarded = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (typeof data === "string" && data.length > maxChars) {
          throw new Error(`oversized state::set payload: ${scope}/${key}`);
        }
        return kv.set(scope, key, data);
      },
    };
    await new IndexPersistence(guarded as never, new SearchIndex(), vector, {
      shardChars: maxChars,
      vectorBuckets: 1,
    }).save();

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.vector!.size).toBe(40);
  });

  it("loads a v1 manifest and migrates it to buckets on the next save", async () => {
    // Write the legacy offset-chunked format by hand, exactly as the v1 code
    // shaped it, then prove no vectors are lost across the upgrade.
    const legacy = seeded(20);
    const serialized = legacy.serialize();
    const shards: Array<{ scope: string; key: string; chars: number }> = [];
    const chunkChars = 200;
    for (let offset = 0; offset < serialized.length; offset += chunkChars) {
      const scope = `mem:index:bm25:vectors:gen_v1:${String(
        shards.length,
      ).padStart(5, "0")}`;
      const chunk = serialized.slice(offset, offset + chunkChars);
      shards.push({ scope, key: "data", chars: chunk.length });
      await kv.set(scope, "data", chunk);
    }
    await kv.set(BM25_SCOPE, VECTOR_MANIFEST_KEY, {
      v: 1,
      generation: "gen_v1",
      shards,
      chars: serialized.length,
    });

    // Load path still understands v1.
    const before = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(before.vector!.size).toBe(20);

    // First save migrates and reclaims the v1 shards.
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(20), {
      shardChars: 400,
    }).save();

    const manifest = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    expect(manifest!.v).toBe(2);
    for (const shard of shards) {
      await expect(kv.get(shard.scope, shard.key)).resolves.toBeNull();
    }
    const after = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(after.vector!.size).toBe(20);
  });

  it("keeps previous buckets loadable when the manifest publish fails", async () => {
    const vector = seeded(30);
    await new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 400,
    }).save();

    const failing = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === BM25_SCOPE && key === VECTOR_MANIFEST_KEY) {
          throw new Error("vector manifest write failed");
        }
        return kv.set(scope, key, data);
      },
    };
    // Empty index: without deferring deletes until after publish, this would
    // reclaim every bucket the still-live manifest names and lose the lot.
    await new IndexPersistence(
      failing as never,
      new SearchIndex(),
      new VectorIndex(),
      { shardChars: 400 },
    ).save();

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.vector!.size).toBe(30);
  });

  it("skips a bucket whose body disagrees with its manifest hash", async () => {
    const vector = seeded(30);
    // Large shardChars keeps every bucket to a single chunk, so the stand-in
    // body below is the bucket in full rather than a fragment of one.
    const persistence = new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 100_000,
    });
    await persistence.save();

    const manifest = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    const [tornKey] = Object.keys(manifest!.shards);
    const tornHash = manifest!.shards[tornKey].hash;

    // Critically, this stand-in is VALID JSON in the right row shape. An
    // invalid body would be dropped by mergeSerialized regardless, so the test
    // would pass with the hash check removed and prove nothing. Only content
    // that would otherwise load cleanly can show the hash check doing work.
    const ghost = JSON.stringify([
      [
        "obs_ghost",
        {
          embedding: Buffer.from(
            new Float32Array([1, 2, 3]).buffer,
          ).toString("base64"),
          sessionId: "ses_1",
        },
      ],
    ]);
    await kv.set(VECTOR_BUCKET_SCOPE, chunkKey(tornKey, tornHash), ghost);

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    // The disagreeing bucket is dropped whole rather than trusted.
    expect(
      loaded.vector!.search(new Float32Array([1, 2, 3]), 50)
        .some((r) => r.obsId === "obs_ghost"),
    ).toBe(false);
    // Every other bucket still loads.
    expect(loaded.vector!.size).toBeGreaterThan(0);
    expect(loaded.vector!.size).toBeLessThan(30);
  });

  // isValidBucketEntry rejects any entry above MAX_BUCKET_CHUNKS, so a save
  // that publishes one hands the next boot a bucket it classifies as corrupt —
  // dropping vectors whose bytes are entirely intact, and marking every load
  // incomplete from then on. A small configured shardChars is all it takes.
  it("fails the save rather than publish a bucket the loader will reject", async () => {
    const vector = seeded(200);
    // Asserted, not assumed: at one chunk per character the bucket has to clear
    // the cap, or a shorter serialisation would leave this testing nothing.
    const [, body] = [...vector.serializeBuckets(1)][0]!;
    expect(body.length).toBeGreaterThan(MAX_BUCKET_CHUNKS);

    // A good save first, so there is something to lose.
    await new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 400,
      vectorBuckets: 1,
    }).save();

    // save() funnels the failure through logFailure, so nothing throws out
    // here. What has to hold is that the live manifest still names a readable
    // bucket rather than an oversized one the loader will throw away.
    await new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 1,
      vectorBuckets: 1,
    }).save();

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.vector!.size).toBe(200);
  });
});

// A content hash cannot see an addressing change: same bytes, different home.
// These two cover that whole family — the bucket count and the chunk size are
// the two inputs that decide where a vector's bytes live.
describe("IndexPersistence vector layout changes", () => {
  let kv: ReturnType<typeof countingKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = countingKV();
  });
  afterEach(() => vi.useRealTimers());

  it("reclaims buckets stranded by a smaller bucket count", async () => {
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(40), {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    const wide = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    const widened = Object.keys(wide!.shards);
    // Needs keys that only the 8-bucket layout can produce.
    const beyondNarrow = widened.filter((key) => Number(key.slice(1)) >= 4);
    expect(beyondNarrow.length).toBeGreaterThan(0);

    await new IndexPersistence(kv as never, new SearchIndex(), seeded(40), {
      shardChars: 400,
      vectorBuckets: 4,
    }).save();

    // Every key the old layout owned and the new one cannot name must be gone.
    for (const bucketKey of beyondNarrow) {
      await expect(
        kv.get(
          VECTOR_BUCKET_SCOPE,
          chunkKey(bucketKey, wide!.shards[bucketKey].hash),
        ),
      ).resolves.toBeNull();
    }
    const narrow = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    expect(narrow!.buckets).toBe(4);
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.vector!.size).toBe(40);
  });

  it("survives a chunk-size change that leaves content identical", async () => {
    // Small chunks first, so buckets span several keys.
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(30), {
      shardChars: 60,
      vectorBuckets: 4,
    }).save();

    const wide = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    const multiChunk = Object.entries(wide!.shards).find(
      ([, entry]) => entry.chunks > 1,
    );
    expect(multiChunk).toBeDefined();
    const [shrinkingKey, wideEntry] = multiChunk!;

    // Same vectors, larger chunks. The bucket bodies are byte-identical, so the
    // content hash matches and a hash-only skip would write nothing at all —
    // while the manifest records the new, smaller chunk count. Load would then
    // read too few keys and drop every bucket.
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(30), {
      shardChars: 100_000,
      vectorBuckets: 4,
    }).save();

    // The bucket now needs fewer keys, so its old tail must be reclaimed
    // rather than left addressable-by-nobody.
    // Chunk 0 keeps its key: same bucket, same content hash, same index. Only
    // the tail is no longer addressed, and reclaiming it must not take chunk 0
    // with it.
    await expect(
      kv.get(VECTOR_BUCKET_SCOPE, chunkKey(shrinkingKey, wideEntry.hash, 0)),
    ).resolves.toEqual(expect.any(String));
    for (let i = 1; i < wideEntry.chunks; i++) {
      await expect(
        kv.get(VECTOR_BUCKET_SCOPE, chunkKey(shrinkingKey, wideEntry.hash, i)),
      ).resolves.toBeNull();
    }

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.vector!.size).toBe(30);
    expect(
      loaded.vector!.search(new Float32Array([7, 8, 9]))[0]?.obsId,
    ).toBe("obs_7");
  });
});

describe("IndexPersistence torn vector save", () => {
  let kv: ReturnType<typeof countingKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = countingKV();
  });
  afterEach(() => vi.useRealTimers());

  it("loses nothing when a save dies partway through writing buckets", async () => {
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(40), {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    const before = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(before.vector!.size).toBe(40);

    // A second save with changed content that dies after some bucket writes and
    // before the manifest publish. With in-place keys this would corrupt the
    // buckets the live manifest still names, load would drop them, and — since
    // rebuild is gated on BM25 being empty, never on the vector index — the
    // next save would serialise the absence and lose them for good.
    const changed = seeded(40);
    for (let i = 0; i < 40; i++) {
      changed.add(`obs_${i}`, "ses_1", new Float32Array([i + 99, i, i]));
    }
    let writes = 0;
    const dying = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === VECTOR_BUCKET_SCOPE && ++writes > 3) {
          throw new Error("engine died mid-save");
        }
        return kv.set(scope, key, data);
      },
    };
    await new IndexPersistence(dying as never, new SearchIndex(), changed, {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    // The old generation is still fully intact and loadable.
    const after = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(after.vector!.size).toBe(40);
    expect(
      after.vector!.search(new Float32Array([7, 8, 9]), 50)[0]?.obsId,
    ).toBe("obs_7");
  });

  it("resumes a reclaim that was published but never finished", async () => {
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(40), {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    // Save again with different content, failing every delete so the reclaim
    // list is published but never drained.
    const changed = seeded(40);
    changed.add("obs_extra", "ses_1", new Float32Array([5, 5, 5]));
    const undeletable = {
      ...kv,
      delete: async (): Promise<void> => {
        throw new Error("delete unavailable");
      },
    };
    await new IndexPersistence(undeletable as never, new SearchIndex(), changed, {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    const stalled = await kv.get<TestVectorBucketManifest & {
      reclaim?: Array<{ scope: string; key: string }>;
    }>(BM25_SCOPE, VECTOR_MANIFEST_KEY);
    expect(stalled!.reclaim!.length).toBeGreaterThan(0);
    const stranded = stalled!.reclaim!.map((t) => t.key);

    // A later healthy save must finish the job rather than orphan those keys.
    await new IndexPersistence(kv as never, new SearchIndex(), changed, {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    for (const key of stranded) {
      await expect(kv.get(VECTOR_BUCKET_SCOPE, key)).resolves.toBeNull();
    }
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.vector!.size).toBe(41);
  });
});

// A failed read is not an empty store, and a mid-save mutation is not a
// deletion. Both were measured to destroy data before these guards existed.
describe("IndexPersistence vector save/load hazards", () => {
  let kv: ReturnType<typeof countingKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = countingKV();
  });
  afterEach(() => vi.useRealTimers());

  async function loadedSize(): Promise<number> {
    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    return loaded.vector?.size ?? 0;
  }

  it("does not persist empty buckets when the index is cleared mid-save", async () => {
    const vector = seeded(60);
    // rebuildIndex() calls vectorIndex.clear() synchronously before its first
    // await, so a search-triggered rebuild lands between two bucket writes.
    let clearedAt = 0;
    const clearing = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === VECTOR_BUCKET_SCOPE && ++clearedAt === 2) vector.clear();
        return kv.set(scope, key, data);
      },
    };

    await new IndexPersistence(clearing as never, new SearchIndex(), vector, {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    // Reading the live Map lazily would serialise every later bucket as "[]",
    // hash it, publish it as truth, and reclaim the real content behind it.
    expect(await loadedSize()).toBe(60);
  });

  it("does not wipe the index when the manifest read fails at load", async () => {
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(60), {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    const blindKv = {
      ...kv,
      get: async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === BM25_SCOPE && key === VECTOR_MANIFEST_KEY) {
          throw new Error("manifest read timed out");
        }
        return kv.get(scope, key);
      },
    };
    // Same instance loads then saves, exactly as src/index.ts does.
    const persistence = new IndexPersistence(
      blindKv as never,
      new SearchIndex(),
      new VectorIndex(),
      { shardChars: 400, vectorBuckets: 8 },
    );
    await persistence.load();
    await persistence.save();

    expect(await loadedSize()).toBe(60);
  });

  it("does not delete a bucket whose chunk read failed at load", async () => {
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(60), {
      shardChars: 400,
      vectorBuckets: 8,
    }).save();

    const manifest = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    const [victim] = Object.keys(manifest!.shards);
    const victimChunk = chunkKey(victim, manifest!.shards[victim].hash, 0);

    const flakyKv = {
      ...kv,
      get: async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === VECTOR_BUCKET_SCOPE && key === victimChunk) {
          throw new Error("chunk read timed out");
        }
        return kv.get(scope, key);
      },
    };
    const persistence = new IndexPersistence(
      flakyKv as never,
      new SearchIndex(),
      new VectorIndex(),
      { shardChars: 400, vectorBuckets: 8 },
    );
    const partial = await persistence.load();
    expect(partial.vector!.size).toBeLessThan(60);

    // The blip must not be converted into a permanent delete.
    await persistence.save();
    expect(await loadedSize()).toBe(60);
  });
});

// Every other test in this file writes and reads through the same build, so the
// suite is self-consistent under ANY addressing change and cannot see one. This
// is the only cross-version fixture: it stands in for "a store written by an
// older layout" and pins the guard that forces a rewrite instead of a skip.
describe("IndexPersistence vector layout version", () => {
  let kv: ReturnType<typeof countingKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = countingKV();
  });
  afterEach(() => vi.useRealTimers());

  it("rewrites everything when the stored layout version differs", async () => {
    const vector = seeded(20);
    await new IndexPersistence(kv as never, new SearchIndex(), vector, {
      shardChars: 400,
    }).save();

    // Rewrite the manifest as an older layout while KEEPING every content hash,
    // then drop the payload keys. Same content, different addressing — exactly
    // the shape a content hash cannot detect on its own. A build that trusts the
    // hash alone skips every write and then cannot find its own data.
    const current = await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    await kv.set(BM25_SCOPE, VECTOR_MANIFEST_KEY, {
      ...current!,
      layout: current!.layout - 1,
    });
    for (const [bucketKey, entry] of Object.entries(current!.shards)) {
      for (let i = 0; i < entry.chunks; i++) {
        await kv.delete(VECTOR_BUCKET_SCOPE, chunkKey(bucketKey, entry.hash, i));
      }
    }

    await new IndexPersistence(kv as never, new SearchIndex(), seeded(20), {
      shardChars: 400,
    }).save();

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.vector!.size).toBe(20);
  });
});

// Stands in for a store written by a build whose contentHash was a different
// function: same bodies, same manifest shape, chunk keys still derived from the
// hash the manifest records — so every chunk is found and every hash fails.
async function rehashStoreUnder(
  kv: ReturnType<typeof countingKV>,
  algorithm: string,
): Promise<void> {
  const manifest = (await kv.get<TestVectorBucketManifest>(
    BM25_SCOPE,
    VECTOR_MANIFEST_KEY,
  ))!;
  const shards: TestVectorBucketManifest["shards"] = {};
  for (const [bucketKey, entry] of Object.entries(manifest.shards)) {
    const parts: string[] = [];
    for (let i = 0; i < entry.chunks; i++) {
      parts.push(
        (await kv.get<string>(
          VECTOR_BUCKET_SCOPE,
          chunkKey(bucketKey, entry.hash, i),
        ))!,
      );
    }
    const rehashed = createHash(algorithm)
      .update(parts.join(""))
      .digest("hex");
    for (let i = 0; i < entry.chunks; i++) {
      await kv.delete(VECTOR_BUCKET_SCOPE, chunkKey(bucketKey, entry.hash, i));
      await kv.set(
        VECTOR_BUCKET_SCOPE,
        chunkKey(bucketKey, rehashed, i),
        parts[i],
      );
    }
    shards[bucketKey] = { hash: rehashed, chunks: entry.chunks };
  }
  await kv.set(BM25_SCOPE, VECTOR_MANIFEST_KEY, { ...manifest, shards });
}

describe("IndexPersistence vector hash-format change", () => {
  let kv: ReturnType<typeof countingKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = countingKV();
  });
  afterEach(() => vi.useRealTimers());

  // Both hashes a bucket may legitimately carry. Whichever one this build
  // publishes, the other stands for a store written either side of the
  // migration — an older build's, or a newer build's after a rollback.
  for (const algorithm of ["sha1", "sha256"]) {
    it(`reads a bucket whose manifest records a ${algorithm} hash`, async () => {
      await new IndexPersistence(kv as never, new SearchIndex(), seeded(20), {
        shardChars: 400,
      }).save();

      await rehashStoreUnder(kv, algorithm);

      const loaded = await new IndexPersistence(
        kv as never,
        new SearchIndex(),
        null,
      ).load();
      expect(loaded.vector!.size).toBe(20);
      expect(loaded.vectorRejected).toBe(false);
    });
  }

  it("migrates a store off the previous bucket hash without re-embedding", async () => {
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(20), {
      shardChars: 400,
    }).save();

    // Stands in for a store this branch's earlier builds wrote: sha1 bucket
    // hashes, under the layout that published them.
    await rehashStoreUnder(kv, "sha1");
    const current = (await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    ))!;
    await kv.set(BM25_SCOPE, VECTOR_MANIFEST_KEY, {
      ...current,
      layout: current.layout - 1,
    });
    const stale = (await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    ))!;

    const live = new VectorIndex();
    const persistence = new IndexPersistence(
      kv as never,
      new SearchIndex(),
      live,
      { shardChars: 400 },
    );
    const loaded = await persistence.load();
    expect(loaded.vector!.size).toBe(20);
    live.restoreFrom(loaded.vector!);

    await persistence.save();

    const migrated = (await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    ))!;
    expect(migrated.layout).toBe(stale.layout + 1);
    for (const entry of Object.values(migrated.shards)) {
      // sha256 hex. sha1 would be 40.
      expect(entry.hash).toHaveLength(64);
    }
    for (const [bucketKey, entry] of Object.entries(stale.shards)) {
      for (let i = 0; i < entry.chunks; i++) {
        expect(
          await kv.get(VECTOR_BUCKET_SCOPE, chunkKey(bucketKey, entry.hash, i)),
        ).toBeNull();
      }
    }

    const reopened = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(reopened.vector!.size).toBe(20);
  });

  it("recovers when a hash change makes every bucket unverifiable", async () => {
    await new IndexPersistence(kv as never, new SearchIndex(), seeded(20), {
      shardChars: 400,
    }).save();

    await rehashStoreUnder(kv, "sha512");
    const alien = (await kv.get<TestVectorBucketManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    ))!;

    // Boot. The live index starts empty and only ever holds what load hands it.
    const live = new VectorIndex();
    const persistence = new IndexPersistence(
      kv as never,
      new SearchIndex(),
      live,
      { shardChars: 400 },
    );
    const loaded = await persistence.load();
    if (loaded.vector && loaded.vector.size > 0) live.restoreFrom(loaded.vector);
    expect(live.size).toBe(0);

    // A debounce flush can land long before any rebuild finishes. It must not
    // turn "could not verify" into a delete.
    await persistence.save();
    for (const [bucketKey, entry] of Object.entries(alien.shards)) {
      for (let i = 0; i < entry.chunks; i++) {
        expect(
          await kv.get(
            VECTOR_BUCKET_SCOPE,
            chunkKey(bucketKey, entry.hash, i),
          ),
        ).not.toBeNull();
      }
    }

    // Stands in for rebuildIndex(), which src/index.ts fires on this signal and
    // which refills the live index before scheduling a save. Nothing else ever
    // re-reads those buckets, so without the signal the vectors stay on disk
    // and unreadable for the life of the store.
    if (loaded.vectorRejected) live.restoreFrom(seeded(20));
    await persistence.save();

    const reopened = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(reopened.vector!.size).toBe(20);
  });
});
