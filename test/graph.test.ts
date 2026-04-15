import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerGraphFunction } from "../src/functions/graph.js";
import type {
  CompressedObservation,
  GraphNode,
  GraphEdge,
  GraphQueryResult,
} from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
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
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

const mockProvider = {
  name: "test",
  compress: vi.fn().mockResolvedValue(`<entities>
<entity type="file" name="src/index.ts"><property key="path">src/index.ts</property></entity>
<entity type="function" name="main"><property key="lang">typescript</property></entity>
</entities>
<relationships>
<relationship type="uses" source="src/index.ts" target="main" weight="0.9"/>
</relationships>`),
  summarize: vi.fn(),
};

const testObs: CompressedObservation = {
  id: "obs_1",
  sessionId: "ses_1",
  timestamp: "2026-02-01T10:00:00Z",
  type: "file_edit",
  title: "Edit index file",
  facts: ["Modified main function"],
  narrative: "Updated index.ts with main function",
  concepts: ["typescript", "entry-point"],
  files: ["src/index.ts"],
  importance: 7,
};

describe("Graph Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    vi.clearAllMocks();
    registerGraphFunction(sdk as never, kv as never, mockProvider as never);
  });

  it("graph-extract creates nodes and edges from XML response", async () => {
    const result = (await sdk.trigger("mem::graph-extract", {
      observations: [testObs],
    })) as { success: boolean; nodesAdded: number; edgesAdded: number };

    expect(result.success).toBe(true);
    expect(result.nodesAdded).toBe(2);
    expect(result.edgesAdded).toBe(1);

    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    expect(nodes.length).toBe(2);
    expect(nodes.find((n) => n.name === "src/index.ts")).toBeDefined();
    expect(nodes.find((n) => n.name === "main")).toBeDefined();

    const edges = await kv.list<GraphEdge>("mem:graph:edges");
    expect(edges.length).toBe(1);
    expect(edges[0].type).toBe("uses");
  });

  it("graph-query with search returns matching nodes", async () => {
    await sdk.trigger("mem::graph-extract", { observations: [testObs] });

    const result = (await sdk.trigger("mem::graph-query", {
      query: "index",
    })) as GraphQueryResult;

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.nodes.some((n) => n.name.includes("index"))).toBe(true);
  });

  it("graph-query with startNodeId does BFS traversal", async () => {
    await sdk.trigger("mem::graph-extract", { observations: [testObs] });

    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    const fileNode = nodes.find((n) => n.name === "src/index.ts")!;

    const result = (await sdk.trigger("mem::graph-query", {
      startNodeId: fileNode.id,
      maxDepth: 2,
    })) as GraphQueryResult;

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.depth).toBe(2);
  });

  it("graph-stats returns counts by type", async () => {
    await sdk.trigger("mem::graph-extract", { observations: [testObs] });

    const result = (await sdk.trigger("mem::graph-stats", {})) as {
      totalNodes: number;
      totalEdges: number;
      nodesByType: Record<string, number>;
      edgesByType: Record<string, number>;
    };

    expect(result.totalNodes).toBe(2);
    expect(result.totalEdges).toBe(1);
    expect(result.nodesByType.file).toBe(1);
    expect(result.nodesByType.function).toBe(1);
    expect(result.edgesByType.uses).toBe(1);
  });

  it("graph-extract returns error for empty observations", async () => {
    const result = (await sdk.trigger("mem::graph-extract", {
      observations: [],
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("No observations");
  });
});
