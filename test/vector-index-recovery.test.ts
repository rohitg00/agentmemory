import { describe, expect, it, vi } from "vitest";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { recoverPersistedVectorIndex } from "../src/state/vector-index-recovery.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
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

const paths = {
  configDir: "/srv/agent/.agentmemory",
  envFile: "/srv/agent/.agentmemory/.env",
  envFileExists: () => false,
};

describe("recoverPersistedVectorIndex", () => {
  it("persists an empty vector snapshot when stale dimensions are dropped", async () => {
    const kv = mockKV();
    const staleVector = new VectorIndex();
    staleVector.add("obs_stale", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    await new IndexPersistence(kv as never, new SearchIndex(), staleVector, {
      createGeneration: () => "stale",
    }).save();

    const activeVector = new VectorIndex();
    const persistence = new IndexPersistence(
      kv as never,
      new SearchIndex(),
      activeVector,
      { createGeneration: () => "cleared" },
    );
    const loaded = await persistence.load();

    const result = await recoverPersistedVectorIndex({
      persistedIndex: loaded.vector!,
      activeIndex: activeVector,
      expectedDimensions: 4,
      providerName: "test-4d",
      dropStale: true,
      persistence,
      paths,
      warn: vi.fn(),
    });

    expect(result).toBe("dropped");
    expect((await persistence.load()).vector?.size).toBe(0);
  });

  it("fails startup when the cleared vector snapshot cannot be persisted", async () => {
    const kv = mockKV();
    const staleVector = new VectorIndex();
    staleVector.add("obs_stale", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    await new IndexPersistence(kv as never, new SearchIndex(), staleVector, {
      createGeneration: () => "stale",
    }).save();

    const persistenceError = new Error("state unavailable");
    const failingKv = {
      ...kv,
      set: vi.fn(async () => {
        throw persistenceError;
      }),
    };
    const persistence = new IndexPersistence(
      failingKv as never,
      new SearchIndex(),
      new VectorIndex(),
    );
    const loaded = await persistence.load();
    const warn = vi.fn();

    await expect(
      recoverPersistedVectorIndex({
        persistedIndex: loaded.vector!,
        activeIndex: new VectorIndex(),
        expectedDimensions: 4,
        providerName: "test-4d",
        dropStale: true,
        persistence,
        paths,
        warn,
      }),
    ).rejects.toThrow("state unavailable");
    expect(warn).toHaveBeenLastCalledWith(
      "[agentmemory] Failed to persist cleared vector index; startup remains blocked:",
      persistenceError,
    );
  });

  it("identifies the exact config and env paths in recovery guidance", async () => {
    const persistedIndex = new VectorIndex();
    persistedIndex.add(
      "obs_stale",
      "ses_1",
      new Float32Array([0.1, 0.2, 0.3]),
    );

    const recovery = recoverPersistedVectorIndex({
      persistedIndex,
      activeIndex: new VectorIndex(),
      expectedDimensions: 4,
      providerName: "test-4d",
      dropStale: false,
      persistence: { save: vi.fn() },
      paths,
    });

    await expect(recovery).rejects.toThrow(
      "config directory: /srv/agent/.agentmemory",
    );
    await expect(recovery).rejects.toThrow(
      "env file: /srv/agent/.agentmemory/.env (exists: false)",
    );
    await expect(recovery).rejects.toThrow(
      "Add AGENTMEMORY_DROP_STALE_INDEX=true to /srv/agent/.agentmemory/.env",
    );
    await expect(recovery).rejects.not.toThrow("echo ");
  });
});
