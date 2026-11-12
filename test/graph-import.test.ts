import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  bootLog: vi.fn(),
}));

import { parseGraphifyGraph, registerGraphImportFunction, type GraphifyImportResult } from "../src/functions/graph-import.js";
import { KV } from "../src/state/schema.js";
import type { GraphNode, GraphEdge } from "../src/types.js";
import { logger } from "../src/logger.js";
import { createGraphIndexState } from "./helpers/graph-index-state.js";
import { initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { queryGraphIndex } from "../src/functions/graph-index-query.js";

// graphify's clustered graph.json is NetworkX node_link: nodes carry
// label/source_file/community/file_type, links carry
// source/target/relation/confidence. --no-cluster output stores the edge
// array under "edges" instead of "links".
const FIXTURE = {
  nodes: [
    { id: "n1", label: "extract", source_file: "extract.py", community: 0, file_type: "code" },
    { id: "n2", label: "cluster.py", source_file: "cluster.py", community: 0, file_type: "code" },
    { id: "n3", label: "retry rationale", community: 1, file_type: "rationale" },
    { id: "n4", label: "architecture overview", file_type: "document" },
  ],
  links: [
    { source: "n1", target: "n2", relation: "imports", confidence: "EXTRACTED" },
    { source: "n1", target: "n3", relation: "references", confidence: "INFERRED" },
    { source: "n2", target: "zz-missing", relation: "calls", confidence: "EXTRACTED" },
  ],
};

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
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
    _store: store,
  };
}

type MockSdk = {
  registerFunction: (id: string, handler: Function) => void;
  registerTrigger: () => void;
  trigger: (input: { function_id: string; payload?: unknown }) => Promise<unknown>;
};

function mockSdk(): MockSdk {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      fns.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload?: unknown }) => {
      const fn = fns.get(input.function_id);
      if (!fn) throw new Error(`missing handler: ${input.function_id}`);
      return fn(input.payload);
    },
  };
}

const LIMIT_KEYS = ["AGENTMEMORY_GRAPH_IMPORT_MAX_NODES", "AGENTMEMORY_GRAPH_IMPORT_MAX_EDGES"];
const savedLimits: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of LIMIT_KEYS) {
    savedLimits[key] = process.env[key];
    process.env[key] = "";
  }
});

afterEach(() => {
  for (const key of LIMIT_KEYS) {
    if (savedLimits[key] === undefined) delete process.env[key];
    else process.env[key] = savedLimits[key];
  }
});

describe("parseGraphifyGraph", () => {
  it("maps nodes with file_type-aware types and provenance", () => {
    const parsed = parseGraphifyGraph(JSON.stringify(FIXTURE));
    expect(parsed.nodesRead).toBe(4);
    const byName = new Map(parsed.nodes.map((n) => [n.name, n]));
    // code symbol without extension -> function; with extension -> file
    expect(byName.get("extract")!.type).toBe("function");
    expect(byName.get("cluster.py")!.type).toBe("file");
    // rationale -> decision, document -> concept
    expect(byName.get("retry rationale")!.type).toBe("decision");
    expect(byName.get("architecture overview")!.type).toBe("concept");
    // provenance kept on every imported node
    for (const n of parsed.nodes) {
      expect(n.properties.source).toBe("graphify");
    }
    expect(byName.get("extract")!.properties.sourceFile).toBe("extract.py");
  });

  it("maps relations to memory edge types and confidence to weight", () => {
    const parsed = parseGraphifyGraph(JSON.stringify(FIXTURE));
    // the edge to a missing endpoint is skipped and counted, never guessed
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.skippedEdges).toBe(1);
    const types = parsed.edges.map((e) => e.type).sort();
    expect(types).toEqual(["imports", "related_to"]);
    const weights = parsed.edges.map((e) => e.weight).sort((a, b) => a - b);
    expect(weights).toEqual([0.6, 0.9]);
  });

  it("maps AMBIGUOUS confidence and unknown file_type defaults", () => {
    const fixture = {
      nodes: [
        { id: "a", label: "mystery" },
        { id: "b", label: "helper.rs", file_type: "wat" },
      ],
      links: [{ source: "a", target: "b", relation: "calls", confidence: "AMBIGUOUS" }],
    };
    const parsed = parseGraphifyGraph(JSON.stringify(fixture));
    const byName = new Map(parsed.nodes.map((n) => [n.name, n]));
    // no/unknown file_type: extension-looking labels are files, rest concepts
    expect(byName.get("mystery")!.type).toBe("concept");
    expect(byName.get("helper.rs")!.type).toBe("file");
    expect(parsed.edges[0].weight).toBe(0.3);
  });

  it("accepts the --no-cluster shape where edges live under `edges`", () => {
    const noCluster = { nodes: FIXTURE.nodes, edges: FIXTURE.links };
    const parsed = parseGraphifyGraph(JSON.stringify(noCluster));
    expect(parsed.edges).toHaveLength(2);
    expect(parsed.edgesRead).toBe(3);
  });

  it("reports truncation loudly instead of silently capping", () => {
    const big = {
      nodes: Array.from({ length: 5010 }, (_, i) => ({ id: `n${i}`, label: `sym${i}` })),
      links: [],
    };
    const parsed = parseGraphifyGraph(JSON.stringify(big));
    expect(parsed.nodes).toHaveLength(5000);
    expect(parsed.droppedNodes).toBe(10);
    expect(parsed.droppedEdges).toBe(0);
  });

  it("counts edges lost to the caps apart from dangling edges", () => {
    const fixture = {
      nodes: [{ id: "a", label: "a" }, { id: "b", label: "b" }, { id: "c", label: "c" }],
      links: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "a", target: "ghost" },
        { source: "b", target: "a" },
      ],
    };
    const parsed = parseGraphifyGraph(JSON.stringify(fixture), { maxNodes: 2, maxEdges: 3 });
    expect(parsed.nodes.map((n) => n.name)).toEqual(["a", "b"]);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.droppedNodes).toBe(1);
    expect(parsed.droppedEdges).toBe(2);
    expect(parsed.skippedEdges).toBe(1);
  });
});

describe("mem::graph::import-graphify limits, paths and index visibility", () => {
  let tmp: string;
  const saved: Record<string, string | undefined> = {};
  const envKeys = ["AGENTMEMORY_IMPORT_ROOT", "HOME", "USERPROFILE"];

  beforeEach(() => {
    for (const key of envKeys) saved[key] = process.env[key];
    tmp = mkdtempSync(join(tmpdir(), "am-graphify-"));
    process.env.AGENTMEMORY_IMPORT_ROOT = tmp;
    mkdirSync(join(tmp, "graphify-out"), { recursive: true });
    writeFileSync(join(tmp, "graphify-out", "graph.json"), JSON.stringify(FIXTURE));
    vi.mocked(logger.warn).mockClear();
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  async function runImport(kv: unknown, payload: Record<string, unknown>): Promise<GraphifyImportResult> {
    const sdk = mockSdk();
    registerGraphImportFunction(sdk as never, kv as never);
    return (await sdk.trigger({
      function_id: "mem::graph::import-graphify",
      payload,
    })) as GraphifyImportResult;
  }

  it("reports truncation with limits, dropped counts and a logged warning", async () => {
    process.env.AGENTMEMORY_GRAPH_IMPORT_MAX_NODES = "2";
    process.env.AGENTMEMORY_GRAPH_IMPORT_MAX_EDGES = "100";
    const result = await runImport(mockKV(), { cwd: tmp });
    expect(result.success).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.limits).toEqual({ nodes: 2, edges: 100 });
    expect(result.nodesRead).toBe(4);
    expect(result.nodesImported).toBe(2);
    expect(result.droppedNodes).toBe(2);
    expect(result.droppedEdges).toBe(1);
    expect((result.warnings ?? []).join(" ")).toContain("AGENTMEMORY_GRAPH_IMPORT_MAX_NODES");
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith("graphify import truncated", expect.objectContaining({ droppedNodes: 2 }));
  });

  it("reports no truncation under the default limits", async () => {
    const result = await runImport(mockKV(), { cwd: tmp });
    expect(result.truncated).toBe(false);
    expect(result.limits).toEqual({ nodes: 5000, edges: 20000 });
    expect(result.droppedNodes).toBe(0);
    expect(result.droppedEdges).toBe(0);
  });

  it("expands a leading ~ in AGENTMEMORY_IMPORT_ROOT and in cwd", async () => {
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    process.env.AGENTMEMORY_IMPORT_ROOT = "~";
    const result = await runImport(mockKV(), { cwd: "~" });
    expect(result.success).toBe(true);
    expect(result.path).toBe(join(tmp, "graphify-out", "graph.json"));
    expect(result.nodesImported).toBe(4);
  });

  it("keeps root confinement when ~ points outside the allowed roots", async () => {
    const home = mkdtempSync(join(tmpdir(), "am-graphify-home-"));
    try {
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      process.env.AGENTMEMORY_IMPORT_ROOT = tmp;
      const result = await runImport(mockKV(), { path: "~/graph.json" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("outside the allowed roots");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("makes imported nodes visible to the indexed graph query the viewer uses", async () => {
    const { kv } = createGraphIndexState();
    await initializeGraphIndex(kv, { status: "ready" });
    const result = await runImport(kv, { cwd: tmp });
    expect(result.success).toBe(true);
    expect(result.graphIndex).toMatchObject({ state: "ready", ready: true });
    expect(result.warnings).toBeUndefined();
    const query = await queryGraphIndex(kv, { limit: 500 });
    expect(query.nodes.map((n) => n.name).sort()).toEqual(["architecture overview", "cluster.py", "extract", "retry rationale"]);
    expect(query.edges).toHaveLength(2);
  });

  it("warns when the store has no graph index, since the viewer cannot show the import", async () => {
    const { kv } = createGraphIndexState();
    const result = await runImport(kv, { cwd: tmp });
    expect(result.success).toBe(true);
    expect(result.newNodes).toBe(4);
    expect(result.graphIndex).toMatchObject({ state: "needs-migration", ready: false });
    expect((result.warnings ?? []).join(" ")).toContain("graph-index migrate");
    expect((await queryGraphIndex(kv, { limit: 500 })).nodes).toHaveLength(0);
  });

  it("reports merged counts when a re-import finds every node already present", async () => {
    const kv = mockKV();
    await runImport(kv, { cwd: tmp });
    const second = await runImport(kv, { cwd: tmp });
    expect(second.newNodes).toBe(0);
    expect(second.mergedNodes).toBe(4);
    expect(second.mergedEdges).toBe(2);
  });
});

describe("mem::graph::import-graphify", () => {
  let tmp: string;
  let kv: ReturnType<typeof mockKV>;
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "am-graphify-"));
    process.env.AGENTMEMORY_IMPORT_ROOT = tmp;
    mkdirSync(join(tmp, "graphify-out"), { recursive: true });
    writeFileSync(join(tmp, "graphify-out", "graph.json"), JSON.stringify(FIXTURE));
    kv = mockKV();
    sdk = mockSdk();
    registerGraphImportFunction(sdk as never, kv as never);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("imports nodes and edges into the memory graph", async () => {
    const result = (await (sdk as any).trigger({
      function_id: "mem::graph::import-graphify",
      payload: { cwd: tmp },
    })) as { success: boolean; newNodes: number; newEdges: number; skippedEdges: number };

    expect(result.success).toBe(true);
    expect(result.newNodes).toBe(4);
    expect(result.newEdges).toBe(2);
    expect(result.skippedEdges).toBe(1);

    const nodes = await kv.list<GraphNode>(KV.graphNodes);
    const edges = await kv.list<GraphEdge>(KV.graphEdges);
    expect(nodes).toHaveLength(4);
    expect(edges).toHaveLength(2);
  });

  it("re-import is idempotent: second run merges instead of duplicating", async () => {
    await (sdk as any).trigger({ function_id: "mem::graph::import-graphify", payload: { cwd: tmp } });
    const second = (await (sdk as any).trigger({
      function_id: "mem::graph::import-graphify",
      payload: { cwd: tmp },
    })) as { success: boolean; newNodes: number; newEdges: number };

    expect(second.success).toBe(true);
    // Everything resolves through the (type, name) index and merges.
    expect(second.newNodes).toBe(0);
    expect(second.newEdges).toBe(0);
    expect(await kv.list(KV.graphNodes)).toHaveLength(4);
    expect(await kv.list(KV.graphEdges)).toHaveLength(2);

    // A merge-only run mutates cached snapshot entries even with zero new
    // counts; the persisted snapshot must still reflect current graph data.
    const snap = await kv.get<{
      stats: { totalNodes: number; totalEdges: number };
      topNodes: unknown[];
    }>("mem:graph:snapshot", "current");
    expect(snap).not.toBeNull();
    expect(snap!.stats.totalNodes).toBe(4);
    expect(snap!.stats.totalEdges).toBe(2);
    expect(snap!.topNodes.length).toBeGreaterThan(0);
  });

  it("fails cleanly with a pointer when graph.json is absent", async () => {
    const result = (await (sdk as any).trigger({
      function_id: "mem::graph::import-graphify",
      payload: { cwd: join(tmp, "nowhere") },
    })) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("Run graphify first");
  });

  it("accepts an explicit path", async () => {
    const alt = join(tmp, "custom.json");
    writeFileSync(alt, JSON.stringify(FIXTURE));
    const result = (await (sdk as any).trigger({
      function_id: "mem::graph::import-graphify",
      payload: { path: alt },
    })) as { success: boolean; nodesImported: number };
    expect(result.success).toBe(true);
    expect(result.nodesImported).toBe(4);
  });

  it("rejects malformed JSON without writing anything", async () => {
    writeFileSync(join(tmp, "graphify-out", "graph.json"), "{not json");
    const result = (await (sdk as any).trigger({
      function_id: "mem::graph::import-graphify",
      payload: { cwd: tmp },
    })) as { success: boolean };
    expect(result.success).toBe(false);
    expect(await kv.list(KV.graphNodes)).toHaveLength(0);
  });
});
