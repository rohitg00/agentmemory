import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  compactGraphProvenance,
  persistGraphDelta,
  registerGraphFunction,
  MAX_GRAPH_SOURCE_OBSERVATIONS,
} from "../src/functions/graph.js";
import type { GraphEdge, GraphNode } from "../src/types.js";

function mockKV(slowFirstNodeReadMs = 0) {
  const store = new Map<string, Map<string, unknown>>();
  const calls = { list: [] as string[], set: [] as string[] };
  let nodeReads = 0;
  return {
    calls,
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      const v = store.get(scope)?.get(key);
      if (
        scope === "mem:graph:nodes" &&
        nodeReads++ === 0 &&
        slowFirstNodeReadMs
      ) {
        await new Promise((r) => setTimeout(r, slowFirstNodeReadMs));
      }
      return (v === undefined ? null : structuredClone(v)) as T | null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      calls.set.push(`${scope}/${key}`);
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, structuredClone(data));
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      calls.list.push(scope);
      const entries = store.get(scope);
      return entries
        ? (Array.from(entries.values()).map((v) => structuredClone(v)) as T[])
        : [];
    },
  };
}
type KV = ReturnType<typeof mockKV>;

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}_${i}`);

async function seedNode(kv: KV, id: string, name: string, sources: string[]) {
  const n: GraphNode = {
    id,
    type: "concept",
    name,
    properties: { keep: "me" },
    sourceObservationIds: sources,
    createdAt: "2026-09-01T00:00:00.000Z",
    aliases: ["alias"],
  };
  await kv.set("mem:graph:nodes", id, n);
  await kv.set("mem:graph:name-index", `concept|${name}`, id);
  return n;
}

async function seedEdge(
  kv: KV,
  id: string,
  src: string,
  tgt: string,
  sources: string[],
) {
  const e: GraphEdge = {
    id,
    type: "related_to",
    sourceNodeId: src,
    targetNodeId: tgt,
    weight: 0.7,
    sourceObservationIds: sources,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  await kv.set("mem:graph:edges", id, e);
  await kv.set("mem:graph:edge-key", `${src}|${tgt}|related_to`, id);
  return e;
}

const node = (kv: KV, id: string) => kv.get<GraphNode>("mem:graph:nodes", id);
const edge = (kv: KV, id: string) => kv.get<GraphEdge>("mem:graph:edges", id);

describe("compactGraphProvenance", () => {
  it("trims an oversized node to the newest ids and keeps every other field", async () => {
    const kv = mockKV();
    const many = ids("obs", 500);
    const before = await seedNode(kv, "gn_1", "hub", many);
    await compactGraphProvenance(kv as never);
    const after = (await node(kv, "gn_1"))!;
    expect(after.sourceObservationIds).toEqual(
      many.slice(-MAX_GRAPH_SOURCE_OBSERVATIONS),
    );
    expect({ ...after, sourceObservationIds: [] }).toEqual({
      ...before,
      sourceObservationIds: [],
    });
  });

  it("trims an oversized edge the same way", async () => {
    const kv = mockKV();
    const many = ids("obs", 300);
    const before = await seedEdge(kv, "ge_1", "gn_a", "gn_b", many);
    await compactGraphProvenance(kv as never);
    const after = (await edge(kv, "ge_1"))!;
    expect(after.sourceObservationIds).toEqual(
      many.slice(-MAX_GRAPH_SOURCE_OBSERVATIONS),
    );
    expect({ ...after, sourceObservationIds: [] }).toEqual({
      ...before,
      sourceObservationIds: [],
    });
  });

  it("does not rewrite records already within the cap", async () => {
    const kv = mockKV();
    await seedNode(
      kv,
      "gn_small",
      "small",
      ids("obs", MAX_GRAPH_SOURCE_OBSERVATIONS),
    );
    await seedEdge(kv, "ge_small", "gn_a", "gn_b", ["obs_1"]);
    kv.calls.set.length = 0;
    await compactGraphProvenance(kv as never);
    expect(
      kv.calls.set.filter(
        (c) =>
          c.startsWith("mem:graph:nodes/") || c.startsWith("mem:graph:edges/"),
      ),
    ).toEqual([]);
  });

  it("never lists the nodes or edges scope", async () => {
    const kv = mockKV();
    await seedNode(kv, "gn_1", "hub", ids("obs", 100));
    await seedEdge(kv, "ge_1", "gn_1", "gn_2", ids("obs", 100));
    await compactGraphProvenance(kv as never);
    expect(kv.calls.list).not.toContain("mem:graph:nodes");
    expect(kv.calls.list).not.toContain("mem:graph:edges");
  });

  it("reports what it scanned and trimmed", async () => {
    const kv = mockKV();
    await seedNode(kv, "gn_1", "big", ids("obs", 100));
    await seedNode(kv, "gn_2", "small", ["obs_1"]);
    await seedEdge(kv, "ge_1", "gn_1", "gn_2", ids("obs", 40));
    const r = await compactGraphProvenance(kv as never);
    expect(r).toMatchObject({
      nodesScanned: 2,
      nodesTrimmed: 1,
      edgesScanned: 1,
      edgesTrimmed: 1,
      idsRemoved:
        100 -
        MAX_GRAPH_SOURCE_OBSERVATIONS +
        (40 - MAX_GRAPH_SOURCE_OBSERVATIONS),
    });
  });

  it("skips an index entry whose record is missing", async () => {
    const kv = mockKV();
    await kv.set("mem:graph:name-index", "concept|ghost", "gn_missing");
    await kv.set("mem:graph:edge-key", "a|b|related_to", "ge_missing");
    const r = await compactGraphProvenance(kv as never);
    expect(r).toMatchObject({
      nodesScanned: 0,
      edgesScanned: 0,
      nodesTrimmed: 0,
      edgesTrimmed: 0,
    });
  });

  it("visits a record once when two index keys point at it", async () => {
    const kv = mockKV();
    await seedNode(kv, "gn_1", "hub", ids("obs", 100));
    await kv.set("mem:graph:name-index", "concept|hub-alias", "gn_1");
    const r = await compactGraphProvenance(kv as never);
    expect(r.nodesScanned).toBe(1);
    expect(r.nodesTrimmed).toBe(1);
  });

  it("trims the cached snapshot's top nodes and edges", async () => {
    const kv = mockKV();
    const n = await seedNode(kv, "gn_1", "hub", ids("obs", 100));
    const e = await seedEdge(kv, "ge_1", "gn_1", "gn_2", ids("obs", 80));
    await kv.set("mem:graph:snapshot", "current", {
      version: 1,
      dirty: false,
      topNodes: [n],
      topEdges: [e],
      topDegrees: { gn_1: 1 },
      stats: { totalNodes: 1, totalEdges: 1, nodesByType: {}, edgesByType: {} },
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const r = await compactGraphProvenance(kv as never);
    const snap = (await kv.get<{
      topNodes: GraphNode[];
      topEdges: GraphEdge[];
    }>("mem:graph:snapshot", "current"))!;
    expect(snap.topNodes[0]!.sourceObservationIds.length).toBe(
      MAX_GRAPH_SOURCE_OBSERVATIONS,
    );
    expect(snap.topEdges[0]!.sourceObservationIds.length).toBe(
      MAX_GRAPH_SOURCE_OBSERVATIONS,
    );
    expect(r.snapshotTrimmed).toBe(true);
  });

  it("an empty graph is a no-op", async () => {
    const kv = mockKV();
    const r = await compactGraphProvenance(kv as never);
    expect(r).toMatchObject({
      nodesScanned: 0,
      edgesScanned: 0,
      idsRemoved: 0,
      snapshotTrimmed: false,
    });
  });

  it("a merge running during compaction is not lost", async () => {
    const kv = mockKV(20);
    await seedNode(kv, "gn_1", "hub", ids("obs", 100));
    const incoming: GraphNode = {
      id: "gn_fresh",
      type: "concept",
      name: "hub",
      properties: { added: "during-compaction" },
      sourceObservationIds: ["obs_during"],
      createdAt: "2026-09-24T00:00:00.000Z",
    };
    await Promise.all([
      compactGraphProvenance(kv as never),
      persistGraphDelta(kv as never, [incoming], []),
    ]);
    const after = (await node(kv, "gn_1"))!;
    expect(after.sourceObservationIds).toContain("obs_during");
    expect(after.properties).toMatchObject({
      keep: "me",
      added: "during-compaction",
    });
    expect(after.sourceObservationIds.length).toBeLessThanOrEqual(
      MAX_GRAPH_SOURCE_OBSERVATIONS,
    );
  });

  it("is registered as mem::graph-compact", async () => {
    const kv = mockKV();
    await seedNode(kv, "gn_1", "hub", ids("obs", 50));
    const functions = new Map<string, Function>();
    const sdk = {
      registerFunction: (
        idOrOpts: string | { id: string },
        handler: Function,
      ) =>
        functions.set(
          typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id,
          handler,
        ),
      registerTrigger: () => {},
    };
    registerGraphFunction(
      sdk as never,
      kv as never,
      { name: "noop", compress: vi.fn(), summarize: vi.fn() } as never,
    );
    const fn = functions.get("mem::graph-compact");
    expect(fn).toBeDefined();
    const r = await fn!({});
    expect(r).toMatchObject({ success: true, nodesTrimmed: 1 });
  });
});

describe("api::graph-compact endpoint", () => {
  it("is an authenticated POST at /agentmemory/graph/compact that runs mem::graph-compact", async () => {
    const { readFileSync } = await import("node:fs");
    const api = readFileSync("src/triggers/api.ts", "utf-8");
    expect(api).toMatch(
      /registerFunction\("api::graph-compact",[\s\S]*?checkAuth\(req, secret\)[\s\S]*?function_id: "mem::graph-compact"/,
    );
    expect(api).toMatch(
      /function_id: "api::graph-compact",\s*config: \{ api_path: "\/agentmemory\/graph\/compact", http_method: "POST" \}/,
    );
  });
});

describe("chunked compaction", () => {
  it("processes one slice of a scope and returns where the next slice starts", async () => {
    const kv = mockKV();
    for (let i = 0; i < 5; i++)
      await seedNode(kv, `gn_${i}`, `n${i}`, ids(`obs${i}`, 50));
    const first = await compactGraphProvenance(kv as never, {
      scope: "nodes",
      offset: 0,
      limit: 2,
    });
    expect(first).toMatchObject({
      nodesScanned: 2,
      nodesTrimmed: 2,
      total: 5,
      nextOffset: 2,
    });
    const trimmed = [];
    for (let i = 0; i < 5; i++)
      trimmed.push((await node(kv, `gn_${i}`))!.sourceObservationIds.length);
    expect(trimmed).toEqual([
      MAX_GRAPH_SOURCE_OBSERVATIONS,
      MAX_GRAPH_SOURCE_OBSERVATIONS,
      50,
      50,
      50,
    ]);
  });

  it("walking every slice trims everything and ends with nextOffset null", async () => {
    const kv = mockKV();
    for (let i = 0; i < 5; i++)
      await seedNode(kv, `gn_${i}`, `n${i}`, ids(`obs${i}`, 50));
    let offset: number | null = 0;
    let calls = 0;
    while (offset !== null && calls < 10) {
      const r = await compactGraphProvenance(kv as never, {
        scope: "nodes",
        offset,
        limit: 2,
      });
      offset = r.nextOffset === undefined ? -1 : r.nextOffset;
      calls += 1;
    }
    expect(calls).toBe(3);
    for (let i = 0; i < 5; i++) {
      expect((await node(kv, `gn_${i}`))!.sourceObservationIds.length).toBe(
        MAX_GRAPH_SOURCE_OBSERVATIONS,
      );
    }
  });

  it("an edges slice touches edges only", async () => {
    const kv = mockKV();
    const n = await seedNode(kv, "gn_1", "hub", ids("obs", 50));
    await seedEdge(kv, "ge_1", "gn_1", "gn_2", ids("obs", 50));
    await kv.set("mem:graph:snapshot", "current", {
      version: 1,
      dirty: false,
      topNodes: [n],
      topEdges: [],
      topDegrees: {},
      stats: { totalNodes: 1, totalEdges: 1, nodesByType: {}, edgesByType: {} },
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const r = await compactGraphProvenance(kv as never, {
      scope: "edges",
      offset: 0,
      limit: 10,
    });
    expect(r).toMatchObject({
      edgesTrimmed: 1,
      nodesScanned: 0,
      nextOffset: null,
      snapshotTrimmed: false,
    });
    expect((await node(kv, "gn_1"))!.sourceObservationIds.length).toBe(50);
    const snap = (await kv.get<{ topNodes: GraphNode[] }>(
      "mem:graph:snapshot",
      "current",
    ))!;
    expect(snap.topNodes[0]!.sourceObservationIds.length).toBe(50);
  });

  it("the snapshot scope trims only the snapshot", async () => {
    const kv = mockKV();
    const n = await seedNode(kv, "gn_1", "hub", ids("obs", 50));
    await kv.set("mem:graph:snapshot", "current", {
      version: 1,
      dirty: false,
      topNodes: [n],
      topEdges: [],
      topDegrees: {},
      stats: { totalNodes: 1, totalEdges: 0, nodesByType: {}, edgesByType: {} },
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const r = await compactGraphProvenance(kv as never, { scope: "snapshot" });
    expect(r).toMatchObject({
      snapshotTrimmed: true,
      nodesScanned: 0,
      nextOffset: null,
    });
    expect((await node(kv, "gn_1"))!.sourceObservationIds.length).toBe(50);
  });

  it("an offset past the end scans nothing and ends", async () => {
    const kv = mockKV();
    await seedNode(kv, "gn_1", "hub", ids("obs", 50));
    const r = await compactGraphProvenance(kv as never, {
      scope: "nodes",
      offset: 10,
      limit: 5,
    });
    expect(r).toMatchObject({ nodesScanned: 0, total: 1, nextOffset: null });
  });

  it("rejects an unknown scope or a bad offset or limit", async () => {
    const kv = mockKV();
    await expect(
      compactGraphProvenance(kv as never, { scope: "bogus" as never }),
    ).rejects.toThrow(/scope/);
    await expect(
      compactGraphProvenance(kv as never, {
        scope: "nodes",
        offset: -1,
        limit: 5,
      }),
    ).rejects.toThrow(/offset/);
    await expect(
      compactGraphProvenance(kv as never, {
        scope: "nodes",
        offset: 0,
        limit: 0,
      }),
    ).rejects.toThrow(/limit/);
  });

  it("mem::graph-compact passes the slice through", async () => {
    const kv = mockKV();
    for (let i = 0; i < 3; i++)
      await seedNode(kv, `gn_${i}`, `n${i}`, ids(`obs${i}`, 50));
    const functions = new Map<string, Function>();
    const sdk = {
      registerFunction: (
        idOrOpts: string | { id: string },
        handler: Function,
      ) =>
        functions.set(
          typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id,
          handler,
        ),
      registerTrigger: () => {},
    };
    registerGraphFunction(
      sdk as never,
      kv as never,
      { name: "noop", compress: vi.fn(), summarize: vi.fn() } as never,
    );
    const r = await functions.get("mem::graph-compact")!({
      scope: "nodes",
      offset: 0,
      limit: 1,
    });
    expect(r).toMatchObject({ success: true, nodesScanned: 1, nextOffset: 1 });
  });
});

function shuffledListKV() {
  const kv = mockKV();
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const list = kv.list;
  return {
    ...kv,
    list: async <T>(scope: string): Promise<T[]> => {
      const items = await list<T>(scope);
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
  };
}

function registerCompact(kv: KV) {
  const functions = new Map<string, Function>();
  const sdk = {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) =>
      functions.set(typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id, handler),
    registerTrigger: () => {},
  };
  registerGraphFunction(
    sdk as never,
    kv as never,
    { name: "noop", compress: vi.fn(), summarize: vi.fn() } as never,
  );
  return functions.get("mem::graph-compact")!;
}

describe("compaction with an unstable list order", () => {
  it("a full sliced walk leaves no node or edge over the cap", async () => {
    const kv = shuffledListKV();
    const nid = (i: number) => `gn_${String(i).padStart(2, "0")}`;
    for (let i = 0; i < 40; i++) await seedNode(kv, nid(i), `n${i}`, ids(`obs${i}`, 50));
    for (let i = 0; i < 39; i++)
      await seedEdge(kv, `ge_${String(i).padStart(2, "0")}`, nid(i), nid(i + 1), ids(`eobs${i}`, 50));
    for (const scope of ["nodes", "edges"] as const) {
      let offset: number | null = 0;
      let calls = 0;
      while (offset !== null && calls < 100) {
        const r = await compactGraphProvenance(kv as never, { scope, offset, limit: 3 });
        offset = r.nextOffset;
        calls += 1;
      }
      expect(offset).toBeNull();
    }
    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    const edges = await kv.list<GraphEdge>("mem:graph:edges");
    expect(nodes).toHaveLength(40);
    expect(edges).toHaveLength(39);
    const over = (r: { sourceObservationIds: string[] }) =>
      r.sourceObservationIds.length > MAX_GRAPH_SOURCE_OBSERVATIONS;
    expect(nodes.filter(over)).toEqual([]);
    expect(edges.filter(over)).toEqual([]);
  });
});

describe("mem::graph-compact audit", () => {
  const auditEntries = async (kv: KV) => {
    const scopes = [...new Set(kv.calls.set.map((k) => k.slice(0, k.lastIndexOf("/"))))].filter(
      (s) => /^mem:audit:\d{4}-\d{2}$/.test(s),
    );
    const rows = await Promise.all(
      scopes.map((s) =>
        kv.list<{ operation: string; functionId: string; details: Record<string, unknown> }>(s),
      ),
    );
    return rows.flat();
  };

  it("records an audit entry with the counts when ids are removed", async () => {
    const kv = mockKV();
    await seedNode(kv, "gn_1", "hub", ids("obs", 50));
    await seedEdge(kv, "ge_1", "gn_1", "gn_2", ids("eobs", 40));
    const r = await registerCompact(kv)({});
    expect(r).toMatchObject({ success: true, idsRemoved: 26 });
    const entries = await auditEntries(kv);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operation: "graph_compact",
      functionId: "mem::graph-compact",
      details: { scope: "all", nodesTrimmed: 1, edgesTrimmed: 1, idsRemoved: 26 },
    });
  });

  it("records nothing when there is nothing to trim", async () => {
    const kv = mockKV();
    await seedNode(kv, "gn_1", "hub", ids("obs", 5));
    const r = await registerCompact(kv)({});
    expect(r).toMatchObject({ success: true, idsRemoved: 0 });
    expect(await auditEntries(kv)).toEqual([]);
  });
});

describe("api::graph-compact responses", () => {
  async function route(
    trigger: (req: {
      function_id: string;
      payload?: unknown;
    }) => Promise<unknown>,
  ) {
    const { registerApiTriggers } = await import("../src/triggers/api.js");
    const fns = new Map<string, Function>();
    const sdk = {
      registerFunction: (id: string, h: Function) => fns.set(id, h),
      registerTrigger: () => {},
      trigger,
    };
    registerApiTriggers(sdk as never, mockKV() as never);
    return (body: unknown) =>
      fns.get("api::graph-compact")!({ headers: {}, body }) as Promise<{
        status_code: number;
        body: Record<string, unknown>;
      }>;
  }

  const ok = async () => ({ success: true, nodesTrimmed: 0 });

  it("rejects invalid slice parameters with 400 before invoking compaction", async () => {
    let calls = 0;
    const post = await route(async () => {
      calls += 1;
      return ok();
    });
    for (const body of [
      { scope: "bogus" },
      { scope: "nodes", offset: -1 },
      { scope: "nodes", offset: 1.5 },
      { scope: "nodes", offset: "5" },
      { scope: "nodes", limit: 0 },
      { scope: "nodes", limit: "5" },
    ]) {
      const r = await post(body);
      expect(r.status_code, JSON.stringify(body)).toBe(400);
    }
    expect(calls).toBe(0);
  });

  it("passes valid parameters through and returns 200", async () => {
    let seen: unknown;
    const post = await route(async (req) => {
      seen = req.payload;
      return ok();
    });
    const r = await post({ scope: "edges", offset: 0, limit: 1000 });
    expect(r.status_code).toBe(200);
    expect(seen).toEqual({ scope: "edges", offset: 0, limit: 1000 });
    expect((await post({})).status_code).toBe(200);
  });

  it("returns 500 when compaction reports its own failure, without leaking the error", async () => {
    const post = await route(async () => ({
      success: false,
      error: "kv write failed: disk full",
    }));
    const r = await post({ scope: "nodes", offset: 0, limit: 10 });
    expect(r.status_code).toBe(500);
    expect(r.body).toEqual({ error: "Graph compaction failed" });
  });

  it("returns 504 when the invocation times out", async () => {
    const { InvocationError } = await import("iii-sdk");
    const post = await route(async () => {
      throw new InvocationError({ code: "TIMEOUT", message: "timed out" });
    });
    const r = await post({});
    expect(r.status_code).toBe(504);
  });

  it("returns 500 for other failures, not the graph-disabled advice", async () => {
    const post = await route(async () => {
      throw new Error("worker gone");
    });
    const r = await post({});
    expect(r.status_code).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/GRAPH_EXTRACTION_ENABLED/);
  });
});
