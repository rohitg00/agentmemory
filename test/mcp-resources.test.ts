import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerMcpEndpoints } from "../src/mcp/server.js";
import { persistGraphDelta, registerGraphFunction } from "../src/functions/graph.js";
import { registerSnapshotFunction } from "../src/functions/snapshot.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { getSearchIndex, setEmbeddingProvider, setIndexPersistence, setVectorIndex } from "../src/functions/search.js";
import { StateKV, applyUpdateOps } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { setGraphGenerationListener } from "../src/state/graph-generation.js";
import { getGraphIndexStatus, initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import type { Session, SessionSummary, Memory, ExportData, GraphEdge, GraphNode, GraphSnapshot } from "../src/types.js";

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
  const triggerOverrides = new Map<string, Function>();
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
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      if (triggerOverrides.has(id)) {
        return triggerOverrides.get(id)!(payload);
      }
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      triggerOverrides.set(id, handler);
    },
    getFunction: (id: string) => functions.get(id),
  };
}

function makeReq(body?: unknown, headers?: Record<string, string>) {
  return {
    body,
    headers: headers || {},
    query_params: {},
  };
}

describe("MCP Resources", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerMcpEndpoints(sdk as never, kv as never);
  });

  it("lists 6 resources", async () => {
    const fn = sdk.getFunction("mcp::resources::list")!;
    const result = (await fn(makeReq())) as {
      status_code: number;
      body: { resources: unknown[] };
    };

    expect(result.status_code).toBe(200);
    expect(result.body.resources).toHaveLength(6);
  });

  it("reads agentmemory://status", async () => {
    const session: Session = {
      id: "ses_1",
      project: "/test",
      cwd: "/test",
      startedAt: new Date().toISOString(),
      status: "active",
      observationCount: 5,
    };
    await kv.set("mem:sessions", "ses_1", session);

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(makeReq({ uri: "agentmemory://status" }))) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data.sessionCount).toBe(1);
  });

  it("reads agentmemory://project/{name}/profile", async () => {
    sdk.overrideTrigger("mem::profile", async () => ({
      project: "/myapp",
      topConcepts: [{ concept: "auth", frequency: 5 }],
    }));

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://project/myapp/profile" }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data.project).toBe("/myapp");
  });

  it("reads agentmemory://project/{name}/recent with sorted summaries", async () => {
    const summaries: SessionSummary[] = [
      {
        sessionId: "ses_1",
        project: "myapp",
        createdAt: "2026-01-01T00:00:00Z",
        title: "Old session",
        narrative: "old",
        keyDecisions: [],
        filesModified: [],
        concepts: [],
        observationCount: 1,
      },
      {
        sessionId: "ses_2",
        project: "myapp",
        createdAt: "2026-02-01T00:00:00Z",
        title: "New session",
        narrative: "new",
        keyDecisions: [],
        filesModified: [],
        concepts: [],
        observationCount: 2,
      },
      {
        sessionId: "ses_3",
        project: "other",
        createdAt: "2026-02-15T00:00:00Z",
        title: "Other project",
        narrative: "other",
        keyDecisions: [],
        filesModified: [],
        concepts: [],
        observationCount: 3,
      },
    ];
    for (const s of summaries) {
      await kv.set("mem:summaries", s.sessionId, s);
    }

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://project/myapp/recent" }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data).toHaveLength(2);
    expect(data[0].sessionId).toBe("ses_2");
  });

  it("reads agentmemory://memories/latest", async () => {
    const memories: Memory[] = [
      {
        id: "mem_1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-02-01T00:00:00Z",
        type: "pattern",
        title: "Latest pattern",
        content: "content",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 5,
        version: 1,
        isLatest: true,
      },
      {
        id: "mem_2",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-15T00:00:00Z",
        type: "bug",
        title: "Old bug",
        content: "content",
        concepts: [],
        files: [],
        sessionIds: [],
        strength: 3,
        version: 2,
        isLatest: false,
      },
    ];
    for (const m of memories) {
      await kv.set("mem:memories", m.id, m);
    }

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://memories/latest" }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("mem_1");
    expect(data[0].title).toBe("Latest pattern");
  });

  it("returns the mem::graph-stats payload unchanged, warning included", async () => {
    const stats = {
      totalNodes: 3,
      totalEdges: 2,
      nodesByType: { file: 2, other: 1 },
      edgesByType: { imports: 2 },
      fromSnapshot: false,
      fromIndex: true,
      available: true,
      coverage: "partial",
      updatedAt: "2026-10-12T12:00:00.000Z",
      warning:
        "Counts describe indexed live records; oversized projections may be incomplete and unrecognized types are grouped under other.",
    };
    sdk.overrideTrigger("mem::graph-stats", async () => stats);

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://graph/stats" }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    expect(JSON.parse(result.body.contents[0].text)).toEqual(stats);
  });

  it("returns 404 for unknown URI", async () => {
    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({ uri: "agentmemory://nonexistent" }),
    )) as { status_code: number };

    expect(result.status_code).toBe(404);
  });

  it("returns 401 when auth fails", async () => {
    const authedSdk = mockSdk();
    const authedKv = mockKV();
    registerMcpEndpoints(authedSdk as never, authedKv as never, "test-secret");

    const fn = authedSdk.getFunction("mcp::resources::list")!;
    const result = (await fn(makeReq())) as { status_code: number };
    expect(result.status_code).toBe(401);

    const authedResult = (await fn(
      makeReq(undefined, { authorization: "Bearer test-secret" }),
    )) as { status_code: number };
    expect(authedResult.status_code).toBe(200);
  });

  it("handles URI with special characters via decodeURIComponent", async () => {
    sdk.overrideTrigger("mem::profile", async (data: any) => ({
      project: data.project,
      topConcepts: [],
    }));

    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({
        uri: "agentmemory://project/my%20app%2Fsubdir/profile",
      }),
    )) as {
      status_code: number;
      body: { contents: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const data = JSON.parse(result.body.contents[0].text);
    expect(data.project).toBe("my app/subdir");
  });

  it("returns 400 for malformed percent-encoding in URI", async () => {
    const fn = sdk.getFunction("mcp::resources::read")!;
    const result = (await fn(
      makeReq({
        uri: "agentmemory://project/bad%E0encoding/profile",
      }),
    )) as { status_code: number; body: { error: string } };

    expect(result.status_code).toBe(400);
    expect(result.body.error).toContain("percent-encoding");
  });
});

describe("MCP graph/stats resource over live graph state", () => {
  const timestamp = "2026-10-12T12:00:00.000Z";
  const node = (id: string): GraphNode => ({ id, name: id, type: "concept", properties: {}, sourceObservationIds: [], createdAt: timestamp });
  const edge = (id: string, sourceNodeId: string, targetNodeId: string): GraphEdge => ({
    id, sourceNodeId, targetNodeId, type: "related_to", weight: 0.8, sourceObservationIds: [], createdAt: timestamp,
  });
  const unavailable = {
    totalNodes: null, totalEdges: null, nodesByType: {}, edgesByType: {},
    fromSnapshot: false, fromIndex: false, available: false, coverage: "unknown",
    warning: expect.stringContaining("Graph index counts are unavailable"),
  };
  const dirs: string[] = [];

  async function rig(options: { index?: "ready" | "building" | "none" } = {}) {
    const dir = mkdtempSync(join(tmpdir(), "mcp-graph-stats-"));
    dirs.push(dir);
    const store = new Map<string, Map<string, unknown>>();
    const handlers = new Map<string, (data?: any) => Promise<any>>();
    const listed: string[] = [];
    const sdk = {
      registerFunction: (idOrOpts: string | { id: string }, fn: (data?: any) => Promise<any>) =>
        handlers.set(typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id, fn),
      registerTrigger: vi.fn(),
      trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }): Promise<any> => {
        if (!id.startsWith("state::")) return handlers.get(id)!(payload);
        const rows = store.get(payload.scope) ?? new Map<string, unknown>();
        if (id === "state::get") return structuredClone(rows.get(payload.key) ?? null);
        if (id === "state::list") {
          listed.push(payload.scope);
          return structuredClone([...rows.values()]);
        }
        if (id === "state::delete") rows.delete(payload.key);
        else if (id === "state::set") rows.set(payload.key, structuredClone(payload.value));
        else if (id === "state::update") rows.set(payload.key, applyUpdateOps(structuredClone(rows.get(payload.key) ?? null), payload.ops));
        else throw new Error(`unexpected state call ${id}`);
        store.set(payload.scope, rows);
        return structuredClone(rows.get(payload.key) ?? null);
      },
    };
    const kv = new StateKV(sdk as never);
    if (options.index !== "none") await initializeGraphIndex(kv, { status: options.index ?? "ready" });
    registerGraphFunction(sdk as never, kv, { name: "noop" } as never);
    registerSnapshotFunction(sdk as never, kv, dir);
    registerExportImportFunction(sdk as never, kv);
    registerMcpEndpoints(sdk as never, kv);
    const call = (id: string, payload: any = {}) => sdk.trigger({ function_id: id, payload });
    // Clears the spy first: reset, import and restore legitimately list scopes.
    const readStats = async () => {
      listed.length = 0;
      const result = await call("mcp::resources::read", makeReq({ uri: "agentmemory://graph/stats" }));
      expect(result.status_code).toBe(200);
      expect(listed).toEqual([]);
      return JSON.parse(result.body.contents[0].text);
    };
    return { kv, call, readStats };
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    setGraphGenerationListener(null);
    setIndexPersistence(null);
    setEmbeddingProvider(null);
    setVectorIndex(null);
    getSearchIndex().clear();
  });

  it("reports unavailable counts when the graph index is missing", async () => {
    const r = await rig({ index: "none" });
    expect(await r.readStats()).toEqual(unavailable);
  });

  it("reports unavailable counts while the graph index is building or paused", async () => {
    const building = await rig({ index: "building" });
    expect(await building.readStats()).toEqual(unavailable);

    const paused = await rig();
    const control = (await getGraphIndexStatus(paused.kv))!;
    await paused.kv.set(KV.graphRetrievalControl, "current", { ...control, status: "paused" });
    expect(await paused.readStats()).toEqual(unavailable);
  });

  it("reports unavailable counts while a record mutation is pending", async () => {
    const r = await rig();
    await persistGraphDelta(r.kv, [node("a")], []);
    const control = (await getGraphIndexStatus(r.kv))!;
    await r.kv.set(KV.graphRetrievalControl, "current", { ...control, pending: { kind: "node", id: "a" } });
    expect(await r.readStats()).toEqual(unavailable);
    expect((await getGraphIndexStatus(r.kv))!.pending).toEqual({ kind: "node", id: "a" });
  });

  it("reports unavailable counts while the graph snapshot is dirty", async () => {
    const r = await rig();
    await persistGraphDelta(r.kv, [node("a"), node("b")], [edge("ab", "a", "b")]);
    const snapshot = (await r.kv.get<GraphSnapshot>(KV.graphSnapshot, "current"))!;
    await r.kv.set(KV.graphSnapshot, "current", { ...snapshot, dirty: true });
    expect((await getGraphIndexStatus(r.kv))!.batchPending).toBe(true);
    expect(await r.readStats()).toEqual(unavailable);
  });

  it("returns the new generation's counts after a graph reset", async () => {
    const r = await rig();
    await persistGraphDelta(r.kv, [node("a"), node("b"), node("c")], [edge("ab", "a", "b"), edge("bc", "b", "c")]);
    expect(await r.readStats()).toMatchObject({ totalNodes: 3, totalEdges: 2, available: true });

    expect(await r.call("mem::graph-reset")).toMatchObject({ success: true });
    expect(await r.readStats()).toMatchObject({
      totalNodes: 0, totalEdges: 0, nodesByType: {}, edgesByType: {},
      fromIndex: true, available: true, coverage: "complete",
    });
  });

  it("returns the imported generation's counts after a replace import", async () => {
    const r = await rig();
    await persistGraphDelta(r.kv, [node("a"), node("b"), node("c")], [edge("ab", "a", "b"), edge("bc", "b", "c")]);
    const exportData: ExportData = {
      version: "0.9.30", exportedAt: timestamp, sessions: [], observations: {}, memories: [], summaries: [],
      graphNodes: [node("x"), node("y")], graphEdges: [edge("xy", "x", "y")],
    };

    expect(await r.call("mem::import", { exportData, strategy: "replace" })).toMatchObject({ success: true });
    expect(await r.readStats()).toMatchObject({
      totalNodes: 2, totalEdges: 1, nodesByType: { concept: 2 }, edgesByType: { related_to: 1 },
      fromIndex: true, available: true, coverage: "complete",
    });
  });

  it("returns the merged counts after a default merge import", async () => {
    const r = await rig();
    await persistGraphDelta(r.kv, [node("a"), node("b"), node("c")], [edge("ab", "a", "b")]);
    const exportData: ExportData = {
      version: "0.9.30", exportedAt: timestamp, sessions: [], observations: {}, memories: [], summaries: [],
      graphNodes: [node("d")], graphEdges: [edge("cd", "c", "d")],
    };

    expect(await r.call("mem::import", { exportData })).toMatchObject({ success: true });
    expect(await r.readStats()).toMatchObject({
      totalNodes: 4, totalEdges: 2, nodesByType: { concept: 4 }, edgesByType: { related_to: 2 },
      fromIndex: true, available: true, coverage: "complete",
    });
  });

  it("returns the restored counts after a snapshot restore that follows a reset", async () => {
    const r = await rig();
    await persistGraphDelta(r.kv, [node("a"), node("b")], [edge("ab", "a", "b")]);
    const created = await r.call("mem::snapshot-create");
    expect(created.success).toBe(true);
    await persistGraphDelta(r.kv, [node("c")], []);
    expect(await r.readStats()).toMatchObject({ totalNodes: 3, totalEdges: 1 });
    await r.call("mem::graph-reset");
    expect(await r.readStats()).toMatchObject({ totalNodes: 0, totalEdges: 0, available: true });

    expect(await r.call("mem::snapshot-restore", { commitHash: created.snapshot.commitHash })).toMatchObject({ success: true });
    expect(await r.readStats()).toMatchObject({
      totalNodes: 2, totalEdges: 1, nodesByType: { concept: 2 }, edgesByType: { related_to: 1 },
      fromIndex: true, available: true, coverage: "complete",
    });
  });
});
