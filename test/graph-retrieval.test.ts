import { describe, it, expect, vi } from "vitest";
import { GraphRetrieval } from "../src/functions/graph-retrieval.js";
import { getGraphIndexStatus, initializeGraphIndex, reconcileGraphIndexRecord } from "../src/state/graph-retrieval-index.js";
import { indexObservationSession } from "../src/state/obs-index.js";
import { KV } from "../src/state/schema.js";
import type { GraphNode, GraphEdge } from "../src/types.js";

async function mockKV(
  nodes: GraphNode[] = [],
  edges: GraphEdge[] = [],
) {
  const store = new Map<string, Map<string, unknown>>();
  const nodesMap = new Map<string, unknown>();
  for (const n of nodes) nodesMap.set(n.id, n);
  store.set("mem:graph:nodes", nodesMap);

  const edgesMap = new Map<string, unknown>();
  for (const e of edges) edgesMap.set(e.id, e);
  store.set("mem:graph:edges", edgesMap);

  const kv = {
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
    list: vi.fn(async <T>(_scope: string): Promise<T[]> => { throw new Error("Whole-store listing is forbidden during retrieval"); }),
  };
  await initializeGraphIndex(kv as never, { status: "ready" });
  for (const node of nodes) await reconcileGraphIndexRecord(kv as never, "node", node.id, node);
  for (const edge of edges) await reconcileGraphIndexRecord(kv as never, "edge", edge.id, edge);
  for (const row of [...nodes, ...edges]) for (const id of row.sourceObservationIds) {
    await indexObservationSession(kv as never, id, "session");
    await kv.set(KV.observations("session"), id, { id, sessionId: "session", title: `Evidence ${id}`, facts: [], narrative: "verified source", concepts: [], files: [] });
  }
  return kv;
}

function makeNode(
  id: string,
  name: string,
  type: GraphNode["type"] = "concept",
  obsIds: string[] = ["obs_1"],
): GraphNode {
  return {
    id,
    type,
    name,
    properties: {},
    sourceObservationIds: obsIds,
    createdAt: new Date().toISOString(),
  };
}

function makeEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  type: GraphEdge["type"] = "related_to",
  weight = 0.8,
): GraphEdge {
  return {
    id,
    type,
    sourceNodeId,
    targetNodeId,
    weight,
    sourceObservationIds: ["obs_1"],
    createdAt: new Date().toISOString(),
    tcommit: new Date().toISOString(),
    isLatest: true,
  };
}

describe("GraphRetrieval", () => {
  it("finds entities by name", async () => {
    const nodes = [
      makeNode("n1", "React", "library", ["obs_1"]),
      makeNode("n2", "Vue", "library", ["obs_2"]),
    ];
    const kv = await mockKV(nodes, []);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["React"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].obsId).toBe("obs_1");
  });

  it("finds entities by partial name match", async () => {
    const nodes = [makeNode("n1", "auth-middleware", "function", ["obs_1"])];
    const kv = await mockKV(nodes, []);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["auth"]);
    expect(results.length).toBeGreaterThan(0);
  });

  it("traverses graph edges to find related observations", async () => {
    const nodes = [
      makeNode("n1", "React", "library", ["obs_1"]),
      makeNode("n2", "Component", "concept", ["obs_2"]),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "uses")];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["React"], 2);
    const obsIds = results.map((r) => r.obsId);
    expect(obsIds).toContain("obs_1");
    expect(obsIds).toContain("obs_2");
  });

  it("returns empty for no matches", async () => {
    const kv = await mockKV([], []);
    const retrieval = new GraphRetrieval(kv as never);
    const results = await retrieval.searchByEntities(["nonexistent"]);
    expect(results).toEqual([]);
  });

  it("expands from existing chunks", async () => {
    const nodes = [
      makeNode("n1", "auth.ts", "file", ["obs_1"]),
      makeNode("n2", "jwt", "concept", ["obs_2"]),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "uses")];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.expandFromChunks(["obs_1"]);
    const obsIds = results.map((r) => r.obsId);
    expect(obsIds).toContain("obs_2");
  });

  it("does not duplicate already-seen observations in expansion", async () => {
    const nodes = [
      makeNode("n1", "file.ts", "file", ["obs_1"]),
      makeNode("n2", "jwt", "concept", ["obs_1", "obs_2"]),
    ];
    const kv = await mockKV(nodes, [makeEdge("e1", "n1", "n2", "uses")]);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.expandFromChunks(["obs_1"]);
    expect(results.map((r) => r.obsId)).toEqual(["obs_2"]);
  });

  it("performs temporal query - current state", async () => {
    const nodes = [makeNode("n1", "Alice", "person", ["obs_1"])];
    const edges = [
      makeEdge("e1", "n1", "n1", "located_in" as any, 0.9),
      {
        ...makeEdge("e2", "n1", "n1", "located_in" as any, 0.9),
        tvalid: "2024-06-01",
        isLatest: true,
      },
    ];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const result = await retrieval.temporalQuery("Alice");
    expect(result.entity).toBeDefined();
    expect(result.entity!.name).toBe("Alice");
    expect(result.currentState.length).toBeGreaterThan(0);
  });

  it("returns null entity for unknown name", async () => {
    const kv = await mockKV([], []);
    const retrieval = new GraphRetrieval(kv as never);
    const result = await retrieval.temporalQuery("Unknown");
    expect(result.entity).toBeNull();
  });

  it("scores closer paths higher", async () => {
    const nodes = [
      makeNode("n1", "React", "library", ["obs_1"]),
      makeNode("n2", "Hook", "concept", ["obs_2"]),
      makeNode("n3", "State", "concept", ["obs_3"]),
    ];
    const edges = [
      makeEdge("e1", "n1", "n2", "uses", 0.9),
      makeEdge("e2", "n2", "n3", "related_to", 0.8),
    ];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["React"], 3);
    const directScore = results.find((r) => r.obsId === "obs_1")?.score ?? 0;
    const indirectScore = results.find((r) => r.obsId === "obs_3")?.score ?? 0;
    expect(directScore).toBeGreaterThan(indirectScore);
  });

  it("picks the weight-optimal path under Dijkstra, not the edge-count-shortest one", async () => {
    const nodes = [
      makeNode("n1", "Start", "concept", ["obs_start"]),
      makeNode("n2", "Mid", "concept", ["obs_mid"]),
      makeNode("n3", "End", "concept", ["obs_end"]),
    ];
    const edges = [
      // Direct n1 → n3 path with a weak edge. BFS would prefer this.
      makeEdge("e_direct", "n1", "n3", "related_to", 0.15),
      // Two-hop chain n1 → n2 → n3 with strong edges. Total cost
      // (1/0.9) + (1/0.9) ≈ 2.22, vs direct 1/0.15 ≈ 6.67.
      // Dijkstra picks the chain.
      makeEdge("e_strong_a", "n1", "n2", "related_to", 0.9),
      makeEdge("e_strong_b", "n2", "n3", "related_to", 0.9),
    ];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["Start"], 3);
    const endResult = results.find((r) => r.obsId === "obs_end");
    expect(endResult).toBeDefined();
    // Path is [Start → Mid → End] (length 3) — Dijkstra picked the
    // chain of two strong edges over the direct weak one.
    expect(endResult!.pathLength).toBe(3);
    expect(endResult!.graphContext).toContain("Evidence obs_end");
    expect(endResult!.graphContext).not.toContain("Mid");
  });

  it("handles disconnected nodes without crashing", async () => {
    const nodes = [
      makeNode("n1", "A", "concept", ["obs_a"]),
      makeNode("n2", "B", "concept", ["obs_b"]),
      // n3 is unreachable from the matched node.
      makeNode("n3", "Lonely", "concept", ["obs_lonely"]),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "related_to", 0.7)];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["A"], 5);
    expect(results.find((r) => r.obsId === "obs_a")).toBeDefined();
    expect(results.find((r) => r.obsId === "obs_b")).toBeDefined();
    expect(results.find((r) => r.obsId === "obs_lonely")).toBeUndefined();
  });

  it("clamps near-zero edge weights without dividing by zero", async () => {
    const nodes = [
      makeNode("n1", "Anchor", "concept", ["obs_anchor"]),
      makeNode("n2", "Weak", "concept", ["obs_weak"]),
    ];
    // weight: 0 is malformed but we shouldn't crash on it; the clamp
    // floor at 0.01 means traversal completes with a very high cost
    // rather than throwing or producing Infinity.
    const edges = [makeEdge("e1", "n1", "n2", "related_to", 0)];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["Anchor"], 2);
    const weak = results.find((r) => r.obsId === "obs_weak");
    expect(weak).toBeDefined();
    expect(Number.isFinite(weak!.score)).toBe(true);
  });

  it("scores startNode observations at 1.0 via the fallback path, not 0.5 via the path-scoring loop", async () => {
    const nodes = [
      makeNode("n1", "React", "library", ["obs_root"]),
      makeNode("n2", "Hook", "concept", ["obs_neighbor"]),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "uses", 0.8)];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["React"], 2);
    const root = results.find((r) => r.obsId === "obs_root");
    expect(root).toBeDefined();
    expect(root!.score).toBe(1.0);
    expect(root!.pathLength).toBe(0);
  });

  it.each([
    { first: "Alpha", second: "Zeta" },
    { first: "Zeta", second: "Alpha" },
  ])("keeps the best score for an observation $first and $second both reach", async ({ first, second }) => {
    const weak = `${first.toLowerCase()}_weak`;
    const strong = `${second.toLowerCase()}_strong`;
    const nodes = [
      makeNode(weak, first, "concept", ["obs_weak"]),
      makeNode(strong, second, "concept", ["obs_strong"]),
      makeNode("mid", "Mid", "concept", ["obs_mid"]),
      makeNode("target", "Target", "concept", ["obs_target"]),
    ];
    const edges = [
      makeEdge("e1", weak, "mid", "related_to", 0.2),
      makeEdge("e2", "mid", "target", "related_to", 0.2),
      makeEdge("e3", strong, "target", "related_to", 0.9),
    ];
    const retrieval = new GraphRetrieval((await mockKV(nodes, edges)) as never);
    const hit = (results: Awaited<ReturnType<typeof retrieval.searchByEntities>>) =>
      results.find((r) => r.obsId === "obs_target");

    const viaWeak = hit(await retrieval.searchByEntities([first], 2))!;
    const viaStrong = hit(await retrieval.searchByEntities([second], 2))!;
    expect(viaStrong.score).toBeGreaterThan(viaWeak.score);

    const both = await retrieval.searchByEntities([first, second], 2);
    expect(both.filter((r) => r.obsId === "obs_target")).toHaveLength(1);
    expect(hit(both)).toMatchObject({ score: viaStrong.score, pathLength: viaStrong.pathLength });
  });

  it.each([
    { far: "a_far", near: "b_near" },
    { far: "b_far", near: "a_near" },
  ])("keeps the closest chunk-expansion score whichever of $far and $near runs first", async ({ far, near }) => {
    const nodes = [
      makeNode(far, far, "concept", ["seed"]),
      makeNode(near, near, "concept", ["seed"]),
      makeNode("mid", "mid", "concept", ["obs_mid"]),
      makeNode("target", "target", "concept", ["obs_target"]),
      makeNode("sibling", "sibling", "concept", ["obs_sibling"]),
    ];
    const edges = [
      makeEdge("e1", far, "mid", "related_to", 0.8),
      makeEdge("e2", "mid", "target", "related_to", 0.8),
      makeEdge("e3", near, "target", "related_to", 0.8),
      makeEdge("e4", near, "sibling", "related_to", 0.8),
    ];
    const kv = await mockKV(nodes, edges);
    const results = await new GraphRetrieval(kv as never).expandFromChunks(["seed"], 2, 10);

    const target = results.find((r) => r.obsId === "obs_target");
    const sibling = results.find((r) => r.obsId === "obs_sibling");
    expect(results.filter((r) => r.obsId === "obs_target")).toHaveLength(1);
    expect(target).toMatchObject({ score: sibling!.score, pathLength: sibling!.pathLength });
  });

  it("ranks a re-scored observation after the ones that reached its score first", async () => {
    const nodes = [
      makeNode("start", "Quasar", "concept", ["obs_start"]),
      makeNode("hub", "Hub", "concept", ["obs_hub"]),
      makeNode("weak", "Weak", "concept", ["obs_b"]),
      makeNode("x_first", "First", "concept", ["obs_a"]),
      makeNode("y_second", "Second", "concept", ["obs_b"]),
    ];
    const edges = [
      makeEdge("e1", "start", "hub", "related_to", 0.9),
      makeEdge("e2", "start", "weak", "related_to", 0.5),
      makeEdge("e3", "hub", "x_first", "related_to", 0.9),
      makeEdge("e4", "hub", "y_second", "related_to", 0.9),
    ];
    const kv = await mockKV(nodes, edges);
    const results = await new GraphRetrieval(kv as never).searchByEntities(["Quasar"], 2);

    const a = results.findIndex((r) => r.obsId === "obs_a");
    const b = results.findIndex((r) => r.obsId === "obs_b");
    expect(results[b].score).toBe(results[a].score);
    expect(b).toBeGreaterThan(a);
  });

  it("keeps the first record when a later start node ties on score", async () => {
    const nodes = [
      makeNode("aaa", "Aaa", "concept", ["obs_aaa"]),
      makeNode("bbb", "Bbb", "concept", ["obs_bbb"]),
      makeNode("target", "Target", "concept", ["obs_target"]),
      makeNode("other", "Other", "concept", ["obs_other"]),
    ];
    const edges = [
      makeEdge("e1", "aaa", "target", "related_to", 0.6),
      makeEdge("e2", "aaa", "other", "related_to", 0.6),
      makeEdge("e3", "bbb", "target", "related_to", 0.6),
    ];
    const kv = await mockKV(nodes, edges);
    const results = await new GraphRetrieval(kv as never).searchByEntities(["Aaa", "Bbb"], 1);

    const target = results.findIndex((r) => r.obsId === "obs_target");
    const other = results.findIndex((r) => r.obsId === "obs_other");
    expect(results[target].score).toBe(results[other].score);
    expect(target).toBeLessThan(other);
  });

  it("keeps a start node's own observation at 1.0 when an oversized weight scores a path higher", async () => {
    const nodes = [
      makeNode("alpha", "Alpha", "concept", ["obs_alpha"]),
      makeNode("beta", "Beta", "concept", ["obs_beta"]),
    ];
    const kv = await mockKV(nodes, [makeEdge("e1", "alpha", "beta", "related_to", 3)]);
    const results = await new GraphRetrieval(kv as never).searchByEntities(["Alpha", "Beta"], 2);

    expect(results).toHaveLength(2);
    for (const result of results) expect(result).toMatchObject({ score: 1, pathLength: 0 });
  });

  it("respects maxDepth bound (Dijkstra stops at edge-count depth)", async () => {
    // Chain n1 -> n2 -> n3 -> n4. With maxDepth=2 we should reach n3
    // but not n4 — edge-count semantics preserved from the old BFS.
    const nodes = [
      makeNode("n1", "Start", "concept", ["obs_1"]),
      makeNode("n2", "Hop1", "concept", ["obs_2"]),
      makeNode("n3", "Hop2", "concept", ["obs_3"]),
      makeNode("n4", "Hop3", "concept", ["obs_4"]),
    ];
    const edges = [
      makeEdge("e1", "n1", "n2", "related_to", 0.8),
      makeEdge("e2", "n2", "n3", "related_to", 0.8),
      makeEdge("e3", "n3", "n4", "related_to", 0.8),
    ];
    const kv = await mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["Start"], 2);
    expect(results.find((r) => r.obsId === "obs_3")).toBeDefined();
    expect(results.find((r) => r.obsId === "obs_4")).toBeUndefined();
  });

  it("preserves exact-match observations when a neighbor has oversized legacy provenance", async () => {
    const kv = await mockKV([
      makeNode("root", "Cobalt", "concept", ["exact"]),
      makeNode("neighbor", "Neighbor", "concept", Array.from({ length: 10_001 }, (_, i) => `related_${i}`)),
    ], [makeEdge("edge", "root", "neighbor")]);
    const results = await new GraphRetrieval(kv as never).searchByEntities(["Cobalt"]);
    expect(results[0]).toMatchObject({ obsId: "exact", score: 1, pathLength: 0 });
    expect(results).toHaveLength(20);
  });

  it("bounds graph context from oversized imported properties and edge reasoning", async () => {
    const neighbor = makeNode("neighbor", "Neighbor", "concept", ["related"]);
    neighbor.properties = Object.fromEntries(Array.from({ length: 10_000 }, (_, i) => [`property_${i}`, "x".repeat(1000)]));
    const edge = { ...makeEdge("edge", "root", "neighbor"), context: { reasoning: "y".repeat(20_000) } };
    const kv = await mockKV([makeNode("root", "Cobalt", "concept", ["exact"]), neighbor], [edge]);
    const results = await new GraphRetrieval(kv as never).searchByEntities(["Cobalt"]);
    const related = results.find((result) => result.obsId === "related")!;
    expect(related.graphContext).toBe("[graph evidence] Evidence related");
    expect(related.graphContext).not.toContain("property_0=");
    expect(related.graphContext.length).toBeLessThanOrEqual(4096);
  });

  it("keeps graph hits when imported optional reasoning is not text", async () => {
    const edge = { ...makeEdge("edge", "root", "neighbor"), context: { reasoning: 42 } };
    const kv = await mockKV([
      makeNode("root", "Cobalt", "concept", ["exact"]),
      makeNode("neighbor", "Neighbor", "concept", ["related"]),
    ], [edge as unknown as GraphEdge]);
    const results = await new GraphRetrieval(kv as never).searchByEntities(["Cobalt"]);
    expect(results.map((result) => result.obsId)).toEqual(["exact", "related"]);
  });
});


describe("bounded graph index reads", () => {
  it("reports incomplete projections when omitted searchable text produces no matches", async () => {
    const source = { ...makeNode("large", "Anchor"), properties: { description: "x".repeat(512) + "遗漏" } };
    const kv = await mockKV([source]);
    const query = new GraphRetrieval(kv as never).createQuery();
    expect(await query.searchByEntities(["遗漏"])).toEqual([]);
    expect(query.diagnostics()).toMatchObject({ status: "ready", truncated: true });
    expect(kv.list).not.toHaveBeenCalled();
  });

  it("requires explicit migration for legacy rows without enumerating them", async () => {
    const list = vi.fn(async () => { throw new Error("unbounded"); });
    const graph = new GraphRetrieval({ get: async () => null, list } as never).createQuery();
    expect(await graph.searchByEntities(["React"])).toEqual([]);
    expect(graph.diagnostics().status).not.toBe("ready");
    expect(list).not.toHaveBeenCalled();
  });

  it("matches Unicode, short names and duplicate names through bounded postings", async () => {
    const kv = await mockKV([
      makeNode("a", "数据库", "concept", ["one"]), makeNode("b", "数据库", "concept", ["two"]),
      makeNode("c", "R", "concept", ["three"]), makeNode("d", "ＦＯＯ", "concept", ["four"]),
    ]);
    const retrieval = new GraphRetrieval(kv as never);
    expect((await retrieval.searchByEntities(["数据"])).map((hit) => hit.obsId)).toEqual(["one", "two"]);
    expect((await retrieval.searchByEntities(["R"])).map((hit) => hit.obsId)).toContain("three");
    expect((await retrieval.searchByEntities(["foo"])).map((hit) => hit.obsId)).toContain("four");
    expect(kv.list).not.toHaveBeenCalled();
  });

  it("excludes forgotten sources and avoids leaking properties from mixed provenance", async () => {
    const root = makeNode("root", "Cobalt", "concept", ["private", "public"]);
    root.properties = { secret: "do not disclose" };
    const kv = await mockKV([root, makeNode("neighbor", "SecretName", "concept", ["forgotten"])], [makeEdge("edge", "root", "neighbor")]);
    await kv.delete(KV.observations("session"), "forgotten");
    const query = new GraphRetrieval(kv as never).createQuery((record) => record.id !== "private");
    expect(await query.searchByEntities(["Cobalt"])).toEqual([
      expect.objectContaining({ obsId: "public", graphContext: "[graph evidence] Evidence public" }),
    ]);
  });

  it("excludes superseded edges and missing or stale neighbors", async () => {
    const kv = await mockKV([
      makeNode("root", "Cobalt", "concept", ["root"]),
      makeNode("old", "Old", "concept", ["old"]),
      { ...makeNode("stale", "Stale", "concept", ["stale"]), stale: true },
    ], [
      { ...makeEdge("old", "root", "old"), isLatest: false },
      makeEdge("stale", "root", "stale"), makeEdge("missing", "root", "missing"), makeEdge("self", "root", "root"),
    ]);
    expect((await new GraphRetrieval(kv as never).searchByEntities(["Cobalt"])).map((hit) => hit.obsId)).toEqual(["root"]);
  });

  it("retains a more expensive shallow route needed to reach a node within the depth limit", async () => {
    const kv = await mockKV([
      makeNode("a", "Start", "concept", ["a"]), makeNode("b", "Middle", "concept", ["b"]),
      makeNode("c", "Junction", "concept", ["c"]), makeNode("d", "End", "concept", ["d"]),
    ], [makeEdge("ac", "a", "c", "related_to", 0.1), makeEdge("ab", "a", "b", "related_to", 1),
      makeEdge("bc", "b", "c", "related_to", 1), makeEdge("cd", "c", "d", "related_to", 1)]);
    const results = await new GraphRetrieval(kv as never).searchByEntities(["Start"], 2);
    expect(results.find((hit) => hit.obsId === "d")?.pathLength).toBe(3);
  });

  it("shares bounded work across repeated operations and reports partial high degree", async () => {
    const nodes = [makeNode("root", "Cobalt", "concept", ["root"]), ...Array.from({ length: 180 }, (_, i) => makeNode(`n${i}`, `Other ${i}`, "concept", [`o${i}`]))];
    const kv = await mockKV(nodes, nodes.slice(1).map((node, i) => makeEdge(`e${i}`, "root", node.id)));
    const get = vi.spyOn(kv, "get");
    const query = new GraphRetrieval(kv as never).createQuery();
    const [a, b] = await Promise.all([query.searchByEntities(["Cobalt"]), query.searchByEntities(["Cobalt"])]);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(query.diagnostics().truncated).toBe(true);
    expect(get.mock.calls.length).toBeLessThanOrEqual(520);
    expect(kv.list).not.toHaveBeenCalled();
  });
});

it("discards results after the graph revision changes during an awaited source read", async () => {
  const root = makeNode("root", "Cobalt", "concept", ["root"]);
  const kv = await mockKV([root]);
  const get = kv.get;
  let changed = false;
  vi.spyOn(kv, "get").mockImplementation(async (scope, key) => {
    const value = await get(scope, key);
    if (!changed && scope === KV.observations("session")) {
      changed = true;
      await reconcileGraphIndexRecord(kv as never, "node", root.id, { ...root, name: "Renamed" });
    }
    return value;
  });
  const query = new GraphRetrieval(kv as never).createQuery();
  expect(await query.searchByEntities(["Cobalt"])).toEqual([]);
  expect(query.diagnostics().status).toBe("changed");
});

it("rechecks canonical evidence before exposing a result after forget", async () => {
  const kv = await mockKV([makeNode("root", "Cobalt", "concept", ["root"])]);
  const get = kv.get;
  vi.spyOn(kv, "get").mockImplementation(async (scope, key) => {
    const value = await get(scope, key);
    if (scope === KV.observations("session")) await kv.delete(scope, key);
    return value;
  });
  expect(await new GraphRetrieval(kv as never).searchByEntities(["Cobalt"])).toEqual([]);
});


it("matches a contained node name when the query begins with a different Unicode character", async () => {
  const kv = await mockKV([makeNode("node", "React", "library", ["source"])]);
  expect((await new GraphRetrieval(kv as never).searchByEntities(["  Using React  "])).map((hit) => hit.obsId)).toEqual(["source"]);
});


it("reports dirty index status without repairing or listing during retrieval", async () => {
  const kv = await mockKV([makeNode("root", "Cobalt", "concept", ["root"])]);
  const control = await getGraphIndexStatus(kv as never);
  await kv.set(KV.graphRetrievalControl, "current", { ...control, pending: { kind: "node", id: "root" } });
  const query = new GraphRetrieval(kv as never).createQuery();
  expect(await query.searchByEntities(["Cobalt"])).toEqual([]);
  expect(query.diagnostics().status).toBe("dirty");
  expect(kv.list).not.toHaveBeenCalled();
});

it("does not replay cached operations after the caller cancels its query", async () => {
  const kv = await mockKV([makeNode("root", "Cobalt", "concept", ["root"])]);
  const query = new GraphRetrieval(kv as never).createQuery();
  expect(await query.searchByEntities(["Cobalt"])).toHaveLength(1);
  query.cancel();
  await expect(query.searchByEntities(["Cobalt"])).rejects.toThrow();
});
