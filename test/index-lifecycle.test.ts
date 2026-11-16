import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
  safeAudit: vi.fn(),
}));

import { getSearchIndex, indexMemory, registerSearchFunction, setHybridRanker, setEmbeddingProvider, setVectorIndex } from "../src/functions/search.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { registerConsolidateFunction } from "../src/functions/consolidate.js";
import { registerAutoForgetFunction } from "../src/functions/auto-forget.js";
import { registerDiagnosticsFunction } from "../src/functions/diagnostics.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerMeshFunction } from "../src/functions/mesh.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Memory, MemoryProvider, Session } from "../src/types.js";

function makeMockKV() {
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
    listKeys: async (scope: string): Promise<string[]> =>
      Array.from(store.get(scope)?.keys() ?? []),
  };
}

function makeMockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : (idOrInput as { payload: unknown }).payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

function makeProvider(title = "auth uses jwt"): MemoryProvider {
  return {
    name: "mock",
    compress: vi.fn().mockResolvedValue(
      `<memory>
        <type>pattern</type>
        <title>${title}</title>
        <content>synthesized content about the concept</content>
        <concepts><concept>auth</concept></concepts>
        <files><file>src/auth.ts</file></files>
        <strength>7</strength>
      </memory>`,
    ),
    embed: vi.fn().mockResolvedValue(new Float32Array(384)),
    embedBatch: vi.fn().mockResolvedValue([]),
    dimensions: 384,
    compressionModel: "mock-model",
  };
}

function makeObs(id: string, concept: string, importance = 7): CompressedObservation {
  return {
    id,
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "file_edit",
    title: `edit ${id}`,
    subtitle: "",
    facts: [],
    narrative: `narrative for ${id} about ${concept}`,
    concepts: [concept],
    files: ["src/x.ts"],
    importance,
  };
}

function makeMemory(id: string, title: string, isLatest = true): Memory {
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "pattern",
    title,
    content: `content for ${title}`,
    concepts: ["auth"],
    files: ["src/auth.ts"],
    sessionIds: ["ses_1"],
    strength: 6,
    version: 1,
    isLatest,
  };
}

function seedSessionWithObs(kv: ReturnType<typeof makeMockKV>, obs: CompressedObservation[]) {
  const session: Session = {
    id: "ses_1",
    project: "proj",
    cwd: "/srv/proj",
    startedAt: new Date().toISOString(),
    status: "completed",
    observationCount: obs.length,
  } as Session;
  return Promise.all([
    kv.set(KV.sessions, session.id, session),
    ...obs.map((o) => kv.set(KV.observations(session.id), o.id, o)),
  ]);
}

let vectors: VectorIndex;

function seedIndexed(memory: Memory) {
  getSearchIndex().add(memoryToObservation(memory), "memory");
  vectors.add(memory.id, memory.sessionIds[0] ?? "memory", new Float32Array([1, 0, 0]));
}

beforeEach(() => {
  getSearchIndex().clear();
  setHybridRanker(null);
  vectors = new VectorIndex();
  setVectorIndex(vectors);
  setEmbeddingProvider({
    name: "test", dimensions: 3,
    embed: async () => new Float32Array([0, 1, 0]),
    embedBatch: async (texts) => texts.map(() => new Float32Array([0, 1, 0])),
  });
});

afterEach(() => {
  getSearchIndex().clear();
  setHybridRanker(null);
  setVectorIndex(null);
  setEmbeddingProvider(null);
  vi.restoreAllMocks();
});

describe("mem::consolidate keeps the search index in step", () => {
  it("indexes the new memory and unindexes the superseded one", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerConsolidateFunction(sdk as never, kv as never, makeProvider() as never);

    const existing = makeMemory("mem_old", "auth uses jwt");
    await kv.set(KV.memories, existing.id, existing);
    seedIndexed(existing);
    await seedSessionWithObs(kv, [makeObs("o1", "auth"), makeObs("o2", "auth"), makeObs("o3", "auth")]);

    const result = await sdk.trigger("mem::consolidate", { minObservations: 1 });
    expect(result.consolidated).toBe(1);

    const memories = await kv.list<Memory>(KV.memories);
    const successor = memories.find((m) => m.isLatest && m.id !== existing.id);
    expect(successor).toBeDefined();

    expect(getSearchIndex().has(existing.id)).toBe(false);
    expect(vectors.has(existing.id)).toBe(false);
    expect(getSearchIndex().has(successor!.id)).toBe(true);
    expect(vectors.has(successor!.id)).toBe(true);
  });

  it("keeps the predecessor latest and indexed when the successor write fails", async () => {
    const sdk = makeMockSdk();
    const inner = makeMockKV();
    const existing = makeMemory("mem_old", "auth uses jwt");
    const kv = {
      ...inner,
      set: async <T>(scope: string, key: string, data: T) => {
        if (scope === KV.memories && key !== existing.id) {
          throw new Error("write failed");
        }
        return inner.set(scope, key, data);
      },
    };
    registerConsolidateFunction(sdk as never, kv as never, makeProvider() as never);

    await kv.set(KV.memories, existing.id, existing);
    seedIndexed(existing);
    await seedSessionWithObs(kv, [makeObs("o1", "auth"), makeObs("o2", "auth"), makeObs("o3", "auth")]);

    const result = await sdk.trigger("mem::consolidate", { minObservations: 1 });
    expect(result.consolidated).toBe(0);

    const predecessor = await kv.get<Memory>(KV.memories, existing.id);
    expect(predecessor?.isLatest).toBe(true);
    expect(getSearchIndex().has(existing.id)).toBe(true);
    expect(vectors.has(existing.id)).toBe(true);
  });

  it("rolls back the successor when the predecessor write fails", async () => {
    const sdk = makeMockSdk();
    const inner = makeMockKV();
    const existing = makeMemory("mem_old", "auth uses jwt");
    const kv = {
      ...inner,
      set: async <T>(scope: string, key: string, data: T) => {
        if (scope === KV.memories && key === existing.id && (data as Memory).isLatest === false) {
          throw new Error("write failed");
        }
        return inner.set(scope, key, data);
      },
    };
    registerConsolidateFunction(sdk as never, kv as never, makeProvider() as never);

    await kv.set(KV.memories, existing.id, existing);
    seedIndexed(existing);
    await seedSessionWithObs(kv, [makeObs("o1", "auth"), makeObs("o2", "auth"), makeObs("o3", "auth")]);

    const result = await sdk.trigger("mem::consolidate", { minObservations: 1 });
    expect(result.consolidated).toBe(0);

    const memories = await kv.list<Memory>(KV.memories);
    expect(memories.map((m) => m.id)).toEqual([existing.id]);
    expect(memories[0].isLatest).toBe(true);
    expect(getSearchIndex().has(existing.id)).toBe(true);
    expect(vectors.has(existing.id)).toBe(true);
    expect(getSearchIndex().size).toBe(1);
  });

  it("chains a second group with the same title onto the new successor", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerConsolidateFunction(sdk as never, kv as never, makeProvider() as never);

    const existing = makeMemory("mem_old", "auth uses jwt");
    await kv.set(KV.memories, existing.id, existing);
    seedIndexed(existing);
    await seedSessionWithObs(kv, [
      makeObs("a1", "auth"), makeObs("a2", "auth"), makeObs("a3", "auth"),
      makeObs("j1", "jwt"), makeObs("j2", "jwt"), makeObs("j3", "jwt"),
    ]);

    const result = await sdk.trigger("mem::consolidate", { minObservations: 1 });
    expect(result.consolidated).toBe(2);

    const memories = await kv.list<Memory>(KV.memories);
    const latest = memories.filter((m) => m.isLatest);
    expect(latest).toHaveLength(1);
    const mid = memories.find((m) => m.id === latest[0].parentId);
    expect(mid?.parentId).toBe(existing.id);
  });

  it("does not evolve an already-superseded memory with a matching title", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerConsolidateFunction(sdk as never, kv as never, makeProvider() as never);

    const dead = makeMemory("mem_dead", "auth uses jwt", false);
    const live = makeMemory("mem_live", "auth uses refresh tokens");
    await kv.set(KV.memories, dead.id, dead);
    await kv.set(KV.memories, live.id, live);
    await seedSessionWithObs(kv, [makeObs("o1", "auth"), makeObs("o2", "auth"), makeObs("o3", "auth")]);

    await sdk.trigger("mem::consolidate", { minObservations: 1 });

    const memories = await kv.list<Memory>(KV.memories);
    const created = memories.find((m) => m.id !== dead.id && m.id !== live.id);
    expect(created).toBeDefined();
    expect(created!.parentId).toBeUndefined();
    expect(created!.version).toBe(1);
  });
});

describe("mem::auto-forget unindexes the contradicted memory", () => {
  it("removes the older memory from the search index on supersede", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerAutoForgetFunction(sdk as never, kv as never);

    const shared = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const older = makeMemory("mem_old", "old title");
    older.content = shared;
    older.createdAt = "2020-01-01T00:00:00.000Z";
    const newer = makeMemory("mem_new", "new title");
    newer.content = shared;
    newer.createdAt = "2021-01-01T00:00:00.000Z";
    await kv.set(KV.memories, older.id, older);
    await kv.set(KV.memories, newer.id, newer);
    seedIndexed(older);
    seedIndexed(newer);

    const result = await sdk.trigger("mem::auto-forget", { dryRun: false });
    expect(result.contradictions.length).toBe(1);
    expect(getSearchIndex().has(older.id)).toBe(false);
    expect(vectors.has(older.id)).toBe(false);
    expect(getSearchIndex().has(newer.id)).toBe(true);
    expect(vectors.has(newer.id)).toBe(true);
  });
});

describe("mem::heal unindexes superseded memories it marks", () => {
  it("removes the healed memory from the search index", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerDiagnosticsFunction(sdk as never, kv as never);

    const dead = makeMemory("mem_dead", "old fact");
    dead.supersedes = [];
    const live = makeMemory("mem_live", "new fact");
    live.supersedes = [dead.id];
    await kv.set(KV.memories, dead.id, dead);
    await kv.set(KV.memories, live.id, live);
    seedIndexed(dead);

    const result = await sdk.trigger("mem::heal", { categories: ["memories"], dryRun: false });
    expect(result.fixed).toBeGreaterThan(0);
    expect((await kv.get<Memory>(KV.memories, dead.id))?.isLatest).toBe(false);
    expect(getSearchIndex().has(dead.id)).toBe(false);
    expect(vectors.has(dead.id)).toBe(false);
  });
});

describe("mem::import replace unindexes wiped records", () => {
  it("removes ghost observations and memories left by deleted rows", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerExportImportFunction(sdk as never, kv as never);

    const session: Session = {
      id: "ses_old",
      project: "proj",
      cwd: "/srv/proj",
      startedAt: new Date().toISOString(),
      status: "completed",
      observationCount: 1,
    } as Session;
    const obs = { ...makeObs("obs_ghost", "zebra"), sessionId: "ses_old" };
    const mem = makeMemory("mem_ghost", "zebra fact");
    await kv.set(KV.sessions, session.id, session);
    await kv.set(KV.observations("ses_old"), obs.id, obs);
    await kv.set(KV.memories, mem.id, mem);
    getSearchIndex().add(obs);
    vectors.add(obs.id, obs.sessionId, new Float32Array([1, 0, 0]));
    seedIndexed(mem);

    const result = await sdk.trigger("mem::import", {
      strategy: "replace",
      exportData: {
        version: "0.9.30",
        exportedAt: new Date().toISOString(),
        sessions: [],
        observations: {},
        memories: [],
        summaries: [],
      },
    });
    expect(result.success).toBe(true);

    expect(getSearchIndex().has(obs.id)).toBe(false);
    expect(vectors.has(obs.id)).toBe(false);
    expect(getSearchIndex().has(mem.id)).toBe(false);
    expect(vectors.has(mem.id)).toBe(false);
  });
});

describe("mem::search does not return superseded memories", () => {
  it("skips memories marked isLatest=false during enrich", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerSearchFunction(sdk as never, kv as never);

    const dead = makeMemory("mem_dead", "superseded auth fact");
    dead.isLatest = false;
    await kv.set(KV.memories, dead.id, dead);
    seedIndexed(dead);

    const result = await sdk.trigger("mem::search", { query: "superseded auth", limit: 10 });
    const hits = (result.results ?? []).filter((r: { observation?: { id?: string } }) => r.observation?.id === dead.id);
    expect(hits).toEqual([]);
  });

  it("skips memories marked isLatest=false through the hybrid ranker", async () => {
    const kv = makeMockKV();
    const dead = makeMemory("mem_dead", "superseded auth fact");
    dead.isLatest = false;
    await kv.set(KV.memories, dead.id, dead);
    seedIndexed(dead);

    const hybrid = new HybridSearch(getSearchIndex(), null, null, kv as never);
    const results = await hybrid.search("superseded auth", 10);
    expect(results.filter((r) => r.observation.id === dead.id)).toEqual([]);
  });

  it("backfills past superseded memories occupying top-ranked slots", async () => {
    const kv = makeMockKV();
    for (let i = 0; i < 20; i++) {
      const dead = makeMemory(`mem_dead_${i}`, `alpha alpha alpha dead ${i}`);
      dead.isLatest = false;
      dead.content = "alpha ".repeat(30);
      await kv.set(KV.memories, dead.id, dead);
      seedIndexed(dead);
    }
    const liveIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const obs = makeObs(`obs_live_${i}`, "alpha");
      liveIds.push(obs.id);
      await kv.set(KV.observations(obs.sessionId), obs.id, obs);
      getSearchIndex().add(obs);
    vectors.add(obs.id, obs.sessionId, new Float32Array([1, 0, 0]));
    }

    const hybrid = new HybridSearch(getSearchIndex(), null, null, kv as never);
    const results = await hybrid.search("alpha", 10);
    expect(results).toHaveLength(10);
    expect(results.map((r) => r.observation.id).sort()).toEqual(liveIds.sort());
  });
});

describe("mem::mesh-receive keeps the search index in step", () => {
  it("indexes a received latest memory and unindexes a received superseded one", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerMeshFunction(sdk as never, kv as never);

    const stale = makeMemory("mem_stale", "auth uses sessions");
    await kv.set(KV.memories, stale.id, stale);
    seedIndexed(stale);

    const later = new Date(Date.now() + 1000).toISOString();
    const fresh = makeMemory("mem_fresh", "auth uses jwt");
    const result = await sdk.trigger("mem::mesh-receive", {
      memories: [fresh, { ...stale, isLatest: false, updatedAt: later }],
    });

    expect(result.accepted).toBe(2);
    expect(getSearchIndex().has(fresh.id)).toBe(true);
    expect(getSearchIndex().has(stale.id)).toBe(false);
  });

  it("leaves the index alone when last-write-wins rejects the item", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerMeshFunction(sdk as never, kv as never);

    const current = makeMemory("mem_current", "auth uses jwt");
    await kv.set(KV.memories, current.id, current);
    seedIndexed(current);

    const older = new Date(Date.now() - 60_000).toISOString();
    await sdk.trigger("mem::mesh-receive", {
      memories: [{ ...current, isLatest: false, updatedAt: older }],
    });

    expect(getSearchIndex().has(current.id)).toBe(true);
  });
});


describe("delayed memory indexing", () => {
  it("keeps the latest mesh version searchable when an older superseded callback runs late", async () => {
    const kv = makeMockKV();
    const older = makeMemory("mem_race", "old auth", false);
    const latest = { ...older, title: "new auth", isLatest: true, updatedAt: "2099-01-01T00:00:00Z" };
    await kv.set(KV.memories, latest.id, latest);
    seedIndexed(latest);

    await indexMemory(kv as never, older);

    expect(getSearchIndex().has(latest.id)).toBe(true);
    expect(vectors.has(latest.id)).toBe(true);
    expect(getSearchIndex().search("new auth", 10).map((hit) => hit.obsId)).toContain(latest.id);
  });

  it("does not reindex a consolidation memory superseded before its callback runs", async () => {
    const kv = makeMockKV();
    const published = makeMemory("mem_published", "auth");
    await kv.set(KV.memories, published.id, { ...published, isLatest: false });

    await indexMemory(kv as never, published);

    expect(getSearchIndex().has(published.id)).toBe(false);
    expect(vectors.has(published.id)).toBe(false);
  });

  it("does not resurrect a deleted memory from a delayed callback", async () => {
    const kv = makeMockKV();
    await indexMemory(kv as never, makeMemory("mem_deleted", "auth"));
    expect(getSearchIndex().has("mem_deleted")).toBe(false);
    expect(vectors.has("mem_deleted")).toBe(false);
  });

  it.each(["mem:remember", "mem:memory:mem_race"])("guards the keyword read and add with %s", async (lock) => {
    const inner = makeMockKV();
    const memory = makeMemory("mem_race", "auth");
    await inner.set(KV.memories, memory.id, memory);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let firstRead = true;
    const kv = {
      ...inner,
      get: async <T>(scope: string, id: string): Promise<T | null> => {
        const record = await inner.get<T>(scope, id);
        if (firstRead && scope === KV.memories && id === memory.id) {
          firstRead = false;
          entered();
          await pending;
        }
        return record;
      },
    };
    const indexing = indexMemory(kv as never, memory);
    await started;
    const supersede = withKeyedLock(lock, async () => {
      await inner.set(KV.memories, memory.id, { ...memory, isLatest: false });
      getSearchIndex().remove(memory.id);
      vectors.remove(memory.id);
    });
    await Promise.resolve();
    await Promise.resolve();
    release();
    await Promise.all([indexing, supersede]);
    expect(getSearchIndex().has(memory.id)).toBe(false);
    expect(vectors.has(memory.id)).toBe(false);
  });

  it("lets a newer mesh write complete while the older embedding is pending", async () => {
    const sdk = makeMockSdk();
    const kv = makeMockKV();
    registerMeshFunction(sdk as never, kv as never);
    let entered!: () => void;
    let release!: (embedding: Float32Array) => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const pending = new Promise<Float32Array>((resolve) => { release = resolve; });
    setEmbeddingProvider({
      name: "controlled", dimensions: 3,
      embed: vi.fn().mockImplementationOnce(() => { entered(); return pending; })
        .mockResolvedValue(new Float32Array([0, 1, 0])),
      embedBatch: async () => [],
    });
    const older = makeMemory("mem_race", "old auth");
    const first = sdk.trigger("mem::mesh-receive", { memories: [older] });
    await started;
    try {
      await sdk.trigger("mem::mesh-receive", {
        memories: [{ ...older, title: "new auth", updatedAt: "2099-01-01T00:00:00Z" }],
      });
    } finally {
      release(new Float32Array([1, 0, 0]));
      await first;
    }
    expect(vectors.get(older.id)?.embedding).toEqual(new Float32Array([0, 1, 0]));
    expect(getSearchIndex().search("new auth", 10).map((hit) => hit.obsId)).toContain(older.id);
  });
});
