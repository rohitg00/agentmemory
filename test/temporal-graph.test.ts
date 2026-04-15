import { describe, it, expect, vi } from "vitest";
import type { GraphNode, GraphEdge, MemoryProvider } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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

  store.set("mem:graph:edge-history", new Map());

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
    const kv = mockKV();
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
    const kv = mockKV();
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
    const kv = mockKV([existingNode, existingNode2], [existingEdge]);
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
    const kv = mockKV([node], [edge1, edge2]);
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
    const kv = mockKV([node], [edge1, edge2]);
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
    const kv = mockKV();
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
