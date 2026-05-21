import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerGraphFunction } from "../src/functions/graph.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import type {
  CompressedObservation,
  GraphNode,
  GraphEdge,
  GraphQueryResult,
  Session,
  Memory,
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

const secondObs: CompressedObservation = {
  ...testObs,
  id: "obs_2",
  timestamp: "2026-02-01T10:01:00Z",
  title: "Edit graph file",
  narrative: "Updated graph.ts with build support",
  files: ["src/functions/graph.ts"],
};

const testSession: Session = {
  id: "ses_1",
  project: "agentmemory",
  cwd: "/repo",
  startedAt: "2026-02-01T10:00:00Z",
  status: "completed",
  observationCount: 2,
};

const testMemory: Memory = {
  id: "mem_1",
  createdAt: "2026-02-01T10:02:00Z",
  updatedAt: "2026-02-01T10:02:00Z",
  type: "workflow",
  title: "Graph build uses memories",
  content: "Graph backfill should build entities from durable memories.",
  concepts: ["graph", "memory"],
  files: ["src/functions/graph.ts"],
  sessionIds: [],
  strength: 7,
  version: 1,
  isLatest: true,
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

  it("graph-extract accepts self-closing entity tags", async () => {
    mockProvider.compress.mockResolvedValueOnce(`<entities>
<entity type="file" name="src/index.ts"/>
<entity type="function" name="main"><property key="lang">typescript</property></entity>
</entities>
<relationships>
<relationship type="uses" source="src/index.ts" target="main" weight="0.9"/>
</relationships>`);

    const result = (await sdk.trigger("mem::graph-extract", {
      observations: [testObs],
    })) as { success: boolean; nodesAdded: number; edgesAdded: number };

    expect(result.success).toBe(true);
    expect(result.nodesAdded).toBe(2);
    expect(result.edgesAdded).toBe(1);

    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    expect(nodes.some((n) => n.name === "src/index.ts")).toBe(true);
    expect(nodes.some((n) => n.name === "main")).toBe(true);

    const edges = await kv.list<GraphEdge>("mem:graph:edges");
    expect(edges).toHaveLength(1);
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

  it("graph-build defaults to dry-run and plans batches without extracting", async () => {
    await kv.set("mem:sessions", testSession.id, testSession);
    await kv.set("mem:obs:ses_1", testObs.id, testObs);
    await kv.set("mem:obs:ses_1", secondObs.id, secondObs);

    const result = (await sdk.trigger("mem::graph-build", {
      batchSize: 1,
    })) as {
      success: boolean;
      dryRun: boolean;
      sessionsScanned: number;
      observationsFound: number;
      observationsSelected: number;
      batchesPlanned: number;
      batchesProcessed: number;
    };

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      sessionsScanned: 1,
      observationsFound: 2,
      observationsSelected: 2,
      batchesPlanned: 2,
      batchesProcessed: 0,
    });
    expect(mockProvider.compress).not.toHaveBeenCalled();
  });

  it("graph-build applies batches through mem::graph-extract when dryRun is false", async () => {
    await kv.set("mem:sessions", testSession.id, testSession);
    await kv.set("mem:obs:ses_1", testObs.id, testObs);
    await kv.set("mem:obs:ses_1", secondObs.id, secondObs);

    const result = (await sdk.trigger("mem::graph-build", {
      dryRun: false,
      batchSize: 1,
      limit: 2,
    })) as {
      success: boolean;
      dryRun: boolean;
      batchesProcessed: number;
      nodesAdded: number;
      edgesAdded: number;
    };

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.batchesProcessed).toBe(2);
    expect(result.nodesAdded).toBe(2);
    expect(result.edgesAdded).toBe(1);
    expect(mockProvider.compress).toHaveBeenCalledTimes(2);

    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    const edges = await kv.list<GraphEdge>("mem:graph:edges");
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(nodes.every((n) => n.sourceObservationIds.includes("obs_1"))).toBe(true);
    expect(nodes.every((n) => n.sourceObservationIds.includes("obs_2"))).toBe(true);
    expect(edges[0].sourceObservationIds).toEqual(["obs_1", "obs_2"]);
  });

  it("graph-build skips observations that already contributed graph records", async () => {
    await kv.set("mem:sessions", testSession.id, testSession);
    await kv.set("mem:obs:ses_1", testObs.id, testObs);
    await kv.set("mem:obs:ses_1", secondObs.id, secondObs);

    await sdk.trigger("mem::graph-build", {
      dryRun: false,
      batchSize: 1,
      limit: 2,
    });

    const result = (await sdk.trigger("mem::graph-build", {
      batchSize: 1,
    })) as {
      dryRun: boolean;
      observationsEligible: number;
      observationsSkippedExisting: number;
      observationsSelected: number;
    };

    expect(result.dryRun).toBe(true);
    expect(result.observationsEligible).toBe(0);
    expect(result.observationsSkippedExisting).toBe(2);
    expect(result.observationsSelected).toBe(0);
  });

  it("graph-build includes latest memories by default", async () => {
    await kv.set("mem:memories", testMemory.id, testMemory);

    const result = (await sdk.trigger("mem::graph-build", {
      source: "all",
      batchSize: 8,
    })) as {
      success: boolean;
      dryRun: boolean;
      memoriesScanned: number;
      observationsFound: number;
      observationsEligible: number;
      observationsSelected: number;
    };

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      memoriesScanned: 1,
      observationsFound: 1,
      observationsEligible: 1,
      observationsSelected: 1,
    });
  });

  it("graph-extract reuses persisted node ids when merging edges", async () => {
    await sdk.trigger("mem::graph-extract", { observations: [testObs] });
    const firstNodes = await kv.list<GraphNode>("mem:graph:nodes");
    const firstEdges = await kv.list<GraphEdge>("mem:graph:edges");

    await sdk.trigger("mem::graph-extract", { observations: [secondObs] });
    const secondNodes = await kv.list<GraphNode>("mem:graph:nodes");
    const secondEdges = await kv.list<GraphEdge>("mem:graph:edges");

    expect(secondNodes.length).toBe(firstNodes.length);
    expect(secondEdges.length).toBe(firstEdges.length);
    const nodeIds = new Set(secondNodes.map((node) => node.id));
    expect(nodeIds.has(secondEdges[0].sourceNodeId)).toBe(true);
    expect(nodeIds.has(secondEdges[0].targetNodeId)).toBe(true);
  });

  it("api graph-build exposes a safe dry-run default", async () => {
    registerApiTriggers(sdk as never, kv as never);
    await kv.set("mem:sessions", testSession.id, testSession);
    await kv.set("mem:obs:ses_1", testObs.id, testObs);

    const response = (await sdk.trigger("api::graph-build", {
      query_params: {},
      body: {},
      headers: {},
    })) as { status_code: number; body: { dryRun?: boolean; batchesPlanned?: number } };

    expect(response.status_code).toBe(200);
    expect(response.body.dryRun).toBe(true);
    expect(response.body.batchesPlanned).toBe(1);
    expect(mockProvider.compress).not.toHaveBeenCalled();
  });
});
