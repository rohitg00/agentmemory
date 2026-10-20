import { afterEach, describe, expect, it, vi } from "vitest";
import { StateKV, applyUpdateOps } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { pinGraphState, setGraphGenerationListener } from "../src/state/graph-generation.js";
import { persistGraphDelta, registerGraphFunction } from "../src/functions/graph.js";
import { persistGraphRecords } from "../src/state/graph-ingestion.js";
import { initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { registerViewerStreamTriggers } from "../src/triggers/viewer-streams.js";
import { resetViewerCounts } from "../src/state/viewer-counts.js";
import { setAuditRecordedListener } from "../src/functions/audit.js";
import type { GraphEdge, GraphNode, GraphSnapshot } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const timestamp = "2026-10-12T12:00:00.000Z";
const later = "2026-10-13T12:00:00.000Z";
const node = (id: string, overrides: Partial<GraphNode> = {}): GraphNode => ({
  id, name: id, type: "concept", properties: {}, sourceObservationIds: [id], createdAt: timestamp,
  ...overrides,
});
const edge = (id: string, sourceNodeId: string, targetNodeId: string, overrides: Partial<GraphEdge> = {}): GraphEdge => ({
  id, sourceNodeId, targetNodeId, type: "related_to", weight: 0.8,
  sourceObservationIds: [id], createdAt: timestamp, ...overrides,
});
const inScope = (physical: string, logical: string) => physical === logical || physical.startsWith(`${logical}:generation:`);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

type Payload = { scope: string; key: string; value?: any; [key: string]: any };

function setup(backend: "file" | "redis" = "file") {
  const store = new Map<string, Map<string, unknown>>();
  const handlers = new Map<string, (data?: any) => Promise<any>>();
  const calls: Array<{ id: string; payload: Payload }> = [];
  const sent: any[] = [];
  let intercept: ((id: string, payload: Payload) => Promise<void> | void) | undefined;
  const sdk = {
    registerFunction: (id: string, fn: (data?: any) => Promise<any>) => handlers.set(id, fn),
    registerTrigger: vi.fn(),
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }): Promise<any> => {
      if (id === "stream::send") { sent.push(structuredClone(payload)); return {}; }
      if (!id.startsWith("state::")) return handlers.get(id)!(payload);
      calls.push({ id, payload: structuredClone(payload) });
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
      if (id === "state::update") {
        const oldValue = structuredClone(rows.get(payload.key) ?? null);
        const newValue = applyUpdateOps(oldValue, payload.ops);
        rows.set(payload.key, structuredClone(newValue));
        store.set(payload.scope, rows);
        return { old_value: oldValue, new_value: newValue, errors: [] };
      }
      throw new Error(`Unexpected state call ${id}`);
    },
  };
  const kv = new StateKV(sdk as never, { backend });
  registerGraphFunction(sdk as never, kv, { name: "noop" } as never);
  const call = (id: string, payload: any = {}) => sdk.trigger({ function_id: id, payload });
  const snapshot = async (view = kv) => (await view.get<GraphSnapshot>(KV.graphSnapshot, "current"))!;
  return { kv, sdk, store, calls, sent, call, snapshot, intercept: (fn?: typeof intercept) => { intercept = fn; } };
}

async function degrees(kv: StateKV, ids: string[]) {
  return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await kv.get<number>(KV.graphNodeDegree, id)])));
}

afterEach(() => {
  setGraphGenerationListener(null);
  setAuditRecordedListener(null);
  resetViewerCounts();
});

describe("raw graph ingestion reconciliation", () => {
  it("checks a clean snapshot once across repeated graph row reads until the next snapshot write", async () => {
    const { kv, snapshot, calls } = setup();
    await persistGraphRecords(kv, [node("a")], [], { mode: "merge" });
    calls.length = 0;
    for (let i = 0; i < 100; i++) {
      await kv.get(KV.graphNodes, "a");
      await kv.get(KV.graphNodeDegree, "a");
      await kv.get(KV.graphNameIndex, "concept|a");
    }
    const snapshotReads = () => calls.filter((call) => call.id === "state::get" && call.payload.scope === KV.graphSnapshot).length;
    expect(snapshotReads()).toBe(1);
    const clean = await snapshot();
    await kv.set(KV.graphSnapshot, "current", clean);
    calls.length = 0;
    await kv.get(KV.graphNodes, "a");
    await kv.get(KV.graphNodes, "a");
    expect(snapshotReads()).toBe(1);
  });

  it("bounds snapshot check entries across generations and checks an evicted scope again", async () => {
    const { kv, calls } = setup();
    const scope = (i: number) => `${KV.graphNodes}:generation:cache-${i}`;
    const snapshotReads = () => calls.filter((call) => call.id === "state::get" && inScope(call.payload.scope, KV.graphSnapshot)).length;
    for (let i = 0; i < 64; i++) await kv.get(scope(i), "missing");
    expect(snapshotReads()).toBe(64);
    await kv.get(scope(0), "missing");
    expect(snapshotReads()).toBe(64);
    await kv.get(scope(64), "missing");
    await kv.get(scope(64), "missing");
    expect(snapshotReads()).toBe(65);
    await kv.get(scope(0), "missing");
    expect(snapshotReads()).toBe(66);
  });

  it("does not cache a failed clean snapshot check", async () => {
    const { kv, calls, intercept } = setup();
    intercept((id, p) => {
      if (id === "state::get" && p.scope === KV.graphSnapshot) throw new Error("snapshot unavailable");
    });
    await expect(kv.get(KV.graphNodes, "missing")).rejects.toThrow("snapshot unavailable");
    intercept();
    await kv.get(KV.graphNodes, "missing");
    await kv.get(KV.graphNodes, "missing");
    expect(calls.filter((call) => call.id === "state::get" && call.payload.scope === KV.graphSnapshot)).toHaveLength(2);
  });

  it("does not restore an evicted check when an older clean peek finishes", async () => {
    const { kv, sdk, calls } = setup();
    const entered = deferred();
    const release = deferred();
    const trigger = sdk.trigger.bind(sdk);
    let paused = false;
    vi.spyOn(sdk, "trigger").mockImplementation(async (request) => {
      const value = await trigger(request);
      if (!paused && request.function_id === "state::get" && request.payload.scope === KV.graphSnapshot) {
        paused = true; entered.resolve(); await release.promise;
      }
      return value;
    });
    const reading = kv.get(KV.graphNodes, "missing");
    await entered.promise;
    try {
      for (let i = 0; i < 64; i++) await kv.get(`${KV.graphNodes}:generation:cache-${i}`, "missing");
    } finally {
      release.resolve(); await reading;
    }
    calls.length = 0;
    await kv.get(KV.graphNodes, "missing");
    await kv.get(KV.graphNodes, "missing");
    expect(calls.filter((call) => call.id === "state::get" && call.payload.scope === KV.graphSnapshot)).toHaveLength(1);
  });

  it.each([false, true])("invalidates an in-flight clean peek after snapshot deletion, response lost: %s", async (responseLost) => {
    const { kv, store, calls, intercept } = setup();
    await persistGraphRecords(kv, [node("before")], [], { mode: "merge" });
    const entered = deferred();
    const release = deferred();
    intercept(async (id, p) => {
      if (id === "state::delete" && p.scope === KV.graphSnapshot) {
        entered.resolve(); await release.promise;
        if (responseLost) {
          store.get(KV.graphSnapshot)!.delete("current");
          throw new Error("delete response lost");
        }
      }
    });
    const deleting = kv.delete(KV.graphSnapshot, "current");
    const finished = responseLost ? expect(deleting).rejects.toThrow("delete response lost") : deleting;
    await entered.promise;
    try {
      expect(await kv.get(KV.graphNodes, "before")).toMatchObject({ id: "before" });
    } finally {
      release.resolve(); await finished; intercept();
    }
    calls.length = 0;
    await kv.get(KV.graphNodes, "before");
    await kv.get(KV.graphNodes, "before");
    expect(calls.filter((call) => call.id === "state::get" && call.payload.scope === KV.graphSnapshot)).toHaveLength(1);
  });

  it.each([
    ["file", "set"], ["file", "update"], ["redis", "update"],
  ] as const)("invalidates a clean in-flight peek when a %s %s journal commits but its response is lost", async (backend, operation) => {
    const { kv, store, snapshot, intercept } = setup(backend);
    await persistGraphRecords(kv, [node("before")], [], { mode: "merge" });
    const clean = await snapshot();
    const added = node("added");
    const next: GraphSnapshot = {
      ...clean, topNodes: [...clean.topNodes, added],
      topDegrees: { ...clean.topDegrees, added: 0 },
      stats: { ...clean.stats, totalNodes: 2, nodesByType: { concept: 2 } },
    };
    const pending: GraphSnapshot = {
      ...clean, dirty: true,
      pendingMutation: {
        snapshot: next,
        writes: [{ scope: KV.graphNodes, key: added.id, value: added }],
      },
    };
    const entered = deferred();
    const release = deferred();
    let paused = false;
    intercept(async (id, p) => {
      if (!paused && (id === "state::set" || id === "state::update") && p.scope === KV.graphSnapshot) {
        paused = true; entered.resolve(); await release.promise;
        store.get(KV.graphSnapshot)!.set("current", structuredClone(pending));
        throw new Error("committed response lost");
      }
    });
    const writing = operation === "set"
      ? kv.set(KV.graphSnapshot, "current", pending)
      : kv.update(KV.graphSnapshot, "current", [{ type: "set", path: "", value: pending }]);
    const failed = expect(writing).rejects.toThrow("committed response lost");
    await entered.promise;
    try {
      expect(await kv.get(KV.graphNodes, "before")).toMatchObject({ id: "before" });
    } finally {
      release.resolve(); await failed; intercept();
    }
    expect((await snapshot()).pendingMutation).toBeUndefined();
    expect((await snapshot()).stats.totalNodes).toBe(2);
    expect(await kv.get(KV.graphNodes, "added")).toMatchObject({ id: "added" });
  });

  it("serves committed index counts while a larger ingestion is still planning its next batch", async () => {
    const { kv, call, intercept } = setup();
    await initializeGraphIndex(kv, { status: "ready" });
    const entered = deferred();
    const release = deferred();
    intercept(async (id, p) => {
      if (id === "state::get" && p.scope === KV.graphNodes && p.key === "batch-50") {
        entered.resolve(); await release.promise;
      }
    });
    const writing = persistGraphRecords(kv, Array.from({ length: 51 }, (_, i) => node(`batch-${i}`)), [], { mode: "merge" });
    await entered.promise;
    let observed: { totalNodes: number } | undefined;
    const reading = call("mem::graph-stats").then((result) => { observed = result; });
    try {
      await new Promise<void>((done) => setImmediate(done));
      expect(observed).toMatchObject({ totalNodes: 50 });
    } finally {
      release.resolve();
      await Promise.all([writing, reading]);
    }
  });

  it("does not cache a clean peek that was overtaken by a failed journaled write", async () => {
    const { kv, sdk, snapshot, intercept } = setup();
    await persistGraphRecords(kv, [node("before")], [], { mode: "merge" });
    const entered = deferred();
    const release = deferred();
    const trigger = sdk.trigger.bind(sdk);
    let paused = false;
    vi.spyOn(sdk, "trigger").mockImplementation(async (request) => {
      const value = await trigger(request);
      if (!paused && request.function_id === "state::get" && request.payload.scope === KV.graphSnapshot) {
        paused = true; entered.resolve(); await release.promise;
      }
      return value;
    });
    const reading = snapshot();
    await entered.promise;
    intercept((id, p) => {
      if (id === "state::set" && p.scope === KV.graphNameIndex && p.key === "concept|after") throw new Error("injected failure");
    });
    try {
      await expect(persistGraphRecords(kv, [node("after")], [], { mode: "merge" })).rejects.toThrow("injected failure");
    } finally {
      intercept(); release.resolve();
    }
    await reading;
    const recovered = await snapshot();
    expect(recovered.pendingMutation).toBeUndefined();
    expect(recovered.stats.totalNodes).toBe(2);
    expect(await kv.get(KV.graphNodes, "after")).toMatchObject({ id: "after" });
  });

  it("does not cache old clean state while an invalidated journal write is still in flight", async () => {
    const { kv, call, snapshot, intercept } = setup();
    await initializeGraphIndex(kv, { status: "ready" });
    await persistGraphRecords(kv, [node("before")], [], { mode: "merge" });
    const entered = deferred();
    const release = deferred();
    intercept(async (id, p) => {
      if (id === "state::set" && p.scope === KV.graphSnapshot && p.value?.pendingMutation) {
        entered.resolve(); await release.promise;
      }
      if (id === "state::set" && p.scope === KV.graphNameIndex && p.key === "concept|after") throw new Error("injected failure");
    });
    const writing = persistGraphRecords(kv, [node("after")], [], { mode: "merge" });
    const failed = expect(writing).rejects.toThrow("injected failure");
    await entered.promise;
    let observed: { totalNodes: number } | undefined;
    const reading = call("mem::graph-stats").then((result) => { observed = result; });
    try {
      await new Promise<void>((done) => setImmediate(done));
      expect(observed).toMatchObject({ available: false, totalNodes: null });
    } finally {
      release.resolve();
      await Promise.all([failed, reading]);
      intercept();
    }
    const recovered = await snapshot();
    expect(recovered.pendingMutation).toBeUndefined();
    expect(recovered.stats.totalNodes).toBe(2);
    expect(await kv.get(KV.graphNodes, "after")).toMatchObject({ id: "after" });
    expect(await call("mem::graph-stats")).toMatchObject({ available: true, totalNodes: 2 });
  });

  it("matches a raw-record oracle through a deterministic sequence of overlapping mutations", async () => {
    const { kv, snapshot } = setup();
    let randomState = 0x1525;
    const random = (limit: number) => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState % limit;
    };
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const namesSeen = new Set<string>();
    const edgeKeysSeen = new Set<string>();
    const apply = async (incomingNodes: GraphNode[], incomingEdges: GraphEdge[]) => {
      await persistGraphRecords(kv, incomingNodes, incomingEdges, { mode: "merge" });
      for (const n of incomingNodes) { nodes.set(n.id, n); namesSeen.add(`${n.type}|${n.name}`); }
      for (const e of incomingEdges) { edges.set(e.id, e); edgeKeysSeen.add(`${e.sourceNodeId}|${e.targetNodeId}|${e.type}`); }
    };
    await apply(
      Array.from({ length: 16 }, (_, i) => node(`n${i}`, { name: `shared-${i % 4}` })),
      Array.from({ length: 24 }, (_, i) => edge(`e${i}`, `n${random(16)}`, `n${random(16)}`)),
    );
    for (let step = 0; step < 100; step++) {
      const incomingNodes: GraphNode[] = [];
      const incomingEdges: GraphEdge[] = [];
      if (step % 3 !== 2) {
        const id = `n${random(16)}`;
        const updated = node(id, {
          name: `shared-${random(5)}`,
          type: (["concept", "file", "function"] as const)[random(3)],
          stale: random(5) === 0,
          properties: { revision: step },
        });
        if (step % 7 === 0) incomingNodes.push(node(id, { name: "intermediate" }));
        incomingNodes.push(updated);
      }
      if (step % 3 !== 0) {
        const id = `e${random(24)}`;
        const updated = edge(id, `n${random(16)}`, `n${random(16)}`, {
          type: (["related_to", "uses", "imports"] as const)[random(3)],
          stale: random(4) === 0,
          weight: random(100) / 100,
        });
        if (step % 9 === 0) incomingEdges.push(edge(id, "n0", "n0"));
        incomingEdges.push(updated);
      }
      await apply(incomingNodes, incomingEdges);

      const liveNodes = [...nodes.values()].filter((n) => !n.stale);
      const liveEdges = [...edges.values()].filter((e) => !e.stale);
      const liveIds = new Set(liveNodes.map((n) => n.id));
      const countTypes = (rows: Array<{ type: string }>) => {
        const counts: Record<string, number> = {};
        for (const row of rows) counts[row.type] = (counts[row.type] ?? 0) + 1;
        return counts;
      };
      const expectedDegrees = Object.fromEntries([...nodes.keys()].map((id) => [id, 0]));
      for (const e of liveEdges) { expectedDegrees[e.sourceNodeId]++; expectedDegrees[e.targetNodeId]++; }
      const snap = await snapshot();
      expect(snap.stats, `counts after step ${step}`).toEqual({
        totalNodes: liveNodes.length, totalEdges: liveEdges.length,
        nodesByType: countTypes(liveNodes), edgesByType: countTypes(liveEdges),
      });
      expect(snap.topNodes.map((n) => n.id).sort(), `nodes after step ${step}`).toEqual([...liveIds].sort());
      expect(snap.topEdges.map((e) => e.id).sort(), `edges after step ${step}`).toEqual(
        liveEdges.filter((e) => liveIds.has(e.sourceNodeId) && liveIds.has(e.targetNodeId)).map((e) => e.id).sort(),
      );
      expect(await degrees(kv, [...nodes.keys()]), `degrees after step ${step}`).toEqual(expectedDegrees);
      for (const n of snap.topNodes) {
        expect(n).toEqual(nodes.get(n.id));
        expect(snap.topDegrees[n.id]).toBe(expectedDegrees[n.id]);
      }
      for (const e of snap.topEdges) expect(e).toEqual(edges.get(e.id));
      for (const key of namesSeen) {
        const members = liveNodes.filter((n) => `${n.type}|${n.name}` === key).map((n) => n.id);
        const indexed = await kv.get(KV.graphNameIndex, key);
        if (members.length) expect(members, `name ${key} after step ${step}`).toContain(indexed);
        else expect(indexed, `removed name ${key} after step ${step}`).toBeNull();
      }
      for (const key of edgeKeysSeen) {
        const members = liveEdges.filter((e) => `${e.sourceNodeId}|${e.targetNodeId}|${e.type}` === key).map((e) => e.id);
        const indexed = await kv.get(KV.graphEdgeKey, key);
        if (members.length) expect(members, `edge key ${key} after step ${step}`).toContain(indexed);
        else expect(indexed, `removed edge key ${key} after step ${step}`).toBeNull();
      }
    }
    expect(await kv.list(KV.graphNodes)).toHaveLength(nodes.size);
    expect(await kv.list(KV.graphEdges)).toHaveLength(edges.size);
  });

  it("preserves raw IDs and endpoint references when multiple records share a name or edge key", async () => {
    const { kv, snapshot } = setup();
    const nodes = [node("raw-a", { name: "shared" }), node("raw-b", { name: "shared" })];
    const edges = [edge("raw-e1", "raw-a", "raw-b"), edge("raw-e2", "raw-a", "raw-b")];
    await persistGraphRecords(kv, nodes, edges, { mode: "merge" });
    expect((await kv.list<GraphNode>(KV.graphNodes)).map((n) => n.id).sort()).toEqual(["raw-a", "raw-b"]);
    expect((await kv.list<GraphEdge>(KV.graphEdges)).map((e) => [e.id, e.sourceNodeId, e.targetNodeId]).sort()).toEqual([
      ["raw-e1", "raw-a", "raw-b"], ["raw-e2", "raw-a", "raw-b"],
    ]);
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 2, totalEdges: 2 });
    expect(await degrees(kv, ["raw-a", "raw-b"])).toEqual({ "raw-a": 2, "raw-b": 2 });
    expect(["raw-a", "raw-b"]).toContain(await kv.get(KV.graphNameIndex, "concept|shared"));
    expect(["raw-e1", "raw-e2"]).toContain(await kv.get(KV.graphEdgeKey, "raw-a|raw-b|related_to"));

    await persistGraphRecords(kv, nodes, edges, { mode: "merge" });
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 2, totalEdges: 2 });
    expect(await degrees(kv, ["raw-a", "raw-b"])).toEqual({ "raw-a": 2, "raw-b": 2 });
  });

  it("reconciles same-ID renames, type changes and edge retargeting without resetting degrees", async () => {
    const { kv, snapshot } = setup();
    await persistGraphRecords(kv, [node("a"), node("b"), node("c")], [edge("e", "a", "b")], { mode: "merge" });
    await persistGraphRecords(kv, [node("a", { name: "renamed", type: "file", properties: { imported: true } })], [], { mode: "merge" });
    expect(await kv.get(KV.graphNameIndex, "concept|a")).toBeNull();
    expect(await kv.get(KV.graphNameIndex, "file|renamed")).toBe("a");
    expect(await kv.get(KV.graphNodeDegree, "a")).toBe(1);
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 3, totalEdges: 1, nodesByType: { concept: 2, file: 1 } });
    expect((await snapshot()).topNodes.find((n) => n.id === "a")).toMatchObject({ name: "renamed", type: "file", properties: { imported: true } });

    await persistGraphRecords(kv, [], [edge("e", "b", "c", { type: "uses", weight: 0.25 })], { mode: "merge" });
    expect(await kv.get(KV.graphEdgeKey, "a|b|related_to")).toBeNull();
    expect(await kv.get(KV.graphEdgeKey, "b|c|uses")).toBe("e");
    expect(await degrees(kv, ["a", "b", "c"])).toEqual({ a: 0, b: 1, c: 1 });
    const snap = await snapshot();
    expect(snap.stats.totalEdges).toBe(1);
    expect(snap.stats.edgesByType.uses).toBe(1);
    expect(snap.stats.edgesByType.related_to ?? 0).toBe(0);
    expect(snap.topEdges).toEqual([expect.objectContaining({ id: "e", sourceNodeId: "b", targetNodeId: "c", type: "uses", weight: 0.25 })]);
  });

  it("removes only the overwritten record's own old lookup entries", async () => {
    const { kv } = setup();
    await persistGraphRecords(kv, [node("a"), node("b"), node("c")], [edge("e", "a", "b"), edge("other-e", "b", "c")], { mode: "merge" });
    await kv.set(KV.graphNameIndex, "concept|a", "b");
    await kv.set(KV.graphEdgeKey, "a|b|related_to", "other-e");
    await persistGraphRecords(kv, [node("a", { name: "new-name" })], [edge("e", "a", "c")], { mode: "merge" });
    expect(await kv.get(KV.graphNameIndex, "concept|a")).toBe("b");
    expect(await kv.get(KV.graphEdgeKey, "a|b|related_to")).toBe("other-e");
    expect(await kv.get(KV.graphNameIndex, "concept|new-name")).toBe("a");
    expect(await kv.get(KV.graphEdgeKey, "a|c|related_to")).toBe("e");
  });

  it("applies duplicate IDs once using the final accepted record in the batch", async () => {
    const { kv, snapshot } = setup();
    await persistGraphRecords(kv, [node("a"), node("a", { name: "final", type: "file" }), node("b")], [
      edge("e", "a", "a"), edge("e", "a", "b", { type: "uses" }),
    ], { mode: "merge" });
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 2, totalEdges: 1, nodesByType: { file: 1, concept: 1 } });
    expect(await kv.get(KV.graphNameIndex, "concept|a")).toBeNull();
    expect(await kv.get(KV.graphNameIndex, "file|final")).toBe("a");
    expect(await kv.get(KV.graphEdgeKey, "a|a|related_to")).toBeNull();
    expect(await kv.get(KV.graphEdgeKey, "a|b|uses")).toBe("e");
    expect(await degrees(kv, ["a", "b"])).toEqual({ a: 1, b: 1 });
  });

  it("handles self loops and repeated stale/live transitions without double counting", async () => {
    const { kv, snapshot } = setup();
    await persistGraphRecords(kv, [node("a"), node("b")], [edge("loop", "a", "a"), edge("e", "a", "b")], { mode: "merge" });
    expect(await degrees(kv, ["a", "b"])).toEqual({ a: 3, b: 1 });
    await persistGraphRecords(kv, [], [edge("loop", "a", "a", { stale: true })], { mode: "merge" });
    await persistGraphRecords(kv, [], [edge("loop", "a", "a", { stale: true })], { mode: "merge" });
    expect(await degrees(kv, ["a", "b"])).toEqual({ a: 1, b: 1 });
    expect((await snapshot()).stats.totalEdges).toBe(1);
    expect((await snapshot()).topEdges.map((e) => e.id)).toEqual(["e"]);
    expect(await kv.get(KV.graphEdgeKey, "a|a|related_to")).toBeNull();
    await persistGraphRecords(kv, [], [edge("loop", "a", "a")], { mode: "merge" });
    expect(await degrees(kv, ["a", "b"])).toEqual({ a: 3, b: 1 });
    expect((await snapshot()).stats.totalEdges).toBe(2);

    await persistGraphRecords(kv, [node("a", { stale: true })], [], { mode: "merge" });
    const stale = await snapshot();
    expect(stale.stats.totalNodes).toBe(1);
    expect(stale.topNodes.map((n) => n.id)).toEqual(["b"]);
    expect(stale.topEdges).toEqual([]);
    expect(await kv.get(KV.graphNameIndex, "concept|a")).toBeNull();
    await persistGraphRecords(kv, [node("a")], [], { mode: "merge" });
    expect((await snapshot()).stats.totalNodes).toBe(2);
    expect(await kv.get(KV.graphNodeDegree, "a")).toBe(3);
  });

  it("honors skip and LWW decisions before touching derived state", async () => {
    const { kv, snapshot } = setup();
    await persistGraphRecords(kv, [node("a"), node("b")], [edge("e", "a", "b")], { mode: "merge" });
    const original = await snapshot();
    await persistGraphRecords(kv, [node("a", { name: "skip", type: "file" })], [edge("e", "b", "b")], { mode: "skip" });
    expect((await snapshot()).stats).toEqual(original.stats);
    expect(await kv.get<GraphNode>(KV.graphNodes, "a")).toMatchObject({ name: "a", type: "concept" });
    expect(await degrees(kv, ["a", "b"])).toEqual({ a: 1, b: 1 });
    await persistGraphRecords(kv, [node("a", { name: "equal-timestamp" })], [edge("e", "b", "b")], { mode: "lww" });
    expect(await kv.get<GraphNode>(KV.graphNodes, "a")).toMatchObject({ name: "a" });
    await persistGraphRecords(kv, [node("a", { name: "newer", updatedAt: later })], [edge("e", "b", "b", { createdAt: later })], { mode: "lww" });
    expect(await kv.get<GraphNode>(KV.graphNodes, "a")).toMatchObject({ name: "newer" });
    expect(await degrees(kv, ["a", "b"])).toEqual({ a: 0, b: 2 });
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 2, totalEdges: 1 });
  });

  it("updates a large graph using targeted operations and a bounded snapshot sample", async () => {
    const { kv, snapshot, calls, intercept } = setup();
    const topNodes = Array.from({ length: 500 }, (_, i) => node(`existing-${i}`));
    const seeded: GraphSnapshot = {
      version: 1, topNodes, topEdges: [], topDegrees: Object.fromEntries(topNodes.map((n) => [n.id, 0])),
      stats: { totalNodes: 75000, totalEdges: 0, nodesByType: { concept: 75000 }, edgesByType: {} },
      updatedAt: timestamp, dirty: false,
    };
    await kv.set(KV.graphSnapshot, "current", seeded);
    for (const n of topNodes) {
      await kv.set(KV.graphNodes, n.id, n);
      await kv.set(KV.graphNodeDegree, n.id, 0);
    }
    calls.length = 0;
    intercept((id, p) => {
      if (id === "state::list" && p.scope.startsWith("mem:graph:")) throw new Error("Unbounded graph enumeration");
    });
    await persistGraphRecords(kv, [node("new")], [edge("new-edge", "new", "existing-0")], { mode: "merge" });
    const snap = await snapshot();
    expect(snap.stats).toMatchObject({ totalNodes: 75001, totalEdges: 1 });
    expect(snap.topNodes.length).toBeLessThanOrEqual(500);
    expect(snap.topNodes.some((n) => n.id === "new")).toBe(true);
    expect(snap.topEdges).toContainEqual(expect.objectContaining({ id: "new-edge" }));
    expect(await degrees(kv, ["new", "existing-0"])).toEqual({ new: 1, "existing-0": 1 });
    await persistGraphRecords(kv, [node("existing-0", { stale: true })], [], { mode: "merge" });
    const removed = await snapshot();
    expect(removed.stats.totalNodes).toBe(75000);
    expect(removed.topNodes.some((n) => n.id === "existing-0")).toBe(false);
    expect(removed.topEdges).toEqual([]);
    expect(removed.sampleIncomplete).toBe(true);
    expect(calls.some((c) => c.id === "state::list")).toBe(false);
  });

  it("does not change raw rows when the durable mutation journal cannot be written", async () => {
    const { kv, snapshot, intercept } = setup();
    await persistGraphRecords(kv, [node("before")], [], { mode: "merge" });
    intercept((id, p) => {
      if (id === "state::set" && inScope(p.scope, KV.graphSnapshot) && p.key === "current" && p.value?.pendingMutation) {
        throw new Error("injected journal failure");
      }
    });
    await expect(persistGraphRecords(kv, [node("after")], [], { mode: "merge" })).rejects.toThrow("injected journal failure");
    intercept();
    expect(await kv.get(KV.graphNodes, "after")).toBeNull();
    expect((await snapshot()).stats.totalNodes).toBe(1);
  });

  it("rejects an oversized reconciliation journal before sending it to the engine", async () => {
    const { kv, snapshot, intercept } = setup();
    await persistGraphRecords(kv, [node("before")], [], { mode: "merge" });
    let sentOversized = false;
    intercept((id, p) => {
      if (id === "state::set" && Buffer.byteLength(JSON.stringify(p), "utf8") > 16 * 1024 * 1024) {
        sentOversized = true;
        throw new Error("Engine transport disconnected");
      }
    });
    const oversized = node("large", { properties: { content: "x".repeat(8 * 1024 * 1024) } });
    await expect(persistGraphRecords(kv, [oversized], [], { mode: "merge" })).rejects.toThrow();
    expect(sentOversized).toBe(false);
    expect(await kv.get(KV.graphNodes, "large")).toBeNull();
    expect((await snapshot()).stats.totalNodes).toBe(1);
    expect((await snapshot()).pendingMutation).toBeUndefined();
  });

  it("validates the complete persisted journal before applying any of its writes", async () => {
    const { kv, sdk, store, snapshot } = setup();
    await persistGraphRecords(kv, [node("before")], [], { mode: "merge" });
    const clean = await snapshot();
    store.get(KV.graphSnapshot)!.set("current", {
      ...clean, dirty: true,
      pendingMutation: {
        snapshot: clean,
        writes: [
          { scope: KV.graphNodes, key: "injected", value: node("injected") },
          { scope: KV.memories, key: "invalid-scope", value: { content: "unexpected" } },
        ],
      },
    });
    const restarted = new StateKV(sdk as never);
    await expect(restarted.get(KV.graphSnapshot, "current")).rejects.toThrow("Invalid graph reconciliation write");
    expect(store.get(KV.graphNodes)?.has("injected")).toBe(false);
    expect(store.get(KV.memories)?.has("invalid-scope") ?? false).toBe(false);
    expect(store.get(KV.graphSnapshot)?.get("current")).toMatchObject({ dirty: true });
  });

  it.each(["file", "redis"] as const)("invalidates a previously checked snapshot after a %s update installs a journal", async (backend) => {
    const { kv, sdk, snapshot } = setup();
    await persistGraphRecords(kv, [node("before")], [], { mode: "merge" });
    const writer = new StateKV(sdk as never, { backend });
    const clean = await snapshot(writer);
    const added = node("added");
    const next: GraphSnapshot = {
      ...clean,
      topNodes: [...clean.topNodes, added],
      topDegrees: { ...clean.topDegrees, added: 0 },
      stats: { ...clean.stats, totalNodes: 2, nodesByType: { concept: 2 } },
    };
    const pending: GraphSnapshot = {
      ...clean, dirty: true,
      pendingMutation: {
        snapshot: next,
        writes: [
          { scope: KV.graphNodes, key: added.id, value: added },
          { scope: KV.graphNameIndex, key: "concept|added", value: added.id },
          { scope: KV.graphNodeDegree, key: added.id, value: 0 },
        ],
      },
    };
    await writer.update(KV.graphSnapshot, "current", [{ type: "set", path: "", value: pending }]);
    const recovered = await snapshot(writer);
    expect(recovered.pendingMutation).toBeUndefined();
    expect(recovered.dirty).toBe(false);
    expect(recovered.stats.totalNodes).toBe(2);
    expect(await writer.get(KV.graphNodes, "added")).toMatchObject({ id: "added" });
  });

  it.each(["index", "snapshot"])("recovers a committed raw write after %s failure across restart and retry", async (failure) => {
    const { kv, sdk, snapshot, intercept } = setup();
    await persistGraphRecords(kv, [node("a"), node("b")], [edge("e", "a", "b")], { mode: "merge" });
    let failed = false;
    intercept((id, p) => {
      const indexWrite = id === "state::set" && inScope(p.scope, KV.graphNameIndex) && p.key === "file|renamed";
      const snapshotWrite = id === "state::set" && inScope(p.scope, KV.graphSnapshot) && p.key === "current" && !p.value?.pendingMutation;
      if (!failed && (failure === "index" ? indexWrite : snapshotWrite)) {
        failed = true;
        throw new Error(`injected ${failure} failure`);
      }
    });
    const changed = node("a", { name: "renamed", type: "file" });
    await expect(persistGraphRecords(kv, [changed], [], { mode: "merge" })).rejects.toThrow(`injected ${failure} failure`);
    expect(failed).toBe(true);
    intercept();
    const restarted = new StateKV(sdk as never);
    const recovered = await snapshot(restarted);
    expect(recovered.stats).toMatchObject({ totalNodes: 2, totalEdges: 1, nodesByType: { concept: 1, file: 1 } });
    expect(recovered.topNodes.find((n) => n.id === "a")).toMatchObject({ name: "renamed", type: "file" });
    expect(await restarted.get(KV.graphNameIndex, "concept|a")).toBeNull();
    expect(await restarted.get(KV.graphNameIndex, "file|renamed")).toBe("a");
    expect(await degrees(restarted, ["a", "b"])).toEqual({ a: 1, b: 1 });
    await persistGraphRecords(restarted, [changed], [], { mode: "merge" });
    expect((await snapshot(restarted)).stats).toEqual(recovered.stats);
    expect(await degrees(restarted, ["a", "b"])).toEqual({ a: 1, b: 1 });
  });

  it("recovers pending ingestion before a subsequent extraction mutates the same record", async () => {
    const { kv, snapshot, intercept } = setup();
    await persistGraphRecords(kv, [node("a")], [], { mode: "merge" });
    let failed = false;
    intercept((id, p) => {
      if (!failed && id === "state::set" && inScope(p.scope, KV.graphNameIndex) && p.key === "concept|renamed") {
        failed = true; throw new Error("injected failure");
      }
    });
    await expect(persistGraphRecords(kv, [node("a", { name: "renamed" })], [], { mode: "merge" })).rejects.toThrow("injected failure");
    intercept();
    await persistGraphDelta(kv, [node("fresh-id", { name: "renamed", sourceObservationIds: ["fresh-observation"] })], []);
    expect((await snapshot()).stats.totalNodes).toBe(1);
    expect((await kv.get<GraphNode>(KV.graphNodes, "a"))?.sourceObservationIds).toContain("fresh-observation");
    expect(await kv.get(KV.graphNodes, "fresh-id")).toBeNull();
  });

  it("retries a failure beyond the first batch without losing or recounting committed rows", async () => {
    const { kv, snapshot, intercept } = setup();
    const nodes = Array.from({ length: 205 }, (_, i) => node(`batch-${i}`));
    let failed = false;
    intercept((id, p) => {
      if (!failed && id === "state::set" && inScope(p.scope, KV.graphNameIndex) && p.key === "concept|batch-130") {
        failed = true; throw new Error("injected later-batch failure");
      }
    });
    await expect(persistGraphRecords(kv, nodes, [], { mode: "merge" })).rejects.toThrow("injected later-batch failure");
    intercept();
    const recovered = await snapshot();
    expect(recovered.stats.totalNodes).toBeGreaterThanOrEqual(100);
    expect(recovered.stats.totalNodes).toBeLessThanOrEqual(205);
    await persistGraphRecords(kv, nodes, [], { mode: "merge" });
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 205, totalEdges: 0, nodesByType: { concept: 205 } });
    expect((await kv.list<GraphNode>(KV.graphNodes))).toHaveLength(205);
    expect(await kv.get(KV.graphNameIndex, "concept|batch-130")).toBe("batch-130");
  });

  it("replays absolute edge accounting after a committed row's write response is lost", async () => {
    const { kv, snapshot, store, intercept } = setup();
    await persistGraphRecords(kv, [node("a"), node("b")], [edge("e", "a", "b")], { mode: "merge" });
    let failed = false;
    intercept((id, p) => {
      if (!failed && id === "state::set" && inScope(p.scope, KV.graphEdges) && p.key === "e") {
        failed = true;
        store.get(p.scope)!.set(p.key, structuredClone(p.value));
        throw new Error("committed response lost");
      }
    });
    const changed = edge("e", "a", "a", { type: "uses" });
    await expect(persistGraphRecords(kv, [], [changed], { mode: "merge" })).rejects.toThrow("committed response lost");
    intercept();
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 2, totalEdges: 1, edgesByType: { uses: 1 } });
    expect(await degrees(kv, ["a", "b"])).toEqual({ a: 2, b: 0 });
    expect(await kv.get(KV.graphEdgeKey, "a|b|related_to")).toBeNull();
    expect(await kv.get(KV.graphEdgeKey, "a|a|uses")).toBe("e");
    await persistGraphRecords(kv, [], [changed], { mode: "merge" });
    expect((await snapshot()).stats.totalEdges).toBe(1);
    expect(await degrees(kv, ["a", "b"])).toEqual({ a: 2, b: 0 });
  });

  it("replaces graph state by publishing a fresh generation without enumerating the old corpus", async () => {
    const { kv, call, snapshot, intercept } = setup();
    await persistGraphRecords(kv, [node("old-a"), node("old-b")], [edge("old-edge", "old-a", "old-b")], { mode: "merge" });
    await kv.set(KV.graphEdgeHistory, "old-history", edge("old-history", "old-a", "old-b"));
    const previous = await kv.get(KV.graphControl, "generation");
    intercept((id, p) => {
      if (id === "state::list" && p.scope.startsWith("mem:graph:")) throw new Error("Unbounded graph enumeration");
    });
    await persistGraphRecords(kv, [node("new")], [edge("loop", "new", "new")], { mode: "merge", replace: true });
    expect(await kv.get(KV.graphControl, "generation")).not.toBe(previous);
    expect(await kv.get(KV.graphNodes, "old-a")).toBeNull();
    expect(await kv.get(KV.graphEdges, "old-edge")).toBeNull();
    expect(await kv.get(KV.graphEdgeHistory, "old-history")).toBeNull();
    expect(await kv.get(KV.graphNameIndex, "concept|old-a")).toBeNull();
    expect(await kv.get(KV.graphNodeDegree, "old-a")).toBeNull();
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 1, totalEdges: 1 });
    expect((await call("mem::graph-query")).nodes).toEqual([expect.objectContaining({ id: "new" })]);
    expect(await kv.get(KV.graphNodeDegree, "new")).toBe(2);
    await persistGraphRecords(kv, [], [], { mode: "merge", replace: true });
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 0, totalEdges: 0 });
    expect((await snapshot()).topNodes).toEqual([]);
    expect((await snapshot()).topEdges).toEqual([]);
  });

  it("retains the prior generation if replacement publication fails", async () => {
    const { kv, snapshot, intercept } = setup();
    await persistGraphRecords(kv, [node("old")], [], { mode: "merge" });
    const previous = await kv.get(KV.graphControl, "generation");
    intercept((id, p) => {
      if (id === "state::set" && p.scope === KV.graphControl && p.key === "generation") throw new Error("injected publish failure");
    });
    await expect(persistGraphRecords(kv, [node("new")], [], { mode: "merge", replace: true })).rejects.toThrow("injected publish failure");
    intercept();
    expect(await kv.get(KV.graphControl, "generation")).toBe(previous);
    expect((await snapshot()).topNodes.map((n) => n.id)).toEqual(["old"]);
    expect(await kv.get(KV.graphNodes, "new")).toBeNull();
    await persistGraphRecords(kv, [node("new")], [], { mode: "merge", replace: true });
    expect((await snapshot()).topNodes.map((n) => n.id)).toEqual(["new"]);
  });

  it("cannot publish a replacement or replay old pending records over a newer reset", async () => {
    const { kv, call, snapshot, intercept } = setup();
    await persistGraphRecords(kv, [node("old")], [], { mode: "merge" });
    const oldView = await pinGraphState(kv);
    let failed = false;
    intercept((id, p) => {
      if (!failed && id === "state::set" && inScope(p.scope, KV.graphNameIndex) && p.key === "concept|pending") {
        failed = true; throw new Error("injected failure");
      }
    });
    await expect(persistGraphRecords(oldView, [node("pending")], [], { mode: "merge" })).rejects.toThrow("injected failure");
    intercept();
    await call("mem::graph-reset");
    await persistGraphRecords(kv, [node("current")], [], { mode: "merge" });
    const currentGeneration = await kv.get(KV.graphControl, "generation");
    await snapshot(oldView);
    await Promise.allSettled([persistGraphRecords(oldView, [node("late-replace")], [], { mode: "merge", replace: true })]);
    expect(await kv.get(KV.graphControl, "generation")).toBe(currentGeneration);
    expect((await snapshot()).topNodes.map((n) => n.id)).toEqual(["current"]);
    expect(await kv.get(KV.graphNodes, "pending")).toBeNull();
    expect(await kv.get(KV.graphNodes, "late-replace")).toBeNull();
  });

  it("publishes the reconciled snapshot with a registered viewer listener without lock reentrance", async () => {
    const { kv, sdk, call, snapshot, sent } = setup();
    registerViewerStreamTriggers(sdk as never, kv);
    await call("mem::graph-reset");
    await persistGraphRecords(kv, [node("a"), node("b")], [edge("e", "a", "b")], { mode: "merge" });
    expect((await snapshot()).stats).toMatchObject({ totalNodes: 2, totalEdges: 1 });
    expect(sent.filter((event) => event.type === "graph.changed").at(-1)?.data.stats).toMatchObject({ totalNodes: 2, totalEdges: 1 });
  }, 5000);
});
