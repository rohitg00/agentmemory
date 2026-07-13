import { describe, expect, it } from "vitest";
import { persistRecallTrace, materializeRecallStats } from "../src/recall/trace-store.js";
import { KV } from "../src/state/schema.js";
import type { RecallItemStats, RecallTrace } from "../src/types.js";

function makeKv() {
  const store = new Map<string, Map<string, unknown>>();
  const tails = new Map<string, Promise<void>>();
  const mapFor = (scope: string) => {
    if (!store.has(scope)) store.set(scope, new Map());
    return store.get(scope)!;
  };
  const update = async <T>(scope: string, key: string, ops: Array<Record<string, unknown>>): Promise<T> => {
    const lockKey = `${scope}:${key}`;
    const previous = tails.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    tails.set(lockKey, previous.then(() => current));
    await previous;
    try {
      const record = (mapFor(scope).get(key) as Record<string, unknown> | undefined) ?? {};
      for (const op of ops) {
        const type = op.type;
        const path = String(op.path);
        if (type === "increment") {
          record[path] = Number(record[path] ?? 0) + Number(op.by);
        } else if (type === "set") {
          record[path] = op.value;
        }
      }
      mapFor(scope).set(key, record);
      return record as T;
    } finally {
      release();
      if (tails.get(lockKey) === current) tails.delete(lockKey);
    }
  };
  return {
    async get<T>(scope: string, key: string) { return (store.get(scope)?.get(key) as T) ?? null; },
    async set<T>(scope: string, key: string, value: T) { mapFor(scope).set(key, value); return value; },
    async update<T>(scope: string, key: string, ops: Array<Record<string, unknown>>) { return update<T>(scope, key, ops); },
    async delete(scope: string, key: string) { store.get(scope)?.delete(key); },
    async list<T>(scope: string) { return Array.from(store.get(scope)?.values() ?? []) as T[]; },
    store,
  };
}

function trace(id: string, timestamp: string, score: number): RecallTrace {
  return {
    id,
    timestamp,
    entryPoint: "search",
    outputMode: "ranked_results",
    redactionKinds: [],
    selected: [{ id: "selected", kind: "memory", score, recencyScore: 0, tokenCount: 1, reason: "selected", decision: "selected" }],
    dropped: [{ id: "mismatch", kind: "memory", score: 0, recencyScore: 0, tokenCount: 1, reason: "scope", decision: "scope_mismatch" }],
    droppedCountsByDecision: { scope_mismatch: 1 },
    totalCandidateCount: 2,
    selectedTokenCount: 1,
    finalContextTokenCount: 0,
    tokenEstimator: { name: "test", version: "1", estimated: true },
    retrievalMode: {
      bm25: { status: "healthy", attempted: true },
      vector: { status: "disabled", attempted: false },
      graph: { status: "disabled", attempted: false },
    },
  };
}

describe("recall stats persistence", () => {
  it("keeps concurrent counters and aggregates without mutating memories", async () => {
    const kv = makeKv();
    const memory = { id: "selected", content: "unchanged", version: 4, updatedAt: "2026-07-01T00:00:00.000Z" };
    await kv.set(KV.memories, memory.id, memory);
    const config = { retentionDays: 30, maxTraces: 200, maxDroppedItemsPerReason: 5 };
    const writes = Array.from({ length: 100 }, (_, index) =>
      persistRecallTrace(kv as never, trace(`trace-${index}`, new Date(Date.now() + index).toISOString(), 0.5 + (index % 2) * 0.25), config),
    );
    await Promise.all(writes);

    const selected = await kv.get<RecallItemStats>(KV.recallStats, "selected");
    const mismatch = await kv.get<RecallItemStats>(KV.recallStats, "mismatch");
    expect(selected?.recallCount).toBe(100);
    expect(selected && materializeRecallStats(selected).averageScore).toBeCloseTo(0.625);
    expect(mismatch?.scopeMismatchCount).toBe(100);
    expect(selected?.lastRecalledAt).toBeTruthy();
    expect(await kv.get(KV.memories, memory.id)).toEqual(memory);
  });
});
