import { describe, it, expect, vi } from "vitest";
import type { Memory, SemanticMemory } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
  store.set("mem:access", new Map());

  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, fn: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
    },
    trigger: async (
      input: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const functionId =
        typeof input === "string" ? input : input.function_id;
      const payload = typeof input === "string" ? data : input.payload;
      const fn = fns.get(functionId);
      if (fn) return fn(payload);
      return null;
    },
  };
}

function makeMemory(id: string, daysOld = 30): Memory {
  const created = new Date(
    Date.now() - daysOld * 86_400_000,
  ).toISOString();
  return {
    id,
    createdAt: created,
    updatedAt: created,
    type: "fact",
    title: `Memory ${id}`,
    content: `Content ${id}`,
    concepts: [],
    files: [],
    sessionIds: ["ses_1"],
    strength: 1,
    version: 1,
    isLatest: true,
  };
}

function makeSemantic(
  id: string,
  daysOld: number,
  accessCount = 0,
): SemanticMemory {
  const created = new Date(
    Date.now() - daysOld * 86_400_000,
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

describe("RetentionScoring with access log (issue #119)", () => {
  it("episodic memories with recorded reads get higher reinforcementBoost than untouched ones", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );
    const { recordAccess } = await import(
      "../src/functions/access-tracker.js"
    );

    const memories = [
      makeMemory("mem_hot", 30),
      makeMemory("mem_cold", 30),
    ];
    const sdk = mockSdk();
    const kv = mockKV(memories);
    registerRetentionFunctions(sdk as never, kv as never);

    // Simulate 5 agent reads of mem_hot in the past 24h
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await recordAccess(kv as never, "mem_hot", now - i * 60_000);
    }

    const result = (await sdk.trigger({ function_id: "mem::retention-score", payload: {} })) as any;

    const hot = result.scores.find((s: any) => s.memoryId === "mem_hot");
    const cold = result.scores.find((s: any) => s.memoryId === "mem_cold");

    expect(hot.accessCount).toBe(5);
    expect(cold.accessCount).toBe(0);
    expect(hot.reinforcementBoost).toBeGreaterThan(0);
    expect(cold.reinforcementBoost).toBe(0);
    expect(hot.score).toBeGreaterThan(cold.score);
  });

  it("recent reads contribute more to reinforcement than ancient reads", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );
    const { recordAccess } = await import(
      "../src/functions/access-tracker.js"
    );

    const memories = [
      makeMemory("mem_recent_read", 60),
      makeMemory("mem_old_read", 60),
    ];
    const sdk = mockSdk();
    const kv = mockKV(memories);
    registerRetentionFunctions(sdk as never, kv as never);

    const now = Date.now();
    // mem_recent_read: 1 access yesterday
    await recordAccess(kv as never, "mem_recent_read", now - 86_400_000);
    // mem_old_read: 1 access 60 days ago
    await recordAccess(kv as never, "mem_old_read", now - 60 * 86_400_000);

    const result = (await sdk.trigger({ function_id: "mem::retention-score", payload: {} })) as any;
    const recent = result.scores.find(
      (s: any) => s.memoryId === "mem_recent_read",
    );
    const old = result.scores.find(
      (s: any) => s.memoryId === "mem_old_read",
    );

    expect(recent.reinforcementBoost).toBeGreaterThan(old.reinforcementBoost);
  });

  it("backwards-compat: semantic memories with only legacy lastAccessedAt still score", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );

    // Pre-0.8.3 data: semantic memory has lastAccessedAt set by the
    // consolidation pipeline, but no entry in mem:access. The merge in
    // retention.ts must inject lastAccessedAt into accessTimestamps so
    // the boost is non-zero. Compare against an identical sem with NO
    // lastAccessedAt to prove the merge actually contributes.
    const semWith = makeSemantic("sem_with_legacy", 30, 3);
    semWith.lastAccessedAt = new Date(Date.now() - 86_400_000).toISOString();
    const semWithout = makeSemantic("sem_without_legacy", 30, 3);
    semWithout.lastAccessedAt = "";

    const sdk = mockSdk();
    const kv = mockKV([], [semWith, semWithout]);
    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger({ function_id: "mem::retention-score", payload: {} })) as any;
    const withEntry = result.scores.find(
      (s: any) => s.memoryId === "sem_with_legacy",
    );
    const withoutEntry = result.scores.find(
      (s: any) => s.memoryId === "sem_without_legacy",
    );

    expect(withEntry.accessCount).toBe(3);
    expect(withEntry.reinforcementBoost).toBeGreaterThan(0);
    expect(withoutEntry.reinforcementBoost).toBe(0);
    // The merged legacy timestamp must produce a meaningful delta.
    expect(withEntry.reinforcementBoost).toBeGreaterThan(
      withoutEntry.reinforcementBoost + 0.1,
    );
  });

  it("corrupted lastAccessedAt does not propagate NaN into the score", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );
    const sem = makeSemantic("sem_corrupt", 30, 1);
    sem.lastAccessedAt = "<script>alert(1)</script>";

    const sdk = mockSdk();
    const kv = mockKV([], [sem]);
    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger({ function_id: "mem::retention-score", payload: {} })) as any;
    const entry = result.scores.find((s: any) => s.memoryId === "sem_corrupt");

    expect(Number.isFinite(entry.score)).toBe(true);
    expect(Number.isFinite(entry.reinforcementBoost)).toBe(true);
  });

  it("retention scoring normalizes malformed mem:access rows", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );
    const memories = [
      makeMemory("mem_corrupt", 10),
      makeMemory("mem_clean", 10),
    ];
    const sdk = mockSdk();
    const kv = mockKV(memories);

    // Seed the access namespace directly with garbage rows.
    await kv.set("mem:access", "mem_corrupt", {
      memoryId: "mem_corrupt",
      count: "not-a-number" as unknown as number,
      lastAt: 42 as unknown as string,
      recent: [NaN, "bad" as unknown as number, 5_000, Infinity, -1_000],
    });
    await kv.set("mem:access", "mem_clean", {
      memoryId: "mem_clean",
      count: -7,
      lastAt: "",
      recent: Array.from({ length: 50 }, (_, i) => i * 1000),
    });

    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger({ function_id: "mem::retention-score", payload: {} })) as any;
    const corrupt = result.scores.find(
      (s: any) => s.memoryId === "mem_corrupt",
    );
    const clean = result.scores.find((s: any) => s.memoryId === "mem_clean");

    expect(Number.isFinite(corrupt.score)).toBe(true);
    expect(Number.isFinite(corrupt.reinforcementBoost)).toBe(true);
    expect(corrupt.accessCount).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(clean.score)).toBe(true);
    // recent[] was 50 entries; normalization should have capped at 20.
    expect(clean.accessCount).toBeGreaterThanOrEqual(20);
  });

  it("retention scoring survives kv.list(mem:access) failures", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );
    const memories = [makeMemory("mem_resilient", 10)];
    const sdk = mockSdk();
    const kv = mockKV(memories);
    const realList = kv.list.bind(kv);
    kv.list = (async (scope: string) => {
      if (scope === "mem:access") throw new Error("namespace missing");
      return realList(scope);
    }) as never;

    registerRetentionFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger({ function_id: "mem::retention-score", payload: {} })) as any;
    expect(result.success).toBe(true);
    const entry = result.scores.find(
      (s: any) => s.memoryId === "mem_resilient",
    );
    expect(entry.accessCount).toBe(0);
  });

  it("fresh access log overrides legacy single-sample for semantic memories", async () => {
    const { registerRetentionFunctions } = await import(
      "../src/functions/retention.js"
    );
    const { recordAccess } = await import(
      "../src/functions/access-tracker.js"
    );

    const sem = makeSemantic("sem_active", 30, 1);
    const sdk = mockSdk();
    const kv = mockKV([], [sem]);
    registerRetentionFunctions(sdk as never, kv as never);

    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      await recordAccess(kv as never, "sem_active", now - i * 30_000);
    }

    const result = (await sdk.trigger({ function_id: "mem::retention-score", payload: {} })) as any;
    const entry = result.scores.find(
      (s: any) => s.memoryId === "sem_active",
    );

    // effectiveCount = max(log=10, sem.accessCount=1) = 10
    expect(entry.accessCount).toBe(10);
  });
});
