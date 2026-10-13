import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { registerReflectFunctions, INSIGHT_MAX_RESULTS, INSIGHT_MAX_SOURCES, REFLECT_MAX_CONCEPTS, REFLECT_MAX_RESPONSE_BYTES } from "../src/functions/reflect.js";
import { REFLECT_MAX_PROMPT_BYTES, REFLECT_SYSTEM, buildReflectPrompt } from "../src/prompts/reflect.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { SAFE_PAYLOAD_BYTES, payloadByteLength } from "../src/state/frame-guard.js";
import { KV } from "../src/state/schema.js";

const now = "2026-10-13T00:00:00Z";
const headers = { authorization: "Bearer reflection-test-secret" };
const xml = (sources = "F1,F2", content = "Validate security boundaries.") =>
  `<insights><insight confidence="0.8" title="Boundary checks" sources="${sources}">${content}</insight></insights>`;

function fixture() {
  const store = new Map<string, Map<string, any>>();
  const kv = {
    get: vi.fn(async (scope: string, id: string) => store.get(scope)?.get(id) ?? null),
    list: vi.fn(async (scope: string) => [...(store.get(scope)?.values() ?? [])]),
    set: async (scope: string, id: string, value: any) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(id, value);
      return value;
    },
    delete: async (scope: string, id: string) => { store.get(scope)?.delete(id); },
  };
  const fns = new Map<string, Function>();
  const sdk = {
    registerFunction: (id: string | { id: string }, fn: Function) => { fns.set(typeof id === "string" ? id : id.id, fn); },
    registerTrigger: () => {},
    trigger: async ({ function_id, payload }: { function_id: string; payload?: unknown }): Promise<any> => fns.get(function_id)!(payload),
  };
  const provider = { name: "test", compress: vi.fn(), summarize: vi.fn().mockResolvedValue(xml()) };
  registerReflectFunctions(sdk as never, kv as never, provider as never);
  registerApiTriggers(sdk as never, kv as never, "reflection-test-secret");
  registerMcpEndpoints(sdk as never, kv as never, "reflection-test-secret");
  const call = (function_id: string, payload: unknown = {}) => sdk.trigger({ function_id, payload });
  const mcp = (name: string, args: unknown) => call("mcp::tools::call", { headers, body: { name, arguments: args } });
  const fact = (id: string, text = `security validation evidence ${id}`) => kv.set(KV.semantic, id, { id, fact: text, confidence: 0.8 });
  const insight = (id: string, content = "security insight", extra = {}) => kv.set(KV.insights, id, {
    id, title: "Security", content, confidence: 0.8, reinforcements: 0, sourceConceptCluster: [],
    sourceMemoryIds: [], sourceLessonIds: [], sourceCrystalIds: [], tags: [], createdAt: now, updatedAt: now, decayRate: 0.05, ...extra,
  });
  async function seed(count = 3) {
    for (const name of ["security", "validation"]) await kv.set(KV.graphNodes, name, { id: name, name, type: "concept" });
    await kv.set(KV.graphEdges, "edge", { id: "edge", sourceNodeId: "security", targetNodeId: "validation" });
    for (let i = 0; i < count; i++) await fact(`fact-${i}`);
  }
  return { kv, call, mcp, provider, fact, insight, seed };
}

describe("reflection budgets", () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => { f = fixture(); });

  it("skips oversized evidence without relabeling it as a different source, and retains mixed evidence", async () => {
    await f.seed(0);
    await f.fact("huge", `security ${'界"\\\n'.repeat(3000)}`);
    await f.fact("usable-a");
    await f.fact("usable-b");
    await f.kv.set(KV.lessons, "lesson", { id: "lesson", content: "security lesson", confidence: 0.8, tags: ["security"] });
    await f.kv.set(KV.crystals, "crystal", { id: "crystal", narrative: "security outcome", lessons: ["security"] });
    f.provider.summarize.mockResolvedValue(xml("F1,L1,C1"));
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 1 });
    const [result] = await f.kv.list(KV.insights);
    expect(result).toMatchObject({ sourceMemoryIds: ["usable-a"], sourceLessonIds: ["lesson"], sourceCrystalIds: ["crystal"] });
    const prompt = f.provider.summarize.mock.calls[0][1];
    expect(prompt).not.toContain("界");
    expect(prompt).toContain('"source":"F1","fact":"security validation evidence usable-a"');
    expect(Buffer.byteLength(REFLECT_SYSTEM + prompt)).toBeLessThanOrEqual(REFLECT_MAX_PROMPT_BYTES);
  });

  it("bounds all evidence types by serialized UTF-8 bytes while keeping later small records", async () => {
    await f.seed(0);
    for (let i = 0; i < 50; i++) {
      const text = `security ${'界"\\\n'.repeat(i < 10 ? 350 : 1)} ${i}`;
      await f.fact(`fact-${i}`, text);
      await f.kv.set(KV.lessons, `lesson-${i}`, { id: `lesson-${i}`, content: text, confidence: 0.8, tags: ["security"] });
      await f.kv.set(KV.crystals, `crystal-${i}`, { id: `crystal-${i}`, narrative: text, lessons: ["security"] });
    }
    f.provider.summarize.mockResolvedValue(xml("F1,L1,C1"));
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 1 });
    const prompt = f.provider.summarize.mock.calls[0][1];
    expect(Buffer.byteLength(REFLECT_SYSTEM + prompt)).toBeLessThanOrEqual(REFLECT_MAX_PROMPT_BYTES);
    for (const type of ["F", "L", "C"]) {
      const labels = [...prompt.matchAll(new RegExp(`"source":"${type}(\\d+)"`, "g"))];
      expect(labels.length).toBeGreaterThan(4);
      expect(labels.length).toBeLessThanOrEqual(INSIGHT_MAX_SOURCES);
      expect(labels.map((m) => Number(m[1]))).toEqual(labels.map((_, i) => i + 1));
    }
  });

  it("keeps at most twenty distinct citations and rejects discarded labels on reinforcement", async () => {
    await f.seed(50);
    f.provider.summarize.mockResolvedValue(xml(Array.from({ length: 20 }, (_, i) => `F${i + 1}`).join(",")));
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 1 });
    const [old] = await f.kv.list(KV.insights);
    expect(old.sourceMemoryIds).toHaveLength(20);
    await f.kv.set(KV.insights, old.id, { ...old, sourceMemoryIds: Array(1000).fill("legacy"), tags: Array(1000).fill("legacy"), sourceConceptCluster: Array(1000).fill("legacy") });
    f.provider.summarize.mockResolvedValue(xml("F1,F2,F1"));
    expect(await f.call("mem::reflect")).toMatchObject({ reinforced: 1 });
    const refreshed = await f.kv.get(KV.insights, old.id);
    expect(refreshed.sourceMemoryIds).toEqual(["fact-0", "fact-1"]);
    expect(refreshed.tags).toEqual(["security", "validation"]);
    expect(refreshed.sourceConceptCluster).toEqual(refreshed.tags);
    f.provider.summarize.mockResolvedValue(xml("F1,F21"));
    expect(await f.call("mem::reflect")).toMatchObject({ reinforced: 0, rejectedInsights: 1 });
    expect(await f.kv.get(KV.insights, old.id)).toEqual(refreshed);
  });

  it("rejects more than twenty valid citations across evidence types before evidence reads", async () => {
    await f.seed(20);
    await f.kv.set(KV.lessons, "lesson", { id: "lesson", content: "security lesson", confidence: 0.8, tags: ["security"] });
    f.provider.summarize.mockResolvedValue(xml(`${Array.from({ length: 20 }, (_, i) => `F${i + 1}`).join(",")},L1`));
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 0, rejectedInsights: 1 });
    expect(f.kv.get.mock.calls.filter(([scope]) => scope === KV.semantic || scope === KV.lessons)).toHaveLength(0);
  });

  it("retains the original full text for mutation checks after evidence selection", async () => {
    await f.seed(0);
    await f.fact("oversized", `security ${"x".repeat(5000)}`);
    for (const id of ["a", "b", "c"]) await f.fact(id, `security original ${id} "\\\n界`);
    f.provider.summarize.mockImplementation(async () => {
      await f.fact("a", "security replacement");
      return xml();
    });
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 0, rejectedInsights: 1 });
  });

  it("bounds stored concepts without truncating names or following oversized model output", async () => {
    await f.seed();
    for (let i = 0; i < 60; i++) {
      const id = `node-${i}`;
      await f.kv.set(KV.graphNodes, id, { id, name: i === 0 ? "界".repeat(1000) : id, type: "concept" });
      await f.kv.set(KV.graphEdges, id, { id, sourceNodeId: "security", targetNodeId: id });
    }
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 1 });
    const [insight] = await f.kv.list(KV.insights);
    expect(insight.tags).toHaveLength(REFLECT_MAX_CONCEPTS);
    expect(insight.tags).not.toContain("界");
    f.provider.summarize.mockResolvedValue(xml("F1,F2", "x".repeat(REFLECT_MAX_RESPONSE_BYTES)));
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 0, reinforced: 0, failedClusters: 1 });
  });

  it("rejects excessive generated title/content and independently guards the complete prompt", async () => {
    await f.seed();
    f.provider.summarize.mockResolvedValue(xml("F1,F2", "界".repeat(2000)));
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 0, rejectedInsights: 1 });
    f.provider.summarize.mockResolvedValue(xml().replace("Boundary checks", "界".repeat(100)));
    expect(await f.call("mem::reflect")).toMatchObject({ newInsights: 0, rejectedInsights: 1 });
    expect(() => buildReflectPrompt({ concepts: [], facts: [{ fact: "界".repeat(REFLECT_MAX_PROMPT_BYTES), confidence: 1 }], lessons: [], crystalNarratives: [] })).toThrow("byte budget");
  });
});

const invalidNumbers = [0, -1, 1.5, NaN, Infinity, -Infinity, "2", null, true, Number.MAX_SAFE_INTEGER + 1];

describe("insight boundaries", () => {
  it.each(invalidNumbers)("rejects invalid count %s on all inner functions before reading", async (limit) => {
    const f = fixture();
    for (const functionId of ["mem::insight-list", "mem::insight-search", "mem::reflect"]) {
      expect(await f.call(functionId, { limit, maxClusters: limit, query: "security" })).toMatchObject({ success: false, invalid: true });
    }
    expect(f.kv.list).not.toHaveBeenCalled();
    expect(f.provider.summarize).not.toHaveBeenCalled();
  });

  it.each([-1, 1.1, NaN, Infinity, "0.5", null])("rejects invalid confidence %s", async (minConfidence) => {
    const f = fixture();
    for (const id of ["mem::insight-list", "mem::insight-search"]) {
      expect(await f.call(id, { minConfidence, query: "security" })).toMatchObject({ invalid: true });
    }
    expect(f.kv.list).not.toHaveBeenCalled();
  });

  it("caps large limits and preserves defaults, filtering, and both boundary confidence values", async () => {
    const f = fixture();
    for (let i = 0; i < 510; i++) await f.insight(`ins-${i}`, "security insight", { project: "a", confidence: 1 });
    await f.insight("foreign", "security insight", { project: "b" });
    expect((await f.call("mem::insight-list")).insights).toHaveLength(50);
    expect((await f.call("mem::insight-search", { query: "security" })).insights).toHaveLength(10);
    for (const id of ["mem::insight-list", "mem::insight-search"]) {
      const result = await f.call(id, { query: "security", limit: 30000, project: "a", minConfidence: 1 });
      expect(result.insights).toHaveLength(INSIGHT_MAX_RESULTS);
      expect(result.insights.every((i: any) => i.project === "a")).toBe(true);
      expect((await f.call(id, { query: "security", minConfidence: 0, limit: 1 })).insights).toHaveLength(1);
    }
  });

  it("refuses oversized legacy records inside the function before either transport wrapper", async () => {
    const f = fixture();
    await f.insight("huge", `security ${"界".repeat(Math.ceil(SAFE_PAYLOAD_BYTES / 3))}`);
    for (const id of ["mem::insight-list", "mem::insight-search"]) {
      const result = await f.call(id, { query: "security", limit: 1 });
      expect(result).toMatchObject({ success: false, oversized: true });
      expect(payloadByteLength(result)).toBeLessThan(1024);
    }
    for (const [id, request] of [["api::insight-list", { query_params: { limit: "1" } }], ["api::insight-search", { body: { query: "security", limit: 1 } }]] as const) {
      const result = await f.call(id, { headers, ...request });
      expect(result).toMatchObject({ status_code: 413, body: { oversized: true } });
    }
    expect(await f.mcp("memory_insight_list", { limit: 1 })).toMatchObject({ status_code: 413, body: { isError: true } });
  });

  it("protects the final MCP envelope when escaping expands a valid inner result", async () => {
    const f = fixture();
    await f.insight("escaped", '"'.repeat(5 * 1024 * 1024));
    const inner = await f.call("mem::insight-list", { limit: 1 });
    expect(inner.success).toBe(true);
    expect(payloadByteLength(inner)).toBeLessThan(SAFE_PAYLOAD_BYTES);
    const rest = await f.call("api::insight-list", { headers, query_params: { limit: "1" } });
    expect(rest.status_code).toBe(200);
    const mcp = await f.mcp("memory_insight_list", { limit: 1 });
    expect(mcp).toMatchObject({ status_code: 413, body: { isError: true } });
    expect(payloadByteLength(mcp)).toBeLessThan(2048);
  });

  it("preserves authorization and returns small validation errors through REST and MCP", async () => {
    const f = fixture();
    expect(await f.call("api::insight-list", { headers: {}, query_params: {} })).toMatchObject({ status_code: 401 });
    expect(await f.call("api::reflect", { headers, body: { maxClusters: "wrong" } })).toMatchObject({ status_code: 400 });
    expect(await f.call("api::insight-search", { headers, body: { query: "security", limit: "wrong" } })).toMatchObject({ status_code: 400 });
    expect(await f.call("api::insight-list", { headers, query_params: { minConfidence: "2" } })).toMatchObject({ status_code: 400 });
    expect(await f.mcp("memory_insight_list", { limit: -1 })).toMatchObject({ status_code: 400, body: { isError: true } });
    expect(await f.mcp("memory_reflect", { maxClusters: 1.5 })).toMatchObject({ status_code: 400 });
    expect(await f.call("mem::insight-search", { query: 42 })).toMatchObject({ invalid: true });
  });
});
