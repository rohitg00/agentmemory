import { describe, expect, it, vi } from "vitest";
import { createGraphIndexState } from "./helpers/graph-index-state.js";
import { initializeGraphIndex, recoverGraphIndex } from "../src/state/graph-retrieval-index.js";
import { queryGraphIndex } from "../src/functions/graph-index-query.js";
import { readIndexedEntity } from "../src/functions/graph-index-temporal.js";
import { registerTemporalGraphFunctions } from "../src/functions/temporal-graph.js";
import { KV } from "../src/state/schema.js";
import type { GraphNode, GraphEdge } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const date = "2026-10-14T00:00:00.000Z";
const node = (id: string, name = id, more: Partial<GraphNode> = {}): GraphNode => ({
  id, name, type: "concept", properties: {}, sourceObservationIds: ["obs"], createdAt: date, ...more,
});
const edge = (id: string, sourceNodeId: string, targetNodeId: string, more: Partial<GraphEdge> = {}): GraphEdge => ({
  id, sourceNodeId, targetNodeId, type: "related_to", weight: 1, sourceObservationIds: ["obs"], createdAt: date, ...more,
});
async function setup() {
  const state = createGraphIndexState();
  await initializeGraphIndex(state.kv, { status: "ready" });
  return state;
}

describe("bounded graph query surfaces", () => {
  it("leaves unknown legacy stores untouched and does not read their snapshot or canonical scopes", async () => {
    const { kv, store, calls } = createGraphIndexState();
    store.set(KV.graphNodes, new Map([["legacy", node("legacy")]]));
    expect(await queryGraphIndex(kv, { query: "legacy" })).toMatchObject({ nodes: [], truncated: true, warning: expect.stringContaining("migration") });
    expect(await readIndexedEntity(kv, "legacy")).toHaveProperty("error");
    expect(calls.every(call => call.id === "state::get" && ![KV.graphNodes, KV.graphEdges, KV.graphSnapshot].includes(call.scope as never))).toBe(true);
  });

  it("searches Unicode primitive properties, excludes stale rows and never enumerates canonical data", async () => {
    const { kv, calls } = await setup();
    await kv.set(KV.graphNodes, "a", node("a", "first", { properties: { city: "東京大学" } }));
    await kv.set(KV.graphNodes, "b", node("b", "second", { properties: { city: "東京大学" }, stale: true }));
    calls.length = 0;
    const result = await queryGraphIndex(kv, { query: "東京" });
    expect(result.nodes.map(row => row.id)).toEqual(["a"]);
    expect(result.truncated).toBe(false);
    expect(calls.some(call => call.id === "state::list" || [KV.graphNodes, KV.graphEdges, KV.graphSnapshot].includes(call.scope as never))).toBe(false);
  });

  it("honors zero depth, terminates cycles and omits edges with missing or historical endpoints", async () => {
    const { kv } = await setup();
    for (const id of ["a", "b", "c"]) await kv.set(KV.graphNodes, id, node(id));
    for (const row of [edge("ab", "a", "b"), edge("ba", "b", "a"), edge("self", "a", "a"),
      edge("missing", "a", "gone"), edge("old", "a", "c", { isLatest: false })]) await kv.set(KV.graphEdges, row.id, row);
    expect((await queryGraphIndex(kv, { startNodeId: "a", maxDepth: 0 })).nodes.map(row => row.id)).toEqual(["a"]);
    const result = await queryGraphIndex(kv, { startNodeId: "a", maxDepth: 5 });
    expect(result.nodes.map(row => row.id).sort()).toEqual(["a", "b"]);
    expect(result.edges.map(row => row.id).sort()).toEqual(["ab", "ba", "self"]);
  });

  it("discards a response if a writer changes the revision during its point reads", async () => {
    const { kv, intercept } = await setup();
    await kv.set(KV.graphNodes, "a", node("a", "before"));
    let changed = false;
    intercept(async (id, payload) => {
      if (!changed && id === "state::get" && payload.scope === KV.graphRetrievalData && payload.key.includes(":record:node:")) {
        changed = true;
        await kv.set(KV.graphNodes, "a", node("a", "after"));
      }
    });
    expect(await queryGraphIndex(kv, {})).toMatchObject({ nodes: [], truncated: true, warning: expect.stringContaining("changed") });
  });

  it("reserves traversal capacity for unique neighbors despite parallel edges and cycles", async () => {
    const { kv, calls } = await setup();
    for (const id of ["root", "a", "b"]) await kv.set(KV.graphNodes, id, node(id));
    await kv.set(KV.graphEdges, "rb", edge("rb", "root", "b"));
    for (let i = 0; i < 512; i++) await kv.set(KV.graphEdges, `parallel-${i}`, edge(`parallel-${i}`, "root", "a"));
    await kv.set(KV.graphEdges, "self", edge("self", "root", "root"));
    calls.length = 0;
    const result = await queryGraphIndex(kv, { startNodeId: "root", maxDepth: 1 });
    expect(result.nodes.map(row => row.id).sort()).toEqual(["a", "b", "root"]);
    expect(result.edges.some(row => row.id === "rb")).toBe(true);
    expect(calls.filter(call => call.scope === KV.graphRetrievalData).length).toBeLessThanOrEqual(2048);
  });

  it("bounds impossible offsets without starting a scope listing", async () => {
    const { kv, calls } = await setup();
    for (let i = 0; i < 1100; i++) await kv.set(KV.graphNodes, `n${i}`, node(`n${i}`));
    calls.length = 0;
    expect(await queryGraphIndex(kv, { offset: Number.MAX_SAFE_INTEGER })).toMatchObject({ nodes: [], truncated: true });
    expect(calls.filter(call => call.scope === KV.graphRetrievalData).length).toBeLessThanOrEqual(2048);
    expect(calls.some(call => call.id === "state::list")).toBe(false);
  });

  it("reads aliases and history from bounded postings with canonical edge IDs deduplicated", async () => {
    const { kv, calls } = await setup();
    await kv.set(KV.graphNodes, "a", node("a", "Alice", { aliases: ["ＡＬＩＣＥ"] }));
    await kv.set(KV.graphNodes, "b", node("b"));
    const old = edge("old", "a", "b", { isLatest: false, version: 1 });
    await kv.set(KV.graphEdges, old.id, old);
    await kv.set(KV.graphEdgeHistory, old.id, old);
    await kv.set(KV.graphEdges, "new", edge("new", "a", "b", { isLatest: true, version: 2 }));
    calls.length = 0;
    const result = await readIndexedEntity(kv, "ＡＬＩＣＥ");
    expect(result).toMatchObject({ entity: { id: "a" }, truncated: false });
    if ("error" in result) throw new Error(result.error);
    expect(result.relatedEdges.map(row => row.id).sort()).toEqual(["new", "old"]);
    expect(result.entityHistory.map(row => row.id)).toEqual(["old"]);
    expect(calls.some(call => call.id === "state::list")).toBe(false);
  });

  it.each(["canonical", "history"])("recovers an interrupted temporal %s write across restart without losing history", async (failure) => {
    const { kv, intercept, store } = await setup();
    await kv.set(KV.graphNodes, "a", node("a", "Alice"));
    await kv.set(KV.graphNodes, "b", node("b", "Acme"));
    await kv.set(KV.graphEdges, "old", edge("old", "a", "b", { type: "uses", version: 1, isLatest: true }));
    const functions = new Map<string, (data: any) => Promise<any>>();
    const sdk = { registerFunction: (id: string, fn: any) => functions.set(id, fn) };
    const provider = {
      name: "fixture", summarize: async () => "", compress: async () => '<temporal_graph><entities><entity type="concept" name="Alice"></entity><entity type="concept" name="Acme"></entity></entities><relationships><relationship type="uses" source="Alice" target="Acme" weight="0.8"><reasoning>new</reasoning></relationship></relationships></temporal_graph>',
    };
    registerTemporalGraphFunctions(sdk as never, kv, provider);
    let failed = false;
    intercept(async (id, payload) => {
      if (!failed && id === "state::set" && (failure === "canonical"
        ? payload.scope === KV.graphEdges && payload.key !== "old"
        : payload.scope === KV.graphEdgeHistory)) {
        failed = true; throw new Error("interrupted replacement");
      }
    });
    expect(await functions.get("mem::temporal-graph-extract")!({ observations: [{ id: "obs", title: "test", narrative: "test", concepts: [], files: [], type: "discovery", timestamp: date }] })).toMatchObject({ success: false });
    expect((await queryGraphIndex(kv, { query: "Alice" })).nodes).toEqual([]);
    intercept();
    const restarted = createGraphIndexState(store).kv;
    await restarted.get(KV.graphNodes, "a");
    await recoverGraphIndex(restarted);
    registerTemporalGraphFunctions(sdk as never, restarted, provider);
    const state = await functions.get("mem::temporal-query")!({ entityName: "Alice", includeHistory: true });
    expect(state.currentEdges).toHaveLength(1);
    expect(state.currentEdges[0]).toMatchObject({ version: 2, isLatest: true });
    expect(state.currentEdges[0].id).not.toBe("old");
    expect(state.historicalEdges.map((edge: GraphEdge) => edge.id)).toEqual(["old"]);
    expect(state.timeline.filter((item: any) => item.edge.id === "old")).toHaveLength(1);
  });
});
