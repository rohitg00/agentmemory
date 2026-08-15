import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function setup() {
  vi.resetModules();
  const { registerLessonsFunctions } = await import("../src/functions/lessons.js");
  const sdk = mockSdk({ looseTrigger: true });
  const kv = mockKV();
  registerLessonsFunctions(sdk as never, kv as never);
  return { sdk, kv };
}

describe("lesson recall through the lesson index", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("recalls a saved lesson by keyword and preserves confidence ordering", async () => {
    const { sdk } = await setup();
    await sdk.trigger("mem::lesson-save", {
      content: "always run migrations inside a transaction",
      confidence: 0.9,
      tags: ["database"],
    });
    await sdk.trigger("mem::lesson-save", {
      content: "database migrations need a rollback script committed alongside",
      confidence: 0.3,
      tags: ["database"],
    });

    const res = (await sdk.trigger("mem::lesson-recall", {
      query: "database migrations",
    })) as { success: boolean; lessons: Array<{ content: string; score: number }> };

    expect(res.success).toBe(true);
    expect(res.lessons.length).toBe(2);
    expect(res.lessons[0].content).toContain("transaction");
    expect(res.lessons[0].score).toBeGreaterThan(res.lessons[1].score);
  });

  it("recalls lessons that existed before the index was built (lazy rebuild)", async () => {
    const { sdk, kv } = await setup();
    await kv.set("mem:lessons", "lsn_pre", {
      id: "lsn_pre",
      content: "verify wire payloads at the boundary before trusting them",
      context: "",
      confidence: 0.8,
      reinforcements: 2,
      source: "manual",
      sourceIds: [],
      tags: ["verification"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      decayRate: 0.05,
    });

    const res = (await sdk.trigger("mem::lesson-recall", {
      query: "wire payloads boundary",
    })) as { lessons: Array<{ id: string }> };

    expect(res.lessons.map((l) => l.id)).toContain("lsn_pre");
  });

  it("stops returning deleted lessons", async () => {
    const { sdk } = await setup();
    const saved = (await sdk.trigger("mem::lesson-save", {
      content: "prefer streaming responses over polling loops",
      confidence: 0.7,
    })) as { lesson: { id: string } };

    let res = (await sdk.trigger("mem::lesson-recall", {
      query: "streaming polling",
    })) as { lessons: Array<{ id: string }> };
    expect(res.lessons.map((l) => l.id)).toContain(saved.lesson.id);

    await sdk.trigger("mem::lesson-delete", { lessonId: saved.lesson.id });

    res = (await sdk.trigger("mem::lesson-recall", {
      query: "streaming polling",
    })) as { lessons: Array<{ id: string }> };
    expect(res.lessons.map((l) => l.id)).not.toContain(saved.lesson.id);
  });
});
