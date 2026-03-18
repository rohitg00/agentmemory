import { describe, it, expect, beforeEach } from "vitest";
import { GraphRetrieval } from "../src/functions/graph-retrieval.js";
import type { GraphNode, GraphEdge } from "../src/types.js";

function mockKV(
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
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
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
    const kv = mockKV(nodes, []);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["React"]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].obsId).toBe("obs_1");
  });

  it("finds entities by partial name match", async () => {
    const nodes = [makeNode("n1", "auth-middleware", "function", ["obs_1"])];
    const kv = mockKV(nodes, []);
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
    const kv = mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["React"], 2);
    const obsIds = results.map((r) => r.obsId);
    expect(obsIds).toContain("obs_1");
    expect(obsIds).toContain("obs_2");
  });

  it("returns empty for no matches", async () => {
    const kv = mockKV([], []);
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
    const kv = mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.expandFromChunks(["obs_1"]);
    const obsIds = results.map((r) => r.obsId);
    expect(obsIds).toContain("obs_2");
  });

  it("does not duplicate already-seen observations in expansion", async () => {
    const nodes = [makeNode("n1", "file.ts", "file", ["obs_1", "obs_2"])];
    const kv = mockKV(nodes, []);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.expandFromChunks(["obs_1"]);
    const obsIds = results.map((r) => r.obsId);
    expect(obsIds).not.toContain("obs_1");
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
    const kv = mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const result = await retrieval.temporalQuery("Alice");
    expect(result.entity).toBeDefined();
    expect(result.entity!.name).toBe("Alice");
    expect(result.currentState.length).toBeGreaterThan(0);
  });

  it("returns null entity for unknown name", async () => {
    const kv = mockKV([], []);
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
    const kv = mockKV(nodes, edges);
    const retrieval = new GraphRetrieval(kv as never);

    const results = await retrieval.searchByEntities(["React"], 3);
    const directScore = results.find((r) => r.obsId === "obs_1")?.score ?? 0;
    const indirectScore = results.find((r) => r.obsId === "obs_3")?.score ?? 0;
    expect(directScore).toBeGreaterThan(indirectScore);
  });
});
