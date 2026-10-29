import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerCascadeFunctions, failureCounters, flushDeleteCascade } from "../src/functions/cascade-audit.js";
import { registerPipelineObservers } from "../src/runtime/pipeline-observers.js";
import { getBindings } from "../src/runtime/bindings.js";
import { KV } from "../src/state/schema.js";
import type { Memory, MemoryRelation, Facet } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const audits: Array<Record<string, unknown>> = [];
vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(async (_kv: unknown, operation: string, functionId: string, targetIds: string[], details: Record<string, unknown>) => {
    audits.push({ operation, functionId, targetIds, details });
    return { id: "aud_x" };
  }),
  safeAudit: vi.fn(async (_kv: unknown, operation: string, functionId: string, targetIds: string[], details: Record<string, unknown>) => {
    audits.push({ operation, functionId, targetIds, details });
    return { id: "aud_x" };
  }),
}));

const removedBm25: string[] = [];
const removedVector: string[] = [];
vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({ remove: (id: string) => removedBm25.push(id) }),
  getVectorIndex: () => ({ size: 0 }),
  vectorIndexRemove: (id: string) => { removedVector.push(id); },
  isMemoryIndexReady: () => true,
}));

function memoryKv(seed: Record<string, Map<string, unknown>> = {}) {
  const store = seed;
  return {
    store,
    get: vi.fn(async (scope: string, key: string) => store[scope]?.get(key) ?? null),
    set: vi.fn(async (scope: string, key: string, v: unknown) => { (store[scope] ??= new Map()).set(key, v); }),
    delete: vi.fn(async (scope: string, key: string) => { store[scope]?.delete(key); }),
    update: vi.fn(async (scope: string, key: string, ops: Array<{ path: string; value: unknown }>) => {
      const row = store[scope]?.get(key) as Record<string, unknown> | undefined;
      if (row) for (const op of ops) row[op.path] = op.value;
      return row;
    }),
    list: vi.fn(async (scope: string) => [...(store[scope]?.values() ?? [])]),
    listKeys: vi.fn(async (scope: string) => [...(store[scope]?.keys() ?? [])]),
    iterate: async function* (scope: string) { yield [...(store[scope]?.values() ?? [])]; },
    backend: "file",
  };
}

function fakeFns() {
  const fns = new Map<string, (d: unknown) => Promise<unknown>>();
  return {
    functions: fns,
    registerFunction(id: string, h: (d: unknown) => Promise<unknown>) { fns.set(id, h); },
  };
}

describe("mem::record-failure", () => {
  beforeEach(() => { audits.length = 0; });

  it("classifies retryable vs permanent and writes the op audit", async () => {
    const sdk = fakeFns();
    const kv = memoryKv();
    registerCascadeFunctions(sdk as never, kv as never);
    const fn = sdk.functions.get("mem::record-failure")!;
    await fn({ input: { observationId: "o1", sessionId: "s1" }, output: {}, error: { code: "circuit_breaker_open", message: "breaker" }, metadata: { function_id: "mem::compress" } });
    expect(audits[0].operation).toBe("compress-failed");
    expect(audits[0].details).toMatchObject({ code: "circuit_breaker_open", retryable: true });
    expect(audits[0].targetIds).toEqual(["o1", "s1"]);
    const c = failureCounters();
    expect(c.transient).toBeGreaterThan(0);
    audits.length = 0;
    await fn({ input: {}, output: { success: false, error: "source_unavailable" }, metadata: { function_id: "mem::summarize" } });
    expect(audits[0].operation).toBe("summarize-failed");
    expect(audits[0].details).toMatchObject({ code: "source_unavailable", retryable: false });
  });

  it("dedupes by (function_id, code) in a fixed 60s window and counts every failure", async () => {
    vi.useFakeTimers();
    const sdk = fakeFns();
    registerCascadeFunctions(sdk as never, memoryKv() as never);
    const fn = sdk.functions.get("mem::record-failure")!;
    const env = { input: {}, output: {}, error: { code: "parse_failed" }, metadata: { function_id: "mem::graph-extract" } };
    await fn(env);
    vi.advanceTimersByTime(30_000);
    const r1 = await fn(env);
    expect(r1).toMatchObject({ deduped: true });
    expect(audits.length).toBe(1);
    vi.advanceTimersByTime(31_000);
    const r2 = await fn(env);
    expect(r2).toMatchObject({ recorded: true });
    expect(audits.length).toBe(2);
    expect(audits[1].details).toMatchObject({ dedupedCount: 1 });
    vi.useRealTimers();
  });
});

describe("pipeline observer specs", () => {
  it("failure observers: error + soft specs per function", async () => {
    const observed: Array<{ source: Record<string, unknown>; target: string; options?: Record<string, unknown> }> = [];
    const sdk = {
      observed,
      registerTrigger: vi.fn(),
      registerFunction: vi.fn(),
      observe: vi.fn((s: Record<string, unknown>, t: string, o?: Record<string, unknown>) => { observed.push({ source: s, target: t, options: o }); return { id: "h", state: "active", ready: () => Promise.resolve(), onStateChange: () => () => {}, dispose: () => Promise.resolve() }; }),
      trigger: vi.fn(async () => ({ functions: ["http::on-request", "state::on-changed", "state::get"] })),
    };
    const b = getBindings(sdk as never);
    registerPipelineObservers(sdk as never);
    await b.activate();
    const compressErr = observed.find((o) => o.options?.id === "agentmemory:pipeline:failure:mem::compress:error")!;
    expect(compressErr.source).toMatchObject({ function_id: "mem::compress", on: "error", capture: ["input", "output", "error"], deliver: "envelope" });
    expect(compressErr.options?.max_in_flight).toBe(4);
    const summarizeSoft = observed.find((o) => o.options?.id === "agentmemory:pipeline:failure:mem::summarize:soft")!;
    expect(summarizeSoft.source).toMatchObject({ on: "success", filters: { "output.success": { $eq: false } } });
    const deleted = observed.find((o) => o.options?.id === "agentmemory:cascade:deleted")!;
    const or = deleted.source.filters as { $or: Array<Record<string, unknown>> };
    expect(or.$or[0]).toMatchObject({ "input.event_type": { $eq: "state:deleted" }, "input.scope": { $prefix: "mem:obs:" } });
    const rel = observed.find((o) => o.options?.id === "agentmemory:cascade:relation-reaction")!;
    const or2 = rel.source.filters as { $or: Array<Record<string, unknown>> };
    expect(or2.$or[0]["input.new_value.type"]).toEqual({ $in: ["supersedes", "contradicts", "extends"] });
    expect(rel.options?.max_in_flight).toBe(1);
  });
});

describe("mem::on-record-deleted", () => {
  beforeEach(() => { audits.length = 0; removedBm25.length = 0; removedVector.length = 0; });

  it("removes bm25/vector entries, facets (incl. lessons), reconciles observationCount, audits", async () => {
    const sdk = fakeFns();
    const facets = new Map<string, Facet>([
      ["f1", { id: "f1", targetId: "m1", targetType: "memory", dimension: "d", value: "v", createdAt: "t" }],
      ["f2", { id: "f2", targetId: "l1", targetType: "memory", dimension: "d", value: "v", createdAt: "t" }],
      ["f3", { id: "f3", targetId: "other", targetType: "memory", dimension: "d", value: "v", createdAt: "t" }],
    ]);
    const kv = memoryKv({
      [KV.facets]: facets,
      [KV.sessions]: new Map([["s1", { id: "s1", observationCount: 5 }]]),
      "mem:obs:s1": new Map([["o1", {}], ["o2", {}]]),
    });
    registerCascadeFunctions(sdk as never, kv as never);
    const fn = sdk.functions.get("mem::on-record-deleted")!;
    await fn({ event_type: "state:deleted", scope: "mem:obs:s1", key: "o9" });
    expect(removedBm25).toContain("o9");
    expect(removedVector).toContain("o9");
    await fn({ scope: KV.lessons, key: "l1", event_type: "state:updated", new_value: { deleted: true }, old_value: { deleted: false } });
    await fn({ event_type: "state:deleted", scope: KV.memories, key: "m1" });
    const { flushDeleteCascade } = await import("../src/functions/cascade-audit.js");
    await flushDeleteCascade();
    expect(kv.update).toHaveBeenCalledWith(KV.sessions, "s1", [{ type: "set", path: "observationCount", value: 2 }]);
    expect(audits.find((a) => a.operation === "cascade")).toBeTruthy();
    expect(kv.store[KV.facets].has("f2")).toBe(false);
    expect(kv.store[KV.facets].has("f3")).toBe(true);
    expect(kv.store[KV.facets].has("f1")).toBe(false);
  });
});

describe("event::graph::edge-reaction", () => {
  const base: Memory = { id: "tgt", createdAt: "t", updatedAt: "t", type: "fact", title: "x", content: "c", concepts: [], files: [], sessionIds: [], strength: 1, version: 1, isLatest: true, confidence: 0.8, relatedIds: ["pre"] } as unknown as Memory;
  const rel: MemoryRelation = { type: "supersedes", sourceId: "src", targetId: "tgt", createdAt: "2026-01-01T00:00:00Z", confidence: 0.6 };

  function seeded(marks: Record<string, unknown> = {}) {
    const sdk = fakeFns();
    const kv = memoryKv({
      [KV.memories]: new Map([["tgt", { ...base }], ["src", { ...base, id: "src" }]]),
      [KV.relations]: new Map(),
      [KV.relationReactions]: new Map(Object.entries(marks)),
    });
    registerCascadeFunctions(sdk as never, kv as never);
    return { kv, fn: sdk.functions.get("event::graph::edge-reaction")! };
  }
  const created = (key: string, r: Partial<MemoryRelation> = {}) => ({ event_type: "state:created", scope: KV.relations, key, new_value: { ...rel, ...r } });
  const deleted = (key: string, r: Partial<MemoryRelation> = {}) => ({ event_type: "state:deleted", scope: KV.relations, key, old_value: { ...rel, ...r } });
  const mem = (kv: ReturnType<typeof seeded>["kv"]) => kv.store[KV.memories].get("tgt") as Memory;
  const mark = (kv: ReturnType<typeof seeded>["kv"], type = "supersedes") => kv.store[KV.relationReactions]?.get(`tgt:${type}`) as Record<string, unknown> | undefined;

  it("two supersedes: second adds contributor only; delete restores originals when empty", async () => {
    const { kv, fn } = seeded();
    await fn(created("rA"));
    await fn(created("rB", { sourceId: "srcB" }));
    expect(mem(kv).strength).toBeCloseTo(0.5);
    const r1 = await fn(deleted("rA"));
    expect(r1).toMatchObject({ unreacted: false, remaining: 1 });
    expect(mem(kv).isLatest).toBe(false);
    expect(mem(kv).strength).toBeCloseTo(0.5);
    const r2 = await fn(deleted("rB", { sourceId: "srcB" }));
    expect(r2).toMatchObject({ unreacted: true });
    expect(mem(kv).isLatest).toBe(true);
    expect(mem(kv).strength).toBeCloseTo(1);
    expect(mark(kv)).toBeUndefined();
  });

  it("contradicts: cumulative floored decay, undo restores original, mutual contradicts allowed", async () => {
    const { kv, fn } = seeded();
    await fn(created("rA", { type: "contradicts", confidence: 0.5 }));
    await fn(created("rB", { type: "contradicts", sourceId: "srcB", confidence: 0.5 }));
    expect(mem(kv).confidence).toBeCloseTo(0.5);
    const cycle = await fn(created("rC", { type: "contradicts", sourceId: "tgt", targetId: "src", confidence: 0.5 }));
    expect(cycle).toMatchObject({ reacted: true });
    await fn(deleted("rA", { type: "contradicts" }));
    await fn(deleted("rB", { type: "contradicts", sourceId: "srcB" }));
    expect(mem(kv).confidence).toBeCloseTo(0.8);
  });

  it("supersedes cycle guard via reverse mark", async () => {
    const { kv, fn } = seeded();
    await fn(created("rA"));
    const r = await fn(created("rB", { sourceId: "tgt", targetId: "src" }));
    expect(r).toMatchObject({ skipped: "cycle" });
    expect(audits.find((a) => (a.details as { skipped?: string }).skipped === "cycle")).toBeTruthy();
  });

  it("extends: undo removes only the added ids", async () => {
    const { kv, fn } = seeded();
    await fn(created("rA", { type: "extends" }));
    await fn(created("rB", { type: "extends", sourceId: "srcB" }));
    expect(mem(kv).relatedIds).toEqual(["pre", "src", "srcB"]);
    await fn(deleted("rA", { type: "extends" }));
    await fn(deleted("rB", { type: "extends", sourceId: "srcB" }));
    expect(mem(kv).relatedIds).toEqual(["pre"]);
  });

  it("replayed create applies once", async () => {
    const { kv, fn } = seeded();
    await fn(created("rA"));
    const r = await fn(created("rA"));
    expect(r).toMatchObject({ skipped: "already_applied" });
    expect(mem(kv).strength).toBeCloseTo(0.5);
  });

  it("missing target audits and skips", async () => {
    const { kv, fn } = seeded();
    kv.store[KV.memories].delete("tgt");
    const r = await fn(created("rA"));
    expect(r).toMatchObject({ skipped: "missing_target" });
  });
});

describe("mem::relate lock safety", () => {
  it("resolves when sourceId === targetId and a follow-up relate resolves", async () => {
    const { registerRelationsFunction } = await import("../src/functions/relations.js");
    const sdk = fakeFns();
    const kv = memoryKv({
      [KV.memories]: new Map([["m1", { id: "m1", relatedIds: [], sessionIds: [], concepts: [], files: [] }]]),
      [KV.relations]: new Map(),
    });
    registerRelationsFunction(sdk as never, kv as never);
    const fn = sdk.functions.get("mem::relate")!;
    const timed = (p: Promise<unknown>) =>
      Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error("deadlock")), 2000))]);
    const r1 = await timed(fn({ sourceId: "m1", targetId: "m1", type: "extends" }));
    expect(r1).toMatchObject({ success: true });
    const r2 = await timed(fn({ sourceId: "m1", targetId: "m1", type: "contradicts" }));
    expect(r2).toMatchObject({ success: true });
  });
});

describe("delete cascade batcher resilience", () => {
  function seededDelete() {
    const sdk = fakeFns();
    const kv = memoryKv({
      [KV.sessions]: new Map([
        ["s1", { id: "s1", observationCount: 5 }],
        ["s2", { id: "s2", observationCount: 3 }],
      ]),
      [KV.observations("s1")]: new Map([["o1", {}], ["o2", {}]]),
      [KV.observations("s2")]: new Map([["o3", {}]]),
      [KV.facets]: new Map(),
    });
    registerCascadeFunctions(sdk as never, kv as never);
    return { kv, fn: sdk.functions.get("mem::on-record-deleted")! };
  }

  it("a failed flush logs, requeues sessions, and reconciles on the next flush", async () => {
    const { kv, fn } = seededDelete();
    const rejections: unknown[] = [];
    const onRej = (e: unknown) => { rejections.push(e); };
    process.on("unhandledRejection", onRej);
    try {
      kv.listKeys.mockRejectedValueOnce(new Error("state worker restarting"));
      await fn({ event_type: "state:deleted", scope: "mem:obs:s1", key: "o9" });
      await flushDeleteCascade().catch(() => {});
      expect(rejections).toEqual([]);
      await flushDeleteCascade();
      expect(kv.update).toHaveBeenCalledWith(KV.sessions, "s1", [
        { type: "set", path: "observationCount", value: 2 },
      ]);
    } finally {
      process.off("unhandledRejection", onRej);
    }
  });

  it("items queued during an in-flight flush are drained by the next batch", async () => {
    vi.useFakeTimers();
    try {
      const { kv, fn } = seededDelete();
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      kv.list.mockImplementationOnce(() => gate.then(() => []));
      await fn({ event_type: "state:deleted", scope: "mem:obs:s1", key: "o1" });
      await vi.advanceTimersByTimeAsync(600);
      await fn({ event_type: "state:deleted", scope: "mem:obs:s2", key: "o3" });
      release();
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(600);
      expect(kv.update).toHaveBeenCalledWith(KV.sessions, "s2", [
        { type: "set", path: "observationCount", value: 1 },
      ]);
      const cascades = audits.filter((a) => a.operation === "cascade");
      expect(cascades.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
