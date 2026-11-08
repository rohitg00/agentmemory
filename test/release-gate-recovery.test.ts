import { afterEach, describe, expect, it, vi } from "vitest";
import { assertRecoveredVectors, isVectorRecoverySettled } from "../scripts/release-gate/recovery.mjs";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { KV } from "../src/state/schema.js";
import { createStatusReporter } from "../src/triggers/api.js";
import {
  getSearchIndex,
  markKeywordRebuildPending,
  rebuildKeywordIndex,
  setEmbeddingProvider,
  setIndexPersistence,
  setPendingVectorBackfillCount,
  setVectorBackfillState,
  setVectorIndex,
} from "../src/functions/search.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function storeKV() {
  const scopes = new Map<string, Map<string, unknown>>();
  return {
    backend: "file" as const,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (scopes.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      if (!scopes.has(scope)) scopes.set(scope, new Map());
      scopes.get(scope)!.set(key, structuredClone(value));
      return value;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      scopes.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> =>
      [...(scopes.get(scope)?.values() ?? [])] as T[],
  };
}

function settledStatus(vectorDocuments = 20) {
  return {
    index: {
      vectorDocuments,
      keywordRebuildRunning: false,
      pendingVectorBackfill: 0,
      vectorBackfillState: "idle",
    },
  };
}

const persistenceInstances: IndexPersistence[] = [];

afterEach(async () => {
  for (const persistence of persistenceInstances.splice(0)) persistence.stop();
  setVectorIndex(null);
  setIndexPersistence(null);
  setEmbeddingProvider(null);
  setPendingVectorBackfillCount(0);
  setVectorBackfillState("idle");
  await rebuildKeywordIndex(storeKV() as never);
  getSearchIndex().clear();
});

describe("release gate vector recovery", () => {
  it("waits while eight checkpoint vectors are visible before twelve pending vectors replay", async () => {
    const kv = storeKV();
    const firstVector = new VectorIndex();
    const first = new IndexPersistence(kv as never, firstVector, { saveIntervalMs: 600_000 });
    persistenceInstances.push(first);
    await kv.set(KV.sessions, "ses_recovery", {
      id: "ses_recovery", project: "recovery", startedAt: "2026-10-10T00:00:00Z", observationCount: 20,
    });
    for (let i = 0; i < 20; i++) {
      const id = `obs_recovery_${i}`;
      await kv.set(KV.observations("ses_recovery"), id, {
        id, sessionId: "ses_recovery", title: `recovery ${i}`, narrative: `saved content ${i}`,
        type: "decision", facts: [], concepts: [], files: [], importance: 5, timestamp: "2026-10-10T00:00:00Z",
      });
      firstVector.add(id, "ses_recovery", new Float32Array([i, i + 1, i + 2]));
      if (i === 7) await first.save();
    }
    await first.flushPendingLog();
    first.stop();
    expect(firstVector.size).toBe(20);
    expect(await kv.list(KV.vectorPendingLog)).toHaveLength(12);

    let releaseReplay!: () => void;
    const pendingRead = new Promise<void>((resolve) => { releaseReplay = resolve; });
    const delayedKV = {
      ...kv,
      list: async <T>(scope: string): Promise<T[]> => {
        if (scope === KV.vectorPendingLog) await pendingRead;
        return kv.list<T>(scope);
      },
    };
    const vector = new VectorIndex();
    const restored = new IndexPersistence(delayedKV as never, vector, { saveIntervalMs: 600_000 });
    persistenceInstances.push(restored);
    setVectorIndex(vector);
    setIndexPersistence(restored);
    const embed = vi.fn(async () => new Float32Array([1, 2, 3]));
    const embedBatch = vi.fn(async () => []);
    setEmbeddingProvider({ name: "recovery-test", dimensions: 3, embed, embedBatch });
    markKeywordRebuildPending();
    const loaded = await restored.load();
    expect(loaded.vector?.size).toBe(8);
    vector.restoreFrom(loaded.vector!);
    const replay = restored.replayPendingLog(3);
    const report = createStatusReporter({ trigger: async () => null } as never, delayedKV as never, {});

    try {
      const during = await report({ health: null });
      expect(during.index).toMatchObject({ vectorDocuments: 8, keywordRebuildRunning: true });
      expect(isVectorRecoverySettled(during)).toBe(false);

      releaseReplay();
      expect(await replay).toMatchObject({ added: 12, skipped: 0 });
      const keyword = await rebuildKeywordIndex(delayedKV as never, loaded.savedAt);
      setPendingVectorBackfillCount(keyword.vectorJobs.length + keyword.fullBackfillPending);
      const after = await report({ health: null });
      expect(after.index).toMatchObject({ vectorDocuments: 20, keywordRebuildRunning: false });
      expect(isVectorRecoverySettled(after)).toBe(true);
      expect(() => assertRecoveredVectors(after, 20, embed.mock.calls.length + embedBatch.mock.calls.length)).not.toThrow();
    } finally {
      releaseReplay();
      await replay;
    }
  });

  it.each([0, 8, 21])("fails a settled count of %i immediately instead of waiting for the desired count", (count) => {
    const status = settledStatus(count);
    expect(isVectorRecoverySettled(status)).toBe(true);
    expect(() => assertRecoveredVectors(status, 20, 0)).toThrow(`${count} vectors after the crash, expected 20`);
  });

  it.each([{}, { index: { vectorDocuments: 20 } }, { index: { vectorDocuments: 20, keywordRebuildRunning: true } }])(
    "does not infer readiness from an absent or unfinished rebuild state",
    (status) => { expect(isVectorRecoverySettled(status)).toBe(false); },
  );

  it("fails when a recovered count required new embeddings", () => {
    expect(() => assertRecoveredVectors(settledStatus(), 20, 12)).toThrow("the restart re-embedded 12 inputs");
  });

  it("fails when vector backfill is pending or running", () => {
    const pending = settledStatus();
    pending.index.pendingVectorBackfill = 12;
    expect(() => assertRecoveredVectors(pending, 20, 0)).toThrow("12 documents wait for vector backfill");
    const running = settledStatus();
    running.index.vectorBackfillState = "running";
    expect(() => assertRecoveredVectors(running, 20, 0)).toThrow("vector backfill is running");
  });
});
