import { describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GraphRetrieval } from "../src/functions/graph-retrieval.js";
import {
  persistGraphDelta,
  rebuildGraphSnapshotFromIndexes,
  registerGraphFunction,
} from "../src/functions/graph.js";
import { registerTemporalGraphFunctions } from "../src/functions/temporal-graph.js";
import {
  backfillGraphIndexes,
  graphIndexReadiness,
  graphIndexesReady,
  GraphIndexReader,
  indexGraphNode,
  initializeGraphIndexes,
  loadNameCatalog,
  nameShardKey,
} from "../src/state/graph-indexes.js";
import { KV } from "../src/state/schema.js";
import { StateKV } from "../src/state/kv.js";
import type {
  CompressedObservation,
  GraphEdge,
  GraphNode,
  GraphQueryResult,
  GraphSnapshot,
} from "../src/types.js";

function mockKV(nodes: GraphNode[] = [], edges: GraphEdge[] = []) {
  const store = new Map<string, Map<string, unknown>>();
  const calls: Array<{ operation: "get" | "list" | "listGroups"; scope?: string; key?: string }> = [];
  let failNextGetScope: string | undefined;
  let failNextSetScope: string | undefined;
  let getHook:
    | { scope: string; remaining: number; fn: () => Promise<void> }
    | undefined;
  store.set(KV.graphNodes, new Map(nodes.map((node) => [node.id, node])));
  store.set(KV.graphEdges, new Map(edges.map((edge) => [edge.id, edge])));

  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      calls.push({ operation: "get", scope, key });
      if (getHook?.scope === scope && --getHook.remaining === 0) {
        const hook = getHook.fn;
        getHook = undefined;
        await hook();
      }
      if (failNextGetScope === scope) {
        failNextGetScope = undefined;
        throw new Error(`injected ${scope} read failure`);
      }
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (failNextSetScope === scope) {
        failNextSetScope = undefined;
        throw new Error(`injected ${scope} write failure`);
      }
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      calls.push({ operation: "list", scope });
      return Array.from(store.get(scope)?.values() ?? []) as T[];
    },
    listGroups: async (): Promise<string[]> => {
      calls.push({ operation: "listGroups" });
      return [...store.entries()]
        .filter(([, entries]) => entries.size > 0)
        .map(([scope]) => scope);
    },
    clearCalls: () => calls.splice(0),
    failNextGet: (scope: string) => {
      failNextGetScope = scope;
    },
    failNextSet: (scope: string) => {
      failNextSetScope = scope;
    },
    onGet: (scope: string, occurrence: number, fn: () => Promise<void>) => {
      getHook = { scope, remaining: occurrence, fn };
    },
    graphListCallCount: () =>
      calls.filter(
        (call) =>
          call.operation === "list" &&
          (call.scope === KV.graphNodes || call.scope === KV.graphEdges),
      ).length,
    getKeys: (scope: string) =>
      calls
        .filter((call) => call.operation === "get" && call.scope === scope)
        .map((call) => call.key!),
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (
      idOrOpts: string | { id: string },
      handler: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

const noopProvider = {
  name: "noop",
  compress: vi.fn().mockResolvedValue(""),
  summarize: vi.fn(),
};

function makeNode(
  id: string,
  name: string,
  type: GraphNode["type"] = "concept",
  obsIds: string[] = ["obs_1"],
  properties: Record<string, unknown> = {},
): GraphNode {
  return {
    id,
    type,
    name,
    properties,
    sourceObservationIds: obsIds,
    createdAt: "2026-01-01T00:00:00.000Z",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    tcommit: "2026-01-01T00:00:00.000Z",
    isLatest: true,
  };
}

function fixtureGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = [
    makeNode("n1", "React", "library", ["obs_react"]),
    makeNode("n2", "Hook", "concept", ["obs_hook"]),
    makeNode("n3", "State", "concept", ["obs_state"]),
    makeNode("n4", "auth-middleware", "function", ["obs_auth"]),
    makeNode("n5", "Lonely", "concept", ["obs_lonely"]),
  ];
  const edges = [
    makeEdge("e1", "n1", "n2", "uses", 0.9),
    makeEdge("e2", "n2", "n3", "related_to", 0.8),
    makeEdge("e3", "n1", "n3", "related_to", 0.15),
    makeEdge("e4", "n4", "n1", "uses", 0.7),
  ];
  return { nodes, edges };
}

async function indexedKV(nodes: GraphNode[], edges: GraphEdge[]) {
  const kv = mockKV();
  await initializeGraphIndexes(kv as never);
  for (const node of nodes) await kv.set(KV.graphNodes, node.id, node);
  for (const edge of edges) await kv.set(KV.graphEdges, edge.id, edge);
  await backfillGraphIndexes(kv as never, nodes, edges);
  await rebuildGraphSnapshotFromIndexes(kv as never);
  kv.clearCalls();
  return kv;
}

function resultIds(results: Array<{ obsId: string }>): string[] {
  return results.map((result) => result.obsId).sort();
}

describe("graph index parity and readiness", () => {
  it("preserves entity, chunk, and traversal semantics through indexes", async () => {
    const { nodes, edges } = fixtureGraph();
    const kv = await indexedKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    expect(resultIds(await retrieval.searchByEntities(["React"], 3, 20))).toEqual([
      "obs_auth",
      "obs_hook",
      "obs_react",
      "obs_state",
    ]);
    expect(resultIds(await retrieval.expandFromChunks(["obs_react"], 2, 20))).toEqual([
      "obs_auth",
      "obs_hook",
      "obs_state",
    ]);
    expect(await retrieval.searchByEntities(["missing"])).toEqual([]);

    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, noopProvider as never);
    const traversal = (await sdk.trigger("mem::graph-query", {
      startNodeId: "n1",
      maxDepth: 2,
    })) as GraphQueryResult;
    expect(traversal.nodes.map((node) => node.id).sort()).toEqual([
      "n1",
      "n2",
      "n3",
      "n4",
    ]);
    expect(traversal.edges.map((edge) => edge.id).sort()).toEqual([
      "e1",
      "e2",
      "e3",
      "e4",
    ]);
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("produces the same retrieval from backfill and incremental indexing", async () => {
    const { nodes, edges } = fixtureGraph();
    const incremental = await indexedKV(nodes, edges);
    const backfilled = mockKV();
    await initializeGraphIndexes(backfilled as never);
    for (const node of nodes) await backfilled.set(KV.graphNodes, node.id, node);
    for (const edge of edges) await backfilled.set(KV.graphEdges, edge.id, edge);
    await backfillGraphIndexes(backfilled as never, nodes, edges);

    const viaIncremental = await new GraphRetrieval(incremental as never)
      .searchByEntities(["React"], 2, 20);
    const viaBackfill = await new GraphRetrieval(backfilled as never)
      .searchByEntities(["React"], 2, 20);
    expect(viaBackfill).toEqual(viaIncremental);
  });

  it("preserves temporal partitioning through indexed reads", async () => {
    const nodes = [makeNode("n1", "Alice", "person")];
    const edges = [
      makeEdge("e1", "n1", "n1", "located_in" as never, 0.9),
      {
        ...makeEdge("e2", "n1", "n1", "located_in" as never, 0.9),
        tcommit: "2026-02-01T00:00:00.000Z",
        tvalid: "2026-02-01",
      },
    ];
    const retrieval = new GraphRetrieval((await indexedKV(nodes, edges)) as never);

    const current = await retrieval.temporalQuery("Alice");
    expect(current.currentState.map((edge) => edge.id)).toEqual(["e2"]);
    expect(current.history.map((edge) => edge.id)).toEqual(["e1"]);
    const historical = await retrieval.temporalQuery(
      "Alice",
      "2026-01-15T00:00:00.000Z",
    );
    expect(historical.currentState.map((edge) => edge.id)).toEqual(["e1"]);
  });

  it("filters catalog names before fetching nodes and bounds properties to the snapshot", async () => {
    const nodes = [
      makeNode("n1", "payments-service", "project", ["obs_1"], { lang: "rust" }),
      makeNode("n2", "billing", "concept", ["obs_2"], { note: "uses payments" }),
      makeNode("n3", "frontend", "project", ["obs_3"]),
    ];
    const kv = await indexedKV(nodes, [makeEdge("e1", "n1", "n2")]);
    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, noopProvider as never);

    const result = (await sdk.trigger("mem::graph-query", {
      query: "payments",
    })) as GraphQueryResult;

    expect(result.nodes.map((node) => node.id).sort()).toEqual(["n1", "n2"]);
    expect(result.warning).toBeUndefined();
    expect(kv.getKeys(KV.graphNodes)).toEqual(["n1", "n2"]);
  });

  it("keeps a missing legacy snapshot unavailable without listing graph scopes", async () => {
    const kv = mockKV([makeNode("legacy", "Legacy")]);
    const readiness = await initializeGraphIndexes(kv as never);

    expect(readiness.status).toBe("unavailable");
    expect(readiness.ready).toBe(false);
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("does not trust an under-counted legacy snapshot or list graph scopes", async () => {
    const kv = mockKV([makeNode("legacy", "Legacy")]);
    await kv.set(KV.graphSnapshot, "current", {
      version: 1,
      topNodes: [],
      topEdges: [],
      topDegrees: {},
      stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, edgesByType: {} },
      updatedAt: "2026-01-01T00:00:00.000Z",
      dirty: false,
    });

    expect((await initializeGraphIndexes(kv as never)).status).toBe("unavailable");
    expect(await graphIndexesReady(kv as never)).toBe(false);
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("proves an empty store ready through list_groups without graph enumeration", async () => {
    const kv = mockKV();
    const readiness = await initializeGraphIndexes(kv as never);

    expect(readiness.ready).toBe(true);
    expect(readiness.generation).toBeTruthy();
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("propagates transient readiness reads without replacing healthy metadata", async () => {
    const kv = mockKV();
    const original = await initializeGraphIndexes(kv as never);
    kv.failNextGet(KV.graphIndexMeta);

    await expect(initializeGraphIndexes(kv as never)).rejects.toThrow(
      /injected/,
    );
    const current = await graphIndexReadiness(kv as never);
    expect(current).toMatchObject({
      ready: true,
      generation: original.generation,
    });
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("fails closed when list_groups returns a malformed response", async () => {
    const sdk = { trigger: vi.fn().mockResolvedValue(null) };
    const kv = new StateKV(sdk as never);

    await expect(kv.listGroups()).rejects.toThrow(/invalid response/);
  });

  it("fails every unavailable read path closed without graph enumeration", async () => {
    const kv = mockKV([makeNode("legacy", "Legacy")]);
    await initializeGraphIndexes(kv as never);
    kv.clearCalls();
    const retrieval = new GraphRetrieval(kv as never);

    expect(await retrieval.searchByEntities(["Legacy"])).toEqual([]);
    expect(await retrieval.expandFromChunks(["obs_1"])).toEqual([]);
    expect((await retrieval.temporalQuery("Legacy")).entity).toBeNull();

    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, noopProvider as never);
    registerTemporalGraphFunctions(sdk as never, kv as never, noopProvider as never);
    const byName = (await sdk.trigger("mem::graph-query", {
      query: "Legacy",
    })) as GraphQueryResult;
    const byStart = (await sdk.trigger("mem::graph-query", {
      startNodeId: "legacy",
    })) as GraphQueryResult;
    const rebuild = (await sdk.trigger("mem::graph-snapshot-rebuild", {
      force: true,
    })) as { success: boolean; indexUnavailable?: boolean };
    const temporal = (await sdk.trigger("mem::temporal-query", {
      entityName: "Legacy",
    })) as { error?: string };
    const differential = (await sdk.trigger("mem::differential-state", {
      entityName: "Legacy",
    })) as { error?: string };

    expect(byName.indexStatus).toBe("unavailable");
    expect(byStart.indexStatus).toBe("unavailable");
    expect(rebuild).toMatchObject({ success: false, indexUnavailable: true });
    expect(temporal.error).toMatch(/unavailable/i);
    expect(differential.error).toMatch(/unavailable/i);
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("refuses graph writes before touching an unavailable legacy corpus", async () => {
    const kv = mockKV([makeNode("legacy", "Legacy")]);
    const incoming = makeNode("new", "New");

    await expect(
      persistGraphDelta(kv as never, [incoming], [], []),
    ).rejects.toThrow(/legacy graph scopes|generation-matched/i);
    expect(await kv.get(KV.graphNodes, incoming.id)).toBeNull();
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("invalidates a partially indexed generation and recovers after reset", async () => {
    const kv = mockKV();
    await initializeGraphIndexes(kv as never);
    const incoming = makeNode("partial", "Partial write");
    kv.failNextSet(KV.graphNameShards);

    await expect(
      persistGraphDelta(kv as never, [incoming], [], []),
    ).rejects.toThrow(/injected/);
    expect(await kv.get(KV.graphNodes, incoming.id)).toEqual(incoming);
    expect((await graphIndexReadiness(kv as never)).status).toBe(
      "unavailable",
    );

    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, noopProvider as never);
    const unavailable = (await sdk.trigger("mem::graph-query", {
      query: incoming.name,
    })) as GraphQueryResult;
    expect(unavailable.indexStatus).toBe("unavailable");
    expect(kv.graphListCallCount()).toBe(0);

    await sdk.trigger("mem::graph-reset", {});
    await persistGraphDelta(kv as never, [incoming], [], []);
    expect((await graphIndexReadiness(kv as never)).ready).toBe(true);
    expect(
      await new GraphRetrieval(kv as never).searchByEntities([incoming.name]),
    ).toHaveLength(1);
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("invalidates readiness when a post-primary write fails", async () => {
    const kv = mockKV();
    await initializeGraphIndexes(kv as never);
    const incoming = makeNode("partial-secondary", "Partial secondary");
    kv.failNextSet(KV.graphNameIndex);

    await expect(
      persistGraphDelta(kv as never, [incoming], [], []),
    ).rejects.toThrow(/injected/);
    expect(await kv.get(KV.graphNodes, incoming.id)).toEqual(incoming);
    expect((await graphIndexReadiness(kv as never)).status).toBe(
      "unavailable",
    );
  });

  it("invalidates readiness when the final snapshot write fails", async () => {
    const kv = mockKV();
    await initializeGraphIndexes(kv as never);
    const incoming = makeNode("partial-snapshot", "Partial snapshot");
    kv.failNextSet(KV.graphSnapshot);

    await expect(
      persistGraphDelta(kv as never, [incoming], [], []),
    ).rejects.toThrow(/injected/);
    expect((await graphIndexReadiness(kv as never)).status).toBe(
      "unavailable",
    );
  });

  it("graph reset starts a fresh ready generation and hides old hints", async () => {
    const legacy = makeNode("legacy", "Legacy");
    const kv = mockKV([legacy]);
    const unavailable = await initializeGraphIndexes(kv as never);
    await kv.set(
      KV.graphNameShards,
      `${unavailable.generation}:${nameShardKey(legacy.id)}`,
      [{ id: legacy.id, name: legacy.name }],
    );
    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, noopProvider as never);

    await sdk.trigger("mem::graph-reset", {});
    const ready = await graphIndexReadiness(kv as never);
    expect(ready.ready).toBe(true);
    expect(ready.generation).not.toBe(unavailable.generation);
    expect(await loadNameCatalog(kv as never)).toEqual([]);

    const fresh = makeNode("fresh", "Fresh");
    await persistGraphDelta(kv as never, [fresh], [], []);
    expect((await loadNameCatalog(kv as never)).map((entry) => entry.name)).toEqual([
      "Fresh",
    ]);
    expect((await new GraphRetrieval(kv as never).searchByEntities(["Fresh"]))).toHaveLength(1);
    const oldWalk = (await sdk.trigger("mem::graph-query", {
      startNodeId: legacy.id,
    })) as GraphQueryResult;
    expect(oldWalk.nodes).toEqual([]);
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("updates the name catalog when an existing node is renamed", async () => {
    const kv = mockKV();
    await initializeGraphIndexes(kv as never);
    const original = makeNode("n1", "Old name");
    await kv.set(KV.graphNodes, original.id, original);
    await indexGraphNode(kv as never, original);
    const renamed = { ...original, name: "New name" };
    await kv.set(KV.graphNodes, renamed.id, renamed);
    await indexGraphNode(kv as never, renamed);

    expect(await loadNameCatalog(kv as never)).toEqual([
      { id: "n1", name: "New name" },
    ]);
  });

  it("does not mix a captured snapshot with a replacement generation", async () => {
    const kv = mockKV();
    const oldNode = makeNode(
      "same-id",
      "stable-name",
      "concept",
      ["obs_old"],
      { tag: "old-only-token" },
    );
    await persistGraphDelta(kv as never, [oldNode], [], []);
    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, noopProvider as never);
    kv.clearCalls();
    kv.onGet(KV.graphIndexMeta, 3, async () => {
      await sdk.trigger("mem::graph-reset", {});
      await persistGraphDelta(
        kv as never,
        [{ ...oldNode, properties: { tag: "replacement" } }],
        [],
        [],
      );
    });

    const result = (await sdk.trigger("mem::graph-query", {
      query: "old-only-token",
    })) as GraphQueryResult;

    expect(result).toMatchObject({ nodes: [], indexStatus: "unavailable" });
    expect(result.warning).toMatch(/changed|generation/i);
  });

  it("applies incident-edge caps after discarding stale adjacency hints", async () => {
    const left = makeNode("left", "Left");
    const middle = makeNode("middle", "Middle");
    const right = makeNode("right", "Right");
    const stale = makeEdge("edge-stale", left.id, middle.id);
    const live = makeEdge("edge-live", left.id, right.id);
    const kv = await indexedKV([left, middle, right], [stale, live]);
    await kv.set(KV.graphEdges, stale.id, { ...stale, stale: true });

    const reader = await GraphIndexReader.open(kv as never);
    expect((await reader!.getIncidentEdges(left.id, 1)).map((edge) => edge.id))
      .toEqual([live.id]);
  });

  it("indexes current heuristic persistence without enumerating graph scopes", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, noopProvider as never);
    const observation: CompressedObservation = {
      id: "obs_heuristic",
      sessionId: "ses_1",
      timestamp: "2026-08-01T00:00:00.000Z",
      type: "file_edit",
      title: "Update graph code",
      facts: [],
      narrative: "Updated graph indexing",
      concepts: ["graph indexing"],
      files: ["src/functions/graph.ts"],
      importance: 8,
    };

    const result = (await sdk.trigger("mem::graph-extract", {
      observations: [observation],
    })) as { success: boolean };
    const reader = await GraphIndexReader.open(kv as never);
    const catalog = await reader!.getNameCatalog();
    const concept = catalog.find((entry) => entry.name === "graph indexing")!;

    expect(result.success).toBe(true);
    expect(catalog.map((entry) => entry.name).sort()).toEqual([
      "graph indexing",
      "src/functions/graph.ts",
    ]);
    expect(await reader!.getIncidentEdges(concept.id)).toHaveLength(1);
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("remaps Graphify-style edges to merged node IDs and indexes both endpoints", async () => {
    const kv = mockKV();
    const existing = makeNode("existing", "React", "library");
    await persistGraphDelta(kv as never, [existing], [], []);

    const duplicate = makeNode("incoming-react", "React", "library");
    const other = makeNode("incoming-hook", "Hook", "concept");
    const edge = makeEdge("incoming-edge", duplicate.id, other.id, "uses");
    await persistGraphDelta(kv as never, [duplicate, other], [edge], []);

    const reader = await GraphIndexReader.open(kv as never);
    const incident = await reader!.getIncidentEdges(existing.id);
    expect(incident).toHaveLength(1);
    expect(incident[0]).toMatchObject({
      sourceNodeId: existing.id,
      targetNodeId: other.id,
    });
    expect((await loadNameCatalog(kv as never)).map((entry) => entry.id).sort()).toEqual([
      existing.id,
      other.id,
    ]);
    expect(kv.graphListCallCount()).toBe(0);
  });

  it("deduplicates same-key edges created within one fresh batch", async () => {
    const kv = mockKV();
    const left = makeNode("left", "Left");
    const right = makeNode("right", "Right");
    const first = makeEdge("edge-first", left.id, right.id);
    const second = makeEdge("edge-second", left.id, right.id);

    const result = await persistGraphDelta(
      kv as never,
      [left, right],
      [first, second],
      [],
    );
    const snapshot = await kv.get<GraphSnapshot>(KV.graphSnapshot, "current");

    expect(result).toEqual({ newNodeCount: 2, newEdgeCount: 1 });
    expect(await kv.get(KV.graphEdges, first.id)).not.toBeNull();
    expect(await kv.get(KV.graphEdges, second.id)).toBeNull();
    expect(snapshot?.stats.totalEdges).toBe(1);
    expect(kv.graphListCallCount()).toBe(0);
  });
});
