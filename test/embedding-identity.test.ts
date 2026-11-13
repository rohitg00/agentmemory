import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ensureEmbeddingIdentity } from "../src/state/embedding-identity.js";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { LocalEmbeddingProvider } from "../src/providers/embedding/local.js";
import { withDimensionGuard } from "../src/providers/embedding/index.js";
import { KV } from "../src/state/schema.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
      return value;
    },
    delete: async (scope: string, key: string) => { store.get(scope)?.delete(key); },
    list: async <T>(scope: string): Promise<T[]> => [...(store.get(scope)?.values() ?? [])] as T[],
    listKeys: async (scope: string) => [...(store.get(scope)?.keys() ?? [])],
    listGroups: async () => [...store].filter(([, rows]) => rows.size > 0).map(([scope]) => scope),
  };
}

beforeEach(() => {
  for (const key of ["MODEL", "DIMENSIONS", "POOLING", "DTYPE", "BATCH_SIZE", "QUERY_PREFIX", "DOCUMENT_PREFIX", "CACHE_DIR"]) {
    vi.stubEnv(`LOCAL_EMBEDDING_${key}`, undefined);
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("persisted embedding identity", () => {
  it("restores a checkpoint and pending vectors when configuration matches", async () => {
    const kv = mockKV();
    const p = withDimensionGuard(new LocalEmbeddingProvider());
    await ensureEmbeddingIdentity(kv as never, p, false);
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector);
    vector.add("obs_saved", "ses", new Float32Array(384).fill(1));
    await persistence.save();
    vector.add("obs_pending", "ses", new Float32Array(384).fill(1));
    await persistence.flushPendingLog();
    persistence.stop();
    await ensureEmbeddingIdentity(kv as never, p, false);
    const restored = new VectorIndex();
    const next = new IndexPersistence(kv as never, restored);
    restored.restoreFrom((await next.load()).vector!);
    await next.replayPendingLog(384);
    next.stop();
    expect(restored.has("obs_saved")).toBe(true);
    expect(restored.has("obs_pending")).toBe(true);
  });

  it.each([["MODEL", "other/model"], ["POOLING", "cls"], ["DTYPE", "fp32"], ["DOCUMENT_PREFIX", "passage: "], ["CACHE_DIR", "other-cache"]])(
    "refuses same-dimension vectors after changing %s without deleting them", async (key, value) => {
      const kv = mockKV();
      await ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), false);
      await kv.set(KV.bm25Index, "vectors:meta", { v: 3, bucketCount: 0 });
      vi.stubEnv(`LOCAL_EMBEDDING_${key}`, value);
      await expect(ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), false)).rejects.toThrow("Refusing to restore");
      expect(await kv.get(KV.bm25Index, "vectors:meta")).not.toBeNull();
    },
  );

  it("does not rebuild document vectors for query-prefix or batch changes", async () => {
    const kv = mockKV();
    await ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), false);
    await kv.set(KV.bm25Index, "vectors:meta", { v: 3 });
    vi.stubEnv("LOCAL_EMBEDDING_QUERY_PREFIX", "query: ");
    vi.stubEnv("LOCAL_EMBEDDING_BATCH_SIZE", "2");
    await expect(ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), false)).resolves.toBeUndefined();
  });

  it.each(["vectors", "vectors:manifest", "vectors:meta", "pending"])("rejects unidentified %s", async (key) => {
    const kv = mockKV();
    await kv.set(key === "pending" ? KV.vectorPendingLog : KV.bm25Index, key, {});
    await expect(ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), false)).rejects.toThrow("unknown");
  });

  it("explicitly drops only derived vectors and requests a full backfill before adopting the identity", async () => {
    const kv = mockKV();
    for (const key of ["vectors", "vectors:manifest", "vectors:meta"]) await kv.set(KV.bm25Index, key, {});
    await kv.set(`${KV.bm25Index}:vec:0000`, "obs", {});
    await kv.set(`${KV.bm25Index}:vectors:legacy:00000`, "data", "legacy");
    await kv.set(KV.vectorPendingLog, "obs", {});
    await kv.set(KV.memories, "mem_keep", "memory");
    await kv.set(KV.observations("ses"), "obs_keep", "observation");
    await ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), true);
    expect(await kv.listKeys(KV.vectorPendingLog)).toEqual([]);
    expect(await kv.listKeys(`${KV.bm25Index}:vec:0000`)).toEqual([]);
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toBeNull();
    expect(await kv.get(KV.bm25Index, "vectors:backfill")).toEqual({ v: 2, since: null });
    expect(await kv.get(KV.memories, "mem_keep")).toBe("memory");
    expect(await kv.get(KV.observations("ses"), "obs_keep")).toBe("observation");
    await expect(ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), false)).resolves.toBeUndefined();
  });

  it("leaves identity unclaimed when deletion fails so a restart cannot load partially stale vectors", async () => {
    const kv = mockKV();
    await kv.set(KV.vectorPendingLog, "obs", {});
    kv.delete = vi.fn().mockRejectedValue(new Error("disk unavailable"));
    await expect(ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), true)).rejects.toThrow("disk unavailable");
    await expect(ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), false)).rejects.toThrow("unknown");
  });

  it("overlaps independent deletions with bounded concurrency and adopts identity only after they finish", async () => {
    const kv = mockKV();
    for (let i = 0; i < 70; i++) await kv.set(KV.vectorPendingLog, `obs_${i}`, {});
    const remove = kv.delete;
    let active = 0;
    let peak = 0;
    kv.delete = async (scope, key) => {
      active++; peak = Math.max(peak, active);
      expect(await kv.get(KV.bm25Index, "vectors:embedding-identity")).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 1));
      await remove(scope, key);
      active--;
    };
    await ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), true);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(32);
    expect(active).toBe(0);
    expect(await kv.listKeys(KV.vectorPendingLog)).toEqual([]);
    expect(await kv.get(KV.bm25Index, "vectors:embedding-identity")).not.toBeNull();
  });

  it("settles an in-flight deletion batch before surfacing an error", async () => {
    const kv = mockKV();
    for (let i = 0; i < 40; i++) await kv.set(KV.vectorPendingLog, `obs_${i}`, {});
    const remove = kv.delete;
    let active = 0;
    kv.delete = async (scope, key) => {
      active++;
      try {
        if (key === "obs_0") throw new Error("delete failed");
        await new Promise((resolve) => setTimeout(resolve, 1));
        await remove(scope, key);
      } finally { active--; }
    };
    await expect(ensureEmbeddingIdentity(kv as never, new LocalEmbeddingProvider(), true)).rejects.toThrow("delete failed");
    expect(active).toBe(0);
    expect(await kv.get(KV.bm25Index, "vectors:embedding-identity")).toBeNull();
    expect(await kv.get(KV.vectorPendingLog, "obs_39")).not.toBeNull();
  });
});
