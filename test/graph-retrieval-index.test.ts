import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { StateKV, applyUpdateOps, type StateBackend } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { pinGraphState, resetGraphGeneration, setGraphGenerationListener } from "../src/state/graph-generation.js";
import { createGraphIndexReader, finishGraphIndexBuild, getGraphIndexStatus, initializeGraphIndex, reconcileGraphIndexRecord, recoverGraphIndex } from "../src/state/graph-retrieval-index.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import type { GraphNode } from "../src/types.js";

const node = (id: string, name = id): GraphNode => ({ id, name, type: "concept", properties: {}, sourceObservationIds: [`obs-${id}`], createdAt: "2026-10-14T00:00:00Z" });
function fixture(backend: StateBackend = "file") {
  const data = new Map<string, unknown>();
  const calls: Array<{ function_id: string; payload: any }> = [];
  let fail: ((call: typeof calls[number], committed: boolean) => void) | undefined;
  const sdk = { trigger: async (call: typeof calls[number]) => {
    calls.push(structuredClone(call)); fail?.(call, false);
    const p = call.payload, key = `${p.scope}\0${p.key}`;
    let result: unknown;
    if (call.function_id === "state::get") result = structuredClone(data.get(key) ?? null);
    else if (call.function_id === "state::set") { data.set(key, structuredClone(p.value)); result = p.value; }
    else if (call.function_id === "state::delete") data.delete(key);
    else if (call.function_id === "state::update") {
      const old_value = data.get(key) ?? null, new_value = applyUpdateOps(old_value, p.ops);
      data.set(key, structuredClone(new_value)); result = { old_value, new_value, errors: [] };
    } else throw new Error(`Unbounded or unexpected operation: ${call.function_id}`);
    fail?.(call, true); return result;
  } };
  return { data, calls, sdk, kv: new StateKV(sdk as never, { backend }), fail: (fn?: typeof fail) => { fail = fn; } };
}

afterEach(() => setGraphGenerationListener(null));

describe("bounded graph retrieval index", () => {
  it("keeps unknown legacy stores unavailable and never lists or reads their snapshot for status", async () => {
    const { kv, calls } = fixture();
    expect(await getGraphIndexStatus(kv)).toBeNull();
    expect(await createGraphIndexReader(kv)).toBeNull();
    expect(calls.every((c) => c.function_id === "state::get" && c.payload.scope !== KV.graphSnapshot)).toBe(true);
  });

  it.each(["file", "redis"] as const)("maintains duplicate names, aliases, provenance and adjacency through %s set, update, stale and delete", async (backend) => {
    const { kv } = fixture(backend); await initializeGraphIndex(kv, { status: "ready" });
    await kv.set(KV.graphNodes, "a", { ...node("a", "Alpha"), aliases: ["北京"] });
    await kv.set(KV.graphNodes, "b", node("b", "Alpha"));
    let reader = (await createGraphIndexReader(kv))!;
    expect((await reader.posting("name", "alpha")).ids.sort()).toEqual(["a", "b"]);
    expect((await reader.posting("name", "北京")).ids).toEqual(["a"]);
    expect((await reader.posting("observation", "obs-a")).ids).toEqual(["a"]);
    await kv.update(KV.graphNodes, "a", [{ type: "set", path: "name", value: "Beta" }, { type: "set", path: "aliases", value: [] }]);
    expect(await reader.finish()).toBe(false);
    reader = (await createGraphIndexReader(kv))!;
    expect((await reader.posting("name", "alpha")).ids).toEqual(["b"]);
    expect((await reader.posting("name", "北京")).ids).toEqual([]);
    const edge = { id: "e", type: "related_to", sourceNodeId: "a", targetNodeId: "b", sourceObservationIds: [], createdAt: "now", weight: 1 };
    await kv.set(KV.graphEdges, "e", edge);
    await kv.set(KV.graphEdgeHistory, "h", { ...edge, id: "h", isLatest: false });
    reader = (await createGraphIndexReader(kv))!;
    expect((await reader.posting("adjacency", "a")).ids).toEqual(["e"]);
    expect((await reader.posting("history", "a")).ids).toEqual(["h"]);
    await kv.set(KV.graphEdges, "e", { ...edge, sourceNodeId: "c", targetNodeId: "c" });
    reader = (await createGraphIndexReader(kv))!;
    expect((await reader.posting("adjacency", "a")).ids).toEqual([]);
    expect((await reader.posting("adjacency", "c")).ids).toEqual(["e"]);
    await kv.set(KV.graphNodes, "a", { ...node("a"), stale: true });
    await kv.delete(KV.graphEdges, "e");
    reader = (await createGraphIndexReader(kv))!;
    expect(await reader.getNode("a")).toBeNull();
    expect((await reader.posting("adjacency", "c")).ids).toEqual([]);
    expect(await getGraphIndexStatus(kv)).toMatchObject({ nodes: 1, edges: 0, historyEdges: 1 });
  });

  it.each([
    ["file", false], ["file", true], ["redis", false], ["redis", true],
  ] as const)("recovers an interrupted %s canonical write with committed=%s", async (backend, committed) => {
    const f = fixture(backend); await initializeGraphIndex(f.kv, { status: "ready" });
    await f.kv.set(KV.graphNodes, "a", node("a", "old"));
    f.fail((c, done) => { if (c.function_id === "state::set" && c.payload.scope === KV.graphNodes && done === committed) throw new Error("offline"); });
    await expect(f.kv.set(KV.graphNodes, "a", node("a", "new"))).rejects.toThrow("offline");
    f.fail();
    expect(await createGraphIndexReader(f.kv)).toBeNull();
    const restarted = new StateKV(f.sdk as never, { backend }); await recoverGraphIndex(restarted);
    const reader = (await createGraphIndexReader(restarted))!;
    expect((await reader.getNode("a"))?.name).toBe(committed ? "new" : "old");
    expect((await reader.posting("name", committed ? "old" : "new")).ids).toEqual([]);
    expect(await reader.finish()).toBe(true);
  });

  it("replays absolute posting edits after a lost acknowledgement without duplicates", async () => {
    const f = fixture(); await initializeGraphIndex(f.kv, { status: "ready" });
    await f.kv.set(KV.graphNodes, "a", node("a", "same"));
    let writes = 0;
    f.fail((c, done) => { if (done && c.function_id === "state::set" && c.payload.scope === KV.graphRetrievalData && ++writes === 4) throw new Error("lost ack"); });
    await expect(f.kv.set(KV.graphNodes, "b", node("b", "same"))).rejects.toThrow("lost ack");
    f.fail(); await recoverGraphIndex(new StateKV(f.sdk as never));
    const reader = (await createGraphIndexReader(f.kv))!;
    expect((await reader.posting("name", "same")).ids.sort()).toEqual(["a", "b"]);
    expect(await getGraphIndexStatus(f.kv)).toMatchObject({ nodes: 2 });
  });

  it.each(["file", "redis"] as const)("does not mutate canonical %s data when the durable barrier fails", async (backend) => {
    const f = fixture(backend); await initializeGraphIndex(f.kv, { status: "ready" });
    f.fail((c) => { if (c.function_id === "state::set" && c.payload.scope === KV.graphRetrievalControl) throw new Error("barrier"); });
    await expect(f.kv.set(KV.graphNodes, "a", node("a"))).rejects.toThrow("barrier");
    expect(f.data.has(`${KV.graphNodes}\0a`)).toBe(false);
  });

  it.each(["file", "redis"] as const)("keeps %s reset indexes isolated from a pinned old view and validates an in-flight reader", async (backend) => {
    const { kv } = fixture(backend); await initializeGraphIndex(kv, { status: "ready" });
    await kv.set(KV.graphNodes, "old", node("old"));
    const old = await pinGraphState(kv), reader = (await createGraphIndexReader(kv))!;
    await resetGraphGeneration(kv, { version: 1, dirty: false });
    await old.set(KV.graphNodes, "late", node("late"));
    expect(await reader.finish()).toBe(false);
    const fresh = (await createGraphIndexReader(kv))!;
    expect((await fresh.posting("nodes")).ids).toEqual([]);
    expect(await fresh.getNode("late")).toBeNull();
  });

  it("bounds projections and every retrieval read while reporting incomplete coverage", async () => {
    const { kv, calls } = fixture(); await initializeGraphIndex(kv, { status: "ready" });
    await kv.set(KV.graphNodes, "large", { ...node("large"), name: "界".repeat(5000), properties: { data: "x".repeat(100000) }, sourceObservationIds: Array.from({ length: 1000 }, (_, i) => `o${i}`) });
    calls.length = 0;
    const reader = (await createGraphIndexReader(kv, { maxReads: 8 }))!;
    const projection = await reader.getNode("large");
    expect(Buffer.byteLength(JSON.stringify(projection))).toBeLessThanOrEqual(16384);
    expect(projection).toMatchObject({ indexIncomplete: true });
    expect(reader.status.incompleteRecords).toBe(1);
    for (let i = 0; i < 20; i++) await reader.getNode(`absent-${i}`);
    expect(reader.exhausted).toBe(true);
    expect(calls.filter((c) => c.payload.scope === KV.graphRetrievalData)).toHaveLength(4);
    expect(await reader.finish()).toBe(true);
    expect(calls).toHaveLength(8);
    expect(calls.every((c) => c.function_id === "state::get" && ![KV.graphNodes, KV.graphEdges, KV.graphSnapshot].includes(c.payload.scope))).toBe(true);
  });

  it.each(["file", "redis"] as const)("keeps %s multirow snapshot journals unavailable and explicitly resumes them after restart", async (backend) => {
    const f = fixture(backend); await initializeGraphIndex(f.kv, { status: "ready" });
    const snapshot = { version: 1, dirty: false, topNodes: [], topEdges: [], topDegrees: {}, stats: { totalNodes: 2, totalEdges: 0, nodesByType: {}, edgesByType: {} }, updatedAt: "now" };
    const pending = { ...snapshot, dirty: true, pendingMutation: { writes: [{ scope: KV.graphNodes, key: "a", value: node("a") }, { scope: KV.graphNodes, key: "b", value: node("b") }], snapshot } };
    await f.kv.set(KV.graphSnapshot, "current", pending);
    expect(await createGraphIndexReader(f.kv)).toBeNull();
    f.calls.length = 0;
    expect(await createGraphIndexReader(new StateKV(f.sdk as never, { backend }))).toBeNull();
    expect(f.calls.every((c) => c.payload.scope !== KV.graphSnapshot)).toBe(true);
    await recoverGraphIndex(new StateKV(f.sdk as never, { backend }), { allowSnapshotRecovery: true });
    const reader = (await createGraphIndexReader(f.kv))!;
    expect((await reader.posting("nodes")).ids.sort()).toEqual(["a", "b"]);
    expect(await reader.finish()).toBe(true);
  });

  it.each(["file", "redis"] as const)("recovers a lost %s clean-snapshot acknowledgement without leaving the index stuck", async (backend) => {
    const f = fixture(backend); await initializeGraphIndex(f.kv, { status: "ready" });
    await f.kv.set(KV.graphSnapshot, "current", { version: 1, dirty: true });
    f.fail((c, done) => { if (done && c.function_id === "state::set" && c.payload.scope === KV.graphSnapshot) throw new Error("lost ack"); });
    await expect(f.kv.set(KV.graphSnapshot, "current", { version: 1, dirty: false })).rejects.toThrow("lost ack");
    f.fail(); expect(await createGraphIndexReader(f.kv)).toBeNull();
    await recoverGraphIndex(new StateKV(f.sdk as never, { backend }), { allowSnapshotRecovery: true });
    expect(await createGraphIndexReader(f.kv)).not.toBeNull();
  });

  it("maintains a building index for concurrent canonical writes and rejects stale cursors and builds", async () => {
    const { kv } = fixture();
    const build = await initializeGraphIndex(kv, { status: "building" });
    await kv.set(KV.graphNodes, "new", node("new"));
    await reconcileGraphIndexRecord(kv, "node", "legacy", node("legacy"));
    expect(await createGraphIndexReader(kv)).toBeNull();
    await expect(finishGraphIndexBuild(kv, "other")).rejects.toThrow("superseded");
    await finishGraphIndexBuild(kv, build.buildId);
    let reader = (await createGraphIndexReader(kv))!;
    const first = await reader.posting("nodes", "", { limit: 1 });
    expect(first.cursor).not.toBeNull();
    expect((await reader.posting("nodes", "", { cursor: first.cursor })).ids).toHaveLength(1);
    await kv.set(KV.graphNodes, "after", node("after"));
    reader = (await createGraphIndexReader(kv))!;
    await expect(reader.posting("nodes", "", { cursor: first.cursor })).rejects.toThrow("expired");
    await expect(initializeGraphIndex(kv, { buildId: build.buildId, status: "building" })).rejects.toThrow("new build ID");
  });

  it("detects corruption, bounds queues, caches only index data and refreshes canonical evidence", async () => {
    const f = fixture(); await initializeGraphIndex(f.kv, { status: "ready" });
    await f.kv.set(KV.graphNodes, "a", node("a"));
    const reader = (await createGraphIndexReader(f.kv, { maxReads: 12, maxConcurrent: 1 }))!;
    f.calls.length = 0;
    await Promise.all(Array.from({ length: 100 }, () => reader.getNode("a")));
    expect(f.calls).toHaveLength(1);
    await f.kv.set(KV.memories, "m", { content: "first" });
    expect(await reader.read(KV.memories, "m")).toEqual({ content: "first" });
    await f.kv.delete(KV.memories, "m");
    expect(await reader.readFresh(KV.memories, "m")).toBeNull();
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => reader.getNode(`absent${i}`)));
    expect(results.every((v) => v === null)).toBe(true);
    expect(reader.exhausted).toBe(true);
    expect(await reader.finish()).toBe(true);
    const corrupted = await getGraphIndexStatus(f.kv);
    f.data.set(`${KV.graphRetrievalControl}\0current`, { ...corrupted, revision: -1 });
    await expect(createGraphIndexReader(f.kv)).rejects.toThrow("Invalid graph retrieval index control");
  });

  it("aborts one reader without cancelling another reader's work", async () => {
    const { kv } = fixture(); await initializeGraphIndex(kv, { status: "ready" });
    await kv.set(KV.graphNodes, "a", node("a"));
    const abort = new AbortController();
    const first = (await createGraphIndexReader(kv, { signal: abort.signal }))!;
    const second = (await createGraphIndexReader(kv))!;
    abort.abort();
    expect(await first.getNode("a")).toBeNull(); expect(await first.finish()).toBe(false);
    expect(await second.getNode("a")).toMatchObject({ id: "a" }); expect(await second.finish()).toBe(true);
  });

  it.each(["nodes", "edges", "historyEdges"] as const)("rejects missing and inconsistent %s inventory roots", async (kind) => {
    const { kv, data } = fixture();
    const control = await initializeGraphIndex(kv, { status: "ready" });
    const edge = { id: "edge", type: "related_to", sourceNodeId: "a", targetNodeId: "b", weight: 1, sourceObservationIds: [], createdAt: "now" };
    if (kind === "nodes") await kv.set(KV.graphNodes, "a", node("a"));
    else await kv.set(kind === "edges" ? KV.graphEdges : KV.graphEdgeHistory, edge.id, edge);
    const posting = createHash("sha256").update(JSON.stringify(`${kind}\0`)).digest("hex");
    const key = `${KV.graphRetrievalData}\0${control.buildId}:root:${posting}`;
    const root = data.get(key) as { head: string; count: number };
    expect(root.count).toBe(1);
    data.delete(key);
    await expect((await createGraphIndexReader(kv))!.posting(kind)).rejects.toThrow("Missing graph inventory root");
    for (const invalid of [{ ...root, count: 0 }, { ...root, head: null }]) {
      data.set(key, invalid);
      await expect((await createGraphIndexReader(kv))!.posting(kind)).rejects.toThrow("Invalid graph posting root");
    }
    if (kind !== "edges") {
      data.set(key, { ...root, count: 2 });
      await expect((await createGraphIndexReader(kv))!.posting(kind)).rejects.toThrow("inventory count");
    }
  });

  it.each([
    ["file", "rename"], ["file", "delete"], ["redis", "rename"], ["redis", "delete"],
  ] as const)("recovers every durable %s %s write boundary before and after acknowledgement", async (backend, operation) => {
    const f = fixture(backend); await initializeGraphIndex(f.kv, { status: "ready" });
    for (const id of ["head", "middle", "tail"]) await f.kv.set(KV.graphNodes, id, node(id, "shared"));
    const saved = structuredClone(f.data);
    const mutate = (kv: StateKV) => operation === "rename" ? kv.set(KV.graphNodes, "middle", { ...node("middle", "renamed"), aliases: ["别名"] }) : kv.delete(KV.graphNodes, "middle");
    f.calls.length = 0; await mutate(f.kv);
    const writeCount = f.calls.filter((c) => c.function_id === "state::set" || c.function_id === "state::delete").length;
    expect(writeCount).toBeGreaterThan(10);
    for (const after of [false, true]) for (let boundary = 1; boundary <= writeCount; boundary++) {
      f.data.clear(); for (const [key, value] of saved) f.data.set(key, structuredClone(value));
      let seen = 0;
      f.fail((c, committed) => {
        if (committed === after && (c.function_id === "state::set" || c.function_id === "state::delete") && ++seen === boundary) throw new Error("interrupted");
      });
      await expect(mutate(new StateKV(f.sdk as never, { backend }))).rejects.toThrow("interrupted");
      f.fail();
      const restarted = new StateKV(f.sdk as never, { backend }); await recoverGraphIndex(restarted);
      const canonical = f.data.get(`${KV.graphNodes}\0middle`) as GraphNode | undefined;
      const reader = (await createGraphIndexReader(restarted))!;
      expect(await reader.getNode("middle")).toEqual(canonical ?? null);
      expect((await reader.posting("name", "shared")).ids.sort()).toEqual(canonical?.name === "shared" ? ["head", "middle", "tail"] : ["head", "tail"]);
      expect((await reader.posting("nodes")).ids.sort()).toEqual(canonical ? ["head", "middle", "tail"] : ["head", "tail"]);
      expect(await reader.finish()).toBe(true);
    }
  });

  it("bounds oversized identifiers by pausing before canonical writes and leaves canonical data intact", async () => {
    const { kv } = fixture(); await initializeGraphIndex(kv, { status: "ready" });
    const id = "x".repeat(1025); await kv.set(KV.graphNodes, id, node(id));
    expect(await getGraphIndexStatus(kv)).toMatchObject({ status: "paused", error: expect.stringContaining("budget") });
    expect(await createGraphIndexReader(kv)).toBeNull();
    expect(await kv.get(KV.graphNodes, id)).toEqual(node(id));
  });

  it("bounds the full record when a near-limit projection has many distinct Unicode posting keys", async () => {
    const { kv, data } = fixture(); await initializeGraphIndex(kv, { status: "ready" });
    const source = { ...node("unicode"), name: Array.from({ length: 512 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join(""),
      sourceObservationIds: Array.from({ length: 128 }, (_, i) => `${i}-${"a".repeat(1000)}`), properties: { value: "p".repeat(500) } };
    await kv.set(KV.graphNodes, source.id, source);
    expect(await kv.get(KV.graphNodes, source.id)).toEqual(source);
    for (const [key, value] of data) if (key.startsWith(`${KV.graphRetrievalData}\0`)) expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(32768);
    const reader = (await createGraphIndexReader(kv))!;
    expect(await reader.getNode(source.id)).toMatchObject({ indexIncomplete: true });
    expect(await reader.finish()).toBe(true);
  });

  it("journals live type statistics and explicitly groups imported unknown types", async () => {
    const { kv } = fixture(); await initializeGraphIndex(kv, { status: "ready" });
    await kv.set(KV.graphNodes, "a", node("a"));
    await kv.set(KV.graphNodes, "custom", { ...node("custom"), type: "custom-type" });
    expect(await getGraphIndexStatus(kv)).toMatchObject({ nodesByType: { concept: 1, other: 1 }, otherTypes: 1 });
    await kv.set(KV.graphNodes, "a", { ...node("a"), type: "file" });
    await kv.delete(KV.graphNodes, "custom");
    expect(await getGraphIndexStatus(kv)).toMatchObject({ nodesByType: { file: 1 }, otherTypes: 0 });
  });

  it.each(["file", "redis"] as const)("guards %s snapshot updates and deletion before readers can use a ready index", async (backend) => {
    const { kv } = fixture(backend); await initializeGraphIndex(kv, { status: "ready" });
    const clean = { version: 1, dirty: false, topNodes: [], topEdges: [], topDegrees: {}, stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, edgesByType: {} }, updatedAt: "now" };
    await kv.set(KV.graphSnapshot, "current", clean);
    await kv.update(KV.graphSnapshot, "current", [{ type: "set", path: "dirty", value: true }, { type: "set", path: "pendingMutation", value: {
      writes: [{ scope: KV.graphNodes, key: "recovered", value: node("recovered") }], snapshot: { ...clean, stats: { ...clean.stats, totalNodes: 1 } },
    } }]);
    expect(await createGraphIndexReader(kv)).toBeNull();
    await recoverGraphIndex(kv);
    expect(await createGraphIndexReader(kv)).toBeNull();
    await recoverGraphIndex(kv, { allowSnapshotRecovery: true });
    expect(await (await createGraphIndexReader(kv))!.getNode("recovered")).toMatchObject({ id: "recovered" });
    await kv.delete(KV.graphSnapshot, "current");
    expect(await createGraphIndexReader(kv)).toBeNull();
    await recoverGraphIndex(kv, { allowSnapshotRecovery: true });
    expect(await createGraphIndexReader(kv)).toBeNull();
  });

  it.each(["file", "redis"] as const)("allows a %s graph listener to update the same key after its index is ready", async (backend) => {
    const { kv } = fixture(backend);
    await resetGraphGeneration(kv, { version: 1, dirty: false });
    await kv.set(KV.graphNodes, "reentrant", node("reentrant", "initial"));
    let reentered = false;
    let listenerSawReadyIndex = false;
    setGraphGenerationListener(async (kind) => {
      if (kind !== "nodes" || reentered) return;
      reentered = true;
      listenerSawReadyIndex = await createGraphIndexReader(kv) !== null;
      await kv.update(KV.graphNodes, "reentrant", [{ type: "set", path: "name", value: "listener" }]);
    });
    const updated = kv.update(KV.graphNodes, "reentrant", [{ type: "set", path: "name", value: "outer" }]);
    await Promise.race([
      updated,
      new Promise<void>((resolve) => setImmediate(resolve)).then(() => { throw new Error("Ready-index listener cannot reenter the mutation queue"); }),
    ]);
    expect(reentered).toBe(true);
    expect(listenerSawReadyIndex).toBe(true);
    expect(await kv.get(KV.graphNodes, "reentrant")).toMatchObject({ name: "listener" });
    const reader = (await createGraphIndexReader(kv))!;
    expect(await reader.getNode("reentrant")).toMatchObject({ name: "listener" });
    expect((await reader.posting("name", "outer")).ids).toEqual([]);
    expect((await reader.posting("name", "listener")).ids).toEqual(["reentrant"]);
    expect(await reader.finish()).toBe(true);
  });

  it("acquires the graph snapshot barrier before the Redis key mutex during concurrent persistence", async () => {
    const { kv } = fixture("redis");
    await initializeGraphIndex(kv, { status: "ready" });
    await kv.set(KV.graphSnapshot, "current", { version: 1, dirty: false });
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    const persisting = withKeyedLock("graph:persist", async () => {
      enter();
      await released;
      await kv.update(KV.graphSnapshot, "current", [{ type: "set", path: "writer", value: "persist" }]);
    });
    await entered;
    const concurrent = kv.update(KV.graphSnapshot, "current", [{ type: "set", path: "writer", value: "concurrent" }]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    release();
    await Promise.race([
      Promise.all([persisting, concurrent]),
      new Promise<void>((resolve) => setImmediate(resolve)).then(() => { throw new Error("Snapshot barrier and Redis key mutex acquired in conflicting order"); }),
    ]);
    expect(await kv.get(KV.graphSnapshot, "current")).toEqual({ version: 1, dirty: false, writer: "concurrent" });
    expect(await createGraphIndexReader(kv)).not.toBeNull();
  });

  it("counts only latest live edges while retaining temporal projections and distinguishes Unicode IDs", async () => {
    const { kv } = fixture(); await initializeGraphIndex(kv, { status: "ready" });
    const edge = { id: "edge", type: "related_to", sourceNodeId: "a", targetNodeId: "b", weight: 1, sourceObservationIds: [], createdAt: "now" };
    await kv.set(KV.graphEdges, edge.id, edge);
    await kv.update(KV.graphEdges, edge.id, [{ type: "set", path: "isLatest", value: false }]);
    expect(await getGraphIndexStatus(kv)).toMatchObject({ edges: 0, edgesByType: {} });
    expect(await (await createGraphIndexReader(kv))!.getEdge(edge.id)).toMatchObject({ isLatest: false });
    for (const id of ["\ud800", "\ud801"]) await kv.set(KV.graphNodes, id, node(id, "same"));
    const reader = (await createGraphIndexReader(kv))!;
    expect((await reader.posting("name", "same")).ids.sort()).toEqual(["\ud800", "\ud801"]);
  });
});
