import { initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSnapshotFunction } from "../src/functions/snapshot.js";
import { persistGraphDelta, registerGraphFunction } from "../src/functions/graph.js";
import { getSearchIndex, indexRecords, setEmbeddingProvider, setIndexPersistence, setVectorIndex } from "../src/functions/search.js";
import { StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { setGraphGenerationListener } from "../src/state/graph-generation.js";
import type { CompressedObservation, GraphEdge, GraphNode, Memory } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const timestamp = "2026-10-12T12:00:00.000Z";
const node = (id: string, name = id): GraphNode => ({ id, name, type: "concept", properties: {}, sourceObservationIds: [], createdAt: timestamp });
const edge = (id: string, sourceNodeId: string, targetNodeId: string): GraphEdge => ({ id, sourceNodeId, targetNodeId, type: "related_to", weight: 0.8, sourceObservationIds: [], createdAt: timestamp });
const memory = (id: string, marker: string, extra: Partial<Memory> = {}): Memory => ({ id, title: marker, content: marker, type: "fact", concepts: [], files: [], sessionIds: [], strength: 5, version: 1, isLatest: true, createdAt: timestamp, updatedAt: timestamp, ...extra });
const observation = (id: string, marker: string): CompressedObservation => ({ id, sessionId: "session", timestamp, type: "discovery", title: marker, narrative: marker, concepts: [], files: [], facts: [], importance: 5 });
const dirs: string[] = [];

async function setup() {
  const dir = mkdtempSync(join(process.cwd(), ".graph-ingestion-snapshot-test-"));
  dirs.push(dir);
  const store = new Map<string, Map<string, unknown>>();
  const handlers = new Map<string, (data?: any) => Promise<any>>();
  let intercept: ((id: string, payload: any) => Promise<void>) | undefined;
  const sdk = {
    registerFunction: (id: string, fn: (data?: any) => Promise<any>) => handlers.set(id, fn),
    registerTrigger: vi.fn(),
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }): Promise<any> => {
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
  registerGraphFunction(sdk as never, kv, { name: "noop" } as never);
  registerSnapshotFunction(sdk as never, kv, dir);
  const call = (id: string, payload: any = {}) => sdk.trigger({ function_id: id, payload });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const archive = (data: unknown) => {
    git("init"); git("config", "user.email", "agentmemory@local"); git("config", "user.name", "agentmemory");
    writeFileSync(join(dir, "state.json"), JSON.stringify(data));
    git("add", "state.json"); git("commit", "-m", "Synthetic snapshot fixture");
    return git("rev-parse", "HEAD");
  };
  return { kv, call, dir, git, archive, intercept: (fn?: typeof intercept) => { intercept = fn; } };
}

beforeEach(() => {
  getSearchIndex().clear();
  setEmbeddingProvider(null);
  setVectorIndex(null);
  setIndexPersistence(null);
});
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  setGraphGenerationListener(null);
  setIndexPersistence(null);
  setEmbeddingProvider(null);
  setVectorIndex(null);
  getSearchIndex().clear();
});

describe("Git snapshot ingestion", () => {
  it("round-trips graph edges and makes a restore after reset immediately queryable and deduplicated", async () => {
    const r = await setup();
    await persistGraphDelta(r.kv, [node("a", "alpha"), node("b", "beta")], [edge("ab", "a", "b")]);
    const created = await r.call("mem::snapshot-create");
    expect(created.success).toBe(true);
    expect(JSON.parse(r.git("show", `${created.snapshot.commitHash}:state.json`)).graphEdges).toHaveLength(1);
    await r.call("mem::graph-reset");
    expect((await r.call("mem::graph-stats")).totalNodes).toBe(0);
    expect(await r.call("mem::snapshot-restore", { commitHash: created.snapshot.commitHash })).toMatchObject({ success: true });
    expect(await r.call("mem::graph-stats")).toMatchObject({ totalNodes: 2, totalEdges: 1 });
    const graph = await r.call("mem::graph-query");
    expect(graph.nodes.map((n: GraphNode) => n.id).sort()).toEqual(["a", "b"]);
    expect(graph.edges.map((e: GraphEdge) => e.id)).toEqual(["ab"]);
    await persistGraphDelta(r.kv, [node("duplicate", "alpha")], []);
    expect((await r.kv.list(KV.graphNodes)).length).toBe(2);
  });

  it("restores legacy nodes-only archives as an overlay without changing the Git worktree", async () => {
    const r = await setup();
    await persistGraphDelta(r.kv, [node("existing")], []);
    const commitHash = r.archive({ graphNodes: [node("legacy")] });
    const uncommitted = '{"uncommitted":"preserve me"}';
    writeFileSync(join(r.dir, "state.json"), uncommitted);
    const statusBefore = r.git("status", "--porcelain");
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: true });
    expect((await r.call("mem::graph-query")).nodes.map((n: GraphNode) => n.id).sort()).toEqual(["existing", "legacy"]);
    expect(readFileSync(join(r.dir, "state.json"), "utf8")).toBe(uncommitted);
    expect(r.git("status", "--porcelain")).toBe(statusBefore);
  });

  it("replaces warm keyword terms and stale vectors while preserving unrelated indexed rows", async () => {
    const r = await setup();
    const oldMemory = memory("mem_restore", "olduniquememory"), oldObs = observation("obs_restore", "olduniqueobservation");
    const unrelated = memory("mem_keep", "unrelatedmarker");
    await indexRecords([oldObs], [oldMemory, unrelated]);
    const vectors = new VectorIndex();
    vectors.add(oldMemory.id, "memory", new Float32Array([1, 0]));
    vectors.add(oldObs.id, "session", new Float32Array([1, 0]));
    vectors.add(unrelated.id, "memory", new Float32Array([1, 0]));
    setVectorIndex(vectors);
    let persisted = "";
    const save = vi.fn(async () => { persisted = getSearchIndex().serialize(); });
    setIndexPersistence({ scheduleSave: vi.fn(), save });
    const commitHash = r.archive({ memories: [memory(oldMemory.id, "newuniquememory")], observations: { session: [observation(oldObs.id, "newuniqueobservation")] } });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: true });
    expect(getSearchIndex().search("olduniquememory olduniqueobservation")).toEqual([]);
    expect(getSearchIndex().search("newuniquememory").map(x => x.obsId)).toEqual([oldMemory.id]);
    expect(getSearchIndex().search("newuniqueobservation").map(x => x.obsId)).toEqual([oldObs.id]);
    expect(getSearchIndex().has(unrelated.id)).toBe(true);
    expect(vectors.has(oldMemory.id)).toBe(false);
    expect(vectors.has(oldObs.id)).toBe(false);
    expect(vectors.has(unrelated.id)).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(SearchIndex.deserialize(persisted).search("newuniquememory").map(x => x.obsId)).toEqual([oldMemory.id]);
    expect(SearchIndex.deserialize(persisted).search("olduniquememory")).toEqual([]);
  });

  it("removes old keyword and vector entries for raw observations and nonlatest memories", async () => {
    const r = await setup();
    const oldMemory = memory("mem_raw", "oldmemory"), oldObs = observation("obs_raw", "oldobservation");
    await indexRecords([oldObs], [oldMemory]);
    const vectors = new VectorIndex();
    for (const id of [oldMemory.id, oldObs.id]) vectors.add(id, "session", new Float32Array([1, 0]));
    setVectorIndex(vectors);
    const save = vi.fn(async () => {});
    setIndexPersistence({ scheduleSave: vi.fn(), save });
    const raw = { id: oldObs.id, sessionId: "session", timestamp, toolName: "Read", toolInput: {}, toolOutput: "raw evidence" };
    const commitHash = r.archive({ memories: [memory(oldMemory.id, "nonlatest", { isLatest: false })], observations: { session: [raw] } });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: true });
    expect(getSearchIndex().size).toBe(0);
    expect(vectors.size).toBe(0);
    expect(await r.kv.get(KV.observations("session"), oldObs.id)).toEqual(raw);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("rejects corrupt graph rows before restoring any memory records", async () => {
    const r = await setup();
    const original = memory("mem_preflight", "originalmarker");
    await r.kv.set(KV.memories, original.id, original);
    await indexRecords([], [original]);
    const commitHash = r.archive({ memories: [memory(original.id, "invalidarchivemarker")], graphNodes: [{ id: "invalid" }] });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: false });
    expect(await r.kv.get(KV.memories, original.id)).toEqual(original);
    expect(getSearchIndex().search("originalmarker").map(x => x.obsId)).toEqual([original.id]);
    expect(getSearchIndex().search("invalidarchivemarker")).toEqual([]);
  });

  it("reconciles committed records when a later restore write fails", async () => {
    const r = await setup();
    const untouched = memory("mem_failed", "untouchedmarker");
    await r.kv.set(KV.memories, untouched.id, untouched);
    await indexRecords([], [untouched]);
    const save = vi.fn(async () => {});
    setIndexPersistence({ scheduleSave: vi.fn(), save });
    const commitHash = r.archive({ memories: [memory("mem_committed", "committedmarker"), memory(untouched.id, "rejectedmarker")] });
    r.intercept(async (id, p) => { if (id === "state::set" && p.key === untouched.id) throw new Error("synthetic state write failure"); });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: false, error: "synthetic state write failure" });
    expect(getSearchIndex().search("committedmarker").map(x => x.obsId)).toEqual(["mem_committed"]);
    expect(getSearchIndex().search("untouchedmarker").map(x => x.obsId)).toEqual([untouched.id]);
    expect(getSearchIndex().search("rejectedmarker")).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reconciles committed search rows when graph ingestion fails", async () => {
    const r = await setup();
    const commitHash = r.archive({ memories: [memory("mem_before_graph", "beforegraphmarker")], graphNodes: [node("graph_failure")] });
    r.intercept(async (id, p) => { if (id === "state::set" && p.key === "graph_failure") throw new Error("synthetic graph write failure"); });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: false });
    expect(getSearchIndex().search("beforegraphmarker").map(x => x.obsId)).toEqual(["mem_before_graph"]);
  });

  it("indexes the current committed row if another writer replaced it during restore", async () => {
    const r = await setup();
    const commitHash = r.archive({ memories: [memory("mem_race", "snapshotmarker")], graphNodes: [node("gate")] });
    r.intercept(async (id, p) => {
      if (id === "state::set" && p.key === "gate") {
        r.intercept();
        await r.kv.set(KV.memories, "mem_race", memory("mem_race", "newerwriter"));
      }
    });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: true });
    expect(getSearchIndex().search("snapshotmarker")).toEqual([]);
    expect(getSearchIndex().search("newerwriter").map(x => x.obsId)).toEqual(["mem_race"]);
  });

  it("preserves a newer first record while reconciliation waits for a second record", async () => {
    const r = await setup();
    const first = memory("mem_first", "firstsnapshotmarker");
    const second = memory("mem_second", "secondsnapshotmarker");
    const commitHash = r.archive({ memories: [first, second] });
    const vectors = new VectorIndex();
    setVectorIndex(vectors);
    setEmbeddingProvider({
      name: "synthetic", dimensions: 2, embed: async () => new Float32Array([1, 0]),
      embedBatch: async (texts) => texts.map((text) => new Float32Array(text.includes("newerfirstmarker") ? [0, 1] : [1, 0])),
    });
    let entered!: () => void;
    let release!: () => void;
    const reading = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    r.intercept(async (id, p) => {
      if (id === "state::get" && p.scope === KV.memories && p.key === second.id) {
        entered();
        await blocked;
      }
    });
    const restoring = r.call("mem::snapshot-restore", { commitHash });
    await reading;
    const newer = memory(first.id, "newerfirstmarker");
    await r.kv.set(KV.memories, first.id, newer);
    await indexRecords([], [newer]);
    release();
    expect(await restoring).toMatchObject({ success: true });
    expect(getSearchIndex().search("firstsnapshotmarker")).toEqual([]);
    expect(getSearchIndex().search("newerfirstmarker").map((hit) => hit.obsId)).toEqual([first.id]);
    expect(getSearchIndex().search("secondsnapshotmarker").map((hit) => hit.obsId)).toEqual([second.id]);
    expect(vectors.get(first.id)?.embedding).toEqual(new Float32Array([0, 1]));
  });

  it("reads snapshots larger than execFile's default output buffer", async () => {
    const r = await setup();
    const large = memory("mem_large", "largemarker", { content: "largemarker " + "x".repeat(1_100_000) });
    const commitHash = r.archive({ memories: [large] });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: true });
    expect((await r.kv.get<Memory>(KV.memories, large.id))?.content.length).toBe(large.content.length);
    expect(getSearchIndex().has(large.id)).toBe(true);
  });

  it("reports index reconciliation failures, flushes stale-entry removals, and permits retry", async () => {
    const r = await setup();
    await indexRecords([], [memory("mem_retry", "obsoletekeyword")]);
    const save = vi.fn(async () => {});
    setIndexPersistence({ scheduleSave: vi.fn(), save });
    const commitHash = r.archive({ memories: [memory("mem_retry", "restoredkeyword")] });
    r.intercept(async (id, p) => {
      if (id === "state::get" && p.scope === KV.memories && p.key === "mem_retry") throw new Error("synthetic index read failure");
    });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: false, error: "synthetic index read failure" });
    expect(getSearchIndex().has("mem_retry")).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    r.intercept();
    expect((await r.kv.get<Memory>(KV.memories, "mem_retry"))?.content).toBe("restoredkeyword");
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: true });
    expect(getSearchIndex().search("restoredkeyword").map(x => x.obsId)).toEqual(["mem_retry"]);
  });

  it("embeds replacement records using their restored text", async () => {
    const r = await setup();
    const vectors = new VectorIndex();
    vectors.add("mem_vector", "memory", new Float32Array([1, 0]));
    setVectorIndex(vectors);
    const embedBatch = vi.fn(async (texts: string[]) => texts.map(() => new Float32Array([0, 1])));
    setEmbeddingProvider({ name: "synthetic", dimensions: 2, embed: async () => new Float32Array([0, 1]), embedBatch });
    const commitHash = r.archive({ memories: [memory("mem_vector", "restoredvector")] });
    expect(await r.call("mem::snapshot-restore", { commitHash })).toMatchObject({ success: true });
    expect(embedBatch).toHaveBeenCalledWith(["restoredvector restoredvector"]);
    expect(Array.from(vectors.get("mem_vector")!.embedding)).toEqual([0, 1]);
  });
});
