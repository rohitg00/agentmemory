import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GraphRetrieval } from "../src/functions/graph-retrieval.js";
import { registerGraphFunction } from "../src/functions/graph.js";
import {
  backfillGraphIndexes,
  graphIndexesReady,
  indexGraphEdge,
  indexGraphNode,
  loadNameCatalog,
} from "../src/state/graph-indexes.js";
import type {
  GraphNode,
  GraphEdge,
  GraphQueryResult,
} from "../src/types.js";

function mockKV(nodes: GraphNode[] = [], edges: GraphEdge[] = []) {
  const store = new Map<string, Map<string, unknown>>();
  const nodesMap = new Map<string, unknown>();
  for (const n of nodes) nodesMap.set(n.id, n);
  store.set("mem:graph:nodes", nodesMap);

  const edgesMap = new Map<string, unknown>();
  for (const e of edges) edgesMap.set(e.id, e);
  store.set("mem:graph:edges", edgesMap);

  let listCalls = 0;

  return {
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
    list: async <T>(scope: string): Promise<T[]> => {
      listCalls += 1;
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
    listCallCount: () => listCalls,
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

const mockProvider = {
  name: "test",
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
  const kv = mockKV(nodes, edges);
  await backfillGraphIndexes(kv as never, nodes, edges);
  return kv;
}

function sortResults<T extends { obsId: string }>(results: T[]): T[] {
  return [...results].sort((a, b) => a.obsId.localeCompare(b.obsId));
}

describe("graph index parity", () => {
  it("searchByEntities returns identical results via indexes and enumeration", async () => {
    const { nodes, edges } = fixtureGraph();
    const plain = new GraphRetrieval(mockKV(nodes, edges) as never);
    const indexed = new GraphRetrieval((await indexedKV(nodes, edges)) as never);

    for (const query of [["React"], ["auth"], ["react", "state"], ["nope"]]) {
      const viaList = sortResults(await plain.searchByEntities(query, 3, 20));
      const viaIndex = sortResults(await indexed.searchByEntities(query, 3, 20));
      expect(viaIndex).toEqual(viaList);
    }
  });

  it("searchByEntities parity holds for incrementally indexed writes", async () => {
    const { nodes, edges } = fixtureGraph();
    const plain = new GraphRetrieval(mockKV(nodes, edges) as never);

    const kv = mockKV(nodes, edges);
    for (const node of nodes) await indexGraphNode(kv as never, node);
    for (const edge of edges) await indexGraphEdge(kv as never, edge);
    await kv.set("mem:graph:index-meta", "current", { version: 1 });
    const indexed = new GraphRetrieval(kv as never);

    const viaList = sortResults(await plain.searchByEntities(["React"], 2));
    const viaIndex = sortResults(await indexed.searchByEntities(["React"], 2));
    expect(viaIndex).toEqual(viaList);
  });

  it("expandFromChunks returns identical results via indexes and enumeration", async () => {
    const { nodes, edges } = fixtureGraph();
    const plain = new GraphRetrieval(mockKV(nodes, edges) as never);
    const indexed = new GraphRetrieval((await indexedKV(nodes, edges)) as never);

    for (const obsIds of [["obs_react"], ["obs_hook", "obs_auth"], ["obs_x"]]) {
      const viaList = sortResults(await plain.expandFromChunks(obsIds, 2, 20));
      const viaIndex = sortResults(await indexed.expandFromChunks(obsIds, 2, 20));
      expect(viaIndex).toEqual(viaList);
    }
  });

  it("temporalQuery returns identical results via indexes and enumeration", async () => {
    const nodes = [makeNode("n1", "Alice", "person", ["obs_1"])];
    const edges = [
      makeEdge("e1", "n1", "n1", "located_in" as never, 0.9),
      {
        ...makeEdge("e2", "n1", "n1", "located_in" as never, 0.9),
        tcommit: "2026-02-01T00:00:00.000Z",
        tvalid: "2026-02-01",
        isLatest: true,
      },
    ];
    const plain = new GraphRetrieval(mockKV(nodes, edges) as never);
    const indexed = new GraphRetrieval((await indexedKV(nodes, edges)) as never);

    for (const asOf of [undefined, "2026-01-15T00:00:00.000Z", "2026-03-01T00:00:00.000Z"]) {
      const viaList = await plain.temporalQuery("Alice", asOf);
      const viaIndex = await indexed.temporalQuery("Alice", asOf);
      expect(viaIndex.entity?.id).toBe(viaList.entity?.id);
      expect(sortResults(mapEdges(viaIndex.currentState))).toEqual(
        sortResults(mapEdges(viaList.currentState)),
      );
      expect(sortResults(mapEdges(viaIndex.history))).toEqual(
        sortResults(mapEdges(viaList.history)),
      );
    }

    const missingViaIndex = await indexed.temporalQuery("Nobody");
    expect(missingViaIndex.entity).toBeNull();

    function mapEdges(list: GraphEdge[]) {
      return list.map((e) => ({ obsId: e.id }));
    }
  });

  it("graph-query startNodeId traversal returns identical pages via indexes and enumeration", async () => {
    const { nodes, edges } = fixtureGraph();

    const plainKv = mockKV(nodes, edges);
    const plainSdk = mockSdk();
    registerGraphFunction(plainSdk as never, plainKv as never, mockProvider as never);

    const idxKv = await indexedKV(nodes, edges);
    const idxSdk = mockSdk();
    registerGraphFunction(idxSdk as never, idxKv as never, mockProvider as never);

    const viaList = (await plainSdk.trigger("mem::graph-query", {
      startNodeId: "n1",
      maxDepth: 2,
    })) as GraphQueryResult;
    const viaIndex = (await idxSdk.trigger("mem::graph-query", {
      startNodeId: "n1",
      maxDepth: 2,
    })) as GraphQueryResult;

    expect(viaIndex.nodes.map((n) => n.id).sort()).toEqual(
      viaList.nodes.map((n) => n.id).sort(),
    );
    expect(viaIndex.edges.map((e) => e.id).sort()).toEqual(
      viaList.edges.map((e) => e.id).sort(),
    );
    expect(viaIndex.totalNodes).toBe(viaList.totalNodes);
    expect(viaIndex.totalEdges).toBe(viaList.totalEdges);
    expect(viaIndex.truncated).toBe(viaList.truncated);
  });

  it("graph-query query branch returns identical matches when the snapshot covers the corpus", async () => {
    const nodes = [
      makeNode("n1", "payments-service", "project", ["obs_1"], { lang: "rust" }),
      makeNode("n2", "billing", "concept", ["obs_2"], { note: "uses payments" }),
      makeNode("n3", "frontend", "project", ["obs_3"]),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "related_to", 0.9)];

    const plainKv = mockKV(nodes, edges);
    const plainSdk = mockSdk();
    registerGraphFunction(plainSdk as never, plainKv as never, mockProvider as never);

    const idxKv = mockKV(nodes, edges);
    const idxSdk = mockSdk();
    registerGraphFunction(idxSdk as never, idxKv as never, mockProvider as never);
    await idxSdk.trigger("mem::graph-snapshot-rebuild", { force: true });
    expect(await graphIndexesReady(idxKv as never)).toBe(true);

    const viaList = (await plainSdk.trigger("mem::graph-query", {
      query: "payments",
    })) as GraphQueryResult;
    const viaIndex = (await idxSdk.trigger("mem::graph-query", {
      query: "payments",
    })) as GraphQueryResult;

    expect(viaIndex.nodes.map((n) => n.id).sort()).toEqual(
      viaList.nodes.map((n) => n.id).sort(),
    );
    expect(viaIndex.nodes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
    expect(viaIndex.edges.map((e) => e.id).sort()).toEqual(
      viaList.edges.map((e) => e.id).sort(),
    );
    expect(viaIndex.totalNodes).toBe(viaList.totalNodes);
    expect(viaIndex.totalEdges).toBe(viaList.totalEdges);
    expect(viaIndex.warning).toBeUndefined();
  });

  it("falls back to enumeration when the readiness marker is absent", async () => {
    const { nodes, edges } = fixtureGraph();
    const kv = mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["React"]);
    expect(results.length).toBeGreaterThan(0);
    expect(kv.listCallCount()).toBeGreaterThan(0);
  });

  it("never enumerates when the readiness marker is present", async () => {
    const { nodes, edges } = fixtureGraph();
    const kv = await indexedKV(nodes, edges);
    const before = kv.listCallCount();
    const retrieval = new GraphRetrieval(kv as never);

    await retrieval.searchByEntities(["React"]);
    await retrieval.expandFromChunks(["obs_react"]);
    await retrieval.temporalQuery("React");
    expect(kv.listCallCount()).toBe(before);
  });

  it("graph-extract maintains the side-indexes after a rebuild", async () => {
    mockProvider.compress.mockResolvedValueOnce(`<entities>
<entity type="file" name="src/index.ts"/>
<entity type="function" name="main"/>
</entities>
<relationships>
<relationship type="uses" source="src/index.ts" target="main" weight="0.9"/>
</relationships>`);

    const kv = mockKV();
    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, mockProvider as never);
    await sdk.trigger("mem::graph-snapshot-rebuild", { force: true });

    await sdk.trigger("mem::graph-extract", {
      observations: [
        {
          id: "obs_new",
          sessionId: "ses_1",
          timestamp: "2026-02-01T10:00:00Z",
          type: "file_edit",
          title: "Edit index file",
          facts: [],
          narrative: "Updated index.ts",
          concepts: [],
          files: ["src/index.ts"],
          importance: 7,
        },
      ],
    });

    const catalog = await loadNameCatalog(kv as never);
    expect(catalog.map((c) => c.name).sort()).toEqual(["main", "src/index.ts"]);

    const before = kv.listCallCount();
    const retrieval = new GraphRetrieval(kv as never);
    const results = await retrieval.searchByEntities(["index"]);
    expect(results.some((r) => r.obsId === "obs_new")).toBe(true);
    expect(kv.listCallCount()).toBe(before);
  });

  it("graph-reset stops indexed retrieval from serving pre-reset rows", async () => {
    const { nodes, edges } = fixtureGraph();
    const kv = await indexedKV(nodes, edges);
    const sdk = mockSdk();
    registerGraphFunction(sdk as never, kv as never, mockProvider as never);

    const retrieval = new GraphRetrieval(kv as never);
    expect((await retrieval.searchByEntities(["React"])).length).toBeGreaterThan(0);

    await sdk.trigger("mem::graph-reset", {});

    expect(await retrieval.searchByEntities(["React"])).toEqual([]);
    expect(await retrieval.expandFromChunks(["obs_react"])).toEqual([]);
    expect((await retrieval.temporalQuery("React")).entity).toBeNull();
    expect(kv.listCallCount()).toBe(0);
  });
});
