import { describe, it, expect, vi } from "vitest";
import type { Memory, SemanticMemory } from "../src/types.js";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  }),
}));

function mockKV(
  memories: Memory[] = [],
  semanticMems: SemanticMemory[] = [],
) {
  const store = new Map<string, Map<string, unknown>>();

  const memMap = new Map<string, unknown>();
  for (const m of memories) memMap.set(m.id, m);
  store.set("mem:memories", memMap);

  const semMap = new Map<string, unknown>();
  for (const s of semanticMems) semMap.set(s.id, s);
  store.set("mem:semantic", semMap);

  store.set("mem:retention", new Map());

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

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (opts: { id: string }, fn: Function) => {
      functions.set(opts.id, fn);
    },
    trigger: async (id: string, data: unknown) => {
      const fn = functions.get(id);
      if (fn) return fn(data);
      return null;
    },
  };
}

function makeMemory(
  id: string,
  type: Memory["type"],
  daysOld: number,
): Memory {
  const created = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    id,
    createdAt: created,
    updatedAt: created,
    type,
    title: `Memory ${id}`,
    content: `Content of memory ${id}`,
    concepts: [],
    files: [],
    sessionIds: ["ses_1"],
    strength: 1,
    version: 1,
    isLatest: true,
  };
}

function makeSemanticMemory(
  id: string,
  daysOld: number,
  accessCount = 0,
): SemanticMemory {
  const created = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    id,
    fact: `Fact ${id}`,
    confidence: 0.8,
    sourceSessionIds: ["ses_1"],
    sourceMemoryIds: [],
    accessCount,
    lastAccessedAt: created,
    strength: 0.8,
    createdAt: created,
    updatedAt: created,
  };
}

describe("RetentionScoring", () => {
  it("imports without errors", async () => {
    const mod = await import("../src/functions/retention.js");
    expect(mod.registerRetentionFunctions).toBeDefined();
  });

  it("computes retention scores for all memories", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    const memories = [
      makeMemory("mem_recent", "architecture", 1),
      makeMemory("mem_old", "fact", 365),
    ];

    const sdk = mockSdk();
    const kv = mockKV(memories);
    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::retention-score", {})) as {
      success: boolean;
      total: number;
      tiers: any;
      scores: any[];
    };

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
    expect(result.scores.length).toBe(2);

    const recentScore = result.scores.find(
      (s: any) => s.memoryId === "mem_recent",
    );
    const oldScore = result.scores.find(
      (s: any) => s.memoryId === "mem_old",
    );

    expect(recentScore!.score).toBeGreaterThan(oldScore!.score);
  });

  it("higher-type memories get higher salience", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    const memories = [
      makeMemory("mem_arch", "architecture", 30),
      makeMemory("mem_fact", "fact", 30),
    ];

    const sdk = mockSdk();
    const kv = mockKV(memories);
    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::retention-score", {})) as any;

    const archScore = result.scores.find(
      (s: any) => s.memoryId === "mem_arch",
    );
    const factScore = result.scores.find(
      (s: any) => s.memoryId === "mem_fact",
    );

    expect(archScore.salience).toBeGreaterThan(factScore.salience);
  });

  it("classifies memories into tiers", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    const memories = [
      makeMemory("hot1", "architecture", 1),
      makeMemory("hot2", "preference", 3),
      makeMemory("warm1", "pattern", 60),
      makeMemory("cold1", "fact", 300),
    ];

    const sdk = mockSdk();
    const kv = mockKV(memories);
    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::retention-score", {})) as any;
    expect(result.tiers.hot + result.tiers.warm + result.tiers.cold + result.tiers.evictable).toBe(4);
  });

  it("dry-run eviction shows candidates without deleting", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    const memories = [
      makeMemory("mem_keep", "architecture", 1),
      makeMemory("mem_evict", "fact", 500),
    ];

    const sdk = mockSdk();
    const kv = mockKV(memories);
    registerRetentionFunctions(sdk as never, kv as never);

    await sdk.trigger("mem::retention-score", {});

    const dryResult = (await sdk.trigger("mem::retention-evict", {
      threshold: 0.5,
      dryRun: true,
    })) as any;

    expect(dryResult.dryRun).toBe(true);
    expect(dryResult.wouldEvict).toBeGreaterThanOrEqual(0);

    const remaining = await kv.list("mem:memories");
    expect(remaining.length).toBe(2);
  });

  it("includes semantic memories in scoring", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    const semanticMems = [
      makeSemanticMemory("sem_1", 10, 5),
      makeSemanticMemory("sem_2", 200, 0),
    ];

    const sdk = mockSdk();
    const kv = mockKV([], semanticMems);
    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::retention-score", {})) as any;

    expect(result.total).toBe(2);
    const sem1 = result.scores.find((s: any) => s.memoryId === "sem_1");
    const sem2 = result.scores.find((s: any) => s.memoryId === "sem_2");
    expect(sem1.score).toBeGreaterThan(sem2.score);
  });

  it("scores tag rows with their source scope (#124)", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    const sdk = mockSdk();
    const kv = mockKV(
      [makeMemory("mem_ep", "fact", 10)],
      [makeSemanticMemory("sem_sem", 10, 2)],
    );
    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::retention-score", {})) as any;
    const ep = result.scores.find((s: any) => s.memoryId === "mem_ep");
    const sem = result.scores.find((s: any) => s.memoryId === "sem_sem");
    expect(ep.source).toBe("episodic");
    expect(sem.source).toBe("semantic");
  });

  it("mem::retention-evict deletes semantic memories from mem:semantic, not mem:memories (#124)", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    // Both are 500 days old with zero access → both will score below
    // the default cold threshold. Before #124 the loop silently called
    // kv.delete(mem:memories, <semantic-id>) which was a no-op, leaving
    // the semantic row in mem:semantic forever.
    const sdk = mockSdk();
    const kv = mockKV(
      [makeMemory("mem_evict", "fact", 500)],
      [makeSemanticMemory("sem_evict", 500, 0)],
    );
    registerRetentionFunctions(sdk as never, kv as never);

    await sdk.trigger("mem::retention-score", {});
    const result = (await sdk.trigger("mem::retention-evict", {
      threshold: 0.9,
    })) as any;

    expect(result.evicted).toBe(2);
    expect(result.evictedEpisodic).toBe(1);
    expect(result.evictedSemantic).toBe(1);

    const remainingEp = await kv.list("mem:memories");
    const remainingSem = await kv.list("mem:semantic");
    expect(remainingEp).toHaveLength(0);
    expect(remainingSem).toHaveLength(0);

    // Retention score rows also cleaned up for both.
    const remainingScores = await kv.list("mem:retention");
    expect(remainingScores).toHaveLength(0);
  });

  it("mem::retention-evict treats pre-0.8.10 rows with missing source as episodic (backwards-compat, #124)", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    // Simulate a store that was scored on 0.8.9 or earlier: retention
    // rows exist but they have no `source` field. The new eviction
    // loop must still route those to mem:memories so users don't get
    // stuck with un-evictable episodic rows after upgrading.
    const sdk = mockSdk();
    const kv = mockKV([makeMemory("mem_old", "fact", 500)]);
    registerRetentionFunctions(sdk as never, kv as never);

    // Directly plant a legacy-shape retention score (no `source` key).
    await kv.set("mem:retention", "mem_old", {
      memoryId: "mem_old",
      score: 0.01,
      salience: 0,
      temporalDecay: 0,
      reinforcementBoost: 0,
      lastAccessed: new Date().toISOString(),
      accessCount: 0,
    });

    const result = (await sdk.trigger("mem::retention-evict", {
      threshold: 0.5,
    })) as any;
    expect(result.evicted).toBe(1);
    expect(result.evictedEpisodic).toBe(1);
    expect(result.evictedSemantic).toBe(0);
    const remaining = await kv.list("mem:memories");
    expect(remaining).toHaveLength(0);
  });
});
