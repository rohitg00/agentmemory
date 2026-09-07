import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GraphRetrieval } from "../src/functions/graph-retrieval.js";
import { onGraphWrite, invalidateGraphCache } from "../src/state/graph-cache.js";
import type { GraphNode, GraphEdge } from "../src/types.js";

function makeNode(
  id: string,
  name: string,
  obsIds: string[] = ["obs_1"],
): GraphNode {
  return {
    id,
    type: "concept",
    name,
    properties: {},
    sourceObservationIds: obsIds,
    createdAt: "2026-02-01T10:00:00Z",
  };
}

function makeEdge(id: string, source: string, target: string): GraphEdge {
  return {
    id,
    type: "related_to",
    sourceNodeId: source,
    targetNodeId: target,
    weight: 0.8,
    sourceObservationIds: ["obs_1"],
    createdAt: "2026-02-01T10:00:00Z",
  };
}

/** Counting KV so the test can assert how often the graph is enumerated. */
function countingKV(nodes: GraphNode[], edges: GraphEdge[]) {
  const store = new Map<string, Map<string, unknown>>();
  store.set("mem:graph:nodes", new Map(nodes.map((n) => [n.id, n])));
  store.set("mem:graph:edges", new Map(edges.map((e) => [e.id, e])));
  const listCalls: string[] = [];
  return {
    listCalls,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      listCalls.push(scope);
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

describe("graph view reuse (#1300)", () => {
  let kv: ReturnType<typeof countingKV>;
  let retrieval: GraphRetrieval;

  beforeEach(() => {
    kv = countingKV(
      [
        makeNode("gn_1", "docker", ["obs_1"]),
        makeNode("gn_2", "compose", ["obs_2"]),
        makeNode("gn_3", "registry", ["obs_3"]),
      ],
      [makeEdge("ge_1", "gn_1", "gn_2"), makeEdge("ge_2", "gn_2", "gn_3")],
    );
    retrieval = new GraphRetrieval(kv as never);
    invalidateGraphCache(kv as never);
  });

  // The regression: searchByEntities and expandFromChunks each ran
  // kv.list on both graph scopes, so a single hybrid query paid four
  // full enumerations and every query after it paid four more.
  it("enumerates the graph once across many queries", async () => {
    await retrieval.searchByEntities(["docker"], 2, 10);
    await retrieval.searchByEntities(["compose"], 2, 10);
    await retrieval.expandFromChunks(["obs_1"], 1, 5);
    await retrieval.searchByEntities(["registry"], 2, 10);

    // One nodes list + one edges list, for all four calls.
    expect(kv.listCalls).toEqual(["mem:graph:nodes", "mem:graph:edges"]);
  });

  it("still returns results for each query", async () => {
    const docker = await retrieval.searchByEntities(["docker"], 2, 10);
    const registry = await retrieval.searchByEntities(["registry"], 2, 10);
    expect(docker.length).toBeGreaterThan(0);
    expect(registry.length).toBeGreaterThan(0);
  });

  // Writes go through StateKV, which patches the view in place. A node
  // added after the view was built must be reachable without paying for
  // another enumeration.
  it("sees nodes written after the view was built, without re-enumerating", async () => {
    await retrieval.searchByEntities(["docker"], 2, 10);
    const before = kv.listCalls.length;

    const fresh = makeNode("gn_4", "kubernetes", ["obs_9"]);
    await kv.set("mem:graph:nodes", fresh.id, fresh);
    onGraphWrite(kv as never, "mem:graph:nodes", fresh.id, fresh);

    const hits = await retrieval.searchByEntities(["kubernetes"], 2, 10);
    expect(hits.some((r) => r.obsId === "obs_9")).toBe(true);
    expect(kv.listCalls.length).toBe(before);
  });

  it("drops a node from the view when it is marked stale", async () => {
    await retrieval.searchByEntities(["docker"], 2, 10);

    const stale = { ...makeNode("gn_1", "docker", ["obs_1"]), stale: true };
    onGraphWrite(kv as never, "mem:graph:nodes", stale.id, stale);

    const hits = await retrieval.searchByEntities(["docker"], 2, 10);
    expect(hits.some((r) => r.obsId === "obs_1")).toBe(false);
  });

  // The visited cap used to bound only nodes popped off the heap. One hub
  // node adds every neighbour to pathTo in a single iteration, so all of
  // them were still returned and scored.
  it("bounds discovered nodes on a star graph, not just expanded ones", async () => {
    const ORIG = process.env["AGENTMEMORY_GRAPH_MAX_VISITED"];
    process.env["AGENTMEMORY_GRAPH_MAX_VISITED"] = "5";
    try {
      const hub = makeNode("gn_hub", "hub", ["obs_hub"]);
      const spokes: GraphNode[] = [];
      const spokeEdges: GraphEdge[] = [];
      for (let i = 0; i < 100; i++) {
        spokes.push(makeNode(`gn_s${i}`, `spoke${i}`, [`obs_s${i}`]));
        spokeEdges.push(makeEdge(`ge_s${i}`, "gn_hub", `gn_s${i}`));
      }
      const starKv = countingKV([hub, ...spokes], spokeEdges);
      const star = new GraphRetrieval(starKv as never);
      invalidateGraphCache(starKv as never);

      const results = await star.searchByEntities(["hub"], 2, 1000);

      // Start node plus at most the configured number of discovered nodes.
      expect(results.length).toBeLessThanOrEqual(6);
    } finally {
      if (ORIG === undefined) delete process.env["AGENTMEMORY_GRAPH_MAX_VISITED"];
      else process.env["AGENTMEMORY_GRAPH_MAX_VISITED"] = ORIG;
    }
  });

  // A write landing while buildView is awaiting its two kv.list calls has no
  // view to patch. The build must not then publish a snapshot that predates
  // it.
  it("does not lose a write that lands mid-build", async () => {
    let releaseList: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    const base = countingKV([makeNode("gn_1", "docker", ["obs_1"])], []);
    let gated = true;
    const slowKv = {
      ...base,
      list: async <T>(scope: string): Promise<T[]> => {
        if (gated) await gate;
        return base.list<T>(scope);
      },
    };
    const slow = new GraphRetrieval(slowKv as never);
    invalidateGraphCache(slowKv as never);

    const query = slow.searchByEntities(["docker"], 2, 10);

    const fresh = makeNode("gn_2", "kubernetes", ["obs_late"]);
    await base.set("mem:graph:nodes", fresh.id, fresh);
    onGraphWrite(slowKv as never, "mem:graph:nodes", fresh.id, fresh);

    gated = false;
    releaseList();
    await query;

    const hits = await slow.searchByEntities(["kubernetes"], 2, 10);
    expect(hits.some((r) => r.obsId === "obs_late")).toBe(true);
  });

  it("rebuilds after an explicit invalidation", async () => {
    await retrieval.searchByEntities(["docker"], 2, 10);
    const before = kv.listCalls.length;
    invalidateGraphCache(kv as never);
    await retrieval.searchByEntities(["docker"], 2, 10);
    expect(kv.listCalls.length).toBe(before + 2);
  });
});
