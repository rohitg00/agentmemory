import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerContextFunction } from "../src/functions/context.js";
import { KV } from "../src/state/schema.js";
import type { Insight, SemanticMemory, Session } from "../src/types.js";

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
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    },
  };
}

type ContextHandler = (data: {
  sessionId: string;
  project: string;
  budget?: number;
}) => Promise<{ context: string; blocks: number; tokens: number }>;

function wireContext(kv: ReturnType<typeof mockKV>, budget = 4000) {
  let handler: ContextHandler | undefined;
  const sdk = {
    registerFunction: vi.fn((id: string, cb: ContextHandler) => {
      if (id === "mem::context") handler = cb;
    }),
  } as unknown as import("iii-sdk").ISdk;
  registerContextFunction(sdk, kv as never, budget);
  if (!handler) throw new Error("mem::context not registered");
  return handler;
}

function makeInsight(over: Partial<Insight> = {}): Insight {
  const now = new Date().toISOString();
  return {
    id: over.id ?? `ins_${Math.random().toString(36).slice(2)}`,
    title: over.title ?? "default insight title",
    content: over.content ?? "default insight content",
    confidence: over.confidence ?? 0.7,
    reinforcements: over.reinforcements ?? 1,
    sourceConceptCluster: over.sourceConceptCluster ?? [],
    sourceMemoryIds: over.sourceMemoryIds ?? [],
    sourceLessonIds: over.sourceLessonIds ?? [],
    sourceCrystalIds: over.sourceCrystalIds ?? [],
    project: over.project,
    tags: over.tags ?? [],
    createdAt: over.createdAt ?? now,
    updatedAt: over.updatedAt ?? now,
    lastReinforcedAt: over.lastReinforcedAt,
    lastDecayedAt: over.lastDecayedAt,
    decayRate: over.decayRate ?? 0.05,
    deleted: over.deleted,
  };
}

function makeSemantic(over: Partial<SemanticMemory> = {}): SemanticMemory {
  const now = new Date().toISOString();
  return {
    id: over.id ?? `sem_${Math.random().toString(36).slice(2)}`,
    fact: over.fact ?? "default semantic fact",
    confidence: over.confidence ?? 0.9,
    sourceSessionIds: over.sourceSessionIds ?? [],
    sourceMemoryIds: over.sourceMemoryIds ?? [],
    accessCount: over.accessCount ?? 0,
    lastAccessedAt: over.lastAccessedAt ?? now,
    strength: over.strength ?? 0.8,
    createdAt: over.createdAt ?? now,
    updatedAt: over.updatedAt ?? now,
  };
}

function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: over.id ?? `ses_${Math.random().toString(36).slice(2)}`,
    project: over.project ?? "/tmp/proj",
    cwd: over.cwd ?? over.project ?? "/tmp/proj",
    startedAt: over.startedAt ?? new Date().toISOString(),
    status: over.status ?? "completed",
    observationCount: over.observationCount ?? 0,
    endedAt: over.endedAt,
    updatedAt: over.updatedAt,
  };
}

async function seedInsight(
  kv: ReturnType<typeof mockKV>,
  partial: Partial<Insight>,
) {
  const insight = makeInsight(partial);
  await kv.set(KV.insights, insight.id, insight);
  return insight;
}

async function seedSemantic(
  kv: ReturnType<typeof mockKV>,
  partial: Partial<SemanticMemory>,
) {
  const fact = makeSemantic(partial);
  await kv.set(KV.semantic, fact.id, fact);
  return fact;
}

async function seedSession(
  kv: ReturnType<typeof mockKV>,
  partial: Partial<Session>,
) {
  const session = makeSession(partial);
  await kv.set(KV.sessions, session.id, session);
  return session;
}

describe("mem::context — insights auto-injection (#590)", () => {
  let kv: ReturnType<typeof mockKV>;
  let handler: ContextHandler;

  beforeEach(() => {
    kv = mockKV();
    handler = wireContext(kv);
  });

  it("includes a 'Distilled Insights' block when KV has insights for the project", async () => {
    await seedInsight(kv, {
      id: "ins_a",
      title: "PID 1 masking kills restart policy",
      content: "When nginx runs as PID 1, supervisor never sees death.",
      project: "/tmp/proj",
      confidence: 0.95,
    });

    const result = await handler({
      sessionId: "ses_a",
      project: "/tmp/proj",
    });

    expect(result.context).toContain("Distilled Insights");
    expect(result.context).toContain("PID 1 masking kills restart policy");
    expect(result.blocks).toBeGreaterThan(0);
  });

  it("omits the insights block entirely when KV has no insights", async () => {
    const result = await handler({
      sessionId: "ses_empty",
      project: "/tmp/proj",
    });

    expect(result.context).not.toContain("Distilled Insights");
  });

  it("ranks project-scoped insights above global insights", async () => {
    await seedInsight(kv, {
      id: "ins_global",
      title: "global-insight-marker",
      content: "global content",
      project: undefined,
      confidence: 0.9,
    });
    await seedInsight(kv, {
      id: "ins_project",
      title: "project-insight-marker",
      content: "project content",
      project: "/tmp/proj",
      confidence: 0.7,
    });

    const result = await handler({
      sessionId: "ses_rank",
      project: "/tmp/proj",
    });

    const projectIdx = result.context.indexOf("project-insight-marker");
    const globalIdx = result.context.indexOf("global-insight-marker");
    expect(projectIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeLessThan(globalIdx);
  });

  it("excludes insights scoped to a different project", async () => {
    await seedInsight(kv, {
      id: "ins_other",
      title: "other-project-insight",
      content: "should not appear",
      project: "/tmp/other-project",
      confidence: 0.9,
    });

    const result = await handler({
      sessionId: "ses_isolate",
      project: "/tmp/proj",
    });

    expect(result.context).not.toContain("other-project-insight");
  });

  it("excludes deleted insights", async () => {
    await seedInsight(kv, {
      id: "ins_deleted",
      title: "tombstoned-insight",
      content: "should not appear",
      project: "/tmp/proj",
      confidence: 0.9,
      deleted: true,
    });

    const result = await handler({
      sessionId: "ses_deleted",
      project: "/tmp/proj",
    });

    expect(result.context).not.toContain("tombstoned-insight");
  });

  it("caps at the top 10 insights by confidence", async () => {
    for (let i = 0; i < 15; i++) {
      await seedInsight(kv, {
        id: `ins_${i}`,
        title: `insight-marker-${i}`,
        content: `content ${i}`,
        project: "/tmp/proj",
        confidence: i / 100,
      });
    }

    const result = await handler({
      sessionId: "ses_cap",
      project: "/tmp/proj",
    });

    const matched = result.context.match(/insight-marker-/g) ?? [];
    expect(matched.length).toBe(10);
    expect(result.context).toContain("insight-marker-14");
    expect(result.context).toContain("insight-marker-5");
    expect(result.context).not.toContain("insight-marker-0");
  });

  it("shows insight confidence in the rendered line", async () => {
    await seedInsight(kv, {
      id: "ins_conf",
      title: "confidence-test",
      content: "test confidence rendering",
      project: "/tmp/proj",
      confidence: 0.83,
    });

    const result = await handler({
      sessionId: "ses_conf",
      project: "/tmp/proj",
    });

    expect(result.context).toContain("(0.83)");
  });
});

describe("mem::context — semantic facts auto-injection (#590)", () => {
  let kv: ReturnType<typeof mockKV>;
  let handler: ContextHandler;

  beforeEach(() => {
    kv = mockKV();
    handler = wireContext(kv);
  });

  it("includes an 'Architectural Facts' block when KV has semantic facts whose source session is in the current project", async () => {
    const session = await seedSession(kv, {
      id: "ses_src",
      project: "/tmp/proj",
    });
    await seedSemantic(kv, {
      id: "sem_a",
      fact: "Loki runs in a railway-loki docker container",
      sourceSessionIds: [session.id],
      confidence: 0.95,
      strength: 0.9,
    });

    const result = await handler({
      sessionId: "ses_a",
      project: "/tmp/proj",
    });

    expect(result.context).toContain("Architectural Facts");
    expect(result.context).toContain(
      "Loki runs in a railway-loki docker container",
    );
  });

  it("includes facts with no source sessions (treated as global cross-project knowledge)", async () => {
    await seedSemantic(kv, {
      id: "sem_global",
      fact: "global-semantic-marker",
      sourceSessionIds: [],
      confidence: 0.9,
      strength: 0.8,
    });

    const result = await handler({
      sessionId: "ses_a",
      project: "/tmp/proj",
    });

    expect(result.context).toContain("global-semantic-marker");
  });

  it("excludes facts whose source sessions are entirely in other projects", async () => {
    const otherSession = await seedSession(kv, {
      id: "ses_other_src",
      project: "/tmp/other-project",
    });
    await seedSemantic(kv, {
      id: "sem_other",
      fact: "other-project-semantic-marker",
      sourceSessionIds: [otherSession.id],
      confidence: 0.95,
      strength: 0.9,
    });

    const result = await handler({
      sessionId: "ses_a",
      project: "/tmp/proj",
    });

    expect(result.context).not.toContain("other-project-semantic-marker");
  });

  it("ranks project-matching facts above pure-global facts", async () => {
    await seedSemantic(kv, {
      id: "sem_global_rank",
      fact: "global-rank-marker",
      sourceSessionIds: [],
      confidence: 0.9,
      strength: 1.0,
    });
    const session = await seedSession(kv, {
      id: "ses_src_rank",
      project: "/tmp/proj",
    });
    await seedSemantic(kv, {
      id: "sem_project_rank",
      fact: "project-rank-marker",
      sourceSessionIds: [session.id],
      confidence: 0.7,
      strength: 1.0,
    });

    const result = await handler({
      sessionId: "ses_a",
      project: "/tmp/proj",
    });

    const projectIdx = result.context.indexOf("project-rank-marker");
    const globalIdx = result.context.indexOf("global-rank-marker");
    expect(projectIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeLessThan(globalIdx);
  });

  it("caps at top 10 facts by score", async () => {
    const session = await seedSession(kv, {
      id: "ses_cap_src",
      project: "/tmp/proj",
    });
    for (let i = 0; i < 15; i++) {
      await seedSemantic(kv, {
        id: `sem_${i}`,
        fact: `semantic-marker-${i}`,
        sourceSessionIds: [session.id],
        confidence: i / 100,
        strength: 1,
      });
    }

    const result = await handler({
      sessionId: "ses_a",
      project: "/tmp/proj",
      budget: 10000,
    });

    const matched = result.context.match(/semantic-marker-/g) ?? [];
    expect(matched.length).toBe(10);
    expect(result.context).toContain("semantic-marker-14");
    expect(result.context).toContain("semantic-marker-5");
    expect(result.context).not.toContain("semantic-marker-0");
  });
});
