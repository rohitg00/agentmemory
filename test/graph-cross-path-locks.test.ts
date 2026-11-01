import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { persistGraphDelta } from "../src/functions/graph.js";
import { registerCascadeFunction } from "../src/functions/cascade.js";
import { KV } from "../src/state/schema.js";
import { createGraphIndexReader, initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import type { GraphNode, GraphSnapshot, Memory } from "../src/types.js";
import { createGraphIndexState } from "./helpers/graph-index-state.js";

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
    const fixture = createGraphIndexState();
    const { kv } = fixture;
    await initializeGraphIndex(kv, { status: "ready" });

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

    let releaseNodeRowRead!: () => void;
    let enteredNodeRowRead!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseNodeRowRead = resolve; });
    const entered = new Promise<void>((resolve) => { enteredNodeRowRead = resolve; });
    fixture.intercept(async (id, payload) => {
      if (id !== "state::get" || payload.scope !== KV.graphNodes || payload.key !== "node_1") return;
      fixture.intercept();
      enteredNodeRowRead();
      await blocked;
    });

    const incomingNode: GraphNode = {
      id: "node_new",
      type: "concept",
      name: "react",
      properties: {},
      sourceObservationIds: ["obs_new"],
      createdAt: new Date().toISOString(),
    };
    const persistPromise = persistGraphDelta(
      kv,
      [incomingNode],
      [],
    );

    await entered;

    let cascadeSettled = false;
    const cascadePromise = sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_old",
    }).then((value) => {
      cascadeSettled = true;
      return value as { success: boolean; graphDeferred: boolean; flagged: { nodes: number } };
    });

    try {
      await flush();
      expect(cascadeSettled).toBe(false);
    } finally {
      releaseNodeRowRead();
    }

    const [, cascadeResult] = await Promise.all([persistPromise, cascadePromise]);

    expect(cascadeResult.success).toBe(true);
    expect(cascadeResult.graphDeferred).toBe(false);
    expect(cascadeResult.flagged.nodes).toBe(1);

    const finalNode = await kv.get<GraphNode>(KV.graphNodes, "node_1");
    expect(finalNode!.stale).toBe(true);
    expect(finalNode!.sourceObservationIds.sort()).toEqual(["obs_new", "obs_old"]);
    const reader = (await createGraphIndexReader(kv))!;
    expect(await reader.getNode("node_1")).toBeNull();
    expect((await reader.posting("observation", "obs_old")).ids).toEqual([]);
    expect(await reader.finish()).toBe(true);
  });
});
