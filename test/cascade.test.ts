import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerCascadeFunction } from "../src/functions/cascade.js";
import type { Memory, GraphNode, GraphEdge } from "../src/types.js";
import { mockSdk } from "./helpers/mocks.js";
import { createGraphIndexState } from "./helpers/graph-index-state.js";
import { initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { KV } from "../src/state/schema.js";

const memoryWithSources = (ids: string[]): Memory => ({ id: "superseded", createdAt: "now", updatedAt: "now", type: "fact", title: "old", content: "old", concepts: [], files: [], sessionIds: [], strength: 1, version: 1, isLatest: false, sourceObservationIds: ids });
const graphNode = (id: string, observationId = "source"): GraphNode => ({ id, name: id, type: "concept", createdAt: "now", properties: {}, sourceObservationIds: [observationId] });

describe("Cascade Update Function", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof createGraphIndexState>["kv"];
  let fixture: ReturnType<typeof createGraphIndexState>;

  beforeEach(async () => {
    sdk = mockSdk();
    fixture = createGraphIndexState();
    kv = fixture.kv;
    await initializeGraphIndex(kv, { status: "ready" });
    vi.clearAllMocks();
    registerCascadeFunction(sdk as never, kv as never);
  });

  it("returns error when supersededMemoryId is missing", async () => {
    const result = (await sdk.trigger("mem::cascade-update", {})) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe("supersededMemoryId is required");
  });

  it("returns error for non-existent memory", async () => {
    const result = (await sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_missing",
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBe("superseded memory not found");
  });

  it("flags graph nodes referencing superseded observation IDs", async () => {
    const memory: Memory = {
      id: "mem_old",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "fact",
      title: "Old fact",
      content: "Old content",
      concepts: ["react"],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: false,
      sourceObservationIds: ["obs_a", "obs_b"],
    };
    await kv.set("mem:memories", "mem_old", memory);

    const node: GraphNode = {
      id: "node_1",
      type: "concept",
      name: "react",
      properties: {},
      sourceObservationIds: ["obs_a"],
      createdAt: "2026-03-01T00:00:00Z",
    };
    await kv.set("mem:graph:nodes", "node_1", node);

    const unrelatedNode: GraphNode = {
      id: "node_2",
      type: "file",
      name: "index.ts",
      properties: {},
      sourceObservationIds: ["obs_c"],
      createdAt: "2026-03-01T00:00:00Z",
    };
    await kv.set("mem:graph:nodes", "node_2", unrelatedNode);

    const result = (await sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_old",
    })) as { success: boolean; flagged: { nodes: number; edges: number } };

    expect(result.success).toBe(true);
    expect(result.flagged.nodes).toBe(1);

    const updated = await kv.get<GraphNode>("mem:graph:nodes", "node_1");
    expect(updated!.stale).toBe(true);

    const unchanged = await kv.get<GraphNode>("mem:graph:nodes", "node_2");
    expect(unchanged!.stale).toBeUndefined();
  });

  it("flags graph edges referencing superseded observation IDs", async () => {
    const memory: Memory = {
      id: "mem_old2",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "pattern",
      title: "Old pattern",
      content: "Old pattern content",
      concepts: ["testing"],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: false,
      sourceObservationIds: ["obs_x"],
    };
    await kv.set("mem:memories", "mem_old2", memory);

    const edge: GraphEdge = {
      id: "edge_1",
      type: "uses",
      sourceNodeId: "node_a",
      targetNodeId: "node_b",
      weight: 1,
      sourceObservationIds: ["obs_x", "obs_y"],
      createdAt: "2026-03-01T00:00:00Z",
    };
    await kv.set("mem:graph:edges", "edge_1", edge);

    const result = (await sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_old2",
    })) as { success: boolean; flagged: { edges: number } };

    expect(result.success).toBe(true);
    expect(result.flagged.edges).toBe(1);

    const updated = await kv.get<GraphEdge>("mem:graph:edges", "edge_1");
    expect(updated!.stale).toBe(true);
  });

  it("counts sibling memories sharing 2+ concepts", async () => {
    const superseded: Memory = {
      id: "mem_superseded",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "architecture",
      title: "React architecture",
      content: "Old arch",
      concepts: ["react", "frontend", "typescript"],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: false,
    };
    await kv.set("mem:memories", "mem_superseded", superseded);

    const sibling: Memory = {
      id: "mem_sibling",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "pattern",
      title: "React patterns",
      content: "Sibling memory sharing concepts",
      concepts: ["react", "typescript"],
      files: [],
      sessionIds: [],
      strength: 6,
      version: 1,
      isLatest: true,
    };
    await kv.set("mem:memories", "mem_sibling", sibling);

    const unrelated: Memory = {
      id: "mem_unrelated",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "fact",
      title: "Python setup",
      content: "Unrelated memory",
      concepts: ["python", "backend"],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: true,
    };
    await kv.set("mem:memories", "mem_unrelated", unrelated);

    const result = (await sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_superseded",
    })) as { success: boolean; flagged: { siblingMemories: number }; total: number };

    expect(result.success).toBe(true);
    expect(result.flagged.siblingMemories).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("skips already stale nodes", async () => {
    const memory: Memory = {
      id: "mem_skip",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "fact",
      title: "Skip test",
      content: "Content",
      concepts: [],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: false,
      sourceObservationIds: ["obs_s"],
    };
    await kv.set("mem:memories", "mem_skip", memory);

    const node: GraphNode = {
      id: "node_stale",
      type: "concept",
      name: "already stale",
      properties: {},
      sourceObservationIds: ["obs_s"],
      createdAt: "2026-03-01T00:00:00Z",
      stale: true,
    };
    await kv.set("mem:graph:nodes", "node_stale", node);

    const result = (await sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_skip",
    })) as { success: boolean; flagged: { nodes: number } };

    expect(result.success).toBe(true);
    expect(result.flagged.nodes).toBe(0);
  });

  it("does not flag siblings when fewer than 2 shared concepts", async () => {
    const memory: Memory = {
      id: "mem_one_concept",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "fact",
      title: "One concept",
      content: "Content",
      concepts: ["react"],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: false,
    };
    await kv.set("mem:memories", "mem_one_concept", memory);

    const result = (await sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_one_concept",
    })) as { success: boolean; flagged: { siblingMemories: number } };

    expect(result.success).toBe(true);
    expect(result.flagged.siblingMemories).toBe(0);
  });

  it("returns zero counts when no sourceObservationIds and < 2 concepts", async () => {
    const memory: Memory = {
      id: "mem_empty",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
      type: "fact",
      title: "Empty refs",
      content: "No references",
      concepts: [],
      files: [],
      sessionIds: [],
      strength: 5,
      version: 1,
      isLatest: false,
    };
    await kv.set("mem:memories", "mem_empty", memory);

    const result = (await sdk.trigger("mem::cascade-update", {
      supersededMemoryId: "mem_empty",
    })) as { success: boolean; total: number };

    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
  });

  it("defers legacy graphs without implicit enumeration or snapshot reads", async () => {
    const legacy = createGraphIndexState();
    registerCascadeFunction(sdk as never, legacy.kv);
    await legacy.kv.set(KV.memories, "superseded", memoryWithSources(["source"]));
    legacy.calls.length = 0;
    const result = await sdk.trigger("mem::cascade-update", { supersededMemoryId: "superseded" }) as any;
    expect(result).toMatchObject({ success: true, graphDeferred: true, retryable: true, progressSaved: true, total: 0 });
    expect(legacy.calls.some((c) => c.id === "state::list" || c.scope === KV.graphSnapshot)).toBe(false);
    expect([...legacy.store.get(KV.graphControl)!.keys()].some((key) => key.startsWith("cascade:"))).toBe(true);
  });

  it("drains a high-degree cascade in yielding batches without whole graph reads", async () => {
    await kv.set(KV.memories, "superseded", memoryWithSources(["source"]));
    for (let i = 0; i < 80; i++) await kv.set(KV.graphNodes, `n${i}`, graphNode(`n${i}`));
    fixture.calls.length = 0;
    const result = await sdk.trigger("mem::cascade-update", { supersededMemoryId: "superseded" }) as any;
    expect(result.flagged.nodes).toBe(80); expect(result.graphDeferred).toBe(false);
    expect(fixture.calls.some((c) => c.id === "state::list" || c.scope === KV.graphSnapshot)).toBe(false);
    expect([...fixture.store.get(KV.graphControl)!.keys()].some((key) => key.startsWith("cascade:"))).toBe(false);
  });

  it("continues beyond empty early sources and resumes saved offsets after interruption", async () => {
    const sources = Array.from({ length: 80 }, (_, i) => `o${i}`);
    await kv.set(KV.memories, "superseded", memoryWithSources(sources));
    await kv.set(KV.graphNodes, "last", graphNode("last", sources.at(-1)));
    let savedOffset = false;
    fixture.intercept(async (id, payload) => {
      if (id === "state::set" && payload.scope === KV.graphControl && payload.value?.offset === 64) savedOffset = true;
      else if (savedOffset && id === "state::get" && payload.scope === KV.graphRetrievalControl) throw new Error("offline");
    });
    const first = await sdk.trigger("mem::cascade-update", { supersededMemoryId: "superseded" }) as any;
    fixture.intercept();
    expect(savedOffset).toBe(true);
    expect(first).toMatchObject({ graphDeferred: true, flagged: { nodes: 0 } });
    const restarted = createGraphIndexState(fixture.store); registerCascadeFunction(sdk as never, restarted.kv);
    const second = await sdk.trigger("mem::cascade-update", { supersededMemoryId: "superseded" }) as any;
    expect(second).toMatchObject({ graphDeferred: false, flagged: { nodes: 1 } });
  });

  it.each(["delete", "replace-provenance"])("rechecks a candidate after concurrent %s without resurrecting or staling it", async (change) => {
    await kv.set(KV.memories, "superseded", memoryWithSources(["source"]));
    await kv.set(KV.graphNodes, "candidate", graphNode("candidate"));
    fixture.intercept(async (id, payload) => {
      if (id !== "state::get" || payload.scope !== KV.graphNodes || payload.key !== "candidate") return;
      fixture.intercept();
      if (change === "delete") fixture.store.get(KV.graphNodes)!.delete("candidate");
      else fixture.store.get(KV.graphNodes)!.set("candidate", graphNode("candidate", "other"));
    });
    const result = await sdk.trigger("mem::cascade-update", { supersededMemoryId: "superseded" }) as any;
    expect(result.flagged.nodes).toBe(0);
    const current = await kv.get<GraphNode>(KV.graphNodes, "candidate");
    if (change === "delete") expect(current).toBeNull(); else expect(current?.stale).toBeUndefined();
  });
});
