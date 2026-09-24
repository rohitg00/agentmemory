import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerGraphPruneFunction } from "../src/functions/graph-prune.js";
import type { GraphNode, GraphEdge } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    raw: store,
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
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) throw new Error(`No function: ${input.function_id}`);
      return fn(input.payload);
    },
  };
}

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: "concept",
    name: id,
    properties: {},
    sourceObservationIds: ["obs_1"],
    createdAt: "2026-02-01T10:00:00Z",
    ...over,
  };
}

function edge(id: string, s: string, t: string, over: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id,
    type: "related_to",
    sourceNodeId: s,
    targetNodeId: t,
    weight: 0.5,
    sourceObservationIds: ["obs_1"],
    createdAt: "2026-02-01T10:00:00Z",
    ...over,
  };
}

type Report = {
  staleNodes: number;
  staleEdges: number;
  danglingEdges: number;
  supersededEdges: number;
  oversizedNodes: number;
  droppableSourceIds: number;
  deletedNodes: number;
  deletedEdges: number;
  compactedNodes: number;
  compactedEdges: number;
  errors: number;
};

describe("mem::graph-prune", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const ORIG_MAX = process.env["GRAPH_MAX_SOURCE_IDS"];

  const run = (payload: unknown) =>
    sdk.trigger({ function_id: "mem::graph-prune", payload }) as Promise<Report>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    process.env["GRAPH_MAX_SOURCE_IDS"] = "3";
    registerGraphPruneFunction(sdk as never, kv as never);

    await kv.set("mem:graph:nodes", "live", node("live"));
    await kv.set("mem:graph:nodes", "gone", node("gone", { stale: true }));
    await kv.set(
      "mem:graph:nodes",
      "fat",
      node("fat", {
        sourceObservationIds: ["o1", "o2", "o3", "o4", "o5", "o6"],
      }),
    );
    await kv.set("mem:graph:edges", "keep", edge("keep", "live", "fat"));
    // Endpoint was tombstoned, so this edge can never be traversed.
    await kv.set("mem:graph:edges", "dangling", edge("dangling", "live", "gone"));
  });

  afterEach(() => {
    if (ORIG_MAX === undefined) delete process.env["GRAPH_MAX_SOURCE_IDS"];
    else process.env["GRAPH_MAX_SOURCE_IDS"] = ORIG_MAX;
  });

  it("dry run reports what it would collect and writes nothing", async () => {
    const report = await run({ dryRun: true });

    expect(report.staleNodes).toBe(1);
    expect(report.danglingEdges).toBe(1);
    expect(report.oversizedNodes).toBe(1);
    expect(report.droppableSourceIds).toBe(3);
    expect(report.deletedNodes).toBe(0);
    expect(report.compactedNodes).toBe(0);

    expect((await kv.list("mem:graph:nodes")).length).toBe(3);
    expect((await kv.list("mem:graph:edges")).length).toBe(2);
  });

  it("deletes stale nodes and edges that can never be traversed", async () => {
    const report = await run({ dryRun: false });

    expect(report.errors).toBe(0);
    expect(report.deletedNodes).toBe(1);
    expect(report.deletedEdges).toBe(1);

    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    const edges = await kv.list<GraphEdge>("mem:graph:edges");
    expect(nodes.map((n) => n.id).sort()).toEqual(["fat", "live"]);
    expect(edges.map((e) => e.id)).toEqual(["keep"]);
  });

  it("leaves provenance alone unless compaction is asked for", async () => {
    await run({ dryRun: false });
    const fat = await kv.get<GraphNode>("mem:graph:nodes", "fat");
    expect(fat!.sourceObservationIds.length).toBe(6);
  });

  it("compacts oversized provenance to the newest ids", async () => {
    const report = await run({ dryRun: false, compactSourceIds: true });

    expect(report.compactedNodes).toBe(1);
    expect(report.errors).toBe(0);

    const fat = await kv.get<GraphNode>("mem:graph:nodes", "fat");
    expect(fat!.sourceObservationIds).toEqual(["o4", "o5", "o6"]);
  });

  it("is idempotent: a second pass finds nothing left", async () => {
    await run({ dryRun: false, compactSourceIds: true });
    const second = await run({ dryRun: true });

    expect(second.staleNodes).toBe(0);
    expect(second.danglingEdges).toBe(0);
    expect(second.oversizedNodes).toBe(0);
    expect(second.droppableSourceIds).toBe(0);
  });
});
