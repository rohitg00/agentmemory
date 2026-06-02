import { describe, it, expect } from "vitest";
import { searchHighOrderTiers } from "../src/functions/high-order-search.js";
import type {
  SemanticMemory,
  ProceduralMemory,
  Crystal,
  Insight,
} from "../src/types.js";

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

function makeSemantic(overrides: Partial<SemanticMemory> = {}): SemanticMemory {
  return {
    id: "sem_1",
    fact: "TypeScript uses structural typing",
    confidence: 0.9,
    sourceSessionIds: [],
    sourceMemoryIds: [],
    accessCount: 1,
    lastAccessedAt: new Date().toISOString(),
    strength: 0.8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeProcedural(overrides: Partial<ProceduralMemory> = {}): ProceduralMemory {
  return {
    id: "proc_1",
    name: "Run vitest tests",
    steps: ["npm run build", "npx vitest run"],
    triggerCondition: "when testing code changes",
    frequency: 3,
    sourceSessionIds: [],
    strength: 0.7,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCrystal(overrides: Partial<Crystal> = {}): Crystal {
  return {
    id: "crys_1",
    narrative: "Database migration completed successfully with zero downtime",
    keyOutcomes: ["zero downtime", "all tables migrated"],
    filesAffected: ["db/migrate.ts"],
    lessons: ["always run migrations in a transaction"],
    sourceActionIds: [],
    project: "myproject",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: "ins_1",
    title: "TypeScript patterns improve code quality",
    content: "Using strict TypeScript patterns consistently reduces bugs",
    confidence: 0.85,
    reinforcements: 2,
    sourceConceptCluster: ["typescript", "patterns"],
    sourceMemoryIds: [],
    sourceLessonIds: [],
    sourceCrystalIds: [],
    tags: ["typescript", "quality"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    decayRate: 0.02,
    ...overrides,
  };
}

describe("searchHighOrderTiers", () => {
  it("returns semantic facts matching query", async () => {
    const kv = mockKV();
    await kv.set("mem:semantic", "sem_1", makeSemantic());

    const { results } = await searchHighOrderTiers(kv as any, "TypeScript typing", {
      confidenceFloor: 0.3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tier).toBe("semantic");
    expect(results[0].id).toBe("sem_1");
  });

  it("returns procedural skills matching query", async () => {
    const kv = mockKV();
    await kv.set("mem:procedural", "proc_1", makeProcedural());

    const { results } = await searchHighOrderTiers(kv as any, "vitest tests", {
      confidenceFloor: 0.3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tier).toBe("procedural");
  });

  it("returns crystals matching query", async () => {
    const kv = mockKV();
    await kv.set("mem:crystals", "crys_1", makeCrystal());

    const { results } = await searchHighOrderTiers(kv as any, "database migration", {
      confidenceFloor: 0.3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tier).toBe("crystal");
    expect(results[0].confidence).toBe(1.0);
  });

  it("returns insights matching query", async () => {
    const kv = mockKV();
    await kv.set("mem:insights", "ins_1", makeInsight());

    const { results } = await searchHighOrderTiers(kv as any, "TypeScript patterns", {
      confidenceFloor: 0.3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tier).toBe("insight");
  });

  it("filters by confidence floor", async () => {
    const kv = mockKV();
    await kv.set(
      "mem:semantic",
      "sem_low",
      makeSemantic({ id: "sem_low", confidence: 0.2, strength: 0.9, fact: "test fact" }),
    );
    await kv.set(
      "mem:semantic",
      "sem_high",
      makeSemantic({ id: "sem_high", confidence: 0.9, strength: 0.9, fact: "test fact" }),
    );

    const { results } = await searchHighOrderTiers(kv as any, "test fact", {
      confidenceFloor: 0.5,
    });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe("sem_high");
  });

  it("uses min(confidence, strength) for semantic decay interaction", async () => {
    const kv = mockKV();
    // High confidence but decayed strength
    await kv.set(
      "mem:semantic",
      "sem_1",
      makeSemantic({ id: "sem_decayed", confidence: 0.9, strength: 0.1, fact: "test fact" }),
    );

    const { results } = await searchHighOrderTiers(kv as any, "test fact", {
      confidenceFloor: 0.5,
    });

    expect(results.length).toBe(0);
  });

  it("filters procedural by strength", async () => {
    const kv = mockKV();
    await kv.set(
      "mem:procedural",
      "proc_1",
      makeProcedural({ id: "proc_weak", strength: 0.2, name: "test test" }),
    );

    const { results } = await searchHighOrderTiers(kv as any, "test test", {
      confidenceFloor: 0.5,
    });

    expect(results.length).toBe(0);
  });

  it("skips deleted insights", async () => {
    const kv = mockKV();
    await kv.set(
      "mem:insights",
      "ins_1",
      makeInsight({ id: "ins_del", title: "test fact", deleted: true }),
    );

    const { results } = await searchHighOrderTiers(kv as any, "test fact", {
      confidenceFloor: 0.3,
    });

    expect(results.length).toBe(0);
  });

  it("filters crystals by project", async () => {
    const kv = mockKV();
    await kv.set("mem:crystals", "crys_a", makeCrystal({ id: "crys_a", project: "projA" }));
    await kv.set("mem:crystals", "crys_b", makeCrystal({ id: "crys_b", project: "projB" }));

    const { results } = await searchHighOrderTiers(kv as any, "database migration", {
      confidenceFloor: 0.3,
      project: "projA",
    });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe("crys_a");
  });

  it("filters insights by project", async () => {
    const kv = mockKV();
    await kv.set("mem:insights", "ins_a", makeInsight({ id: "ins_a", project: "projA" }));
    await kv.set("mem:insights", "ins_b", makeInsight({ id: "ins_b", project: "projB" }));

    const { results } = await searchHighOrderTiers(kv as any, "TypeScript patterns", {
      confidenceFloor: 0.3,
      project: "projA",
    });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe("ins_a");
  });

  it("returns empty array for empty query terms", async () => {
    const kv = mockKV();
    await kv.set("mem:semantic", "sem_1", makeSemantic());

    const response = await searchHighOrderTiers(kv as any, "a", {
      confidenceFloor: 0.3,
    });

    expect(response).toEqual({ results: [], needsBackfill: false });
  });

  it("returns empty array when no tiers have data", async () => {
    const kv = mockKV();

    const response = await searchHighOrderTiers(kv as any, "test query", {
      confidenceFloor: 0.3,
    });

    expect(response).toEqual({ results: [], needsBackfill: false });
  });

  it("caps per-tier results at 50", async () => {
    const kv = mockKV();
    for (let i = 0; i < 60; i++) {
      await kv.set(
        "mem:semantic",
        `sem_${i}`,
        makeSemantic({ fact: `test fact ${i}` }),
      );
    }

    const { results } = await searchHighOrderTiers(kv as any, "test fact", {
      confidenceFloor: 0.3,
      limit: 100,
    });

    const semanticCount = results.filter((r) => r.tier === "semantic").length;
    expect(semanticCount).toBeLessThanOrEqual(50);
  });

  it("applies confidence boost for high-confidence entries", async () => {
    const kv = mockKV();
    await kv.set(
      "mem:semantic",
      "sem_low",
      makeSemantic({ id: "sem_low", fact: "test fact", confidence: 0.5, strength: 1.0 }),
    );
    await kv.set(
      "mem:semantic",
      "sem_high",
      makeSemantic({ id: "sem_high", fact: "test fact", confidence: 0.95, strength: 1.0 }),
    );

    const { results } = await searchHighOrderTiers(kv as any, "test fact", {
      confidenceFloor: 0.3,
    });

    expect(results.length).toBe(2);
    expect(results[0].id).toBe("sem_high");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("respects limit parameter", async () => {
    const kv = mockKV();
    for (let i = 0; i < 5; i++) {
      await kv.set(
        "mem:semantic",
        `sem_${i}`,
        makeSemantic({ id: `sem_${i}`, fact: `test fact ${i}` }),
      );
    }

    const { results } = await searchHighOrderTiers(kv as any, "test fact", {
      confidenceFloor: 0.3,
      limit: 3,
    });

    expect(results.length).toBe(3);
  });

  it("searches across multiple tiers simultaneously", async () => {
    const kv = mockKV();
    await kv.set("mem:semantic", "sem_1", makeSemantic({ fact: "shared keyword" }));
    await kv.set("mem:procedural", "proc_1", makeProcedural({ name: "shared keyword" }));

    const { results } = await searchHighOrderTiers(kv as any, "shared keyword", {
      confidenceFloor: 0.3,
    });

    const tiers = new Set(results.map((r) => r.tier));
    expect(tiers.size).toBeGreaterThanOrEqual(2);
    expect(tiers.has("semantic")).toBe(true);
    expect(tiers.has("procedural")).toBe(true);
  });

  it("truncates long content preview", async () => {
    const kv = mockKV();
    const longFact = "a".repeat(300) + " test fact";
    await kv.set(
      "mem:semantic",
      "sem_1",
      makeSemantic({ fact: longFact }),
    );

    const { results } = await searchHighOrderTiers(kv as any, "test fact", {
      confidenceFloor: 0.3,
    });

    expect(results.length).toBe(1);
    expect(results[0].content.length).toBeLessThanOrEqual(241); // 240 + ellipsis
    expect(results[0].content.endsWith("…")).toBe(true);
  });
});
