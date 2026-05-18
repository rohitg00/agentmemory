import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerContextFunction } from "../src/functions/context.js";
import { KV } from "../src/state/schema.js";
import type { Lesson } from "../src/types.js";

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

function makeLesson(over: Partial<Lesson> = {}): Lesson {
  const now = new Date().toISOString();
  return {
    id: over.id ?? `lesson_${Math.random().toString(36).slice(2)}`,
    content: over.content ?? "default lesson content",
    context: over.context ?? "",
    confidence: over.confidence ?? 0.7,
    reinforcements: over.reinforcements ?? 1,
    source: over.source ?? "manual",
    sourceIds: over.sourceIds ?? [],
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

async function seedLesson(
  kv: ReturnType<typeof mockKV>,
  partial: Partial<Lesson>,
) {
  const lesson = makeLesson(partial);
  await kv.set(KV.lessons, lesson.id, lesson);
  return lesson;
}

describe("mem::context — lessons auto-injection (#457)", () => {
  let kv: ReturnType<typeof mockKV>;
  let handler: ContextHandler;

  beforeEach(() => {
    kv = mockKV();
    handler = wireContext(kv);
  });

  it("includes a 'Lessons Learned' block when KV has lessons for the project", async () => {
    await seedLesson(kv, {
      id: "lesson_a",
      content: "always run npm test before commit",
      project: "/tmp/proj",
      confidence: 0.85,
    });

    const result = await handler({
      sessionId: "ses_a",
      project: "/tmp/proj",
    });

    expect(result.context).toContain("Lessons Learned");
    expect(result.context).toContain("always run npm test before commit");
    expect(result.blocks).toBeGreaterThan(0);
  });

  it("omits the lessons block entirely when KV has no lessons", async () => {
    const result = await handler({
      sessionId: "ses_empty",
      project: "/tmp/proj",
    });

    expect(result.context).not.toContain("Lessons Learned");
  });

  it("ranks project-scoped lessons above global lessons", async () => {
    await seedLesson(kv, {
      id: "lesson_global",
      content: "global-lesson-marker",
      project: undefined,
      confidence: 0.9,
    });
    await seedLesson(kv, {
      id: "lesson_project",
      content: "project-lesson-marker",
      project: "/tmp/proj",
      confidence: 0.7,
    });

    const result = await handler({
      sessionId: "ses_rank",
      project: "/tmp/proj",
    });

    const projectIdx = result.context.indexOf("project-lesson-marker");
    const globalIdx = result.context.indexOf("global-lesson-marker");
    expect(projectIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeLessThan(globalIdx);
  });

  it("excludes lessons scoped to a different project", async () => {
    await seedLesson(kv, {
      id: "lesson_other",
      content: "other-project-lesson",
      project: "/tmp/other-project",
      confidence: 0.9,
    });

    const result = await handler({
      sessionId: "ses_isolate",
      project: "/tmp/proj",
    });

    expect(result.context).not.toContain("other-project-lesson");
  });

  it("excludes deleted lessons", async () => {
    await seedLesson(kv, {
      id: "lesson_deleted",
      content: "tombstoned-lesson",
      project: "/tmp/proj",
      confidence: 0.9,
      deleted: true,
    });

    const result = await handler({
      sessionId: "ses_deleted",
      project: "/tmp/proj",
    });

    expect(result.context).not.toContain("tombstoned-lesson");
  });

  it("caps at the top 10 lessons by confidence", async () => {
    for (let i = 0; i < 15; i++) {
      await seedLesson(kv, {
        id: `lesson_${i}`,
        content: `lesson-marker-${i}`,
        project: "/tmp/proj",
        confidence: i / 100,
      });
    }

    const result = await handler({
      sessionId: "ses_cap",
      project: "/tmp/proj",
    });

    const matched = result.context.match(/lesson-marker-/g) ?? [];
    expect(matched.length).toBe(10);
    expect(result.context).toContain("lesson-marker-14");
    expect(result.context).toContain("lesson-marker-5");
    expect(result.context).not.toContain("lesson-marker-0");
  });

  it("shows lesson confidence in the rendered line", async () => {
    await seedLesson(kv, {
      id: "lesson_conf",
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

  it("appends optional context string when present", async () => {
    await seedLesson(kv, {
      id: "lesson_ctx",
      content: "use TaskCreate for >5-file work",
      context: "when working on multi-file refactors",
      project: "/tmp/proj",
      confidence: 0.8,
    });

    const result = await handler({
      sessionId: "ses_ctx",
      project: "/tmp/proj",
    });

    expect(result.context).toContain(
      "use TaskCreate for >5-file work — when working on multi-file refactors",
    );
  });
});
