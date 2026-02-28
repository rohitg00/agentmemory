import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerRelationsFunction } from "../src/functions/relations.js";
import type { Memory, MemoryRelation } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
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
    registerFunction: (opts: { id: string }, handler: Function) => {
      functions.set(opts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, data: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(data);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "pattern",
    title: "Test memory",
    content: "This is a test memory",
    concepts: ["test"],
    files: [],
    sessionIds: ["ses_1"],
    strength: 5,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

describe("Confidence Scoring", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerRelationsFunction(sdk as never, kv as never);
  });

  it("computes default confidence from co-occurrence and recency", async () => {
    const mem1 = makeMemory({
      id: "mem_1",
      sessionIds: ["ses_1", "ses_2"],
      updatedAt: new Date().toISOString(),
    });
    const mem2 = makeMemory({
      id: "mem_2",
      sessionIds: ["ses_1", "ses_2", "ses_3"],
      updatedAt: new Date().toISOString(),
    });
    await kv.set("mem:memories", "mem_1", mem1);
    await kv.set("mem:memories", "mem_2", mem2);

    const result = (await sdk.trigger("mem::relate", {
      sourceId: "mem_1",
      targetId: "mem_2",
      type: "related",
    })) as { success: boolean; relation: MemoryRelation };

    expect(result.success).toBe(true);
    expect(result.relation.confidence).toBeGreaterThan(0.5);
    expect(result.relation.confidence).toBeLessThanOrEqual(1);
  });

  it("uses explicit confidence when provided", async () => {
    const mem1 = makeMemory({ id: "mem_1" });
    const mem2 = makeMemory({ id: "mem_2" });
    await kv.set("mem:memories", "mem_1", mem1);
    await kv.set("mem:memories", "mem_2", mem2);

    const result = (await sdk.trigger("mem::relate", {
      sourceId: "mem_1",
      targetId: "mem_2",
      type: "related",
      confidence: 0.95,
    })) as { success: boolean; relation: MemoryRelation };

    expect(result.relation.confidence).toBe(0.95);
  });

  it("clamps confidence to [0, 1]", async () => {
    const mem1 = makeMemory({ id: "mem_1" });
    const mem2 = makeMemory({ id: "mem_2" });
    await kv.set("mem:memories", "mem_1", mem1);
    await kv.set("mem:memories", "mem_2", mem2);

    const over = (await sdk.trigger("mem::relate", {
      sourceId: "mem_1",
      targetId: "mem_2",
      type: "related",
      confidence: 1.5,
    })) as { success: boolean; relation: MemoryRelation };
    expect(over.relation.confidence).toBe(1);

    const mem3 = makeMemory({ id: "mem_3" });
    await kv.set("mem:memories", "mem_3", mem3);

    const under = (await sdk.trigger("mem::relate", {
      sourceId: "mem_1",
      targetId: "mem_3",
      type: "related",
      confidence: -0.5,
    })) as { success: boolean; relation: MemoryRelation };
    expect(under.relation.confidence).toBe(0);
  });

  it("mem::get-related sorts by confidence desc", async () => {
    const mem1 = makeMemory({ id: "mem_1", relatedIds: ["mem_2", "mem_3"] });
    const mem2 = makeMemory({ id: "mem_2", relatedIds: ["mem_1"] });
    const mem3 = makeMemory({ id: "mem_3", relatedIds: ["mem_1"] });
    await kv.set("mem:memories", "mem_1", mem1);
    await kv.set("mem:memories", "mem_2", mem2);
    await kv.set("mem:memories", "mem_3", mem3);

    await kv.set("mem:relations", "rel_low", {
      type: "related",
      sourceId: "mem_1",
      targetId: "mem_2",
      createdAt: new Date().toISOString(),
      confidence: 0.3,
    } as MemoryRelation);
    await kv.set("mem:relations", "rel_high", {
      type: "related",
      sourceId: "mem_1",
      targetId: "mem_3",
      createdAt: new Date().toISOString(),
      confidence: 0.9,
    } as MemoryRelation);

    const result = (await sdk.trigger("mem::get-related", {
      memoryId: "mem_1",
      maxHops: 1,
    })) as { results: Array<{ memory: Memory; hop: number; confidence: number }> };

    expect(result.results.length).toBe(2);
    expect(result.results[0].confidence).toBeGreaterThanOrEqual(
      result.results[1].confidence,
    );
  });

  it("minConfidence filter works", async () => {
    const mem1 = makeMemory({ id: "mem_1", relatedIds: ["mem_2", "mem_3"] });
    const mem2 = makeMemory({ id: "mem_2", relatedIds: ["mem_1"] });
    const mem3 = makeMemory({ id: "mem_3", relatedIds: ["mem_1"] });
    await kv.set("mem:memories", "mem_1", mem1);
    await kv.set("mem:memories", "mem_2", mem2);
    await kv.set("mem:memories", "mem_3", mem3);

    await kv.set("mem:relations", "rel_low", {
      type: "related",
      sourceId: "mem_1",
      targetId: "mem_2",
      createdAt: new Date().toISOString(),
      confidence: 0.2,
    } as MemoryRelation);
    await kv.set("mem:relations", "rel_high", {
      type: "related",
      sourceId: "mem_1",
      targetId: "mem_3",
      createdAt: new Date().toISOString(),
      confidence: 0.8,
    } as MemoryRelation);

    const result = (await sdk.trigger("mem::get-related", {
      memoryId: "mem_1",
      maxHops: 1,
      minConfidence: 0.5,
    })) as { results: Array<{ memory: Memory; hop: number; confidence: number }> };

    expect(result.results.length).toBe(1);
    expect(result.results[0].memory.id).toBe("mem_3");
  });

  it("mem::evolve creates supersedes relation with confidence=1.0", async () => {
    const original = makeMemory({ id: "mem_old", version: 1 });
    await kv.set("mem:memories", "mem_old", original);

    await sdk.trigger("mem::evolve", {
      memoryId: "mem_old",
      newContent: "Updated content",
    });

    const relations = await kv.list<MemoryRelation>("mem:relations");
    const supersedesRel = relations.find((r) => r.type === "supersedes");
    expect(supersedesRel).toBeDefined();
    expect(supersedesRel!.confidence).toBe(1.0);
  });

  it("old relations without confidence default to 0.5", async () => {
    const mem1 = makeMemory({ id: "mem_1", relatedIds: ["mem_2"] });
    const mem2 = makeMemory({ id: "mem_2", relatedIds: ["mem_1"] });
    await kv.set("mem:memories", "mem_1", mem1);
    await kv.set("mem:memories", "mem_2", mem2);

    await kv.set("mem:relations", "rel_old", {
      type: "related",
      sourceId: "mem_1",
      targetId: "mem_2",
      createdAt: new Date().toISOString(),
    } as MemoryRelation);

    const result = (await sdk.trigger("mem::get-related", {
      memoryId: "mem_1",
      maxHops: 1,
    })) as { results: Array<{ memory: Memory; hop: number; confidence: number }> };

    expect(result.results.length).toBe(1);
    expect(result.results[0].confidence).toBe(0.5);
  });
});
