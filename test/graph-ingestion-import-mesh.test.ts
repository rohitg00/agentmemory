import { onLiveEvent } from "../src/viewer/live-events.js";
import { initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StateKV, applyUpdateOps } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { setGraphGenerationListener } from "../src/state/graph-generation.js";
import { registerGraphFunction } from "../src/functions/graph.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerMeshFunction } from "../src/functions/mesh.js";
import { registerViewerStreamTriggers } from "../src/triggers/viewer-streams.js";
import { getViewerCounts, resetViewerCounts } from "../src/state/viewer-counts.js";
import { setAuditRecordedListener } from "../src/functions/audit.js";
import type { ExportData, GraphEdge, GraphNode } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]) }));

const timestamp = "2026-10-12T12:00:00.000Z";
const node = (id: string, name = id, extra: Partial<GraphNode> = {}): GraphNode => ({
  id, name, type: "concept", properties: {}, sourceObservationIds: [], createdAt: timestamp, ...extra,
});
const edge = (id: string, sourceNodeId: string, targetNodeId: string, extra: Partial<GraphEdge> = {}): GraphEdge => ({
  id, sourceNodeId, targetNodeId, type: "related_to", weight: 0.8, sourceObservationIds: [], createdAt: timestamp, ...extra,
});
const exported = (graphNodes?: GraphNode[], graphEdges?: GraphEdge[]): ExportData => ({
  version: "0.9.30", exportedAt: timestamp, sessions: [], observations: {}, memories: [], summaries: [], graphNodes, graphEdges,
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

async function rig(rotated = true) {
  const store = new Map<string, Map<string, unknown>>();
  const handlers = new Map<string, (data: any) => Promise<any>>();
  const sent: any[] = [];
  const unsubscribeEvents = onLiveEvent((event) => sent.push({ type: event.type, data: structuredClone(event.data) }));
  const triggers: Array<{ type: string; function_id: string; config: { scope?: string } }> = [];
  let intercept: ((id: string, payload: any) => Promise<void>) | undefined;
  const sdk = {
    registerFunction: (id: string, fn: (data: any) => Promise<any>) => handlers.set(id, fn),
    registerTrigger: (trigger: typeof triggers[number]) => triggers.push(trigger),
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }): Promise<any> => {
      if (!id.startsWith("state::")) return handlers.get(id)!(payload);
      await intercept?.(id, payload);
      const rows = store.get(payload.scope) ?? new Map<string, unknown>();
      if (id === "state::get") return structuredClone(rows.get(payload.key) ?? null);
      if (id === "state::list") return structuredClone([...rows.values()]);
      const before = structuredClone(rows.get(payload.key) ?? null);
      if (id === "state::delete") rows.delete(payload.key);
      else if (id === "state::set") rows.set(payload.key, structuredClone(payload.value));
      else if (id === "state::update") rows.set(payload.key, applyUpdateOps(before, payload.ops));
      else throw new Error(`Unexpected state operation: ${id}`);
      store.set(payload.scope, rows);
      const after = structuredClone(rows.get(payload.key) ?? null);
      for (const trigger of triggers) {
        if (trigger.type === "state" && trigger.config.scope === payload.scope) {
          await handlers.get(trigger.function_id)!({ key: payload.key, event_type: after === null ? "state:deleted" : "state:updated", old_value: before, new_value: after });
        }
      }
      return id === "state::update" ? { old_value: before, new_value: after, errors: [] } : after;
    },
  };
  const kv = new StateKV(sdk as never);
  registerGraphFunction(sdk as never, kv, { name: "noop" } as never);
  registerExportImportFunction(sdk as never, kv);
  registerMeshFunction(sdk as never, kv, "fixture-secret");
  registerViewerStreamTriggers(sdk as never, kv);
  const call = (id: string, payload: any = {}) => sdk.trigger({ function_id: id, payload });
  if (rotated) await call("mem::graph-reset");
  else await initializeGraphIndex(kv, { status: "ready" });
  await getViewerCounts(kv);
  return { kv, call, store, sent, unsubscribeEvents, intercept: (fn?: typeof intercept) => { intercept = fn; } };
}

async function expectGraph(r: Awaited<ReturnType<typeof rig>>, ids: string[], edgeCount: number) {
  const query = await r.call("mem::graph-query");
  expect(query.nodes.map((n: GraphNode) => n.id).sort()).toEqual([...ids].sort());
  expect(await r.call("mem::graph-stats")).toMatchObject({ totalNodes: ids.length, totalEdges: edgeCount });
  expect(await getViewerCounts(r.kv)).toMatchObject({ graphNodes: ids.length, graphEdges: edgeCount });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setGraphGenerationListener(null);
  setAuditRecordedListener(null);
  resetViewerCounts();
});

describe("raw graph import reconciliation", () => {
  it.each([false, true])("publishes imported raw IDs in queries, stats, indexes and viewer counts (rotated: %s)", async (rotated) => {
    const r = await rig(rotated);
    const nodes = [node("raw-a", "Alpha"), node("raw-b", "Beta")];
    const result = await r.call("mem::import", { exportData: exported(nodes, [edge("raw-edge", "raw-a", "raw-b")]) });
    expect(result.success).toBe(true);
    await expectGraph(r, ["raw-a", "raw-b"], 1);
    expect(await r.kv.get(KV.graphNameIndex, "concept|Alpha")).toBe("raw-a");
    expect(await r.kv.get(KV.graphEdgeKey, "raw-a|raw-b|related_to")).toBe("raw-edge");
    expect(await r.kv.get(KV.graphNodeDegree, "raw-a")).toBe(1);
  });

  it("preserves overwrite-by-ID semantics while removing obsolete names and edge keys", async () => {
    const r = await rig();
    await r.call("mem::import", { exportData: exported([node("a", "Old"), node("b"), node("c")], [edge("e", "a", "b")]) });
    const renamed = node("a", "src/new.ts", { type: "file", properties: { marker: "verbatim" }, createdAt: "2001-01-01T00:00:00Z" });
    const changedEdge = edge("e", "a", "c", { type: "uses", weight: 0.4 });
    await r.call("mem::import", { exportData: exported([renamed], [changedEdge]), strategy: "merge" });
    await expectGraph(r, ["a", "b", "c"], 1);
    expect(await r.kv.get(KV.graphNodes, "a")).toEqual(renamed);
    expect(await r.kv.get(KV.graphNameIndex, "concept|Old")).toBeNull();
    expect(await r.kv.get(KV.graphNameIndex, "file|src/new.ts")).toBe("a");
    expect(await r.kv.get(KV.graphEdgeKey, "a|b|related_to")).toBeNull();
    expect(await r.kv.get(KV.graphEdgeKey, "a|c|uses")).toBe("e");
    expect(await r.kv.get(KV.graphNodeDegree, "b")).toBe(0);
    expect(await r.kv.get(KV.graphNodeDegree, "c")).toBe(1);
    expect(await r.call("mem::graph-stats")).toMatchObject({ nodesByType: { concept: 2, file: 1 }, edgesByType: { uses: 1 } });
  });

  it("does not merge distinct IDs that have the same name", async () => {
    const r = await rig();
    await r.call("mem::import", { exportData: exported([node("one", "Same"), node("two", "Same")], [edge("e", "one", "two")]) });
    await expectGraph(r, ["one", "two"], 1);
    expect(await r.kv.get(KV.graphEdges, "e")).toMatchObject({ sourceNodeId: "one", targetNodeId: "two" });
  });

  it("keeps existing graph records under skip and counts only skipped records", async () => {
    const r = await rig();
    const original = node("a", "Original");
    const relation = edge("e", "a", "b");
    await r.call("mem::import", { exportData: exported([original, node("b")], [relation]) });
    const result = await r.call("mem::import", {
      strategy: "skip", exportData: exported([node("a", "Changed"), node("c")], [edge("e", "c", "b")]),
    });
    expect(result).toMatchObject({ success: true, skipped: 2 });
    expect(await r.kv.get(KV.graphNodes, "a")).toEqual(original);
    expect(await r.kv.get(KV.graphEdges, "e")).toEqual(relation);
    expect(await r.kv.get(KV.graphNameIndex, "concept|Changed")).toBeNull();
    await expectGraph(r, ["a", "b", "c"], 1);
  });

  it.each(["omitted", "empty", "new records"])("replace clears graph history and obsolete derived state with %s", async (kind) => {
    const r = await rig();
    await r.call("mem::import", { exportData: exported([node("old-a"), node("old-b")], [edge("old-e", "old-a", "old-b")]) });
    await r.kv.set(KV.graphEdgeHistory, "old-history", edge("old-history", "old-a", "old-b"));
    const replacement = kind === "omitted" ? exported() : exported(kind === "empty" ? [] : [node("new")], []);
    expect((await r.call("mem::import", { exportData: replacement, strategy: "replace" })).success).toBe(true);
    await expectGraph(r, kind === "new records" ? ["new"] : [], 0);
    for (const [scope, id] of [[KV.graphNodes, "old-a"], [KV.graphNameIndex, "concept|old-a"], [KV.graphEdgeKey, "old-a|old-b|related_to"], [KV.graphNodeDegree, "old-a"], [KV.graphEdgeHistory, "old-history"]]) {
      expect(await r.kv.get(scope, id)).toBeNull();
    }
  });

  it.each(["merge", "skip", "replace"])("rejects invalid graph data before any %s mutation", async (strategy) => {
    const r = await rig();
    await r.call("mem::import", { exportData: exported([node("retained")], []) });
    const memory = { id: "kept-memory", title: "handwritten", content: "preserve me", sessionIds: [] };
    const session = { id: "kept-session", project: "fixture", startedAt: timestamp };
    await r.kv.set(KV.memories, memory.id, memory);
    await r.kv.set(KV.sessions, session.id, session);
    const mutations = vi.fn();
    r.intercept(async (operation) => {
      if (operation !== "state::get" && operation !== "state::list") mutations(operation);
    });
    const payload = { ...exported([{ ...node("invalid"), name: undefined } as never], []), memories: [{ ...memory, content: "changed" }] };
    expect(await r.call("mem::import", { strategy, exportData: payload })).toEqual({ success: false, error: "Invalid graph node or edge" });
    expect(mutations).not.toHaveBeenCalled();
    expect(await r.kv.get(KV.memories, memory.id)).toEqual(memory);
    expect(await r.kv.get(KV.sessions, session.id)).toEqual(session);
    await expectGraph(r, ["retained"], 0);
  });

  it.each([
    { graphNodes: {}, graphEdges: [] },
    { graphNodes: [], graphEdges: {} },
    { graphNodes: [], graphEdges: [{ ...edge("invalid", "a", "b"), sourceNodeId: "" }] },
  ])("rejects malformed graph containers and edges before replacement", async (graph) => {
    const r = await rig();
    await r.call("mem::import", { exportData: exported([node("retained")], []) });
    expect(await r.call("mem::import", { strategy: "replace", exportData: { ...exported(), ...graph } })).toMatchObject({ success: false });
    await expectGraph(r, ["retained"], 0);
  });

  it.each([["mem::import", "merge"], ["mem::import", "replace"], ["mem::mesh-receive", "lww"]])("keeps delayed %s (%s) writes in their original generation", async (id, strategy) => {
    const r = await rig();
    const entered = deferred();
    const release = deferred();
    let hold = true;
    r.intercept(async (operation, payload) => {
      if (hold && operation === "state::set" && payload.scope === KV.memories) {
        hold = false; entered.resolve(); await release.promise;
      }
    });
    const memories = [{ id: "memory", type: "fact", title: "fixture", content: "fixture", sessionIds: [], concepts: [], files: [], strength: 5, version: 1, isLatest: true, createdAt: timestamp, updatedAt: timestamp }];
    const payload = id === "mem::import"
      ? { exportData: { ...exported([node("late")], []), memories }, strategy }
      : { graphNodes: [node("late")], memories };
    const pending = r.call(id, payload);
    await entered.promise;
    await r.call("mem::graph-reset");
    release.resolve();
    expect((await pending).success).toBe(true);
    await expectGraph(r, [], 0);
    expect(await r.kv.get(KV.graphNodes, "late")).toBeNull();
  });

  it("reports a derived-state write failure and repairs it when ingestion is retried", async () => {
    const r = await rig();
    const payload = { exportData: exported([node("a"), node("b")], [edge("e", "a", "b")]) };
    let fail = true;
    r.intercept(async (operation, p) => {
      if (fail && operation === "state::set" && p.scope.startsWith(KV.graphNodeDegree)) {
        fail = false; throw new Error("injected degree failure");
      }
    });
    await expect(r.call("mem::import", payload)).rejects.toThrow("injected degree failure");
    expect((await r.call("mem::import", payload)).success).toBe(true);
    await expectGraph(r, ["a", "b"], 1);
    expect(await r.kv.get(KV.graphNodeDegree, "a")).toBe(1);
  });
});

describe("mesh raw graph reconciliation", () => {
  it("does not access graph storage when receiving only non-graph records", async () => {
    const r = await rig();
    r.intercept(async (operation, payload) => {
      if (operation === "state::get" && payload.scope.startsWith(KV.graphSnapshot)) {
        throw new Error("graph storage unavailable");
      }
    });
    const memory = { id: "memory-only", updatedAt: timestamp, content: "fixture" };
    expect(await r.call("mem::mesh-receive", { memories: [memory] })).toMatchObject({ success: true, accepted: 1 });
    expect(await r.kv.get(KV.memories, memory.id)).toEqual(memory);
  });

  it("uses node update timestamps and edge creation timestamps while preserving metadata", async () => {
    const r = await rig();
    const original = node("a", "Original");
    await r.call("mem::mesh-receive", { graphNodes: [original, node("b"), node("c")], graphEdges: [edge("e", "a", "b")] });
    const newer = node("a", "Changed", { updatedAt: "2026-10-13T00:00:00Z", aliases: ["alternate"], properties: { source: "peer" } });
    const relation = edge("e", "a", "c", { type: "uses", createdAt: "2026-10-13T00:00:00Z", tvalid: "2026-09-01T00:00:00Z" });
    expect(await r.call("mem::mesh-receive", { graphNodes: [newer], graphEdges: [relation] })).toMatchObject({ success: true, accepted: 2 });
    expect(await r.kv.get(KV.graphNodes, "a")).toEqual(newer);
    expect(await r.kv.get(KV.graphEdges, "e")).toEqual(relation);
    expect(await r.kv.get(KV.graphNameIndex, "concept|Original")).toBeNull();
    expect(await r.kv.get(KV.graphEdgeKey, "a|b|related_to")).toBeNull();
    expect(await r.kv.get(KV.graphNodeDegree, "b")).toBe(0);
    await expectGraph(r, ["a", "b", "c"], 1);
    expect(await r.call("mem::mesh-receive", { graphNodes: [original, { ...newer, name: "Equal timestamp" }, node("invalid", "invalid", { createdAt: "not-a-date" })], graphEdges: [edge("e", "c", "b"), { ...relation, weight: 0.1 }] })).toMatchObject({ accepted: 0 });
    expect(await r.kv.get(KV.graphNodes, "a")).toEqual(newer);
    expect(await r.kv.get(KV.graphEdges, "e")).toEqual(relation);
  });

  it("preserves edge-only acceptance and bounds provenance without changing other metadata", async () => {
    const r = await rig();
    const ids = Array.from({ length: 80 }, (_, i) => `obs-${i}`);
    expect(await r.call("mem::mesh-receive", { graphEdges: [edge("e", "unknown-a", "unknown-b", { sourceObservationIds: ids })] })).toMatchObject({ accepted: 1 });
    expect(await r.kv.get(KV.graphEdges, "e")).toMatchObject({ sourceNodeId: "unknown-a", targetNodeId: "unknown-b", sourceObservationIds: ids.slice(-32), weight: 0.8 });
    expect(await r.call("mem::graph-stats")).toMatchObject({ totalNodes: 0, totalEdges: 1 });
  });

  it("shows previously received edges when their endpoint nodes arrive in a later batch", async () => {
    const r = await rig();
    const relation = edge("early-edge", "late-a", "late-b");
    await r.call("mem::mesh-receive", { graphEdges: [relation] });
    await r.call("mem::mesh-receive", { graphNodes: [node("late-a"), node("late-b")] });
    await expectGraph(r, ["late-a", "late-b"], 1);
    expect((await r.call("mem::graph-query")).edges).toEqual([relation]);
  });

  it("reconciles graph data from pull sync and honors the peer's selected graph scopes", async () => {
    const r = await rig();
    const remote = { graphNodes: [node("remote-a"), node("remote-b")], graphEdges: [edge("remote-edge", "remote-a", "remote-b")] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(remote), { status: 200 })));
    await r.kv.set(KV.mesh, "peer", { id: "peer", name: "fixture", url: "https://peer.example.test", status: "connected", sharedScopes: ["graph:nodes"] });
    const first = await r.call("mem::mesh-sync", { peerId: "peer", direction: "pull" });
    expect(first.results[0]).toMatchObject({ pulled: 2, errors: [] });
    await expectGraph(r, ["remote-a", "remote-b"], 0);
    const second = await r.call("mem::mesh-sync", { peerId: "peer", direction: "pull", scopes: ["graph:edges"] });
    expect(second.results[0]).toMatchObject({ pulled: 1, errors: [] });
    await expectGraph(r, ["remote-a", "remote-b"], 1);
  });
});
