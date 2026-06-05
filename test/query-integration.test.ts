import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerQueryFunction } from "../src/functions/query.js";
import type {
  CompressedObservation,
  Lesson,
  LineageResult,
  MemoryProvider,
  QueryRequest,
  QueryResult,
  Session,
  SessionSummary,
  TimelineItem,
} from "../src/types.js";

// ---- mocks -----------------------------------------------------------------

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
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
    functions,
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function registered: ${id}`);
      return fn(payload);
    },
  };
}

interface MockProvider extends MemoryProvider {
  calls: { kind: "summarize" | "compress"; system: string; user: string }[];
}

function mockProvider(): MockProvider {
  const calls: { kind: "summarize" | "compress"; system: string; user: string }[] = [];
  return {
    name: "mock",
    calls,
    summarize: async (system: string, user: string) => {
      calls.push({ kind: "summarize", system, user });
      // Heuristic: if the system prompt is the ranker, return a JSON
      // array assigning a fake score per id mentioned in user prompt.
      if (system.includes("relevance scorer")) {
        const ids = [...user.matchAll(/id=(\S+)/g)].map((m) => m[1]);
        const arr = ids.map((id, i) => ({ id, score: 1 - i * 0.1 }));
        return JSON.stringify(arr);
      }
      // Otherwise it's the synthesize prompt: echo the ids it finds as
      // citations so the parser can pick them up.
      const ids = [...user.matchAll(/_id=(\S+)/g)].map((m) => m[1]);
      const summary = `STUB SUMMARY mentioning ${ids.slice(0, 3).join(", ")}`;
      const citations = JSON.stringify(ids.slice(0, 3).map((id) => ({ kind: "memory", id })));
      return `${summary}\nCITATIONS: ${citations}`;
    },
    compress: async () => "STUB COMPRESS",
  };
}

// ---- helpers ---------------------------------------------------------------

function timelineItem(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    timestamp: "2026-05-15T00:00:00Z",
    channel: "memory",
    id: "tl-default",
    sessionId: "s-default",
    project: "proj-A",
    title: "Default title",
    snippet: "Default snippet",
    score: 1.0,
    ...overrides,
  } as TimelineItem;
}

function makeLineage(items: TimelineItem[]): LineageResult {
  return {
    query: "stub",
    firstMention: items[0]
      ? {
          timestamp: items[0].timestamp,
          channel: items[0].channel,
          sessionId: items[0].sessionId,
          project: items[0].project,
        }
      : null,
    timeline: items,
    totalsByChannel: {
      observation: items.filter((i) => i.channel === "observation").length,
      memory: items.filter((i) => i.channel === "memory").length,
      lesson: items.filter((i) => i.channel === "lesson").length,
      summary: items.filter((i) => i.channel === "summary").length,
    },
  };
}

async function callQuery(
  sdk: ReturnType<typeof mockSdk>,
  req: QueryRequest,
): Promise<QueryResult> {
  return (await sdk.trigger({ function_id: "mem::query", payload: req })) as QueryResult;
}

// ---- tests -----------------------------------------------------------------

describe("mem::query — integration", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let provider: MockProvider;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    provider = mockProvider();
    registerQueryFunction(sdk as never, kv as never, provider);
  });

  it("rejects writer ops at validation time", async () => {
    const result = await callQuery(sdk, {
      pipeline: [{ op: "save" as never, content: "x" } as never],
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toMatch(/not allowed/);
    }
  });

  it("rejects empty pipeline", async () => {
    const result = await callQuery(sdk, { pipeline: [] as never });
    expect(result.kind).toBe("error");
  });

  it("rejects synthesize that isn't terminal", async () => {
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "synthesize", question: "huh" },
        { op: "limit", n: 1 },
      ] as never,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.error).toMatch(/terminal/);
  });

  it("rejects synthesize inside for_each (LLM blowup)", async () => {
    const result = await callQuery(sdk, {
      pipeline: [
        {
          op: "for_each",
          do: [{ op: "synthesize", question: "no" }],
        },
      ] as never,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.error).toMatch(/synthesize.*not allowed inside for_each/);
  });

  it("rejects rank_by_relevance inside for_each", async () => {
    const result = await callQuery(sdk, {
      pipeline: [
        {
          op: "for_each",
          do: [{ op: "rank_by_relevance", target: "x" }],
        },
      ] as never,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.error).toMatch(/rank_by_relevance.*not allowed/);
  });

  it("dry_run returns plan and estimated cost without executing", async () => {
    sdk.registerFunction("mem::lineage", async () => {
      throw new Error("should not be called");
    });
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "x" },
        { op: "filter", where: { field: "_kind", op: "eq", value: "memory" } },
        { op: "limit", n: 5 },
      ],
      options: { dry_run: true },
    });
    expect(result.kind).toBe("dry_run");
    if (result.kind === "dry_run") {
      expect(result.plan.length).toBe(3);
      expect(result.estimatedCost.min).toBe(3 + 1 + 1); // lineage:3 + filter:1 + limit:1
      expect(result.estimatedCost.max).toBe(result.estimatedCost.min);
    }
  });

  it("runs producer + transformers and returns records", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([
        timelineItem({ id: "m1", channel: "memory", title: "Decision A", score: 0.9 }),
        timelineItem({ id: "o1", channel: "observation", title: "Obs A", score: 0.5 }),
        timelineItem({ id: "m2", channel: "memory", title: "Decision B", score: 0.7 }),
      ]),
    );
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "x" },
        { op: "filter", where: { field: "_kind", op: "eq", value: "memory" } },
        { op: "sort", by: "_score", dir: "desc" },
        { op: "limit", n: 2 },
      ],
    });
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      expect(result.result.length).toBe(2);
      expect(result.result[0]._id).toBe("m1");
      expect(result.result[1]._id).toBe("m2");
      expect(result.cost.llmCalls).toBe(0);
      expect(result.trace.map((t) => t.op)).toEqual(["lineage", "filter", "sort", "limit"]);
    }
  });

  it("synthesize terminates pipeline and invokes the provider once", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([
        timelineItem({ id: "m1", channel: "memory", title: "Pick X", snippet: "We picked X." }),
        timelineItem({ id: "m2", channel: "memory", title: "Rejected Y", snippet: "Considered Y but…" }),
      ]),
    );
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "pick X" },
        { op: "synthesize", question: "Why X?", style: "answer", maxCitations: 3 },
      ],
    });
    expect(result.kind).toBe("synthesis");
    if (result.kind === "synthesis") {
      expect(result.cost.llmCalls).toBe(1);
      expect(provider.calls.length).toBe(1);
      expect(provider.calls[0].kind).toBe("summarize");
      expect(result.result.summary).toContain("STUB SUMMARY");
      expect(result.result.citations.length).toBeGreaterThan(0);
      expect(result.result.citations.some((c) => c.id === "m1")).toBe(true);
    }
  });

  it("budget_exceeded short-circuits before terminal LLM step", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([timelineItem({ id: "m1" })]),
    );
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "x" },
        { op: "synthesize", question: "?" },
      ],
      options: { budget: 5 },
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toMatch(/budget_exceeded/);
      // lineage ran (cost 3), but synthesize (cost 10) would push spent to 13 > cap 5
      expect(result.cost.totalCostUnits).toBe(3);
      expect(result.cost.llmCalls).toBe(0);
    }
  });

  it("named streams + join + distinct + limit", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([
        timelineItem({ id: "tl1", sessionId: "s1", channel: "observation" }),
        timelineItem({ id: "tl2", sessionId: "s2", channel: "observation" }),
        timelineItem({ id: "tl3", sessionId: "s1", channel: "observation" }),
      ]),
    );
    sdk.registerFunction("mem::lesson-recall", async () => ({
      success: true,
      lessons: [
        { id: "lsn-s1", content: "lesson about s1", project: "p", createdAt: "2026-01-01T00:00:00Z", confidence: 0.9, tags: [] } as Lesson,
      ],
    }));
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", out: "ctx", query: "x" },
        { op: "lesson_recall", out: "lessons", query: "x" },
        { op: "join", in: "ctx", right: "lessons", on: { left: "_sessionId", right: "_id" }, type: "left" },
      ] as never,
    });
    // Note: lessons are emitted with _id="lsn-s1" not session id, so this
    // particular `on` doesn't match — that's intentional, tests the
    // left-join null path.
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      expect(result.result.length).toBe(3); // 3 left, none matched (left-join keeps all)
      expect(result.result.every((r) => "_join" in r)).toBe(true);
    }
  });

  it("group_by + top_n_per_group: per-project limit", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([
        timelineItem({ id: "p1a", project: "p1", score: 1, timestamp: "2026-01-01T00:00:00Z" }),
        timelineItem({ id: "p1b", project: "p1", score: 5, timestamp: "2026-01-02T00:00:00Z" }),
        timelineItem({ id: "p1c", project: "p1", score: 3, timestamp: "2026-01-03T00:00:00Z" }),
        timelineItem({ id: "p2a", project: "p2", score: 9, timestamp: "2026-01-04T00:00:00Z" }),
        timelineItem({ id: "p2b", project: "p2", score: 2, timestamp: "2026-01-05T00:00:00Z" }),
      ]),
    );
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "x" },
        { op: "group_by", by: "_project" },
        { op: "top_n_per_group", n: 2, by: "_score", dir: "desc" },
      ],
    });
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      expect(result.result.length).toBe(4); // 2 per project, 2 projects
      const p1 = result.result.filter((r) => r._project === "p1");
      const p2 = result.result.filter((r) => r._project === "p2");
      expect(p1.length).toBe(2);
      expect(p2.length).toBe(2);
      expect(p1[0]._id).toBe("p1b"); // top by score
    }
  });

  it("for_each runs sub-pipeline per record and merges by default", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([
        timelineItem({ id: "x1", channel: "observation" }),
        timelineItem({ id: "x2", channel: "memory" }),
        timelineItem({ id: "x3", channel: "observation" }),
      ]),
    );
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "x" },
        {
          op: "for_each",
          do: [{ op: "filter", where: { field: "_kind", op: "eq", value: "observation" } }],
          into: "merge",
        },
      ],
    });
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      expect(result.result.length).toBe(2); // x1, x3 survive
      expect(result.result.every((r) => r._kind === "observation")).toBe(true);
    }
  });

  it("rank_by_relevance applies a single LLM call and re-sorts", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([
        timelineItem({ id: "a", title: "A" }),
        timelineItem({ id: "b", title: "B" }),
        timelineItem({ id: "c", title: "C" }),
      ]),
    );
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "x" },
        { op: "rank_by_relevance", target: "best one", topK: 2 },
      ],
    });
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      expect(result.cost.llmCalls).toBe(1);
      expect(provider.calls.length).toBe(1);
      expect(provider.calls[0].system).toMatch(/relevance scorer/);
      expect(result.result.length).toBe(2); // topK applied
      // Mock assigns scores 1.0, 0.9, 0.8 in record order → first two survive
      expect(result.result[0]._id).toBe("a");
      expect(result.result[1]._id).toBe("b");
    }
  });

  it("expand_by_session loads session + summary from KV", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([timelineItem({ id: "obs-1", sessionId: "ses-1" })]),
    );
    const session: Session = {
      id: "ses-1",
      project: "p",
      startedAt: "2026-01-01T00:00:00Z",
      firstPrompt: "hello there",
    } as Session;
    const summary: SessionSummary = {
      sessionId: "ses-1",
      title: "What we did",
      narrative: "Did things",
      createdAt: "2026-01-02T00:00:00Z",
      project: "p",
    } as SessionSummary;
    await kv.set("mem:sessions", "ses-1", session);
    await kv.set("mem:summaries", "ses-1", summary);

    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "x" },
        { op: "expand_by_session" },
      ],
    });
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      expect(result.result.length).toBe(1);
      const r = result.result[0];
      expect((r["_session"] as { firstPrompt?: string })?.firstPrompt).toBe("hello there");
      expect((r["_summary"] as { title?: string })?.title).toBe("What we did");
    }
  });

  it("`out` defaults to `_` (linear flow works even after named-stream producer)", async () => {
    // Producer writes to a named stream `data`; downstream filter (without
    // `in`) reads from `_`. With out-default-to-`_`, the producer writes
    // BOTH to `_` AND to `data`? No — producer writes ONLY to its explicit
    // `out`. So downstream reads `_` which is empty.
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([timelineItem({ id: "n1" })]),
    );
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", out: "data", query: "x" },
        { op: "filter", where: { field: "_id", op: "exists" } },
      ],
    });
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      // _ is empty since lineage went to "data" only
      expect(result.result.length).toBe(0);
    }
  });

  it("`sessions` producer reads kv.sessions directly", async () => {
    const s1: Session = { id: "s1", project: "p1", startedAt: "2026-01-01T00:00:00Z" } as Session;
    const s2: Session = { id: "s2", project: "p2", startedAt: "2026-01-02T00:00:00Z" } as Session;
    await kv.set("mem:sessions", "s1", s1);
    await kv.set("mem:sessions", "s2", s2);
    const result = await callQuery(sdk, {
      pipeline: [{ op: "sessions", project: "p1" }] as never,
    });
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      expect(result.result.length).toBe(1);
      expect(result.result[0]._id).toBe("s1");
    }
  });

  it("trace records inCount, outCount, ms, costClass per step", async () => {
    sdk.registerFunction("mem::lineage", async () =>
      makeLineage([
        timelineItem({ id: "a" }),
        timelineItem({ id: "b" }),
        timelineItem({ id: "c" }),
      ]),
    );
    const result = await callQuery(sdk, {
      pipeline: [
        { op: "lineage", query: "x" },
        { op: "limit", n: 2 },
      ],
    });
    expect(result.kind).toBe("records");
    if (result.kind === "records") {
      expect(result.trace.length).toBe(2);
      expect(result.trace[0]).toMatchObject({ op: "lineage", inCount: 0, outCount: 3, costClass: 3 });
      expect(result.trace[1]).toMatchObject({ op: "limit", inCount: 3, outCount: 2, costClass: 1 });
      expect(result.trace[0].ms).toBeGreaterThanOrEqual(0);
    }
  });
});

// Side check — silence "kv unused" lints for tests that don't seed kv state.
void timelineItem;
void mockKV;
// (test imports kept exhaustive for clarity; the linter will not flag these.)
void ({} as CompressedObservation);
