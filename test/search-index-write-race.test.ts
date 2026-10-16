import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { KV } from "../src/state/schema.js";
import {
  backfillVectorBacklog, getPendingVectorBackfillCount, getSearchIndex,
  indexRecords, rebuildKeywordIndex, setEmbeddingProvider, setIndexPersistence,
  setPendingVectorBackfillCount, setVectorIndex, vectorIndexAddBatchGuarded,
  vectorIndexAddGuarded, vectorIndexRemove,
} from "../src/functions/search.js";
import type { VectorBackfillJob } from "../src/functions/search.js";
import type { CompressedObservation } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const oldVector = () => new Float32Array([1, 0]);
const newVector = () => new Float32Array([0, 1]);
const observation = (id: string, text = id): CompressedObservation => ({
  id, sessionId: "session", type: "discovery", title: text, narrative: text,
  timestamp: "2026-10-12T12:00:00.000Z", facts: [], concepts: [], files: [], importance: 5,
});
const context = (id: string) => ({ kind: "observation" as const, logId: id });
const job = (id: string): VectorBackfillJob => ({ id, sessionId: "session", text: id, context: context(id) });
const provider = () => ({
  name: "test", dimensions: 2,
  embed: vi.fn(async (_text: string) => newVector()),
  embedBatch: vi.fn(async (texts: string[]) => texts.map(() => newVector())),
});

let vectors: VectorIndex;
let embedding: ReturnType<typeof provider>;
beforeEach(() => {
  getSearchIndex().clear();
  vectors = new VectorIndex();
  embedding = provider();
  setVectorIndex(vectors);
  setEmbeddingProvider(embedding);
  setIndexPersistence(null);
  setPendingVectorBackfillCount(0);
});
afterEach(() => {
  vi.unstubAllEnvs();
  getSearchIndex().clear();
  setVectorIndex(null);
  setEmbeddingProvider(null);
  setIndexPersistence(null);
  setPendingVectorBackfillCount(0);
});

describe("search indexing async write ownership", () => {
  it("keeps newer keywords/vectors and deletion while accepting unaffected rows from the same old batch", async () => {
    const entered = deferred<void>();
    const pending = deferred<Float32Array[]>();
    embedding.embedBatch.mockImplementationOnce(async () => { entered.resolve(); return pending.promise; });
    const old = indexRecords([
      observation("same", "antiquarium"), observation("unaffected", "moonstone"), observation("deleted", "obsoletezebra"),
    ], []);
    expect(getSearchIndex().has("unaffected")).toBe(true);
    await entered.promise;
    await indexRecords([observation("same", "xylophone")], []);
    getSearchIndex().remove("deleted");
    vectorIndexRemove("deleted");
    pending.resolve([oldVector(), oldVector(), oldVector()]);
    await old;
    expect([...vectors.get("same")!.embedding]).toEqual([0, 1]);
    expect([...vectors.get("unaffected")!.embedding]).toEqual([1, 0]);
    expect(vectors.has("deleted")).toBe(false);
    expect(getSearchIndex().has("deleted")).toBe(false);
    expect(getSearchIndex().search("xylophone").map((r) => r.obsId)).toEqual(["same"]);
    expect(getSearchIndex().search("antiquarium")).toEqual([]);
  });

  it("captures queued record revisions before an earlier vector batch awaits", async () => {
    vi.stubEnv("REBUILD_EMBED_BATCH_SIZE", "1");
    const entered = deferred<void>();
    const pending = deferred<Float32Array[]>();
    embedding.embedBatch.mockImplementationOnce(async () => { entered.resolve(); return pending.promise; });
    const indexing = indexRecords([observation("first"), observation("queued", "antiquarium")], []);
    await entered.promise;
    getSearchIndex().add(observation("queued", "xylophone"));
    vectors.add("queued", "session", newVector());
    pending.resolve([oldVector()]);
    await indexing;
    expect(embedding.embedBatch).toHaveBeenCalledTimes(1);
    expect([...vectors.get("queued")!.embedding]).toEqual([0, 1]);
    expect(getSearchIndex().search("antiquarium")).toEqual([]);
  });

  it("does not cancel an absent-ID vector write when another ID is removed", async () => {
    const pending = deferred<Float32Array>();
    embedding.embed.mockReturnValueOnce(pending.promise);
    const adding = vectorIndexAddGuarded("absent", "session", "new text", context("absent"));
    getSearchIndex().remove("unrelated");
    vectorIndexRemove("also-unrelated");
    pending.resolve(oldVector());
    expect(await adding).toBe(true);
    expect([...vectors.get("absent")!.embedding]).toEqual([1, 0]);
  });

  it("rejects an absent-ID completion after delete/add/delete returns the ID to absence", async () => {
    const pending = deferred<Float32Array>();
    embedding.embed.mockReturnValueOnce(pending.promise);
    const adding = vectorIndexAddGuarded("absent", "session", "old text", context("absent"));
    getSearchIndex().remove("absent");
    getSearchIndex().add(observation("absent", "new text"));
    getSearchIndex().remove("absent");
    pending.resolve(oldVector());
    expect(await adding).toBe(false);
    expect(vectors.has("absent")).toBe(false);
    expect(await vectorIndexAddGuarded("absent", "session", "deliberate new add", context("absent"))).toBe(true);
  });

  it.each(["clear", "restore", "provider", "vector"] as const)("rejects batch completion after %s replacement", async (change) => {
    getSearchIndex().add(observation("doc"));
    const pending = deferred<Float32Array[]>();
    embedding.embedBatch.mockReturnValueOnce(pending.promise);
    const adding = vectorIndexAddBatchGuarded([job("doc")]);
    let replacement: VectorIndex | undefined;
    if (change === "clear") getSearchIndex().clear();
    if (change === "restore") {
      const restored = new SearchIndex(); restored.add(observation("doc"));
      getSearchIndex().restoreFrom(restored);
    }
    if (change === "provider") setEmbeddingProvider(provider());
    if (change === "vector") { replacement = new VectorIndex(); setVectorIndex(replacement); }
    pending.resolve([oldVector()]);
    expect(await adding).toEqual({ ok: 0, fail: 0, skipped: 1 });
    expect(vectors.has("doc")).toBe(false);
    expect(replacement?.has("doc") ?? false).toBe(false);
  });

  it("skips outdated jobs returned by keyword rebuild without submitting them to the provider", async () => {
    const rows = [observation("changed"), observation("deleted")];
    const kv = {
      list: async (scope: string) => scope === KV.sessions ? [{ id: "session" }]
        : scope === KV.observations("session") ? rows : [],
    };
    const rebuilt = await rebuildKeywordIndex(kv as never, "2020-01-01T00:00:00.000Z");
    expect(rebuilt.vectorJobs).toHaveLength(2);
    getSearchIndex().add(observation("changed", "newer"));
    getSearchIndex().remove("deleted");
    const result = await backfillVectorBacklog(rebuilt.vectorJobs, { pauseMs: 0 });
    expect(result).toEqual({ added: 0, failed: 0, remaining: 1, complete: false });
    expect(getPendingVectorBackfillCount()).toBe(1);
    expect(embedding.embedBatch).not.toHaveBeenCalled();
  });

  it("retains edited rows without replacement vectors when a superseded in-flight provider rejects", async () => {
    getSearchIndex().add(observation("a")); getSearchIndex().add(observation("b"));
    const pending = deferred<Float32Array[]>();
    const entered = deferred<void>();
    embedding.embedBatch.mockImplementationOnce(async () => { entered.resolve(); return pending.promise; });
    const jobs = [job("a"), job("b")].map((j) => ({ ...j, revision: getSearchIndex().watchRevision(j.id) }));
    const backlog = backfillVectorBacklog(jobs, { pauseMs: 0 });
    await entered.promise;
    getSearchIndex().remove("a"); getSearchIndex().add(observation("b", "newer"));
    pending.reject(new Error("provider offline"));
    expect(await backlog).toEqual({ added: 0, failed: 0, remaining: 1, complete: false });
    expect(getPendingVectorBackfillCount()).toBe(1);
    expect(vectors.size).toBe(0);
    jobs.forEach((j) => j.revision.release());
  });

  it("keeps only current failed jobs pending when an in-flight batch is partly superseded", async () => {
    getSearchIndex().add(observation("a")); getSearchIndex().add(observation("b"));
    const pending = deferred<Float32Array[]>();
    const entered = deferred<void>();
    embedding.embedBatch.mockImplementationOnce(async () => { entered.resolve(); return pending.promise; });
    const jobs = [job("a"), job("b")].map((j) => ({ ...j, revision: getSearchIndex().watchRevision(j.id) }));
    const backlog = backfillVectorBacklog(jobs, { pauseMs: 0 });
    await entered.promise;
    getSearchIndex().remove("a");
    pending.reject(new Error("provider offline"));
    expect(await backlog).toEqual({ added: 0, failed: 1, remaining: 1, complete: false });
    expect(getPendingVectorBackfillCount()).toBe(1);
    expect(await backfillVectorBacklog(jobs, { pauseMs: 0 })).toEqual({ added: 1, failed: 0, remaining: 0, complete: true });
    expect(vectors.has("a")).toBe(false); expect(vectors.has("b")).toBe(true);
    jobs.forEach((j) => j.revision.release());
  });

  it("allows a custom commit callback to reject ownership lost during its own await", async () => {
    getSearchIndex().add(observation("doc"));
    const entered = deferred<void>();
    const resume = deferred<void>();
    const adding = vectorIndexAddGuarded("doc", "session", "old", context("doc"), async (value, isCurrent) => {
      entered.resolve(); await resume.promise;
      if (!isCurrent()) return false;
      vectors.add("doc", "session", value); return true;
    });
    await entered.promise;
    getSearchIndex().add(observation("doc", "newer"));
    vectors.add("doc", "session", oldVector());
    resume.resolve();
    expect(await adding).toBe(false);
    expect([...vectors.get("doc")!.embedding]).toEqual([1, 0]);
  });

  it.each(["provider", "callback"] as const)("can retry an absent ID after %s failure", async (failure) => {
    if (failure === "provider") embedding.embed.mockRejectedValueOnce(new Error("provider offline"));
    const failed = await vectorIndexAddGuarded("absent", "session", "text", context("absent"), failure === "callback"
      ? async () => { throw new Error("callback failed"); } : undefined);
    expect(failed).toBe(false);
    expect(vectors.has("absent")).toBe(false);
    expect(await vectorIndexAddGuarded("absent", "session", "retry", context("absent"))).toBe(true);
    expect([...vectors.get("absent")!.embedding]).toEqual([0, 1]);
  });
});
