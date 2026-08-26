import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function setup() {
  vi.resetModules();
  const { registerLessonsFunctions, resetLessonIndex } = await import(
    "../src/functions/lessons.js"
  );
  const sdk = mockSdk({ looseTrigger: true });
  const kv = mockKV();
  registerLessonsFunctions(sdk as never, kv as never);
  return { sdk, kv, resetLessonIndex };
}

function gateFirstLessonList(kv: { list: (scope: string) => Promise<unknown[]> }) {
  const origList = kv.list.bind(kv);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let gated = true;
  kv.list = async (scope: string) => {
    if (scope === "mem:lessons" && gated) {
      gated = false;
      await gate;
    }
    return origList(scope);
  };
  return release;
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

  it("a save landing while the index build is in flight is not lost", async () => {
    const { sdk, kv } = await setup();
    await kv.set("mem:lessons", "lsn_early", {
      id: "lsn_early",
      content: "cache invalidation needs an explicit generation counter",
      context: "",
      confidence: 0.8,
      reinforcements: 0,
      source: "manual",
      sourceIds: [],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      decayRate: 0.05,
    });
    const release = gateFirstLessonList(kv as never);

    const pendingRecall = sdk.trigger("mem::lesson-recall", {
      query: "cache invalidation generation",
    });
    await new Promise((r) => setTimeout(r, 0));

    const saved = (await sdk.trigger("mem::lesson-save", {
      content: "cache invalidation generation counters beat timestamps",
      confidence: 0.9,
    })) as { success: boolean; lesson: { id: string } };
    expect(saved.success).toBe(true);

    release();
    await pendingRecall;

    const res = (await sdk.trigger("mem::lesson-recall", {
      query: "cache invalidation generation",
    })) as { lessons: Array<{ id: string }> };
    expect(res.lessons.map((l) => l.id)).toContain(saved.lesson.id);
    expect(res.lessons.map((l) => l.id)).toContain("lsn_early");
  });

  it("resetLessonIndex during an in-flight build discards the stale snapshot", async () => {
    const { sdk, kv, resetLessonIndex } = await setup();
    const release = gateFirstLessonList(kv as never);

    const pendingRecall = sdk.trigger("mem::lesson-recall", {
      query: "replayed lesson content",
    });
    await new Promise((r) => setTimeout(r, 0));

    await kv.set("mem:lessons", "lsn_replayed", {
      id: "lsn_replayed",
      content: "replayed lesson content arrives outside the lesson functions",
      context: "",
      confidence: 0.7,
      reinforcements: 0,
      source: "manual",
      sourceIds: [],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      decayRate: 0.05,
    });
    resetLessonIndex();

    release();
    await pendingRecall;

    const res = (await sdk.trigger("mem::lesson-recall", {
      query: "replayed lesson content",
    })) as { lessons: Array<{ id: string }> };
    expect(res.lessons.map((l) => l.id)).toContain("lsn_replayed");
  });
});
