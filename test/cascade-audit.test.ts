import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerCascadeFunctions, failureCounters } from "../src/functions/cascade-audit.js";
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

  it("dedupes by (function_id, code) within 60s", async () => {
    const sdk = fakeFns();
    registerCascadeFunctions(sdk as never, memoryKv() as never);
    const fn = sdk.functions.get("mem::record-failure")!;
    const env = { input: {}, output: {}, error: { code: "parse_failed" }, metadata: { function_id: "mem::graph-extract" } };
    await fn(env);
    const count = audits.length;
    const r = await fn(env);
    expect(r).toMatchObject({ deduped: true });
    expect(audits.length).toBe(count);
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
    expect(kv.update).toHaveBeenCalledWith(KV.sessions, "s1", [{ op: "set", path: "observationCount", value: 2 }]);
    expect(audits.find((a) => a.operation === "cascade")).toBeTruthy();
    await fn({ scope: KV.lessons, key: "l1", event_type: "state:updated", new_value: { deleted: true }, old_value: { deleted: false } });
    expect(kv.store[KV.facets].has("f2")).toBe(false);
    expect(kv.store[KV.facets].has("f3")).toBe(true);
    await fn({ event_type: "state:deleted", scope: KV.memories, key: "m1" });
    expect(kv.store[KV.facets].has("f1")).toBe(false);
  });
});

describe("event::graph::edge-reaction", () => {
  const base: Memory = { id: "tgt", createdAt: "t", updatedAt: "t", type: "fact", title: "x", content: "c", concepts: [], files: [], sessionIds: [], strength: 1, version: 1, isLatest: true, confidence: 0.8, relatedIds: [] } as unknown as Memory;
  const rel: MemoryRelation = { type: "supersedes", sourceId: "src", targetId: "tgt", createdAt: "2026-01-01T00:00:00Z", confidence: 0.6 };

  function seeded(seedRel = true) {
    const sdk = fakeFns();
    const kv = memoryKv({
      [KV.memories]: new Map([["tgt", { ...base }]]),
      [KV.relations]: new Map(seedRel ? [["r1", { ...rel }]] : []),
    });
    registerCascadeFunctions(sdk as never, kv as never);
    return { sdk, kv, fn: sdk.functions.get("event::graph::edge-reaction")! };
  }

  it("supersedes: isLatest false + strength halved, mark stored", async () => {
    const { kv, fn } = seeded();
    await fn({ event_type: "state:created", scope: KV.relations, key: "r1", new_value: { ...rel } });
    const mem = kv.store[KV.memories].get("tgt") as Memory;
    expect(mem.isLatest).toBe(false);
    expect(mem.strength).toBeCloseTo(0.5);
    expect(kv.store[KV.relationReactions]?.get("r1")).toMatchObject({ type: "supersedes", isLatestBefore: true, strengthBefore: 1 });
  });

  it("contradicts: confidence floored reduction; extends: relatedIds union", async () => {
    const { kv, fn } = seeded();
    await fn({ event_type: "state:created", scope: KV.relations, key: "r1", new_value: { ...rel, type: "contradicts", confidence: 0.5 } });
    expect((kv.store[KV.memories].get("tgt") as Memory).confidence).toBeCloseTo(0.65);
    await fn({ event_type: "state:created", scope: KV.relations, key: "r2", new_value: { ...rel, type: "extends", sourceId: "src2" } });
    expect((kv.store[KV.memories].get("tgt") as Memory).relatedIds).toEqual(["src2"]);
  });

  it("idempotent on redelivery", async () => {
    const { kv, fn } = seeded();
    await fn({ event_type: "state:created", scope: KV.relations, key: "r1", new_value: { ...rel } });
    const r2 = await fn({ event_type: "state:created", scope: KV.relations, key: "r1", new_value: { ...rel } });
    expect(r2).toMatchObject({ skipped: "already_applied" });
    expect((kv.store[KV.memories].get("tgt") as Memory).strength).toBeCloseTo(0.5);
  });

  it("delete un-reacts only when no same-type relation remains", async () => {
    const { kv, fn } = seeded();
    await fn({ event_type: "state:created", scope: KV.relations, key: "r1", new_value: { ...rel } });
    kv.store[KV.relations].delete("r1");
    const r = await fn({ event_type: "state:deleted", scope: KV.relations, key: "r1", old_value: { ...rel } });
    expect(r).toMatchObject({ unreacted: true });
    expect((kv.store[KV.memories].get("tgt") as Memory).isLatest).toBe(true);
    expect((kv.store[KV.memories].get("tgt") as Memory).strength).toBeCloseTo(1);
  });

  it("delete keeps reaction when a same-type relation remains", async () => {
    const { kv, fn } = seeded();
    kv.store[KV.relations].set("r2", { ...rel, sourceId: "other" });
    await fn({ event_type: "state:created", scope: KV.relations, key: "r1", new_value: { ...rel } });
    const r = await fn({ event_type: "state:deleted", scope: KV.relations, key: "r1", old_value: { ...rel } });
    expect(r).toMatchObject({ unreacted: false, remaining: true });
    expect((kv.store[KV.memories].get("tgt") as Memory).isLatest).toBe(false);
  });

  it("cycle guard skips and audits", async () => {
    const { kv, fn } = seeded();
    kv.store[KV.relations].set("back", { type: "supersedes", sourceId: "tgt", targetId: "src", createdAt: "t" });
    const r = await fn({ event_type: "state:created", scope: KV.relations, key: "r1", new_value: { ...rel } });
    expect(r).toMatchObject({ skipped: "cycle" });
    expect((kv.store[KV.memories].get("tgt") as Memory).isLatest).toBe(true);
    expect(audits.find((a) => (a.details as { skipped?: string }).skipped === "cycle")).toBeTruthy();
  });

  it("missing target skips and audits", async () => {
    const { kv, fn } = seeded();
    kv.store[KV.memories].delete("tgt");
    const r = await fn({ event_type: "state:created", scope: KV.relations, key: "r1", new_value: { ...rel } });
    expect(r).toMatchObject({ skipped: "missing_target" });
  });
});
