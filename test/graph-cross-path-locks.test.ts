import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { persistGraphDelta } from "../src/functions/graph.js";
import { registerCascadeFunction } from "../src/functions/cascade.js";
import { KV } from "../src/state/schema.js";
import type { GraphNode, GraphSnapshot, Memory } from "../src/types.js";

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

function mockSdk() {
  const fns = new Map<string, (data: unknown) => Promise<unknown>>();
  return {
    registerFunction: (id: string, handler: (data: unknown) => Promise<unknown>) => {
      fns.set(id, handler);
    },
    trigger: (id: string, data: unknown) => fns.get(id)!(data),
  };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("graph:persist serializes cross-path graph mutations", () => {
  it("does not lose cascade's stale flag or persistGraphDelta's merge when they race on the same node", async () => {
    const kv = mockKV();

    const node: GraphNode = {
      id: "node_1",
      type: "concept",
      name: "react",
      properties: {},
      sourceObservationIds: ["obs_old"],
      createdAt: "2026-03-01T00:00:00Z",
    };
    await kv.set(KV.graphNodes, "node_1", node);
    await kv.set(KV.graphNameIndex, "concept|react", "node_1");
    await kv.set(KV.graphNodeDegree, "node_1", 0);
    await kv.set(KV.graphSnapshot, "current", {
      version: 1,
      topNodes: [node],
      topEdges: [],
      topDegrees: {},
      stats: {
        totalNodes: 1,
        totalEdges: 0,
        nodesByType: { concept: 1 },
        edgesByType: {},
      },
      updatedAt: new Date().toISOString(),
      dirty: false,
    } satisfies GraphSnapshot);

    const supersededMemory: Memory = {
      id: "mem_old",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "fact",
      title: "Old fact",
      content: "Old content",
      concepts: [],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: false,
      sourceObservationIds: ["obs_old"],
    };
    await kv.set(KV.memories, "mem_old", supersededMemory);

    const sdk = mockSdk();
    registerCascadeFunction(sdk as never, kv as never);

    const releaseNodeRowRead = kv.armGetGate(KV.graphNodes, "node_1");

    const incomingNode: GraphNode = {
      id: "node_new",
      type: "concept",
      name: "react",
      properties: {},
      sourceObservationIds: ["obs_new"],
      createdAt: new Date().toISOString(),
    };
    const persistPromise = persistGraphDelta(
      kv as never,
      [incomingNode],
      [],
      ["obs_new"],
    );

    await flush();

    const cascadePromise = sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_old",
    }) as Promise<{ success: boolean; flagged: { nodes: number } }>;

    await flush();
    releaseNodeRowRead();

    const [, cascadeResult] = await Promise.all([persistPromise, cascadePromise]);

    expect(cascadeResult.success).toBe(true);
    expect(cascadeResult.flagged.nodes).toBe(1);

    const finalNode = await kv.get<GraphNode>(KV.graphNodes, "node_1");
    expect(finalNode!.stale).toBe(true);
    expect(finalNode!.sourceObservationIds.sort()).toEqual(["obs_new", "obs_old"]);
  });
});
