import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { persistGraphDelta } from "../src/functions/graph.js";
import { KV } from "../src/state/schema.js";
import type { GraphNode, GraphEdge, GraphSnapshot } from "../src/types.js";

function clone<T>(value: T): T {
  return value === null || value === undefined
    ? value
    : (JSON.parse(JSON.stringify(value)) as T);
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  let gate: {
    scope: string;
    key: string;
    release: () => void;
    promise: Promise<void>;
  } | null = null;

  return {
    store,
    armGetGate: (scope: string, key: string) => {
      let release!: () => void;
      const promise = new Promise<void>((res) => {
        release = res;
      });
      gate = { scope, key, release, promise };
      return release;
    },
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      const value = clone((store.get(scope)?.get(key) as T) ?? null);
      if (gate && gate.scope === scope && gate.key === key) {
        const g = gate;
        gate = null;
        await g.promise;
      }
      return value;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      const stored = clone(data);
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, stored);
      return clone(stored);
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? clone(Array.from(m.values()) as T[]) : [];
    },
  };
}

function node(overrides: Partial<GraphNode> & { id: string; name: string }): GraphNode {
  return {
    type: "file",
    properties: {},
    sourceObservationIds: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("persistGraphDelta concurrent merges (finding 7)", () => {
  it("does not create duplicate nodes when two concurrent extractions resolve the same (type, name) key", async () => {
    const kv = mockKV();

    const nameIndexKey = "file|src/index.ts";
    const releaseNameIndexRead = kv.armGetGate(KV.graphNameIndex, nameIndexKey);

    const nodeA = node({
      id: "node_a",
      name: "src/index.ts",
      sourceObservationIds: ["obs_a"],
    });
    const promiseA = persistGraphDelta(kv as never, [nodeA], [], ["obs_a"]);

    await flush();

    const nodeB = node({
      id: "node_b",
      name: "src/index.ts",
      sourceObservationIds: ["obs_b"],
    });
    const promiseB = persistGraphDelta(kv as never, [nodeB], [], ["obs_b"]);

    await flush();
    releaseNameIndexRead();

    await Promise.all([promiseA, promiseB]);

    const allNodes = await kv.list<GraphNode>(KV.graphNodes);
    expect(allNodes.length).toBe(1);

    const merged = allNodes[0];
    expect(merged.sourceObservationIds.sort()).toEqual(["obs_a", "obs_b"]);

    const snapshot = (await kv.get<GraphSnapshot>(
      KV.graphSnapshot,
      "current",
    )) as GraphSnapshot;
    expect(snapshot.stats.totalNodes).toBe(1);
  });

  it("does not lose either batch's obsIds when merging into an existing node concurrently", async () => {
    const kv = mockKV();

    const existing: GraphNode = node({
      id: "node_existing",
      name: "src/utils.ts",
      sourceObservationIds: ["obs_seed"],
    });
    await kv.set(KV.graphNodes, "node_existing", existing);
    await kv.set(KV.graphNameIndex, "file|src/utils.ts", "node_existing");
    await kv.set(KV.graphNodeDegree, "node_existing", 0);
    await kv.set(KV.graphSnapshot, "current", {
      version: 1,
      topNodes: [existing],
      topEdges: [],
      topDegrees: {},
      stats: {
        totalNodes: 1,
        totalEdges: 0,
        nodesByType: { file: 1 },
        edgesByType: {},
      },
      updatedAt: new Date().toISOString(),
      dirty: false,
    } satisfies GraphSnapshot);

    const releaseExistingNodeRead = kv.armGetGate(KV.graphNodes, "node_existing");

    const nodeA = node({
      id: "node_a2",
      name: "src/utils.ts",
      sourceObservationIds: ["obs_x"],
    });
    const promiseA = persistGraphDelta(kv as never, [nodeA], [], ["obs_x"]);

    await flush();

    const nodeB = node({
      id: "node_b2",
      name: "src/utils.ts",
      sourceObservationIds: ["obs_y"],
    });
    const promiseB = persistGraphDelta(kv as never, [nodeB], [], ["obs_y"]);

    await flush();
    releaseExistingNodeRead();

    await Promise.all([promiseA, promiseB]);

    const allNodes = await kv.list<GraphNode>(KV.graphNodes);
    expect(allNodes.length).toBe(1);
    expect(allNodes[0].sourceObservationIds.sort()).toEqual([
      "obs_seed",
      "obs_x",
      "obs_y",
    ]);
  });
});
