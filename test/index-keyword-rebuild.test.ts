import { describe, it, expect, afterEach } from "vitest";
import {
  backfillVectors,
  getSearchIndex,
  isMemoryIndexReady,
  rebuildKeywordIndex,
  setEmbeddingProvider,
  setIndexPersistence,
  setVectorIndex,
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

describe("rebuildKeywordIndex", () => {
  afterEach(() => {
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

  it("queues every missing document when no vector state was persisted, and none when storage was unavailable", async () => {
    const kv = mockKV();
    seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
    setVectorIndex(new VectorIndex());
    setEmbeddingProvider(stubProvider());

    const fresh = await rebuildKeywordIndex(kv as never, null);
    expect(fresh.vectorJobs.map((j) => j.id).sort()).toEqual(["mem_1", "obs_0", "obs_1", "obs_2"]);

    const unavailable = await rebuildKeywordIndex(kv as never, undefined);
    expect(unavailable.vectorJobs).toEqual([]);
  });

  it("backfills queued vectors in batches and schedules a save", async () => {
    const kv = mockKV();
    seed(kv, 1, 3, () => "2026-09-01T00:00:00.000Z");
    const vector = new VectorIndex();
    setVectorIndex(vector);
    setEmbeddingProvider(stubProvider());
    let scheduled = 0;
    setIndexPersistence({ scheduleSave: () => void scheduled++, save: async () => {} });

    const { vectorJobs } = await rebuildKeywordIndex(kv as never, null);
    const added = await backfillVectors(vectorJobs);

    expect(added).toBe(4);
    expect(vector.size).toBe(4);
    expect(scheduled).toBe(1);
  });
});
