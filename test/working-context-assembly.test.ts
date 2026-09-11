import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    update: async (scope: string, key: string, updates: Array<{ path: string; value: unknown }>) => {
      const m = store.get(scope);
      if (!m) return;
      const v = (m.get(key) as Record<string, unknown>) ?? {};
      for (const u of updates) v[u.path] = u.value;
      m.set(key, v);
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
    fns,
    registerFunction: (
      idOrOpts: string | { id: string },
      fn: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
    },
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown; action?: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

const PROJECT = "agentmemory";

function makeObservation(i: number, sessionId: string, baseTime: number) {
  return {
    id: `obs_${i}`,
    sessionId,
    timestamp: new Date(baseTime + i * 1000).toISOString(),
    type: "command_run",
    title: `Observation step ${i}`,
    narrative: `Completed task step ${i}`,
    facts: [],
    concepts: [],
    files: [],
    importance: 6,
  };
}

function makeLesson(i: number) {
  const now = new Date().toISOString();
  return {
    id: `lesson_${i}`,
    content: `lesson-cap-marker-${i}`,
    context: "",
    confidence: 0.99 - i * 0.05,
    reinforcements: 1,
    source: "manual",
    sourceIds: [],
    project: PROJECT,
    tags: [],
    createdAt: now,
    updatedAt: now,
    lastReinforcedAt: now,
    decayRate: 0.05,
  };
}

async function seedCheckpoint(
  kv: ReturnType<typeof mockKV>,
  id: string,
  sessionId: string,
  watermarkEnd: number,
  summary: string,
) {
  await kv.set("mem:checkpoints", id, {
    id,
    sessionId,
    project: PROJECT,
    watermarkStart: 0,
    watermarkEnd,
    summary,
    filesModified: [],
    createdAt: new Date().toISOString(),
  });
}

describe("Ticket 05: Bounded Working Context Assembly", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("legacy session without checkpoint renders exactly as before (no new tiers, lessons cap 10)", async () => {
    const { registerContextFunction } = await import("../src/functions/context.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerContextFunction(sdk as never, kv as never, 4000);

    const baseTime = Date.now() - 3600_000;
    for (let i = 0; i < 5; i++) {
      await kv.set(
        `mem:obs:ses_short`,
        `obs_${i}`,
        makeObservation(i, "ses_short", baseTime),
      );
    }
    for (let i = 0; i < 12; i++) {
      await kv.set("mem:lessons", `lesson_${i}`, makeLesson(i));
    }

    const result = (await sdk.trigger("mem::context", {
      sessionId: "ses_short",
      project: PROJECT,
    })) as { context: string; blocks: number; tokens: number };

    expect(result.context).not.toContain("Session Checkpoint");
    expect(result.context).not.toContain("Recent Activity");
    expect(result.context).not.toContain("Observation step 0");

    const matched = result.context.match(/lesson-cap-marker-/g) ?? [];
    expect(matched.length).toBe(10);
    expect(result.context).toContain("lesson-cap-marker-0");
    expect(result.context).not.toContain("lesson-cap-marker-10");
  });

  it("assembles 3-tier working context: checkpoint, last-25 tail, lessons capped at 3", async () => {
    const { registerContextFunction } = await import("../src/functions/context.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerContextFunction(sdk as never, kv as never, 4000);

    await kv.set("mem:sessions", "ses_long", {
      id: "ses_long",
      project: PROJECT,
      cwd: "/repo",
      startedAt: new Date(Date.now() - 3600_000).toISOString(),
      status: "active",
      observationCount: 60,
      uncompactedCount: 25,
      compactedWatermark: 35,
    });

    const baseTime = Date.now() - 3600_000;
    for (let i = 0; i < 60; i++) {
      await kv.set(
        `mem:obs:ses_long`,
        `obs_${i}`,
        makeObservation(i, "ses_long", baseTime),
      );
    }
    await seedCheckpoint(
      kv,
      "ckpt_long_1",
      "ses_long",
      35,
      "Episodic Checkpoint (0 - 35):\n- Step 0: done\n- Step 34: done",
    );
    for (let i = 0; i < 12; i++) {
      await kv.set("mem:lessons", `lesson_${i}`, makeLesson(i));
    }

    const result = (await sdk.trigger("mem::context", {
      sessionId: "ses_long",
      project: PROJECT,
    })) as { context: string; blocks: number; tokens: number };

    expect(result.context).toContain("Session Checkpoint");
    expect(result.context).toContain("Episodic Checkpoint");
    expect(result.context).toContain("Recent Activity (last 25 observations)");

    // Tail must contain exactly the last 25 of 60 observations (steps 35..59).
    expect(result.context).toContain("Observation step 59");
    expect(result.context).toContain("Observation step 35");
    expect(result.context).not.toContain("Observation step 34");
    expect(result.context).not.toContain("Observation step 0");

    // Checkpoint sorts above the tail window.
    expect(result.context.indexOf("Session Checkpoint")).toBeLessThan(
      result.context.indexOf("Recent Activity"),
    );

    // Lessons contribute at most the top 3 in 3-tier mode.
    const matched = result.context.match(/lesson-cap-marker-/g) ?? [];
    expect(matched.length).toBe(3);
    expect(result.context).toContain("lesson-cap-marker-0");
    expect(result.context).not.toContain("lesson-cap-marker-3");
  });

  it("selects the checkpoint with the highest watermarkEnd when multiple exist", async () => {
    const { registerContextFunction } = await import("../src/functions/context.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerContextFunction(sdk as never, kv as never, 4000);

    await seedCheckpoint(kv, "ckpt_a", "ses_multi", 20, "EARLY-CHECKPOINT-MARKER");
    await seedCheckpoint(kv, "ckpt_b", "ses_multi", 40, "LATEST-CHECKPOINT-MARKER");

    const result = (await sdk.trigger("mem::context", {
      sessionId: "ses_multi",
      project: PROJECT,
    })) as { context: string; blocks: number; tokens: number };

    expect(result.context).toContain("Session Checkpoint");
    expect(result.context).toContain("LATEST-CHECKPOINT-MARKER");
    expect(result.context).not.toContain("EARLY-CHECKPOINT-MARKER");
  });

  it("skips the tail block when the current session has zero observations", async () => {
    const { registerContextFunction } = await import("../src/functions/context.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerContextFunction(sdk as never, kv as never, 4000);

    await seedCheckpoint(
      kv,
      "ckpt_empty",
      "ses_empty",
      10,
      "Checkpoint for an observation-free session",
    );

    const result = (await sdk.trigger("mem::context", {
      sessionId: "ses_empty",
      project: PROJECT,
    })) as { context: string; blocks: number; tokens: number };

    expect(result.context).toContain("Session Checkpoint");
    expect(result.context).not.toContain("Recent Activity");
  });

  it("does not throw when the budget is smaller than the header", async () => {
    const { registerContextFunction } = await import("../src/functions/context.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerContextFunction(sdk as never, kv as never, 4000);

    await seedCheckpoint(
      kv,
      "ckpt_tiny",
      "ses_tiny",
      10,
      "Checkpoint summary for budget test.",
    );
    const baseTime = Date.now() - 3600_000;
    for (let i = 0; i < 30; i++) {
      await kv.set(
        `mem:obs:ses_tiny`,
        `obs_${i}`,
        makeObservation(i, "ses_tiny", baseTime),
      );
    }

    const result = (await sdk.trigger("mem::context", {
      sessionId: "ses_tiny",
      project: PROJECT,
      budget: 5,
    })) as { context: string; blocks: number; tokens: number };

    expect(result.context).toBe("");
    expect(result.blocks).toBe(0);
    expect(result.tokens).toBe(0);
  });

  it("budget loop drops blocks that exceed the remaining budget", async () => {
    const { registerContextFunction } = await import("../src/functions/context.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerContextFunction(sdk as never, kv as never, 4000);

    await seedCheckpoint(
      kv,
      "ckpt_budget",
      "ses_budget",
      10,
      "Checkpoint summary for budget test.",
    );
    const baseTime = Date.now() - 3600_000;
    for (let i = 0; i < 30; i++) {
      await kv.set(
        `mem:obs:ses_budget`,
        `obs_${i}`,
        makeObservation(i, "ses_budget", baseTime),
      );
    }

    const result = (await sdk.trigger("mem::context", {
      sessionId: "ses_budget",
      project: PROJECT,
      budget: 60,
    })) as { context: string; blocks: number; tokens: number };

    expect(result.context).toContain("Session Checkpoint");
    expect(result.context).not.toContain("Recent Activity");
    expect(result.tokens).toBeLessThanOrEqual(60);
  });
});
