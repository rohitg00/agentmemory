import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerGraphFunction } from "../src/functions/graph.js";
import type {
  CompressedObservation,
  GraphNode,
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
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

// One entity, no relationships: every extract re-observes the same node,
// which is the shape that made the provenance array grow without bound.
const mockProvider = {
  name: "test",
  compress: vi.fn().mockResolvedValue(`<entities>
<entity type="file" name="src/hot-path.ts"><property key="path">src/hot-path.ts</property></entity>
</entities>
<relationships>
</relationships>`),
  summarize: vi.fn(),
};

function obs(n: number): CompressedObservation {
  return {
    id: `obs_${n}`,
    sessionId: "ses_1",
    timestamp: `2026-02-01T10:00:${String(n % 60).padStart(2, "0")}Z`,
    type: "file_edit",
    title: `Edit ${n}`,
    facts: [`change ${n}`],
    narrative: `Edited the hot path, revision ${n}`,
    concepts: [],
    files: [],
    importance: 5,
  };
}

describe("graph provenance bounds (#1168 / #1171)", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const ORIG_FLAG = process.env["GRAPH_EXTRACTION_ENABLED"];
  const ORIG_MAX = process.env["GRAPH_MAX_SOURCE_IDS"];

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    vi.clearAllMocks();
    process.env["GRAPH_EXTRACTION_ENABLED"] = "true";
    process.env["GRAPH_MAX_SOURCE_IDS"] = "5";
    registerGraphFunction(sdk as never, kv as never, mockProvider as never);
  });

  afterEach(() => {
    if (ORIG_FLAG === undefined) delete process.env["GRAPH_EXTRACTION_ENABLED"];
    else process.env["GRAPH_EXTRACTION_ENABLED"] = ORIG_FLAG;
    if (ORIG_MAX === undefined) delete process.env["GRAPH_MAX_SOURCE_IDS"];
    else process.env["GRAPH_MAX_SOURCE_IDS"] = ORIG_MAX;
  });

  // The regression: creation capped at ten ids, mergeNode re-unioned with
  // no cap, so re-observing an entity grew the array for the life of the
  // graph.
  it("keeps sourceObservationIds bounded across repeated merges", async () => {
    for (let i = 1; i <= 20; i++) {
      await sdk.trigger("mem::graph-extract", { observations: [obs(i)] });
    }

    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    const hot = nodes.find((n) => n.name === "src/hot-path.ts")!;
    expect(hot).toBeDefined();
    expect(hot.sourceObservationIds.length).toBeLessThanOrEqual(5);
    // Newest kept, oldest dropped.
    expect(hot.sourceObservationIds).toContain("obs_20");
    expect(hot.sourceObservationIds).not.toContain("obs_1");
  });

  it("caps provenance at creation too", async () => {
    await sdk.trigger("mem::graph-extract", {
      observations: [obs(1), obs(2), obs(3), obs(4), obs(5), obs(6), obs(7)],
    });

    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    for (const node of nodes) {
      expect(node.sourceObservationIds.length).toBeLessThanOrEqual(5);
    }
  });

  it("graph-query projects provenance to a count plus a sample", async () => {
    for (let i = 1; i <= 20; i++) {
      await sdk.trigger("mem::graph-extract", { observations: [obs(i)] });
    }

    const result = (await sdk.trigger("mem::graph-query", {
      query: "hot-path",
    })) as GraphQueryResult;

    const node = result.nodes.find((n) => n.name === "src/hot-path.ts")!;
    expect(node).toBeDefined();
    expect(node.sourceObservationCount).toBeGreaterThan(0);
    expect(node.sourceObservationIds.length).toBeLessThanOrEqual(3);
  });

  it("graph-query returns the full array when includeSources is set", async () => {
    for (let i = 1; i <= 20; i++) {
      await sdk.trigger("mem::graph-extract", { observations: [obs(i)] });
    }

    const projected = (await sdk.trigger("mem::graph-query", {
      query: "hot-path",
    })) as GraphQueryResult;
    const full = (await sdk.trigger("mem::graph-query", {
      query: "hot-path",
      includeSources: true,
    })) as GraphQueryResult;

    const projectedNode = projected.nodes.find(
      (n) => n.name === "src/hot-path.ts",
    )!;
    const fullNode = full.nodes.find((n) => n.name === "src/hot-path.ts")!;

    expect(fullNode.sourceObservationIds.length).toBe(
      fullNode.sourceObservationCount,
    );
    expect(fullNode.sourceObservationIds.length).toBeGreaterThanOrEqual(
      projectedNode.sourceObservationIds.length,
    );
  });
});
