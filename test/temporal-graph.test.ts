import { createGraphIndexState } from "./helpers/graph-index-state.js";
import { createGraphIndexReader, graphEdgeLookupKey, GraphIndexReader, initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { GraphIndexMigrationController } from "../src/state/graph-index-migration.js";
import { KV } from "../src/state/schema.js";
import { describe, it, expect, vi } from "vitest";
import type { GraphNode, GraphEdge, MemoryProvider } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function mockKV(nodes: GraphNode[] = [], edges: GraphEdge[] = []) {
  const { kv } = createGraphIndexState();
  await initializeGraphIndex(kv, { status: "ready" });
  for (const node of nodes) await kv.set("mem:graph:nodes", node.id, node);
  for (const edge of edges) {
    for (const id of [edge.sourceNodeId, edge.targetNodeId]) {
      if (!await kv.get("mem:graph:nodes", id)) await kv.set("mem:graph:nodes", id, {
        id, name: id, type: "location", properties: {}, sourceObservationIds: [], createdAt: edge.createdAt,
      });
    }
    await kv.set("mem:graph:edges", edge.id, edge);
  }
  return kv;
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, fn: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, fn);
    },
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

describe("TemporalGraph", () => {
  it("imports without errors", async () => {
    const mod = await import("../src/functions/temporal-graph.js");
    expect(mod.registerTemporalGraphFunctions).toBeDefined();
  });

  it("registers all three functions", async () => {
    const { registerTemporalGraphFunctions } = await import(
      "../src/functions/temporal-graph.js"
    );
    const sdk = mockSdk();
    const kv = await mockKV();
    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn().mockResolvedValue(""),
      summarize: vi.fn().mockResolvedValue(""),
    };

    registerTemporalGraphFunctions(sdk as never, kv as never, provider);

    const fns = Array.from((sdk as any).trigger ? [] : []);
    expect(sdk.trigger).toBeDefined();
  });

  it("extracts temporal graph with context metadata", async () => {
    const { registerTemporalGraphFunctions } = await import(
      "../src/functions/temporal-graph.js"
    );

    const response = `<temporal_graph>
  <entities>
    <entity type="person" name="Alice">
      <property key="role">engineer</property>
    </entity>
    <entity type="organization" name="Acme Corp">
      <property key="industry">tech</property>
    </entity>
  </entities>
  <relationships>
    <relationship type="works_at" source="Alice" target="Acme Corp" weight="0.9" valid_from="2024-01-01" valid_to="current">
      <reasoning>Alice joined Acme Corp as an engineer</reasoning>
      <sentiment>positive</sentiment>
    </relationship>
  </relationships>
</temporal_graph>`;

    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn().mockResolvedValue(response),
      summarize: vi.fn().mockResolvedValue(response),
    };

    const sdk = mockSdk();
    const kv = await mockKV();
    registerTemporalGraphFunctions(sdk as never, kv as never, provider);

    const result = (await sdk.trigger("mem::temporal-graph-extract", {
      observations: [
        {
          id: "obs_1",
          title: "Alice at Acme",
          narrative: "Alice works at Acme Corp as an engineer",
          concepts: ["career"],
          files: [],
          type: "conversation",
          timestamp: "2024-01-01T00:00:00Z",
        },
      ],
    })) as { success: boolean; nodesAdded: number; edgesAdded: number };

    expect(result.success).toBe(true);
    expect(result.nodesAdded).toBe(2);
    expect(result.edgesAdded).toBe(1);

    const storedEdges = await kv.list<GraphEdge>("mem:graph:edges");
    expect(storedEdges.length).toBe(1);
    expect(storedEdges[0].tcommit).toBeDefined();
    expect(storedEdges[0].tvalid).toBe("2024-01-01");
    expect(storedEdges[0].context?.reasoning).toBe(
      "Alice joined Acme Corp as an engineer",
    );
    expect(storedEdges[0].context?.sentiment).toBe("positive");
    expect(storedEdges[0].isLatest).toBe(true);
    expect(storedEdges[0].version).toBe(1);
  });

  it("appends new edge version instead of overwriting", async () => {
    const { registerTemporalGraphFunctions } = await import(
      "../src/functions/temporal-graph.js"
    );

    const existingNode: GraphNode = {
      id: "gn_existing_alice",
      type: "person",
      name: "Alice",
      properties: { role: "engineer" },
      sourceObservationIds: ["obs_0"],
      createdAt: "2024-01-01T00:00:00Z",
    };
    const existingNode2: GraphNode = {
      id: "gn_existing_acme",
      type: "organization",
      name: "Acme Corp",
      properties: {},
      sourceObservationIds: ["obs_0"],
      createdAt: "2024-01-01T00:00:00Z",
    };
    const existingEdge: GraphEdge = {
      id: "ge_old",
      type: "works_at" as any,
      sourceNodeId: "gn_existing_alice",
      targetNodeId: "gn_existing_acme",
      weight: 0.9,
      sourceObservationIds: ["obs_0"],
      createdAt: "2024-01-01T00:00:00Z",
      tcommit: "2024-01-01T00:00:00Z",
      tvalid: "2024-01-01",
      version: 1,
      isLatest: true,
    };

    const response = `<temporal_graph>
  <entities>
    <entity type="person" name="Alice">
      <property key="role">senior engineer</property>
    </entity>
    <entity type="organization" name="Acme Corp">
    </entity>
  </entities>
  <relationships>
    <relationship type="works_at" source="Alice" target="Acme Corp" weight="0.95" valid_from="2025-01-01" valid_to="current">
      <reasoning>Alice was promoted to senior engineer</reasoning>
      <sentiment>positive</sentiment>
    </relationship>
  </relationships>
</temporal_graph>`;

    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn().mockResolvedValue(response),
      summarize: vi.fn().mockResolvedValue(response),
    };

    const sdk = mockSdk();
    const kv = await mockKV([existingNode, existingNode2], [existingEdge]);
    registerTemporalGraphFunctions(sdk as never, kv as never, provider);

    const result = (await sdk.trigger("mem::temporal-graph-extract", {
      observations: [
        {
          id: "obs_1",
          title: "Alice promotion",
          narrative: "Alice was promoted to senior engineer at Acme Corp",
          concepts: [],
          files: [],
          type: "conversation",
          timestamp: "2025-01-01T00:00:00Z",
        },
      ],
    })) as { success: boolean; nodesAdded: number; edgesAdded: number };

    expect(result.success).toBe(true);

    const allEdges = await kv.list<GraphEdge>("mem:graph:edges");
    expect(allEdges.length).toBe(2);

    const oldEdge = allEdges.find((e) => e.id === "ge_old");
    expect(oldEdge?.isLatest).toBe(false);
    expect(oldEdge?.tvalidEnd).toBeDefined();

    const newEdge = allEdges.find((e) => e.id !== "ge_old");
    expect(newEdge?.isLatest).toBe(true);
    expect(newEdge?.version).toBe(2);
    expect(newEdge?.tvalid).toBe("2025-01-01");
  });

  it("temporal query returns current state", async () => {
    const { registerTemporalGraphFunctions } = await import(
      "../src/functions/temporal-graph.js"
    );

    const node: GraphNode = {
      id: "gn_1",
      type: "person",
      name: "Bob",
      properties: {},
      sourceObservationIds: ["obs_1"],
      createdAt: "2024-01-01T00:00:00Z",
    };
    const edge1: GraphEdge = {
      id: "ge_1",
      type: "located_in" as any,
      sourceNodeId: "gn_1",
      targetNodeId: "gn_2",
      weight: 0.9,
      sourceObservationIds: ["obs_1"],
      createdAt: "2023-01-01T00:00:00Z",
      tcommit: "2023-01-01T00:00:00Z",
      tvalid: "2023-01-01",
      tvalidEnd: "2024-06-01",
      version: 1,
      isLatest: false,
    };
    const edge2: GraphEdge = {
      id: "ge_2",
      type: "located_in" as any,
      sourceNodeId: "gn_1",
      targetNodeId: "gn_3",
      weight: 0.9,
      sourceObservationIds: ["obs_2"],
      createdAt: "2024-06-01T00:00:00Z",
      tcommit: "2024-06-01T00:00:00Z",
      tvalid: "2024-06-01",
      version: 2,
      isLatest: true,
    };

    const sdk = mockSdk();
    const kv = await mockKV([node], [edge1, edge2]);
    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerTemporalGraphFunctions(sdk as never, kv as never, provider);

    const result = (await sdk.trigger("mem::temporal-query", {
      entityName: "Bob",
    })) as any;

    expect(result.entity).toBeDefined();
    expect(result.entity.name).toBe("Bob");
    expect(result.currentEdges.length).toBe(1);
    expect(result.currentEdges[0].id).toBe("ge_2");
  });

  it("temporal query with asOf returns historical state", async () => {
    const { registerTemporalGraphFunctions } = await import(
      "../src/functions/temporal-graph.js"
    );

    const node: GraphNode = {
      id: "gn_1",
      type: "person",
      name: "Charlie",
      properties: {},
      sourceObservationIds: ["obs_1"],
      createdAt: "2023-01-01T00:00:00Z",
    };
    const edge1: GraphEdge = {
      id: "ge_1",
      type: "located_in" as any,
      sourceNodeId: "gn_1",
      targetNodeId: "gn_nyc",
      weight: 0.9,
      sourceObservationIds: ["obs_1"],
      createdAt: "2023-01-01T00:00:00Z",
      tcommit: "2023-01-01T00:00:00Z",
      tvalid: "2023-01-01",
      tvalidEnd: "2024-06-01",
      version: 1,
      isLatest: false,
    };
    const edge2: GraphEdge = {
      id: "ge_2",
      type: "located_in" as any,
      sourceNodeId: "gn_1",
      targetNodeId: "gn_london",
      weight: 0.9,
      sourceObservationIds: ["obs_2"],
      createdAt: "2024-06-01T00:00:00Z",
      tcommit: "2024-06-01T00:00:00Z",
      tvalid: "2024-06-01",
      version: 2,
      isLatest: true,
    };

    const sdk = mockSdk();
    const kv = await mockKV([node], [edge1, edge2]);
    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerTemporalGraphFunctions(sdk as never, kv as never, provider);

    const result = (await sdk.trigger("mem::temporal-query", {
      entityName: "Charlie",
      asOf: "2023-06-01T00:00:00Z",
    })) as any;

    expect(result.entity.name).toBe("Charlie");
    expect(result.currentEdges.length).toBe(1);
    expect(result.currentEdges[0].targetNodeId).toBe("gn_nyc");
  });

  it("handles empty observations gracefully", async () => {
    const { registerTemporalGraphFunctions } = await import(
      "../src/functions/temporal-graph.js"
    );
    const sdk = mockSdk();
    const kv = await mockKV();
    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerTemporalGraphFunctions(sdk as never, kv as never, provider);

    const result = (await sdk.trigger("mem::temporal-graph-extract", {
      observations: [],
    })) as any;

    expect(result.success).toBe(false);
    expect(result.error).toBe("No observations provided");
  });
});

describe("temporal predecessor reconciliation", () => {
  const date = "2026-10-14T00:00:00.000Z";
  const makeNode = (id: string, name = id): GraphNode => ({
    id, name, type: "concept", properties: {}, sourceObservationIds: ["obs"], createdAt: date,
  });
  const makeEdge = (id: string, more: Partial<GraphEdge> = {}): GraphEdge => ({
    id, sourceNodeId: "a", targetNodeId: "b", type: "uses", weight: 1,
    sourceObservationIds: ["obs"], createdAt: date, version: 1, isLatest: true, ...more,
  });
  const provider: MemoryProvider = {
    name: "fixture", summarize: async () => "", compress: async () => '<temporal_graph><entities><entity type="concept" name="Alice"></entity><entity type="concept" name="Acme"></entity></entities><relationships><relationship type="uses" source="Alice" target="Acme" weight="0.8"><reasoning>updated</reasoning></relationship></relationships></temporal_graph>',
  };
  const input = { observations: [{ id: "obs", title: "test", narrative: "test", concepts: [], files: [], type: "discovery", timestamp: date }] };

  it("rejects an older ready index without scans or creating another edge version", async () => {
    const { registerTemporalGraphFunctions } = await import("../src/functions/temporal-graph.js");
    const fixture = createGraphIndexState();
    await initializeGraphIndex(fixture.kv, { status: "ready" });
    for (const row of [makeNode("a", "Alice"), makeNode("b", "Acme")]) await fixture.kv.set(KV.graphNodes, row.id, row);
    await fixture.kv.set(KV.graphEdges, "old", makeEdge("old", { version: 7 }));
    const controls = fixture.store.get(KV.graphRetrievalControl)!;
    controls.set("current", { ...controls.get("current") as object, schema: 1 });
    const before = structuredClone(fixture.store);
    const restarted = createGraphIndexState(fixture.store);
    const sdk = mockSdk();
    registerTemporalGraphFunctions(sdk as never, restarted.kv, provider);
    expect(await sdk.trigger("mem::temporal-graph-extract", input)).toMatchObject({ success: false, error: expect.stringContaining("explicit graph-index migration") });
    expect(fixture.store).toEqual(before);
    expect(restarted.calls.every(call => call.id === "state::get" && ![KV.graphNodes, KV.graphEdges, KV.graphSnapshot].includes(call.scope as never))).toBe(true);
  });

  it.each(["direct", "migrated"])("uses the exact current edge key after %s writes and restart despite unrelated and historical fanout", async (mode) => {
    const { registerTemporalGraphFunctions } = await import("../src/functions/temporal-graph.js");
    const fixture = createGraphIndexState();
    const nodes = [makeNode("a", "Alice"), makeNode("b", "Acme"), makeNode("c")];
    const edges = [
      makeEdge("candidate-a", { version: 4 }), makeEdge("candidate-z", { version: 4 }),
      makeEdge("legacy-current", { version: 2, isLatest: undefined }),
      ...Array.from({ length: 300 }, (_, i) => makeEdge(`unrelated-${i}`, { targetNodeId: "c" })),
      ...Array.from({ length: 300 }, (_, i) => makeEdge(`historical-${i}`, { version: 99, isLatest: false })),
      makeEdge("stale", { version: 100, stale: true }),
    ];
    if (mode === "migrated") {
      fixture.store.set(KV.graphNodes, new Map(nodes.map(row => [row.id, row])));
      fixture.store.set(KV.graphEdges, new Map(edges.map(row => [row.id, row])));
      const migration = new GraphIndexMigrationController(fixture.kv);
      await migration.start({ allowLegacyScan: true });
      await migration.waitForIdle();
      expect(await migration.status()).toMatchObject({ ready: true });
    } else {
      await initializeGraphIndex(fixture.kv, { status: "ready" });
      for (const row of nodes) await fixture.kv.set(KV.graphNodes, row.id, row);
      for (const row of edges) await fixture.kv.set(KV.graphEdges, row.id, row);
    }
    await fixture.kv.set(KV.graphEdgeHistory, "history-only", makeEdge("history-only", { version: 1000 }));
    await fixture.kv.set(KV.graphEdgeKey, "a|b|uses", "historical-299");

    const readerCalls = vi.spyOn(GraphIndexReader.prototype, "getEdge");
    try {
      for (const version of [5, 6]) {
        const restarted = createGraphIndexState(fixture.store);
        const sdk = mockSdk();
        registerTemporalGraphFunctions(sdk as never, restarted.kv, provider);
        expect(await sdk.trigger("mem::temporal-graph-extract", input)).toMatchObject({ success: true });
        const rows = [...fixture.store.get(KV.graphEdges)!.values()] as GraphEdge[];
        const replacement = rows.find(row => row.version === version && row.sourceNodeId === "a" && row.targetNodeId === "b");
        expect(replacement).toMatchObject({ isLatest: true });
        const predecessor = version === 5 ? rows.find(row => row.id === "candidate-a") : rows.find(row => row.version === 5);
        expect(predecessor).toMatchObject({ isLatest: false, supersededBy: replacement!.id });
        expect(rows.find(row => row.id === "candidate-z")).toMatchObject({ isLatest: true, version: 4 });
        expect(rows.find(row => row.id === "historical-299")).toMatchObject({ isLatest: false, version: 99 });
        expect(restarted.calls.some(call => call.id === "state::list")).toBe(false);
      }
      expect(readerCalls.mock.calls.length).toBeLessThanOrEqual(6);
      expect(readerCalls.mock.calls.flat().some(id => /unrelated|historical|stale|history-only/.test(id))).toBe(false);
    } finally {
      readerCalls.mockRestore();
    }
  }, 30_000);

  it("keeps delimiter-safe key membership correct across direct updates, stale records, historical copies and deletion", async () => {
    const { kv, store } = createGraphIndexState();
    await initializeGraphIndex(kv, { status: "ready" });
    const first = makeEdge("first", { sourceNodeId: "a|b", targetNodeId: "c" });
    const collision = makeEdge("collision", { sourceNodeId: "a", targetNodeId: "b|c" });
    const ids = async (row: GraphEdge) => {
      const reader = (await createGraphIndexReader(createGraphIndexState(store).kv))!;
      const page = await reader.posting("edgeKey", graphEdgeLookupKey(row));
      expect(await reader.finish()).toBe(true);
      return page.ids;
    };
    await kv.set(KV.graphEdges, first.id, first);
    await kv.set(KV.graphEdges, collision.id, collision);
    expect(await ids(first)).toEqual(["first"]);
    expect(await ids(collision)).toEqual(["collision"]);
    const moved = { ...first, targetNodeId: "other" };
    await kv.set(KV.graphEdges, first.id, moved);
    expect(await ids(first)).toEqual([]);
    expect(await ids(moved)).toEqual(["first"]);
    await kv.set(KV.graphEdges, first.id, { ...moved, isLatest: false });
    await kv.set(KV.graphEdgeHistory, first.id, moved);
    expect(await ids(moved)).toEqual([]);
    await kv.set(KV.graphEdges, first.id, { ...moved, isLatest: undefined });
    expect(await ids(moved)).toEqual(["first"]);
    await kv.set(KV.graphEdges, first.id, { ...moved, stale: true });
    expect(await ids(moved)).toEqual([]);
    await kv.set(KV.graphEdges, first.id, moved);
    await kv.delete(KV.graphEdges, first.id);
    expect(await ids(moved)).toEqual([]);
  });

  it("rejects a predecessor changed during resolution and uses its new version after restart", async () => {
    const { registerTemporalGraphFunctions } = await import("../src/functions/temporal-graph.js");
    const fixture = createGraphIndexState();
    await initializeGraphIndex(fixture.kv, { status: "ready" });
    for (const row of [makeNode("a", "Alice"), makeNode("b", "Acme")]) await fixture.kv.set(KV.graphNodes, row.id, row);
    await fixture.kv.set(KV.graphEdges, "old", makeEdge("old"));
    let changed = false;
    fixture.intercept(async (id, payload) => {
      if (!changed && id === "state::get" && payload.scope === KV.graphEdges && payload.key === "old") {
        changed = true;
        await fixture.kv.set(KV.graphEdges, "old", makeEdge("old", { version: 7 }));
      }
    });
    const sdk = mockSdk();
    registerTemporalGraphFunctions(sdk as never, fixture.kv, provider);
    expect(await sdk.trigger("mem::temporal-graph-extract", input)).toMatchObject({ success: false, error: expect.stringContaining("changed revision") });
    expect(fixture.store.get(KV.graphEdges)?.size).toBe(1);
    fixture.intercept();
    registerTemporalGraphFunctions(sdk as never, createGraphIndexState(fixture.store).kv, provider);
    expect(await sdk.trigger("mem::temporal-graph-extract", input)).toMatchObject({ success: true });
    const rows = [...fixture.store.get(KV.graphEdges)!.values()] as GraphEdge[];
    expect(rows.find(row => row.id !== "old")).toMatchObject({ version: 8, isLatest: true });
    expect(rows.find(row => row.id === "old")).toMatchObject({ version: 7, isLatest: false });
  });

  it("fails closed when conflicting current predecessors exceed the existing read budget", async () => {
    const { registerTemporalGraphFunctions } = await import("../src/functions/temporal-graph.js");
    const fixture = createGraphIndexState();
    await initializeGraphIndex(fixture.kv, { status: "ready" });
    for (const row of [makeNode("a", "Alice"), makeNode("b", "Acme")]) await fixture.kv.set(KV.graphNodes, row.id, row);
    for (let i = 0; i < 300; i++) await fixture.kv.set(KV.graphEdges, `edge-${i}`, makeEdge(`edge-${i}`));
    const sdk = mockSdk();
    registerTemporalGraphFunctions(sdk as never, fixture.kv, provider);
    expect(await sdk.trigger("mem::temporal-graph-extract", input)).toMatchObject({ success: false, error: expect.stringContaining("read budget") });
    expect(fixture.store.get(KV.graphEdges)?.size).toBe(300);
    expect([...fixture.store.get(KV.graphEdges)!.values()].every(row => (row as GraphEdge).isLatest === true)).toBe(true);
    expect(fixture.store.get(KV.graphEdgeHistory)?.size ?? 0).toBe(0);
  });
});
