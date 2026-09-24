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

  it("reclaims the previous generation when the previous manifest read fails (#1115)", async () => {
    const previous = makeBm25("obs_old", "alpha previous snapshot");
    await new IndexPersistence(kv as never, previous, null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();
    const oldShardScope = "mem:index:bm25:bm25:gen_old:00000";
    await expect(kv.get(oldShardScope, "data")).resolves.not.toBeNull();

    // The manifest read that opens saveShardedIndex times out. It used to be
    // swallowed into `previous = null`, which skipped the cleanup guard and
    // stranded gen_old's shards with nothing left to ever revisit them.
    const readFailsKv = {
      ...kv,
      get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === BM25_SCOPE && key === BM25_MANIFEST_KEY) {
          throw new Error("Invocation timeout after 180000ms: state::get");
        }
        return kv.get<T>(scope, key);
      }),
    };

    const next = makeBm25("obs_new", "bravo new snapshot");
    await new IndexPersistence(readFailsKv as never, next, null, {
      shardChars: 80,
      createGeneration: () => "gen_new",
    }).save();

    const manifest = await getBm25Manifest(kv);
    expect(manifest.generation).toBe("gen_new");
    await expect(kv.get(oldShardScope, "data")).resolves.toBeNull();
  });

  it("reclaims a generation stranded by a failed cleanup on the next load (#1115)", async () => {
    const previous = makeBm25("obs_old", "alpha previous snapshot");
    await new IndexPersistence(kv as never, previous, null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();
    const oldShardScope = "mem:index:bm25:bm25:gen_old:00000";

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

    // Cleanup failed, so gen_old is still on disk. Nothing in the save path
    // will revisit it — a later save only ever inspects its own predecessor.
    await expect(kv.get(oldShardScope, "data")).resolves.not.toBeNull();

    const loaded = await new IndexPersistence(
      kv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25!.search("bravo").length).toBe(1);
    await expect(kv.get(oldShardScope, "data")).resolves.toBeNull();
  });

  it("reclaims the previous vector generation when the vector manifest read fails (#1115)", async () => {
    await new IndexPersistence(
      kv as never,
      makeBm25("obs_old", "alpha previous snapshot"),
      makeVector("obs_old"),
      { shardChars: 80, createGeneration: () => "gen_old" },
    ).save();
    const oldVectorScope = "mem:index:bm25:vectors:gen_old:00000";
    await expect(kv.get(oldVectorScope, "data")).resolves.not.toBeNull();

    const readFailsKv = {
      ...kv,
      get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === BM25_SCOPE && key === VECTOR_MANIFEST_KEY) {
          throw new Error("Invocation timeout after 180000ms: state::get");
        }
        return kv.get<T>(scope, key);
      }),
    };

    await new IndexPersistence(
      readFailsKv as never,
      makeBm25("obs_new", "bravo new snapshot"),
      makeVector("obs_new"),
      { shardChars: 80, createGeneration: () => "gen_new" },
    ).save();

    await expect(kv.get(oldVectorScope, "data")).resolves.toBeNull();
  });

  it("leaves a generation recorded after the live one untouched on load (#1115)", async () => {
    await new IndexPersistence(
      kv as never,
      makeBm25("obs_old", "alpha previous snapshot"),
      null,
      { shardChars: 80, createGeneration: () => "gen_live" },
    ).save();

    // A concurrent save has recorded its generation and is mid-write, but has
    // not published its manifest yet. setIndexPersistence runs before load()
    // in src/index.ts, so a request arriving during boot produces exactly this.
    const inflightScope = "mem:index:bm25:bm25:gen_inflight:00000";
    await kv.set(inflightScope, "data", "partial shard");
    const gcKey = `${BM25_MANIFEST_KEY}:gc`;
    const ledger = await kv.get<{
      v: 1;
      generations: Array<{
        generation: string;
        shards: Array<{ scope: string; key: string }>;
      }>;
    }>(BM25_SCOPE, gcKey);
    ledger!.generations.push({
      generation: "gen_inflight",
      shards: [{ scope: inflightScope, key: "data" }],
    });
    await kv.set(BM25_SCOPE, gcKey, ledger);

    await new IndexPersistence(kv as never, new SearchIndex(), null).load();

    // Deleting it would leave the in-flight save publishing a manifest whose
    // shards are already gone, which fails closed on the next load.
    await expect(kv.get(inflightScope, "data")).resolves.toBe("partial shard");
  });

  it("reclaims a pre-ledger manifest that carries no generation (#1115)", async () => {
    const legacyScope = "mem:index:bm25:bm25:gen_legacy:00000";
    await kv.set(legacyScope, "data", "legacy shard");
    await kv.set(BM25_SCOPE, BM25_MANIFEST_KEY, {
      v: 1,
      shards: [{ scope: legacyScope, key: "data", chars: 12 }],
      chars: 12,
    });

    await new IndexPersistence(
      kv as never,
      makeBm25("obs_new", "bravo new snapshot"),
      null,
      { shardChars: 80, createGeneration: () => "gen_new" },
    ).save();

    await expect(kv.get(legacyScope, "data")).resolves.toBeNull();
  });

  it("keeps a published manifest whole when two saves overlap (#1115)", async () => {
    // scheduleSave fires save() unawaited from a timer while flushIndexSave
    // awaits save() on every delete path, so two saves on ONE instance is the
    // normal shape, not a contrivance. Without the queue, whichever published
    // second reclaimed the other's shards and left it naming data already gone.
    vi.useRealTimers();
    const store = new Map<string, Map<string, unknown>>();
    const slowKv = {
      get: async <T>(scope: string, key: string): Promise<T | null> =>
        (store.get(scope)?.get(key) as T) ?? null,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        // Stall one of the first generation's shard writes so the second save
        // overtakes it.
        if (scope.includes(":gen_0:") && scope.endsWith("00005")) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (!store.has(scope)) store.set(scope, new Map());
        store.get(scope)!.set(key, data);
        return data;
      },
      delete: async (scope: string, key: string): Promise<void> => {
        store.get(scope)?.delete(key);
      },
      list: async <T>(scope: string): Promise<T[]> =>
        Array.from((store.get(scope)?.values() ?? []) as Iterable<T>),
    };

    const bm25 = new SearchIndex();
    for (let i = 0; i < 30; i++) {
      bm25.add(
        makeObs({ id: `obs_${i}`, title: `lorem ipsum dolor sit amet ${i}` }),
      );
    }
    let generation = 0;
    const persistence = new IndexPersistence(slowKv as never, bm25, null, {
      shardChars: 400,
      createGeneration: () => `gen_${generation++}`,
    });

    // Let the first save get into its shard writes before the second starts,
    // so the second is the one that publishes.
    const first = persistence.save();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = persistence.save();
    await Promise.all([first, second]);

    const manifest = await slowKv.get<TestIndexShardManifest>(
      BM25_SCOPE,
      BM25_MANIFEST_KEY,
    );
    const missing: string[] = [];
    for (const shard of manifest!.shards) {
      if ((await slowKv.get(shard.scope, shard.key)) === null) {
        missing.push(shard.scope);
      }
    }
    expect(missing).toEqual([]);

    const loaded = await new IndexPersistence(
      slowKv as never,
      new SearchIndex(),
      null,
    ).load();
    expect(loaded.bm25).not.toBeNull();
  });

  it("still persists the index when the gc ledger is unreadable (#1115)", async () => {
    // state::get timing out is the condition this bug appears under. Aborting
    // the save there would stop persisting entirely, which is worse than the
    // leak: a lost BM25 index costs a full-corpus rebuild.
    const failingKv = {
      ...kv,
      get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === BM25_SCOPE && key === `${BM25_MANIFEST_KEY}:gc`) {
          throw new Error("Invocation timeout after 180000ms: state::get");
        }
        return kv.get<T>(scope, key);
      }),
    };

    await new IndexPersistence(
      failingKv as never,
      makeBm25("obs_new", "bravo new snapshot"),
      null,
      { shardChars: 80, createGeneration: () => "gen_new" },
    ).save();

    const manifest = await getBm25Manifest(kv);
    expect(manifest.generation).toBe("gen_new");
    await expect(
      kv.get(manifest.shards[0].scope, manifest.shards[0].key),
    ).resolves.not.toBeNull();
  });

  it("still persists when the gc ledger holds a malformed entry (#1115)", async () => {
    // A null entry used to throw a TypeError out of saveShardedIndex before any
    // shard write, leaving one throttled log line per 60s while BM25 silently
    // stopped persisting for good.
    await kv.set(BM25_SCOPE, `${BM25_MANIFEST_KEY}:gc`, {
      v: 1,
      generations: [null],
    });

    await new IndexPersistence(
      kv as never,
      makeBm25("obs_new", "bravo new snapshot"),
      null,
      { shardChars: 80, createGeneration: () => "gen_new" },
    ).save();

    const manifest = await getBm25Manifest(kv);
    expect(manifest.generation).toBe("gen_new");
    await expect(
      kv.get(manifest.shards[0].scope, manifest.shards[0].key),
    ).resolves.not.toBeNull();
  });

  it("still reclaims when the gc ledger holds a malformed entry (#1115)", async () => {
    // Publishing is not enough. A malformed entry that silently disabled
    // reclaim would leak a generation every cycle while this test stayed green.
    await new IndexPersistence(kv as never, makeBm25("obs_old", "alpha"), null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();
    const oldShardScope = "mem:index:bm25:bm25:gen_old:00000";

    const gcKey = `${BM25_MANIFEST_KEY}:gc`;
    const ledger = await kv.get<{ v: 1; generations: unknown[] }>(
      BM25_SCOPE,
      gcKey,
    );
    ledger!.generations.unshift(null);
    await kv.set(BM25_SCOPE, gcKey, ledger);

    await new IndexPersistence(kv as never, makeBm25("obs_new", "bravo"), null, {
      shardChars: 80,
      createGeneration: () => "gen_new",
    }).save();

    await expect(kv.get(oldShardScope, "data")).resolves.toBeNull();
  });

  it("falls back to previous-generation cleanup when the ledger is unusable (#1115)", async () => {
    // Measured regression guard: with no fallback, an unusable ledger leaked
    // one generation per cycle — strictly worse than the code this replaced,
    // which always had this path. Without this test the `else if` can be
    // deleted with the whole suite green.
    await new IndexPersistence(kv as never, makeBm25("obs_old", "alpha"), null, {
      shardChars: 80,
      createGeneration: () => "gen_old",
    }).save();
    const oldShardScope = "mem:index:bm25:bm25:gen_old:00000";
    await expect(kv.get(oldShardScope, "data")).resolves.not.toBeNull();

    // Ledger read fails, manifest read succeeds. Both are state::get with
    // independent timeouts, so this split is ordinary, not contrived.
    const ledgerFailsKv = {
      ...kv,
      get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
        if (scope === BM25_SCOPE && key === `${BM25_MANIFEST_KEY}:gc`) {
          throw new Error("Invocation timeout after 180000ms: state::get");
        }
        return kv.get<T>(scope, key);
      }),
    };

    await new IndexPersistence(
      ledgerFailsKv as never,
      makeBm25("obs_new", "bravo"),
      null,
      { shardChars: 80, createGeneration: () => "gen_new" },
    ).save();

    const manifest = await getBm25Manifest(kv);
    expect(manifest.generation).toBe("gen_new");
    await expect(kv.get(oldShardScope, "data")).resolves.toBeNull();
  });

  it("keeps the ledger entry when a rollback delete fails (#1115)", async () => {
    // Shards that survived their rollback delete must keep the entry that
    // names them, or nothing can ever reclaim them.
    let shardWrites = 0;
    const failingKv = {
      ...kv,
      set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope.includes(":gen_new:")) {
          shardWrites += 1;
          if (shardWrites === 2) throw new Error("shard write failed");
        }
        return kv.set(scope, key, data);
      }),
      delete: vi.fn(async () => {
        throw new Error("rollback delete failed");
      }),
    };

    await new IndexPersistence(
      failingKv as never,
      makeBm25("obs_new", "bravo new snapshot"),
      null,
      { shardChars: 80, createGeneration: () => "gen_new" },
    ).save();

    const ledger = await kv.get<{
      v: 1;
      generations: Array<{ generation: string }>;
    }>(BM25_SCOPE, `${BM25_MANIFEST_KEY}:gc`);
    expect(ledger!.generations.map((entry) => entry.generation)).toContain(
      "gen_new",
    );
  });

  it("refuses to overwrite a gc ledger it does not recognise (#1115)", async () => {
    const gcKey = `${BM25_MANIFEST_KEY}:gc`;
    const future = { v: 2, generations: [], writtenByANewerBuild: true };
    await kv.set(BM25_SCOPE, gcKey, future);

    await new IndexPersistence(
      kv as never,
      makeBm25("obs_new", "bravo new snapshot"),
      null,
      { shardChars: 80, createGeneration: () => "gen_new" },
    ).save();

    // Rewriting it as a v1 ledger would drop every generation it tracked.
    await expect(kv.get(BM25_SCOPE, gcKey)).resolves.toEqual(future);
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

describe("IndexPersistence save coalescing", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = mockKV();
  });
  afterEach(() => vi.useRealTimers());

  it("does not queue a second identical save behind one that has not started", async () => {
    // flushIndexSave awaits save() on every delete path. Serialising every one
    // of them means a delete waits out every save ahead of it, which is fine
    // when a save takes a second and is an outage when saves are timing out at
    // 180s. A save that is queued but not yet running will serialise the index
    // as it stands when it runs, so it already covers these callers.
    let manifestWrites = 0;
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((r) => {
      releaseFirst = r;
    });
    let started = 0;
    const slowKv = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === BM25_SCOPE && key === BM25_MANIFEST_KEY) {
          manifestWrites++;
          if (++started === 1) await firstStarted;
        }
        return kv.set(scope, key, data);
      },
    };

    const persistence = new IndexPersistence(
      slowKv as never,
      makeBm25("obs_1", "alpha"),
      null,
      { shardChars: 400 },
    );

    const first = persistence.save();
    // Five more delete-path flushes arrive while the first is still running.
    const rest = Array.from({ length: 5 }, () => persistence.save());
    releaseFirst();
    await Promise.all([first, ...rest]);

    // One running save plus at most one queued behind it covers all six
    // callers. Six serialised saves would be the regression.
    expect(manifestWrites).toBeLessThanOrEqual(2);
  });
});
