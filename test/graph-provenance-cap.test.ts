import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  persistGraphDelta,
  MAX_GRAPH_SOURCE_OBSERVATIONS,
} from "../src/functions/graph.js";
import type { GraphEdge, GraphNode } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
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

let seq = 0;
function node(name: string, sources: string[]): GraphNode {
  seq += 1;
  return {
    id: `gn_${seq}`,
    type: "concept",
    name,
    properties: {},
    sourceObservationIds: sources,
    createdAt: "2026-09-24T00:00:00.000Z",
  };
}

function edge(src: string, tgt: string, sources: string[]): GraphEdge {
  seq += 1;
  return {
    id: `ge_${seq}`,
    type: "related_to",
    sourceNodeId: src,
    targetNodeId: tgt,
    weight: 0.5,
    sourceObservationIds: sources,
    createdAt: "2026-09-24T00:00:00.000Z",
  };
}

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}_${i}`);

async function onlyNode(kv: ReturnType<typeof mockKV>, name: string) {
  const all = await kv.list<GraphNode>("mem:graph:nodes");
  const hits = all.filter((n) => n.name === name);
  expect(hits.length).toBe(1);
  return hits[0]!;
}

async function onlyEdge(kv: ReturnType<typeof mockKV>) {
  const all = await kv.list<GraphEdge>("mem:graph:edges");
  expect(all.length).toBe(1);
  return all[0]!;
}

describe("graph provenance is bounded and attributed", () => {
  it("the cap is at least the largest retrieval result size", () => {
    expect(MAX_GRAPH_SOURCE_OBSERVATIONS).toBeGreaterThanOrEqual(20);
  });

  it("a node merged many times never exceeds the cap", async () => {
    const kv = mockKV();
    for (let batch = 0; batch < 20; batch++) {
      const batchIds = ids(`obs_b${batch}`, 10);
      await persistGraphDelta(kv as never, [node("CLAUDE.md", batchIds)], []);
    }
    const n = await onlyNode(kv, "CLAUDE.md");
    expect(n.sourceObservationIds.length).toBe(MAX_GRAPH_SOURCE_OBSERVATIONS);
  });

  it("the cap keeps the NEWEST ids, in arrival order", async () => {
    const kv = mockKV();
    const all: string[] = [];
    for (let batch = 0; batch < 10; batch++) {
      const batchIds = ids(`obs_b${batch}`, 10);
      all.push(...batchIds);
      await persistGraphDelta(kv as never, [node("hub", batchIds)], []);
    }
    const n = await onlyNode(kv, "hub");
    expect(n.sourceObservationIds).toEqual(
      all.slice(-MAX_GRAPH_SOURCE_OBSERVATIONS),
    );
  });

  it("a re-seen id moves to the newest end and survives trimming", async () => {
    const kv = mockKV();
    await persistGraphDelta(kv as never, [node("hub", ["obs_old"])], []);
    const filler = ids("obs_fill", MAX_GRAPH_SOURCE_OBSERVATIONS - 1);
    await persistGraphDelta(kv as never, [node("hub", filler)], []);
    await persistGraphDelta(kv as never, [node("hub", ["obs_old"])], []);
    await persistGraphDelta(kv as never, [node("hub", ["obs_new"])], []);
    const n = await onlyNode(kv, "hub");
    expect(n.sourceObservationIds).toContain("obs_old");
    expect(n.sourceObservationIds.at(-1)).toBe("obs_new");
    expect(n.sourceObservationIds.at(-2)).toBe("obs_old");
    expect(n.sourceObservationIds).not.toContain("obs_fill_0");
  });

  it("ids are never duplicated", async () => {
    const kv = mockKV();
    for (let i = 0; i < 3; i++) {
      await persistGraphDelta(
        kv as never,
        [node("hub", ["obs_a", "obs_b"])],
        [],
      );
    }
    const n = await onlyNode(kv, "hub");
    expect(n.sourceObservationIds).toEqual(["obs_a", "obs_b"]);
  });

  it("a brand-new node carrying more than the cap is trimmed on first write", async () => {
    const kv = mockKV();
    const many = ids("obs", MAX_GRAPH_SOURCE_OBSERVATIONS + 15);
    await persistGraphDelta(kv as never, [node("fresh", many)], []);
    const n = await onlyNode(kv, "fresh");
    expect(n.sourceObservationIds).toEqual(
      many.slice(-MAX_GRAPH_SOURCE_OBSERVATIONS),
    );
  });

  it("a merged node gains ITS OWN sources, not every id in the batch", async () => {
    const kv = mockKV();
    await persistGraphDelta(kv as never, [node("a.ts", ["obs_1"])], []);
    await persistGraphDelta(
      kv as never,
      [node("a.ts", ["obs_3"]), node("b.ts", ["obs_2", "obs_4"])],
      [],
    );
    const a = await onlyNode(kv, "a.ts");
    expect(a.sourceObservationIds).toEqual(["obs_1", "obs_3"]);
  });

  it("a merged edge gains its own sources, bounded, not the batch", async () => {
    const kv = mockKV();
    const a = node("a", ["obs_0"]);
    const b = node("b", ["obs_0"]);
    await persistGraphDelta(kv as never, [a, b], [edge(a.id, b.id, ["obs_0"])]);
    for (let batch = 1; batch <= 10; batch++) {
      const batchIds = ids(`obs_b${batch}`, 10);
      const a2 = node("a", batchIds);
      const b2 = node("b", batchIds);
      await persistGraphDelta(
        kv as never,
        [a2, b2],
        [edge(a2.id, b2.id, [batchIds[0]!])],
      );
    }
    const e = await onlyEdge(kv);
    expect(e.sourceObservationIds).toEqual([
      "obs_0",
      ...Array.from({ length: 10 }, (_, i) => `obs_b${i + 1}_0`),
    ]);
  });

  it("a merged edge is capped", async () => {
    const kv = mockKV();
    const a = node("a", ["obs_0"]);
    const b = node("b", ["obs_0"]);
    await persistGraphDelta(kv as never, [a, b], [edge(a.id, b.id, ["obs_0"])]);
    const many = ids("obs_e", MAX_GRAPH_SOURCE_OBSERVATIONS * 2);
    const a2 = node("a", ["obs_x"]);
    const b2 = node("b", ["obs_x"]);
    await persistGraphDelta(kv as never, [a2, b2], [edge(a2.id, b2.id, many)]);
    const e = await onlyEdge(kv);
    expect(e.sourceObservationIds).toEqual(
      many.slice(-MAX_GRAPH_SOURCE_OBSERVATIONS),
    );
  });

  it("a brand-new edge carrying more than the cap is trimmed on first write", async () => {
    const kv = mockKV();
    const a = node("a", ["obs_0"]);
    const b = node("b", ["obs_0"]);
    const many = ids("obs", MAX_GRAPH_SOURCE_OBSERVATIONS + 5);
    await persistGraphDelta(kv as never, [a, b], [edge(a.id, b.id, many)]);
    const e = await onlyEdge(kv);
    expect(e.sourceObservationIds).toEqual(
      many.slice(-MAX_GRAPH_SOURCE_OBSERVATIONS),
    );
  });

  it("a record written before this change with an oversized list is trimmed on its next merge", async () => {
    const kv = mockKV();
    const legacy = node("legacy", ids("obs_legacy", 500));
    await kv.set("mem:graph:nodes", legacy.id, legacy);
    await kv.set("mem:graph:name-index", "concept|legacy", legacy.id);
    await persistGraphDelta(kv as never, [node("legacy", ["obs_now"])], []);
    const n = await onlyNode(kv, "legacy");
    expect(n.sourceObservationIds.length).toBe(MAX_GRAPH_SOURCE_OBSERVATIONS);
    expect(n.sourceObservationIds.at(-1)).toBe("obs_now");
  });
});

describe("temporal graph provenance is bounded", () => {
  function mockSdk() {
    const functions = new Map<string, Function>();
    return {
      registerFunction: (
        idOrOpts: string | { id: string },
        handler: Function,
      ) => {
        functions.set(
          typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id,
          handler,
        );
      },
      registerTrigger: () => {},
      trigger: async (id: string, data: unknown) => functions.get(id)!(data),
    };
  }

  it("a temporal node merged many times keeps only the newest ids", async () => {
    const { registerTemporalGraphFunctions } = await import(
      "../src/functions/temporal-graph.js"
    );
    const response = `<temporal_graph>
  <entities>
    <entity type="person" name="Alice"><property key="role">engineer</property></entity>
  </entities>
  <relationships></relationships>
</temporal_graph>`;
    const provider = {
      name: "test",
      compress: vi.fn().mockResolvedValue(response),
      summarize: vi.fn().mockResolvedValue(response),
    };
    const sdk = mockSdk();
    const kv = mockKV();
    registerTemporalGraphFunctions(
      sdk as never,
      kv as never,
      provider as never,
    );

    const all: string[] = [];
    for (let batch = 0; batch < 10; batch++) {
      const observations = ids(`obs_t${batch}`, 10).map((id) => {
        all.push(id);
        return {
          id,
          title: "t",
          narrative: "Alice works at Acme",
          concepts: [],
          files: [],
          type: "conversation",
          timestamp: "2026-09-24T00:00:00Z",
        };
      });
      const r = (await sdk.trigger("mem::temporal-graph-extract", {
        observations,
      })) as {
        success: boolean;
      };
      expect(r.success).toBe(true);
    }
    const n = await onlyNode(kv, "Alice");
    expect(n.sourceObservationIds).toEqual(
      all.slice(-MAX_GRAPH_SOURCE_OBSERVATIONS),
    );
  });

  it("a temporal edge from a batch larger than the cap keeps only the newest ids", async () => {
    const { registerTemporalGraphFunctions } = await import(
      "../src/functions/temporal-graph.js"
    );
    const response = `<temporal_graph>
  <entities>
    <entity type="person" name="Alice"></entity>
    <entity type="project" name="Acme"></entity>
  </entities>
  <relationships>
    <relationship type="works_on" source="Alice" target="Acme" weight="0.9"></relationship>
  </relationships>
</temporal_graph>`;
    const provider = {
      name: "test",
      compress: vi.fn().mockResolvedValue(response),
      summarize: vi.fn().mockResolvedValue(response),
    };
    const sdk = mockSdk();
    const kv = mockKV();
    registerTemporalGraphFunctions(
      sdk as never,
      kv as never,
      provider as never,
    );

    const batch = ids("obs_e", MAX_GRAPH_SOURCE_OBSERVATIONS + 8);
    for (let round = 0; round < 2; round++) {
      const r = (await sdk.trigger("mem::temporal-graph-extract", {
        observations: batch.map((id) => ({
          id,
          title: "t",
          narrative: "Alice works on Acme",
          concepts: [],
          files: [],
          type: "conversation",
          timestamp: "2026-09-24T00:00:00Z",
        })),
      })) as { success: boolean };
      expect(r.success).toBe(true);
    }
    const edges = await kv.list<GraphEdge>("mem:graph:edges");
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.sourceObservationIds).toEqual(
        batch.slice(-MAX_GRAPH_SOURCE_OBSERVATIONS),
      );
    }
  });
});
