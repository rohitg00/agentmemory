import { initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { indexObservationSession } from "../src/state/obs-index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { pinGraphState, setGraphGenerationListener } from "../src/state/graph-generation.js";
import { persistGraphDelta, registerGraphFunction } from "../src/functions/graph.js";
import { GraphRetrieval } from "../src/functions/graph-retrieval.js";
import { describeGraphNode } from "../src/functions/graph-node.js";
import { registerTemporalGraphFunctions } from "../src/functions/temporal-graph.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerMeshFunction } from "../src/functions/mesh.js";
import { registerSnapshotFunction } from "../src/functions/snapshot.js";
import { registerReflectFunctions } from "../src/functions/reflect.js";
import { registerViewerStreamTriggers } from "../src/triggers/viewer-streams.js";
import { getViewerCounts, resetViewerCounts } from "../src/state/viewer-counts.js";
import { setAuditRecordedListener } from "../src/functions/audit.js";
import type { GraphEdge, GraphNode, GraphSnapshot } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const timestamp = "2026-10-12T12:00:00.000Z";
const node = (id: string, name = id, obs = id): GraphNode => ({
  id, name, type: "concept", properties: {}, sourceObservationIds: [obs], createdAt: timestamp,
});
const edge = (id: string, sourceNodeId: string, targetNodeId: string): GraphEdge => ({
  id, sourceNodeId, targetNodeId, type: "related_to", weight: 0.8,
  sourceObservationIds: ["old-edge-observation"], createdAt: timestamp,
});
const observation = { id: "old-observation", sessionId: "s", timestamp, type: "discovery", title: "old", narrative: "old", concepts: [], files: [], facts: [], importance: 5 };
const memory = { id: "mem_test", type: "fact", title: "test", content: "test", concepts: [], files: [], sessionIds: [], sourceObservationIds: [], strength: 5, version: 1, isLatest: true, createdAt: timestamp, updatedAt: timestamp };
const xml = '<entities><entity type="concept" name="alpha"></entity><entity type="concept" name="beta"></entity></entities><relationships><relationship type="related_to" source="alpha" target="beta" weight="0.8"></relationship></relationships>';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

async function setup(provider = { name: "noop", compress: vi.fn(async () => xml), summarize: vi.fn(async () => "") }) {
  const store = new Map<string, Map<string, unknown>>();
  const handlers = new Map<string, (data?: any) => Promise<any>>();
  const sent: any[] = [];
  let intercept: ((id: string, payload: any) => Promise<void>) | undefined;
  const sdk = {
    registerFunction: (id: string, fn: (data?: any) => Promise<any>) => handlers.set(id, fn),
    registerTrigger: vi.fn(),
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }): Promise<any> => {
      if (id === "stream::send") { sent.push(structuredClone(payload)); return {}; }
      if (!id.startsWith("state::")) return handlers.get(id)!(payload);
      await intercept?.(id, payload);
      const rows = store.get(payload.scope) ?? new Map<string, unknown>();
      if (id === "state::get") return structuredClone(rows.get(payload.key) ?? null);
      if (id === "state::list") return structuredClone([...rows.values()]);
      if (id === "state::delete") { rows.delete(payload.key); return; }
      if (id === "state::set") {
        rows.set(payload.key, structuredClone(payload.value));
        store.set(payload.scope, rows);
        return structuredClone(payload.value);
      }
      throw new Error(`unexpected state call ${id}`);
    },
  };
  const kv = new StateKV(sdk as never);
  await initializeGraphIndex(kv, { status: "ready" });
  registerGraphFunction(sdk as never, kv, provider as never);
  registerTemporalGraphFunctions(sdk as never, kv, provider as never);
  registerExportImportFunction(sdk as never, kv);
  registerMeshFunction(sdk as never, kv);
  registerReflectFunctions(sdk as never, kv, provider as never);
  const call = (id: string, payload: any = {}) => sdk.trigger({ function_id: id, payload });
  return { kv, sdk, call, store, sent, provider, intercept: (fn?: typeof intercept) => { intercept = fn; } };
}

async function seed(kv: StateKV) {
  for (const id of ["old-a", "old-b", "old-edge-observation"]) {
    await kv.set(KV.observations("s"), id, { ...observation, id });
    await indexObservationSession(kv, id, "s");
  }
  await persistGraphDelta(kv, [node("old-a", "alpha"), node("old-b", "beta")], [edge("old-edge", "old-a", "old-b")]);
  await kv.set(KV.graphEdgeHistory, "old-history", edge("old-history", "old-a", "old-b"));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setGraphGenerationListener(null);
  setAuditRecordedListener(null);
  resetViewerCounts();
});

describe("graph generation reset", () => {
  it("hides legacy nodes, edges, history and indexes from every graph read path, rebuild and export", async () => {
    const { kv, call, store, provider } = await setup();
    await seed(kv);
    await kv.set(KV.graphNodes, "undated", { ...node("undated"), createdAt: undefined });
    const retrieval = new GraphRetrieval(kv);
    expect(await retrieval.searchByEntities(["alpha"])).not.toEqual([]);
    expect(await call("mem::graph-reset")).toMatchObject({
      success: true,
      resetMode: "generation",
      physicalStorageRetained: true,
      message: expect.stringContaining("does not reclaim disk space"),
    });
    // Physical legacy rows remain, but no logical read can fall back to them.
    expect(store.get(KV.graphNodes)?.size).toBe(3);
    for (const scope of [KV.graphNodes, KV.graphEdges, KV.graphEdgeHistory, KV.graphNameIndex, KV.graphEdgeKey, KV.graphNodeDegree]) {
      expect(await kv.list(scope)).toEqual([]);
    }
    expect(await kv.get(KV.graphNodes, "old-a")).toBeNull();
    expect(await retrieval.searchByEntities(["alpha"])).toEqual([]);
    expect(await retrieval.expandFromChunks(["old-a"])).toEqual([]);
    expect((await retrieval.temporalQuery("alpha")).entity).toBeNull();
    expect(await describeGraphNode(kv, "old-a")).toBeNull();
    for (const args of [{}, { query: "alpha" }, { startNodeId: "old-a" }]) {
      expect((await call("mem::graph-query", args)).nodes).toEqual([]);
    }
    expect(await call("mem::graph-stats")).toMatchObject({ totalNodes: 0, totalEdges: 0 });
    expect(await call("mem::temporal-query", { entityName: "alpha", includeHistory: true })).toHaveProperty("error");
    expect(await call("mem::differential-state", { entityName: "alpha" })).toHaveProperty("error");
    const exported = await call("mem::export");
    expect(exported.graphNodes).toBeUndefined();
    expect(exported.graphEdges).toBeUndefined();
    expect((await call("mem::reflect")).clustersProcessed).toBe(0);
    expect(provider.summarize).not.toHaveBeenCalled();
    expect((await call("mem::graph-snapshot-rebuild", { force: true })).success).toBe(true);
    expect((await call("mem::graph-stats")).totalNodes).toBe(0);
    expect((await call("mem::graph-compact")).nodesTrimmed).toBe(0);
  });

  it("uses unique generations for same-millisecond resets and never merges old provenance on re-extraction", async () => {
    vi.useFakeTimers(); vi.setSystemTime(timestamp);
    const { kv, call } = await setup();
    await seed(kv);
    await call("mem::graph-reset");
    const first = await kv.get(KV.graphControl, "generation");
    await persistGraphDelta(kv, [node("new-a", "alpha", "new-observation")], []);
    expect((await kv.list<GraphNode>(KV.graphNodes))[0]).toMatchObject({ id: "new-a", sourceObservationIds: ["new-observation"] });
    const oldView = await pinGraphState(kv);
    await call("mem::graph-reset");
    expect(await kv.get(KV.graphControl, "generation")).not.toBe(first);
    await oldView.set(KV.graphNodes, "late", node("late"));
    expect(await kv.list(KV.graphNodes)).toEqual([]);
    expect((await call("mem::graph-stats")).totalNodes).toBe(0);
  });

  it.each(["mem::graph-extract", "mem::temporal-graph-extract"])("does not publish %s which was awaiting its provider at reset", async (id) => {
    vi.stubEnv("GRAPH_EXTRACTION_ENABLED", "true");
    const entered = deferred(); const response = deferred<string>();
    const provider = { name: "test", compress: vi.fn(() => { entered.resolve(); return response.promise; }), summarize: vi.fn(async () => "") };
    const { kv, call } = await setup(provider);
    const extraction = call(id, { observations: [observation] });
    await entered.promise;
    await call("mem::graph-reset");
    response.resolve(xml);
    const late = await extraction;
    expect(late.success).toBe(id !== "mem::temporal-graph-extract");
    if (id === "mem::temporal-graph-extract") expect(late.error).toContain("changed revision");
    expect(await kv.list(KV.graphNodes)).toEqual([]);
    expect(await kv.list(KV.graphEdges)).toEqual([]);
    expect((await call("mem::graph-stats")).totalNodes).toBe(0);
    provider.compress.mockResolvedValue(xml);
    await call(id, { observations: [{ ...observation, id: "fresh-observation" }] });
    const rows = await kv.list<GraphNode>(KV.graphNodes);
    expect(rows.length).toBe(2);
    expect(rows.every((n) => n.sourceObservationIds.includes("fresh-observation") && !n.sourceObservationIds.includes("old-observation"))).toBe(true);
  });

  it("keeps a persist queued behind reset in its starting generation", async () => {
    const { kv, call, intercept } = await setup();
    const entered = deferred(); const release = deferred();
    intercept(async (id, p) => {
      if (id === "state::get" && p.scope === KV.graphNameIndex) {
        intercept(); entered.resolve(); await release.promise;
      }
    });
    const first = persistGraphDelta(kv, [node("first")], []);
    await entered.promise;
    const reset = call("mem::graph-reset");
    const queued = persistGraphDelta(kv, [node("queued")], []);
    release.resolve();
    await Promise.all([first, reset, queued]);
    expect(await kv.list(KV.graphNodes)).toEqual([]);
    expect((await call("mem::graph-stats")).totalNodes).toBe(0);
  });

  it("preserves the old active graph if snapshot initialization or pointer publication fails", async () => {
    const { kv, call, intercept } = await setup();
    await seed(kv);
    for (const failPointer of [false, true]) {
      intercept(async (id, p) => {
        if (id === "state::set" && (failPointer ? p.scope === KV.graphControl : p.scope.startsWith(`${KV.graphSnapshot}:generation:`))) throw new Error("write failed");
      });
      await expect(call("mem::graph-reset")).rejects.toThrow("write failed");
      intercept();
      expect((await kv.list(KV.graphNodes)).length).toBe(2);
      expect((await call("mem::graph-stats")).totalNodes).toBe(2);
    }
    expect((await call("mem::graph-reset")).success).toBe(true);
    expect(await kv.list(KV.graphNodes)).toEqual([]);
  });

  it("retains the boundary across StateKV restart and fails closed on an unreadable or corrupt pointer", async () => {
    const { kv, sdk, call, intercept } = await setup();
    await seed(kv); await call("mem::graph-reset");
    const restarted = new StateKV(sdk as never);
    expect(await restarted.list(KV.graphNodes)).toEqual([]);
    expect(await new GraphRetrieval(restarted).searchByEntities(["alpha"])).toEqual([]);
    intercept(async (id, p) => { if (id === "state::get" && p.scope === KV.graphControl) throw new Error("offline"); });
    await expect(restarted.list(KV.graphNodes)).rejects.toThrow("offline");
    intercept();
    await kv.set(KV.graphControl, "generation", "invalid");
    await expect(restarted.list(KV.graphNodes)).rejects.toThrow("Invalid graph generation");
    await call("mem::graph-reset");
    expect(await restarted.list(KV.graphNodes)).toEqual([]);
  });

  it("accepts intentional imports into the active generation without timestamp-based duplication", async () => {
    const { kv, call } = await setup();
    await seed(kv); await call("mem::graph-reset");
    const imported = { ...node("imported", "alpha", "import-observation"), createdAt: "2020-01-01T00:00:00.000Z" };
    await call("mem::import", { exportData: { version: "0.9.30", exportedAt: timestamp, sessions: [], observations: {}, memories: [], summaries: [], graphNodes: [imported] } });
    await call("mem::graph-snapshot-rebuild", { force: true });
    await persistGraphDelta(kv, [node("new", "alpha", "new-observation")], []);
    const nodes = await kv.list<GraphNode>(KV.graphNodes);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].sourceObservationIds).toEqual(["import-observation", "new-observation"]);
    expect((await call("mem::graph-stats")).totalNodes).toBe(1);
    await call("mem::mesh-receive", { graphNodes: [node("from-mesh")] });
    expect(await kv.get(KV.graphNodes, "from-mesh")).not.toBeNull();
    expect(await kv.get(KV.graphNodes, "old-a")).toBeNull();
  });

  it.each(["mem::import", "mem::mesh-receive"])("keeps delayed %s graph writes out of a concurrent reset", async (id) => {
    const { kv, call, intercept } = await setup();
    const entered = deferred(); const release = deferred();
    intercept(async (fn, p) => {
      if (fn === "state::set" && p.scope === KV.memories) {
        intercept(); entered.resolve(); await release.promise;
      }
    });
    const data = { version: "0.9.30", exportedAt: timestamp, sessions: [], observations: {}, memories: [memory], summaries: [], graphNodes: [node("imported")], graphEdges: [] };
    const pending = call(id, id === "mem::import" ? { exportData: data } : data);
    await entered.promise;
    await call("mem::graph-reset");
    release.resolve();
    expect((await pending).success).toBe(true);
    expect(await kv.list(KV.graphNodes)).toEqual([]);
  });

  it("pins snapshot restore before filesystem and non-graph work, while allowing a later deliberate restore", async () => {
    const { kv, sdk, call, intercept } = await setup();
    const dir = mkdtempSync(join(process.cwd(), ".graph-generation-test-"));
    try {
      registerSnapshotFunction(sdk as never, kv, dir);
      await seed(kv); await kv.set(KV.memories, memory.id, memory);
      const saved = await call("mem::snapshot-create");
      expect(saved.success).toBe(true);
      const commitHash = saved.snapshot.commitHash;
      await call("mem::graph-reset");
      const entered = deferred(); const release = deferred();
      intercept(async (fn, p) => {
        if (fn === "state::set" && p.scope === KV.memories) {
          intercept(); entered.resolve(); await release.promise;
        }
      });
      const restoring = call("mem::snapshot-restore", { commitHash });
      await entered.promise;
      await call("mem::graph-reset");
      release.resolve();
      expect((await restoring).success).toBe(true);
      expect(await kv.list(KV.graphNodes)).toEqual([]);
      expect((await call("mem::snapshot-restore", { commitHash })).success).toBe(true);
      expect((await kv.list(KV.graphNodes)).length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never re-resolves the namespace halfway through a Redis read-modify-write", async () => {
    const { kv, sdk, call, intercept, store } = await setup();
    await seed(kv);
    const redis = new StateKV(sdk as never, { backend: "redis" });
    const entered = deferred(); const release = deferred();
    intercept(async (fn, p) => {
      if (fn === "state::get" && p.scope === KV.graphNodes) {
        intercept(); entered.resolve(); await release.promise;
      }
    });
    const update = redis.update(KV.graphNodes, "old-a", [{ type: "set", path: "name", value: "late-update" }]);
    await entered.promise;
    await call("mem::graph-reset");
    release.resolve(); await update;
    expect(store.get(KV.graphNodes)?.get("old-a")).toMatchObject({ name: "late-update" });
    expect(await redis.get(KV.graphNodes, "old-a")).toBeNull();
  });

  it("updates cached viewer counts and refuses late legacy snapshot events after reset", async () => {
    const { kv, sdk, call, sent } = await setup();
    await seed(kv);
    const legacy = await kv.get<GraphSnapshot>(KV.graphSnapshot, "current");
    registerViewerStreamTriggers(sdk as never, kv);
    expect((await getViewerCounts(kv)).graphNodes).toBe(2);
    await call("mem::graph-reset");
    expect((await getViewerCounts(kv)).graphNodes).toBe(0);
    const count = sent.length;
    expect(await call("event::viewer::graph-snapshot-changed", { key: "current", event_type: "state:updated", new_value: legacy })).toEqual({ emitted: false });
    expect(await call("event::viewer::graph-nodes-changed")).toEqual({ emitted: false });
    expect(await call("event::viewer::graph-edges-changed")).toEqual({ emitted: false });
    expect(sent.length).toBe(count);
    await persistGraphDelta(kv, [node("fresh")], []);
    expect((await getViewerCounts(kv)).graphNodes).toBe(1);
    expect(sent.filter((e) => e.type === "graph.changed").at(-1).data.stats.totalNodes).toBe(1);
  });

  it("orders a delayed legacy viewer callback before reset completion", async () => {
    const { kv, sdk, call, sent } = await setup();
    await seed(kv);
    const legacy = await kv.get<GraphSnapshot>(KV.graphSnapshot, "current");
    registerViewerStreamTriggers(sdk as never, kv);
    await getViewerCounts(kv);
    const entered = deferred(); const release = deferred();
    const originalGet = kv.get.bind(kv);
    let pause = true;
    vi.spyOn(kv, "get").mockImplementation(async (scope, key) => {
      const result = await originalGet(scope, key);
      if (pause && scope === KV.graphControl) {
        pause = false; entered.resolve(); await release.promise;
      }
      return result;
    });
    const legacyEvent = call("event::viewer::graph-snapshot-changed", { key: "current", event_type: "state:updated", new_value: legacy });
    await entered.promise;
    const reset = call("mem::graph-reset");
    release.resolve();
    await Promise.all([legacyEvent, reset]);
    expect((await getViewerCounts(kv)).graphNodes).toBe(0);
    expect(sent.filter((e) => e.type === "graph.changed").at(-1).data.stats.totalNodes).toBe(0);
  });
});
