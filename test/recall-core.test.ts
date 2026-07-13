import { describe, expect, it } from "vitest";
import { RecallCore } from "../src/recall/core.js";
import type { HybridSearchResult, RecallConfig } from "../src/types.js";
import { KV } from "../src/state/schema.js";

function makeKv() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
      return value;
    },
    update: async <T>(scope: string, key: string, ops: Array<{ type: string; path: string; value?: unknown; by?: number }>): Promise<T> => {
      const current = (store.get(scope)?.get(key) as Record<string, unknown> | undefined) ?? {};
      for (const op of ops) {
        if (op.type === "increment") current[op.path] = Number(current[op.path] ?? 0) + Number(op.by);
        if (op.type === "set") current[op.path] = op.value;
      }
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, current);
      return current as T;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> =>
      (Array.from(store.get(scope)?.values() || []) as T[]),
    store,
  };
}

const config: RecallConfig = {
  budget: {
    maxContextTokens: 80,
    reservedBootstrapTokens: 20,
    maxSemanticTokens: 60,
    maxMemories: 5,
    maxSessionSummaries: 1,
    maxObservations: 3,
    maxContinuityItems: 1,
  },
  scope: { unknownAutoInjection: false, unknownExplicitSearch: true },
  trace: { retentionDays: 30, maxTraces: 100, maxDroppedItemsPerReason: 20 },
  injection: { reinjectionTurnWindow: 8 },
};

function hit(id: string, score: number): HybridSearchResult {
  return {
    observation: {
      id,
      sessionId: "memory",
      timestamp: "2026-07-01T00:00:00.000Z",
      type: "decision",
      title: id,
      facts: [],
      narrative: `${id} relevant implementation detail`,
      concepts: [],
      files: [],
      importance: 7,
    },
    bm25Score: score,
    vectorScore: 0,
    graphScore: 0,
    combinedScore: score,
    sessionId: "memory",
  };
}

describe("RecallCore", () => {
  it("blocks unknown memories from automatic prompt injection and records why", async () => {
    const kv = makeKv();
    await kv.set(KV.memories, "mem_scoped", {
      id: "mem_scoped", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
      type: "fact", title: "scoped", content: "PPS7000 pair cache uses a staged key", concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
      scope: { level: "project", projectId: "pps", repoId: "repo-a" }, origin: "manual",
    });
    await kv.set(KV.memories, "mem_legacy", {
      id: "mem_legacy", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
      type: "fact", title: "legacy", content: "Ivan plan is not for PPS", concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
    });
    const core = new RecallCore(kv as never, config, async () => [hit("mem_scoped", 0.8), hit("mem_legacy", 0.9)]);

    const result = await core.recall({
      entryPoint: "prompt", outputMode: "prompt_injection", query: "PPS7000 pair cache",
      projectId: "pps", repoId: "repo-a", sessionId: "s1",
    });

    expect(result.context).toContain("PPS7000 pair cache");
    expect(result.context).not.toContain("Ivan plan");
    expect(result.trace.droppedCountsByDecision.scope_mismatch).toBe(1);
    expect(result.trace.dropped[0]).toMatchObject({ id: "mem_legacy", decision: "scope_mismatch" });
  });

  it("does not apply context token budget to ranked search results", async () => {
    const kv = makeKv();
    for (const id of ["mem_one", "mem_two"]) {
      await kv.set(KV.memories, id, {
        id, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
        type: "fact", title: id, content: "a deliberately long but relevant memory value for structured search", concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
        scope: { level: "project", projectId: "pps" }, origin: "manual",
      });
    }
    const core = new RecallCore(kv as never, { ...config, budget: { ...config.budget, maxContextTokens: 1 } }, async () => [hit("mem_one", 0.8), hit("mem_two", 0.7)]);
    const result = await core.recall({ entryPoint: "search", outputMode: "ranked_results", query: "relevant", projectId: "pps", limit: 2 });

    expect(result.results.map((item) => item.id)).toEqual(["mem_one", "mem_two"]);
    expect(result.context).toBe("");
  });

  it("honors explicit ranked result limits, including zero and limits above candidates", async () => {
    const kv = makeKv();
    for (const id of ["mem_one", "mem_two"]) {
      await kv.set(KV.memories, id, {
        id, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
        type: "fact", title: id, content: `${id} relevant implementation detail`, concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
        scope: { level: "project", projectId: "pps" }, origin: "manual",
      });
    }
    const core = new RecallCore(kv as never, config, async () => [hit("mem_one", 0.8), hit("mem_two", 0.7)]);

    const zero = await core.recall({ entryPoint: "search", outputMode: "ranked_results", query: "relevant", projectId: "pps", limit: 0 });
    const aboveCandidates = await core.recall({ entryPoint: "search", outputMode: "ranked_results", query: "relevant", projectId: "pps", limit: 10 });

    expect(zero.results).toHaveLength(0);
    expect(aboveCandidates.results).toHaveLength(2);
  });

  it("clamps request budgets to the configured hard context ceiling", async () => {
    const kv = makeKv();
    await kv.set(KV.memories, "mem_clamped", {
      id: "mem_clamped", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
      type: "fact", title: "clamped", content: "A deliberately long memory that must remain below the service hard ceiling.", concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
      scope: { level: "project", projectId: "pps" }, origin: "manual",
    });
    const core = new RecallCore(kv as never, config, async () => [hit("mem_clamped", 0.8)]);
    const result = await core.recall({
      entryPoint: "context", outputMode: "rendered_context", query: "clamped", projectId: "pps",
      budget: { maxContextTokens: 10_000 },
    });

    expect(result.trace.finalContextTokenCount).toBeLessThanOrEqual(config.budget.maxContextTokens);
  });

  it("keeps prompt injection inside the hard context budget", async () => {
    const kv = makeKv();
    await kv.set(KV.memories, "mem_prompt", {
      id: "mem_prompt", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
      type: "fact", title: "prompt", content: "A long prompt-injection candidate that must not exceed the hard budget.", concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
      scope: { level: "project", projectId: "pps" }, origin: "manual",
    });
    const hardConfig = { ...config, budget: { ...config.budget, maxContextTokens: 12, maxSemanticTokens: 12 } };
    const core = new RecallCore(kv as never, hardConfig, async () => [hit("mem_prompt", 0.8)]);
    const result = await core.recall({ entryPoint: "prompt", outputMode: "prompt_injection", query: "prompt", projectId: "pps", sessionId: "session" });

    expect(result.trace.finalContextTokenCount).toBeLessThanOrEqual(12);
  });

  it("suppresses duplicate automatic injection only inside the current epoch and turn window", async () => {
    const kv = makeKv();
    await kv.set(KV.memories, "mem_one", {
      id: "mem_one", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
      type: "fact", title: "one", content: "relevant durable implementation memory", concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
      scope: { level: "project", projectId: "pps" }, origin: "manual",
    });
    const core = new RecallCore(kv as never, config, async () => [hit("mem_one", 0.8)]);
    const request = { entryPoint: "prompt" as const, outputMode: "prompt_injection" as const, query: "relevant", projectId: "pps", sessionId: "session" };

    const first = await core.recall(request);
    const second = await core.recall(request);

    expect(first.trace.selectedTokenCount).toBeGreaterThan(0);
    expect(second.trace.selectedTokenCount).toBe(0);
    expect(second.trace.droppedCountsByDecision.duplicate).toBe(1);
  });

  it("loads explicitly scoped bootstrap rules separately from semantic recall", async () => {
    const kv = makeKv();
    await kv.set(KV.slots, "project_context", {
      label: "project_context", content: "Run the project validation before publishing.", sizeLimit: 1000,
      description: "", pinned: true, readOnly: false, scope: "project", projectId: "pps", repoId: "repo-a",
      createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
    });
    await kv.set(KV.slots, "pending_items", {
      label: "pending_items", content: "Validate the pair cache fixture.", sizeLimit: 1000,
      description: "", pinned: true, readOnly: false, scope: "project", projectId: "pps", repoId: "repo-a",
      createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const core = new RecallCore(kv as never, config);
    const result = await core.recall({ entryPoint: "session_start", outputMode: "bootstrap", projectId: "pps", repoId: "repo-a", sessionId: "s1" });

    expect(result.context).toContain("Run the project validation");
    expect(result.context).toContain("Validate the pair cache fixture");
    expect(result.trace.selected.map((item) => item.kind)).toContain("continuity");
  });

  it("counts wrappers and separators inside the hard rendered-context budget", async () => {
    const kv = makeKv();
    await kv.set(KV.memories, "mem_budget", {
      id: "mem_budget", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
      type: "fact", title: "budget", content: "A long enough memory body to exercise conservative token packing.", concepts: [], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
      scope: { level: "project", projectId: "pps" }, origin: "manual",
    });
    const core = new RecallCore(kv as never, { ...config, budget: { ...config.budget, maxContextTokens: 12, maxSemanticTokens: 12 } }, async () => [hit("mem_budget", 0.8)]);
    const result = await core.recall({ entryPoint: "context", outputMode: "rendered_context", query: "budget", projectId: "pps" });

    expect(result.trace.finalContextTokenCount).toBeLessThanOrEqual(12);
    expect(result.trace.droppedCountsByDecision.over_budget).toBe(1);
  });
});
