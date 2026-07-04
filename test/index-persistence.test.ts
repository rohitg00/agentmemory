import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import type { CompressedObservation } from "../src/types.js";

const BM25_SCOPE = "mem:index:bm25";
const BM25_LEGACY_KEY = "data";
const BM25_MANIFEST_KEY = "data:manifest";
const VECTOR_LEGACY_KEY = "vectors";
const VECTOR_MANIFEST_KEY = "vectors:manifest";

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

    const manifest = await kv.get<TestIndexShardManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    expect(manifest).not.toBeNull();
    expect(manifest!.generation).toBe("gen_vector");
    expect(manifest!.shards.length).toBeGreaterThan(1);
    expect(manifest!.shards[0].scope).toContain(":gen_vector:");
    await expect(kv.get(BM25_SCOPE, VECTOR_LEGACY_KEY)).resolves.toBeNull();
    await expect(
      kv.get(manifest!.shards[0].scope, manifest!.shards[0].key),
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

    const vectorManifest = await kv.get<TestIndexShardManifest>(
      BM25_SCOPE,
      VECTOR_MANIFEST_KEY,
    );
    expect(vectorManifest).not.toBeNull();
    expect(vectorManifest!.generation).toBe("gen_empty");
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
