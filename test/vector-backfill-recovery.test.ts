import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { backfillVectorBacklog, getPendingVectorBackfillCount, getSearchIndex, indexRecords, rebuildKeywordIndex, setEmbeddingProvider, setIndexPersistence, setVectorIndex, vectorIndexRemove } from "../src/functions/search.js";
import type { CompressedObservation } from "../src/types.js";
import { KV } from "../src/state/schema.js";

function storage() {
  const rows = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string) => (rows.get(scope)?.get(key) ?? null) as T | null,
    set: async <T>(scope: string, key: string, value: T) => {
      if (!rows.has(scope)) rows.set(scope, new Map());
      rows.get(scope)!.set(key, structuredClone(value));
      return value;
    },
    delete: async (scope: string, key: string) => { rows.get(scope)?.delete(key); },
    list: async <T>(scope: string) => [...(rows.get(scope)?.values() ?? [])] as T[],
  };
}
const provider = (dimensions = 3) => ({
  name: "fixture", dimensions,
  embed: vi.fn(async () => new Float32Array(dimensions).fill(1)),
  embedBatch: vi.fn(async (texts: string[]) => texts.map(() => new Float32Array(dimensions).fill(1))),
});
async function seed(kv: ReturnType<typeof storage>, count = 3) {
  await kv.set(KV.sessions, "session", { id: "session", project: "fixture", observationCount: count });
  for (let i = 0; i < count; i++) await kv.set(KV.observations("session"), `obs_${i}`, {
    id: `obs_${i}`, sessionId: "session", timestamp: "2020-01-01T00:00:00.000Z", type: "discovery",
    title: `fixture ${i}`, narrative: `record ${i}`, facts: [], concepts: [], files: [], importance: 5,
  });
}
const active: IndexPersistence[] = [];
async function boot(kv: ReturnType<typeof storage>, embedding = provider()) {
  getSearchIndex().clear();
  const vector = new VectorIndex();
  const persistence = new IndexPersistence(kv as never, vector);
  active.push(persistence);
  setVectorIndex(vector); setEmbeddingProvider(embedding); setIndexPersistence(persistence);
  const loaded = await persistence.load();
  if (loaded.vector) vector.restoreFrom(loaded.vector);
  await persistence.replayPendingLog(embedding.dimensions);
  return { vector, persistence, loaded, embedding };
}
afterEach(() => {
  active.splice(0).forEach((p) => p.stop());
  vi.unstubAllEnvs(); getSearchIndex().clear(); setVectorIndex(null); setEmbeddingProvider(null); setIndexPersistence(null);
});

describe("vector recovery across checkpoints", () => {
  it("retains a whole-store backlog beyond the cap and resumes old rows after a checkpoint and restart", async () => {
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL", "all");
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL_MAX", "2");
    const kv = storage(); await seed(kv);
    const first = await boot(kv);
    await first.persistence.markBackfillSince(null);
    const plan = await first.persistence.readBackfillMarker();
    expect(plan).toBeNull();
    const scan = await rebuildKeywordIndex(kv as never, plan);
    const result = await backfillVectorBacklog(scan.vectorJobs, { pauseMs: 0, remainingAfter: scan.fullBackfillPending });
    expect(result).toMatchObject({ added: 2, remaining: 1, complete: false });
    expect(getPendingVectorBackfillCount()).toBe(1);
    first.persistence.stop();
    const second = await boot(kv);
    expect(second.vector.size).toBe(2);
    const resumed = await rebuildKeywordIndex(kv as never, await second.persistence.readBackfillMarker());
    expect(resumed.vectorJobs.map((job) => job.id)).toEqual(["obs_2"]);
    expect(await backfillVectorBacklog(resumed.vectorJobs, { pauseMs: 0 })).toMatchObject({ added: 1, remaining: 0, complete: true });
    expect(second.vector.size).toBe(3);
  });
  it("keeps a dimension reset as whole-store recovery even after saving an empty checkpoint", async () => {
    const kv = storage(); await seed(kv);
    const first = await boot(kv, provider(2));
    first.vector.add("obs_0", "session", new Float32Array([1, 1]));
    await first.persistence.save(); first.persistence.stop();
    const second = await boot(kv);
    const since = await second.persistence.prepareBackfill(second.loaded, true);
    for (const [id] of second.vector.entries()) second.vector.remove(id);
    await second.persistence.save(); second.persistence.stop();
    expect(since).toBeNull();
    const third = await boot(kv);
    const resumed = await third.persistence.prepareBackfill(third.loaded);
    const scan = await rebuildKeywordIndex(kv as never, resumed);
    expect(scan.vectorJobs).toHaveLength(0);
    expect(scan.fullBackfillPending).toBe(3);
    expect(third.embedding.embedBatch).not.toHaveBeenCalled();
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL", "all");
    expect((await rebuildKeywordIndex(kv as never, resumed)).vectorJobs).toHaveLength(3);
  });

  it("retains recovery intent when a provider is replaced during embedding", async () => {
    const kv = storage(); await seed(kv);
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL", "all");
    const first = await boot(kv);
    let release!: (embeddings: Float32Array[]) => void;
    let entered!: () => void;
    const called = new Promise<void>((resolve) => { entered = resolve; });
    first.embedding.embedBatch.mockImplementationOnce(async () => {
      entered(); return new Promise<Float32Array[]>((resolve) => { release = resolve; });
    });
    const scan = await rebuildKeywordIndex(kv as never, null);
    const pending = backfillVectorBacklog(scan.vectorJobs, { pauseMs: 0 });
    await called;
    setEmbeddingProvider(provider(4));
    release(scan.vectorJobs.map(() => new Float32Array(3).fill(1)));
    expect(await pending).toMatchObject({ added: 0, complete: false, remaining: 3 });
    expect(first.vector.size).toBe(0);
    expect(getPendingVectorBackfillCount()).toBe(3);
  });

  it("does not let a concurrent incremental marker overwrite whole-store recovery", async () => {
    const kv = storage();
    let release!: () => void;
    let entered!: () => void;
    const called = new Promise<void>((resolve) => { entered = resolve; });
    const delayed = { ...kv, set: async <T>(scope: string, key: string, value: T) => {
      if (key === "vectors:backfill" && (value as { since?: unknown }).since !== null) {
        entered(); await new Promise<void>((resolve) => { release = resolve; });
      }
      return kv.set(scope, key, value);
    } };
    const p = new IndexPersistence(delayed as never, new VectorIndex()); active.push(p);
    const incremental = p.markBackfillSince("2026-01-01T00:00:00Z");
    await called;
    const full = p.markBackfillSince(null);
    await new Promise((resolve) => setImmediate(resolve));
    release(); await Promise.all([incremental, full]);
    expect(await p.readBackfillMarker()).toBeNull();
  });

  it("preserves legacy incremental markers and refuses to advance recovery when marker storage fails", async () => {
    const kv = storage();
    await kv.set(KV.bm25Index, "vectors:backfill", { v: 1, since: "2020-01-01T00:00:00Z" });
    const p = new IndexPersistence(kv as never, new VectorIndex()); active.push(p);
    const loaded = { state: "buckets" as const, savedAt: "2026-01-01T00:00:00Z", vector: new VectorIndex() };
    expect(await p.prepareBackfill(loaded)).toBe("2020-01-01T00:00:00Z");
    const broken = new IndexPersistence({ ...kv, get: async () => { throw new Error("state read failed"); } } as never, new VectorIndex()); active.push(broken);
    expect(await broken.prepareBackfill(loaded)).toBeUndefined();
    expect(broken.isRecoveryPaused()).toBe(true);
    expect(await p.readBackfillMarker()).toBe("2020-01-01T00:00:00Z");
    const unavailable = await p.prepareBackfill({ vector: null, state: "unavailable", savedAt: null }, true);
    expect(unavailable).toBeUndefined();
    expect(await p.readBackfillMarker()).toBe("2020-01-01T00:00:00Z");
  });

  it("keeps deferred rows and partial provider failures pending across restart without repeated successful embeddings", async () => {
    const kv = storage(); await seed(kv, 5);
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL", "all"); vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL_MAX", "3");
    const first = await boot(kv);
    first.embedding.embedBatch.mockImplementationOnce(async (texts) => texts.map((_, i) => new Float32Array(i === 1 ? 2 : 3).fill(1)));
    const plan = await first.persistence.prepareBackfill(first.loaded);
    const scan = await rebuildKeywordIndex(kv as never, plan);
    const result = await backfillVectorBacklog(scan.vectorJobs, { remainingAfter: scan.fullBackfillPending, pauseMs: 0 });
    expect(result).toEqual({ added: 2, failed: 1, remaining: 3, complete: false });
    expect(getPendingVectorBackfillCount()).toBe(3);
    first.persistence.stop();
    const second = await boot(kv);
    const resumed = await rebuildKeywordIndex(kv as never, await second.persistence.prepareBackfill(second.loaded));
    expect(resumed.vectorJobs.map((job) => job.id)).toEqual(["obs_1", "obs_3", "obs_4"]);
    expect(await backfillVectorBacklog(resumed.vectorJobs, { pauseMs: 0 })).toMatchObject({ added: 3, complete: true });
    expect(second.embedding.embedBatch).toHaveBeenCalledTimes(1);
  });

  it("does not acknowledge recovery until its vector checkpoint succeeds", async () => {
    const kv = storage(); let fail = true;
    const broken = { ...kv, set: async <T>(scope: string, key: string, value: T) => {
      if (fail && scope.startsWith(`${KV.bm25Index}:vec:`)) throw new Error("checkpoint unavailable");
      return kv.set(scope, key, value);
    } };
    const vector = new VectorIndex(); const persistence = new IndexPersistence(broken as never, vector); active.push(persistence);
    await persistence.markBackfillSince(null);
    vector.add("obs_1", "session", new Float32Array([1, 1, 1]));
    expect(await persistence.completeBackfill()).toBe(false);
    expect(await persistence.readBackfillMarker()).toBeNull();
    fail = false;
    expect(await persistence.completeBackfill()).toBe(true);
    expect(await persistence.readBackfillMarker()).toBeUndefined();
    const restarted = await boot(kv);
    expect(restarted.vector.has("obs_1")).toBe(true);
  });

  it.each(["edited", "new"] as const)("keeps %s canonical rows missing after a concurrent embedding failure recoverable on restart", async (kind) => {
    const kv = storage(); await seed(kv, 2);
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL", "all");
    const first = await boot(kv);
    let release!: (embeddings: Float32Array[]) => void;
    let entered!: () => void;
    const called = new Promise<void>((resolve) => { entered = resolve; });
    first.embedding.embedBatch.mockImplementationOnce(async () => {
      entered(); return new Promise<Float32Array[]>((resolve) => { release = resolve; });
    }).mockRejectedValueOnce(new Error("live embedding unavailable"));
    const since = await first.persistence.prepareBackfill(first.loaded);
    const scan = await rebuildKeywordIndex(kv as never, since);
    const running = backfillVectorBacklog(scan.vectorJobs, { pauseMs: 0,
      remainingCount: () => getSearchIndex().countMissingDocuments((id) => first.vector.has(id), since),
    });
    await called;
    const id = kind === "edited" ? "obs_0" : "obs_new";
    const updated: CompressedObservation = { id, sessionId: "session", timestamp: new Date().toISOString(), type: "discovery", title: "updated Cobalt", narrative: "new canonical content", facts: [], concepts: [], files: [], importance: 5 };
    await kv.set(KV.observations("session"), id, updated);
    await indexRecords([updated], []);
    release(scan.vectorJobs.map(() => new Float32Array(3).fill(1)));
    expect(await running).toMatchObject({ remaining: 1, complete: false });
    expect(first.vector.has(id)).toBe(false);
    expect(await first.persistence.readBackfillMarker()).toBeNull();
    first.persistence.stop();
    const second = await boot(kv);
    const resumed = await rebuildKeywordIndex(kv as never, await second.persistence.prepareBackfill(second.loaded));
    expect(resumed.vectorJobs.map((job) => job.id)).toEqual([id]);
    expect(await backfillVectorBacklog(resumed.vectorJobs, { pauseMs: 0 })).toMatchObject({ added: 1, complete: true });
  });

  it.each(["read", "write"] as const)("keeps keyword search available and vector checkpoint unchanged after recovery marker %s fails", async (operation) => {
    const kv = storage(); await seed(kv);
    const first = await boot(kv);
    first.vector.add("obs_0", "session", new Float32Array([1, 1, 1]));
    await first.persistence.save(); first.persistence.stop();
    const original = await kv.get(KV.bm25Index, "vectors:meta");
    const faulty = { ...kv,
      get: async <T>(scope: string, key: string): Promise<T | null> => {
        if (operation === "read" && key === "vectors:backfill") throw new Error("marker read unavailable");
        return kv.get<T>(scope, key);
      },
      set: async <T>(scope: string, key: string, value: T): Promise<T> => {
        if (operation === "write" && key === "vectors:backfill") throw new Error("marker write unavailable");
        return kv.set(scope, key, value);
      },
    };
    const second = await boot(faulty);
    const since = await second.persistence.prepareBackfill(second.loaded, true);
    expect(since).toBeUndefined(); expect(second.persistence.isRecoveryPaused()).toBe(true);
    const scan = await rebuildKeywordIndex(faulty as never, since);
    expect(scan.documents).toBe(3); expect(scan.vectorJobs).toHaveLength(0);
    expect(getSearchIndex().search("fixture")).toHaveLength(3);
    second.vector.add("obs_1", "session", new Float32Array([1, 1, 1]));
    second.persistence.scheduleSave(); await second.persistence.save(); await second.persistence.flushPendingLog();
    expect(await second.persistence.completeBackfill()).toBe(false);
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toEqual(original);
    expect(await kv.list(KV.vectorPendingLog)).toEqual([]);
    expect(second.persistence.status().vector?.lastError).toContain("paused until restart");
    second.persistence.stop();
    const third = await boot(kv);
    expect(third.vector.size).toBe(1);
    expect(await third.persistence.prepareBackfill(third.loaded, true)).toBeNull();
  });

  it.each(["coverage", "intent"] as const)("retains recovery if %s changes during the awaited checkpoint", async (change) => {
    const kv = storage(); let release!: () => void; let entered!: () => void;
    const called = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = { ...kv, set: async <T>(scope: string, key: string, value: T) => {
      if (scope.startsWith(`${KV.bm25Index}:vec:`)) { entered(); await new Promise<void>((resolve) => { release = resolve; }); }
      return kv.set(scope, key, value);
    } };
    const vector = new VectorIndex(); const persistence = new IndexPersistence(blocked as never, vector); active.push(persistence);
    await persistence.markBackfillSince(null);
    vector.add("obs_1", "session", new Float32Array([1, 1, 1]));
    let covered = true;
    const completing = persistence.completeBackfill(() => covered);
    await called;
    if (change === "coverage") covered = false;
    else await persistence.markBackfillSince(null);
    release();
    expect(await completing).toBe(false);
    expect(await persistence.readBackfillMarker()).toBeNull();
  });

  it("defers early capture checkpoints until startup has established durable recovery intent", async () => {
    const kv = storage(); const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { requireRecoveryPlan: true }); active.push(persistence);
    const loaded = await persistence.load();
    vector.add("early", "session", new Float32Array([1, 1, 1]));
    persistence.scheduleSave(); await persistence.save(); await persistence.flushPendingLog();
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toBeNull();
    expect(await kv.list(KV.vectorPendingLog)).toEqual([]);
    expect(await persistence.prepareBackfill(loaded)).toBeNull();
    await persistence.save();
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toMatchObject({ count: 1 });
    expect(await persistence.readBackfillMarker()).toBeNull();
  });

  it("resumes checkpoint recovery intent when the separate marker is absent, then clears it on a later stable checkpoint", async () => {
    const kv = storage(); await seed(kv);
    const first = await boot(kv);
    await first.persistence.prepareBackfill(first.loaded);
    first.vector.add("obs_0", "session", new Float32Array([1, 1, 1]));
    await first.persistence.save();
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toMatchObject({ backfillSince: null });
    await kv.delete(KV.bm25Index, "vectors:backfill"); first.persistence.stop();
    const second = await boot(kv);
    const since = await second.persistence.prepareBackfill(second.loaded);
    expect(since).toBeNull();
    const gated = await rebuildKeywordIndex(kv as never, since);
    expect(gated.fullBackfillPending).toBe(2); expect(second.embedding.embedBatch).not.toHaveBeenCalled();
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL", "all");
    const scan = await rebuildKeywordIndex(kv as never, since);
    await backfillVectorBacklog(scan.vectorJobs, { pauseMs: 0 });
    expect(await second.persistence.completeBackfill()).toBe(true);
    const completed = await kv.get(KV.bm25Index, "vectors:meta");
    expect(completed).toMatchObject({ backfillSince: null });
    await second.persistence.save();
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toEqual(completed);
    second.vector.add("obs_later", "session", new Float32Array([1, 1, 1]));
    await second.persistence.save();
    expect(await kv.get(KV.bm25Index, "vectors:meta")).not.toHaveProperty("backfillSince");
  });

  it.each([false, true])("retains old-timestamp snapshot edits during marker deletion when restoring the marker fails=%s", async (failRestore) => {
    const kv = storage(); await seed(kv, 1);
    let release!: () => void; let entered!: () => void; let deleted = false;
    const called = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = { ...kv,
      delete: async (scope: string, key: string) => {
        if (key === "vectors:backfill") { entered(); await new Promise<void>((resolve) => { release = resolve; }); }
        await kv.delete(scope, key);
        if (key === "vectors:backfill") deleted = true;
      },
      set: async <T>(scope: string, key: string, value: T) => {
        if (key === "vectors:backfill" && deleted && failRestore) throw new Error("marker restore unavailable");
        return kv.set(scope, key, value);
      },
    };
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL", "all");
    const first = await boot(blocked);
    const since = await first.persistence.prepareBackfill(first.loaded);
    const scan = await rebuildKeywordIndex(blocked as never, since);
    await backfillVectorBacklog(scan.vectorJobs, { pauseMs: 0 });
    const completing = first.persistence.completeBackfill(() => getSearchIndex().countMissingDocuments((id) => first.vector.has(id), since) === 0);
    await called;
    const updated = { ...(await kv.get<CompressedObservation>(KV.observations("session"), "obs_0"))!, title: "Cobalt changed during deletion" };
    await kv.set(KV.observations("session"), updated.id, updated);
    getSearchIndex().remove(updated.id);
    vectorIndexRemove(updated.id);
    first.embedding.embedBatch.mockRejectedValueOnce(new Error("live embedding unavailable"));
    await indexRecords([updated], []);
    await first.persistence.flushPendingLog();
    release();
    expect(await completing).toBe(false);
    expect(first.persistence.isRecoveryPaused()).toBe(failRestore);
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toMatchObject({ backfillSince: null });
    first.persistence.stop();
    const second = await boot(kv);
    const resumed = await rebuildKeywordIndex(kv as never, await second.persistence.prepareBackfill(second.loaded));
    expect(resumed.vectorJobs.map((job) => job.id)).toEqual(["obs_0"]);
    expect(await backfillVectorBacklog(resumed.vectorJobs, { pauseMs: 0 })).toMatchObject({ added: 1, complete: true });
  });

  it("pauses vector persistence for invalid checkpoint recovery intent without advancing its cutoff", async () => {
    const kv = storage();
    const meta = { v: 3, bucketCount: 0, savedAt: "2026-01-01T00:00:00Z", count: 0, backfillSince: "invalid cutoff" };
    await kv.set(KV.bm25Index, "vectors:meta", meta);
    const first = await boot(kv);
    expect(await first.persistence.prepareBackfill(first.loaded)).toBeUndefined();
    expect(first.persistence.isRecoveryPaused()).toBe(true);
    expect(first.persistence.status().vector?.lastError).toContain("Invalid persisted vector recovery cutoff");
    first.vector.add("obs_new", "session", new Float32Array([1, 1, 1]));
    await first.persistence.save();
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toEqual(meta);
  });

  it.each([["embedding", false], ["deletion", false], ["deletion", true]] as const)("retains incremental jobs moved behind the cutoff during %s with marker restoration failure=%s", async (phase, failRestore) => {
    const kv = storage(); await seed(kv, 2);
    const original = await boot(kv);
    original.vector.add("obs_0", "session", new Float32Array([1, 1, 1]));
    await original.persistence.save(); original.persistence.stop();
    const target = { ...(await kv.get<CompressedObservation>(KV.observations("session"), "obs_0"))!, id: "obs_target", timestamp: "2099-01-01T00:00:00Z" };
    await kv.set(KV.observations("session"), target.id, target);
    let release!: () => void; let entered!: () => void;
    const called = new Promise<void>((resolve) => { entered = resolve; });
    let markerDeleted = false;
    const blocked = { ...kv, delete: async (scope: string, key: string) => {
      if (phase === "deletion" && key === "vectors:backfill") { entered(); await new Promise<void>((resolve) => { release = resolve; }); }
      await kv.delete(scope, key);
      if (key === "vectors:backfill") markerDeleted = true;
    }, set: async <T>(scope: string, key: string, value: T) => {
      if (key === "vectors:backfill" && markerDeleted && failRestore) throw new Error("promotion unavailable");
      return kv.set(scope, key, value);
    } };
    const first = await boot(blocked);
    let since = await first.persistence.prepareBackfill(first.loaded);
    expect(typeof since).toBe("string");
    const scan = await rebuildKeywordIndex(blocked as never, since);
    expect(scan.vectorJobs.map((job) => job.id)).toEqual([target.id]);
    const ids = new Set(scan.vectorJobs.map((job) => job.id));
    const missing = () => getSearchIndex().countMissingDocuments((id) => first.vector.has(id), since, ids);
    expect(await first.persistence.beginBackfill()).toBe(true);
    expect(await first.persistence.readBackfillMarker()).toBeNull();
    if (phase === "embedding") first.embedding.embedBatch.mockImplementationOnce(async (texts) => {
      entered(); await new Promise<void>((resolve) => { release = resolve; });
      return texts.map(() => new Float32Array(3).fill(1));
    });
    const backfill = backfillVectorBacklog(scan.vectorJobs, { pauseMs: 0, remainingCount: missing });
    let completing: Promise<boolean> | undefined;
    if (phase === "deletion") {
      expect(await backfill).toMatchObject({ added: 1, complete: true });
      completing = first.persistence.completeBackfill(() => missing() === 0);
    }
    await called;
    const updated = { ...target, timestamp: "2020-01-01T00:00:00Z", title: "older snapshot content" };
    await kv.set(KV.observations("session"), target.id, updated);
    getSearchIndex().remove(target.id); vectorIndexRemove(target.id);
    first.embedding.embedBatch.mockRejectedValueOnce(new Error("replacement embedding unavailable"));
    await indexRecords([updated], []);
    if (phase === "embedding") {
      await first.persistence.save();
      expect(await first.persistence.readBackfillMarker()).toBeNull();
    } else expect(await kv.get(KV.bm25Index, "vectors:meta")).toMatchObject({ backfillSince: null });
    release();
    if (completing) expect(await completing).toBe(false);
    else expect(await backfill).toMatchObject({ complete: false });
    expect(await first.persistence.readBackfillMarker()).toBe(failRestore ? undefined : null);
    expect(first.persistence.isRecoveryPaused()).toBe(failRestore);
    first.persistence.stop();
    const restarted = await boot(kv);
    const resumed = await rebuildKeywordIndex(kv as never, await restarted.persistence.prepareBackfill(restarted.loaded));
    expect(resumed.vectorJobs).toHaveLength(0);
    expect(resumed.fullBackfillPending).toBe(2);
    expect(restarted.embedding.embedBatch).not.toHaveBeenCalled();
    vi.stubEnv("AGENTMEMORY_VECTOR_BACKFILL", "all");
    const optedIn = await rebuildKeywordIndex(kv as never, await restarted.persistence.readBackfillMarker());
    expect(optedIn.vectorJobs.map((job) => job.id).sort()).toEqual(["obs_1", "obs_target"]);
  });

  it("pauses before embedding or checkpointing when the incremental recovery barrier cannot be persisted", async () => {
    const kv = storage(); let fail = false;
    const faulty = { ...kv, set: async <T>(scope: string, key: string, value: T) => {
      if (fail && key === "vectors:backfill") throw new Error("promotion unavailable");
      return kv.set(scope, key, value);
    } };
    const vector = new VectorIndex(); const persistence = new IndexPersistence(faulty as never, vector); active.push(persistence);
    await persistence.markBackfillSince("2020-01-01T00:00:00Z");
    vector.add("obs_0", "session", new Float32Array([1, 1, 1])); await persistence.save();
    const previous = await kv.get(KV.bm25Index, "vectors:meta");
    fail = true;
    expect(await persistence.beginBackfill()).toBe(false);
    vector.add("obs_1", "session", new Float32Array([1, 1, 1])); await persistence.save();
    expect(persistence.isRecoveryPaused()).toBe(true);
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toEqual(previous);
  });

  it("processes only the planned incremental rows without opt-in after saving conservative restart intent", async () => {
    const kv = storage(); await seed(kv, 2);
    const original = await boot(kv);
    original.vector.add("obs_0", "session", new Float32Array([1, 1, 1])); await original.persistence.save(); original.persistence.stop();
    const next = { ...(await kv.get<CompressedObservation>(KV.observations("session"), "obs_0"))!, id: "obs_next", timestamp: "2099-01-01T00:00:00Z" };
    await kv.set(KV.observations("session"), next.id, next);
    const first = await boot(kv); const since = await first.persistence.prepareBackfill(first.loaded);
    const scan = await rebuildKeywordIndex(kv as never, since);
    expect(scan.vectorJobs.map((job) => job.id)).toEqual(["obs_next"]);
    expect(await first.persistence.beginBackfill()).toBe(true);
    expect(await first.persistence.readBackfillMarker()).toBeNull();
    expect(await backfillVectorBacklog(scan.vectorJobs, { pauseMs: 0 })).toMatchObject({ added: 1, complete: true });
    expect(first.embedding.embedBatch).toHaveBeenCalledTimes(1);
    expect(first.vector.has("obs_1")).toBe(false);
    expect(await first.persistence.completeBackfill()).toBe(true);
    expect(await first.persistence.readBackfillMarker()).toBeUndefined();
  });

  it("recovers an incremental replacement interrupted before any later vector checkpoint", async () => {
    const kv = storage(); await seed(kv, 2);
    const original = await boot(kv);
    original.vector.add("obs_0", "session", new Float32Array([1, 1, 1])); await original.persistence.save(); original.persistence.stop();
    const checkpoint = await kv.get(KV.bm25Index, "vectors:meta");
    const target = { ...(await kv.get<CompressedObservation>(KV.observations("session"), "obs_0"))!, id: "obs_target", timestamp: "2099-01-01T00:00:00Z" };
    await kv.set(KV.observations("session"), target.id, target);
    const first = await boot(kv);
    const scan = await rebuildKeywordIndex(kv as never, await first.persistence.prepareBackfill(first.loaded));
    expect(await first.persistence.beginBackfill()).toBe(true);
    let release!: (embeddings: Float32Array[]) => void; let entered!: () => void;
    const called = new Promise<void>((resolve) => { entered = resolve; });
    first.embedding.embedBatch.mockImplementationOnce(async () => { entered(); return new Promise<Float32Array[]>((resolve) => { release = resolve; }); }).mockRejectedValueOnce(new Error("live unavailable"));
    const pending = backfillVectorBacklog(scan.vectorJobs, { pauseMs: 0 }); await called;
    const restored = { ...target, timestamp: "2020-01-01T00:00:00Z", title: "restored old version" };
    await kv.set(KV.observations("session"), restored.id, restored); await indexRecords([restored], []);
    first.persistence.stop();
    expect(await kv.get(KV.bm25Index, "vectors:meta")).toEqual(checkpoint);
    const restarted = await boot(kv);
    const resumed = await rebuildKeywordIndex(kv as never, await restarted.persistence.prepareBackfill(restarted.loaded));
    expect(resumed.vectorJobs).toHaveLength(0); expect(resumed.fullBackfillPending).toBe(2);
    expect(restarted.embedding.embedBatch).not.toHaveBeenCalled();
    release([new Float32Array([1, 1, 1])]); await pending;
  });

});
