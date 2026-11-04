import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = readFileSync("src/viewer/index.html", "utf8");
const script = viewer.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1];
const parsed = ts.createSourceFile("viewer.js", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ["clearGraphView", "noteGraphGeneration", "setGraphData", "mergeGraphRows", "loadGraph", "applyGraphDelta", "handleGraphChange", "scheduleGraphReload", "fetchGraphDetail", "searchGraphRemote", "loadSnapshot", "applySnapshot"];
const functions = parsed.statements.filter((s) => ts.isFunctionDeclaration(s) && names.includes(s.name!.text)).map((s) => s.getText(parsed)).join("\n");
const oldNode = { id: "old", type: "concept", name: "Old graph evidence" };
const fullEmpty = { full: true, nodes: [], edges: [], degrees: {} };

function deferred<T = any>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function rig() {
  const graph = {
    loaded: true, loading: false, dirty: false, generation: "before", requestSeq: 0, searchRequestSeq: 0, resetSeq: 0,
    nodeMap: { old: oldNode } as Record<string, unknown>, edgeMap: {}, degrees: { old: 2 }, fresh: { old: 1 },
    selectedId: "old" as string | null, detail: { id: "old", data: { node: oldNode } } as any,
    totalNodes: 1, totalEdges: 0, rev: 0, patches: 0, fetches: 0, search: "", searchOpen: false,
  };
  const api = vi.fn();
  const apiPost = vi.fn();
  const route = vi.fn();
  const context = {
    state: { graph, activeTab: "graph" }, api, apiGet: api, apiPost, setRouteEntity: route,
    store: { graph: { stats: { totalNodes: 1, totalEdges: 0 } } },
    GRAPH_LIMIT: 500, graphReloadTimer: null, graphSim: { canvas: null, hoverId: "old", drag: {} },
    setTimeout, clearTimeout, document: { getElementById: () => null },
    renderGraphView: vi.fn(), renderGraphDetail: vi.fn(), renderGraphOverview: vi.fn(),
    syncGraphSim: vi.fn(), requestGraphDraw: vi.fn(), centerGraphOn: vi.fn(), selectGraphNode: vi.fn(),
    graphSearchMatches: () => [],
    renderFlagsChip: vi.fn(), renderFlagsPanel: vi.fn(), updateCountBadges: vi.fn(), updateFooter: vi.fn(),
    markDirty: vi.fn(), renderTab: vi.fn(), tabRendered: { graph: true },
  };
  const f = runInNewContext(`${functions}\n({${names.join(",")}})`, context);
  return { ...f, graph, api, apiPost, route, context };
}

function reset(r: ReturnType<typeof rig>, delta: unknown = fullEmpty) {
  r.handleGraphChange({ source: "snapshot", reset: true, generation: "after", delta });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("viewer graph reset boundaries", () => {
  it("clears a selected node, details, degrees and route on an empty full reset", () => {
    const r = rig();
    reset(r);
    expect(r.graph).toMatchObject({ selectedId: null, detail: null, nodeMap: {}, edgeMap: {}, degrees: {}, fresh: {}, loaded: true });
    expect(r.route).toHaveBeenCalledWith("graph", "");
    expect(r.context.graphSim).toMatchObject({ hoverId: null, drag: null });
  });

  it.each([true, false])("ignores a pre-reset graph query (previously loaded: %s)", async (loaded) => {
    const r = rig();
    r.graph.loaded = loaded;
    const response = deferred();
    r.apiPost.mockReturnValueOnce(response.promise);
    const pending = r.loadGraph();
    reset(r);
    response.resolve({ nodes: [oldNode], edges: [] });
    await pending;
    expect(r.graph.nodeMap).toEqual({});
    expect(r.graph).toMatchObject({ selectedId: null, loading: false, loaded: true });
  });

  it("ignores an old detail response even when the same id is requested again", async () => {
    const r = rig();
    const before = deferred();
    const after = deferred();
    r.api.mockReturnValueOnce(before.promise).mockReturnValueOnce(after.promise);
    const first = r.fetchGraphDetail("old");
    reset(r);
    const second = r.fetchGraphDetail("old");
    before.resolve({ node: oldNode, relations: [] });
    await first;
    expect(r.graph.nodeMap).toEqual({});
    expect(r.graph.detail.loading).toBe(true);
    after.resolve({ error: "Node not found" });
    await second;
    expect(r.graph.nodeMap).toEqual({});
    expect(r.graph.detail.error).toBe("Node not found");
  });

  it("ignores a delayed remote search and its automatic selection after reset", async () => {
    const r = rig();
    const response = deferred();
    r.apiPost.mockReturnValueOnce(response.promise);
    const pending = r.searchGraphRemote("Old graph");
    reset(r);
    response.resolve({ nodes: [oldNode], edges: [] });
    await pending;
    expect(r.graph.nodeMap).toEqual({});
    expect(r.graph.searchOpen).toBe(false);
    expect(r.context.selectGraphNode).not.toHaveBeenCalled();
  });

  it("ignores the stats fallback of a failed query when reset occurs during that second request", async () => {
    const r = rig();
    const stats = deferred();
    const entered = deferred();
    r.apiPost.mockResolvedValueOnce(null);
    r.api.mockImplementationOnce(() => { entered.resolve(undefined); return stats.promise; });
    const pending = r.loadGraph();
    await entered.promise;
    expect(r.api).toHaveBeenCalled();
    reset(r);
    stats.resolve({ error: "Old error", flag: "old" });
    await pending;
    expect(r.graph).toMatchObject({ queryError: null, disabledInfo: null, loaded: true });
  });

  it("clears a prior generation on reconnect and handles explicit same-generation resets", () => {
    const r = rig();
    r.noteGraphGeneration({ generation: "after" });
    expect(r.graph).toMatchObject({ selectedId: null, detail: null, nodeMap: {}, generation: "after" });
    r.graph.nodeMap.old = oldNode;
    r.graph.selectedId = "old";
    reset(r);
    expect(r.graph).toMatchObject({ selectedId: null, nodeMap: {} });
  });

  it("discards a viewer snapshot captured before a reset without reverting generation or counts", async () => {
    const r = rig();
    const snapshot = deferred();
    r.api.mockReturnValueOnce(snapshot.promise);
    const pending = r.loadSnapshot();
    reset(r);
    snapshot.resolve({ graph: { generation: "before", stats: { totalNodes: 1 } }, counts: { graphNodes: 1 } });
    expect(await pending).toBe(false);
    expect(r.graph).toMatchObject({ generation: "after", nodeMap: {}, selectedId: null });
  });

  it("retries a reset-invalidated snapshot once to recover startup metadata", async () => {
    const r = rig();
    const snapshot = deferred();
    r.api.mockReturnValueOnce(snapshot.promise).mockResolvedValueOnce({
      graph: { generation: "after", stats: { totalNodes: 0 } },
      provider: "fixture-provider", flags: [{ name: "fixture-flag" }], version: "fixture-version",
    });
    const pending = r.loadSnapshot();
    reset(r);
    snapshot.resolve({ graph: { generation: "before" }, provider: "obsolete" });
    expect(await pending).toBe(true);
    expect(r.api).toHaveBeenCalledTimes(2);
    expect(r.context.store).toMatchObject({ provider: "fixture-provider", version: "fixture-version", flags: [{ name: "fixture-flag" }] });
    expect(r.graph.generation).toBe("after");
  });

  it("stops retrying when another reset invalidates the second snapshot", async () => {
    const r = rig();
    const first = deferred();
    const second = deferred();
    const entered = deferred();
    r.api.mockReturnValueOnce(first.promise).mockImplementationOnce(() => { entered.resolve(undefined); return second.promise; });
    const pending = r.loadSnapshot();
    reset(r);
    first.resolve({ graph: { generation: "before" } });
    await entered.promise;
    reset(r);
    second.resolve({ graph: { generation: "after" } });
    expect(await pending).toBe(false);
    expect(r.api).toHaveBeenCalledTimes(2);
  });

  it.each(["query", "full delta"])("keeps the initial snapshot valid after an ordinary empty %s", async (kind) => {
    const r = rig();
    Object.assign(r.graph, { nodeMap: {}, selectedId: null, detail: null, loaded: false, generation: undefined });
    const snapshot = deferred();
    r.api.mockReturnValueOnce(snapshot.promise);
    const pending = r.loadSnapshot();
    if (kind === "query") r.setGraphData({ nodes: [], edges: [], totalNodes: 0 });
    else r.applyGraphDelta(fullEmpty);
    expect(r.graph.resetSeq).toBe(0);
    snapshot.resolve({ graph: { generation: "current" }, provider: "fixture-provider" });
    expect(await pending).toBe(true);
    expect(r.api).toHaveBeenCalledTimes(1);
    expect(r.context.store).toMatchObject({ provider: "fixture-provider" });
  });

  it("invalidates old queries and selection even when the reset delta requires a reload", () => {
    const r = rig();
    reset(r, null);
    expect(r.graph).toMatchObject({ selectedId: null, detail: null, nodeMap: {}, loaded: false, dirty: true });
    expect(r.graph.requestSeq).toBeGreaterThan(0);
  });

  it("drops old snapshot totals when a reset could only send an item invalidation", () => {
    const r = rig();
    r.handleGraphChange({ source: "items", reset: true, coveredBySnapshot: false });
    expect(r.context.store.graph).toBeNull();
    expect(r.graph).toMatchObject({ selectedId: null, detail: null, nodeMap: {}, dirty: true, totalNodes: 0 });
  });

  it("preserves selected nodes outside an ordinary snapshot's top-node window", () => {
    const r = rig();
    const detail = r.graph.detail;
    r.handleGraphChange({ source: "snapshot", generation: "before", delta: { full: true, nodes: [{ id: "top", type: "concept", name: "Top node" }], edges: [] } });
    expect(r.graph.nodeMap.old).toEqual(oldNode);
    expect(r.graph.selectedId).toBe("old");
    expect(r.graph.detail).toBe(detail);
    expect(r.graph.requestSeq).toBe(0);
  });

  it("clears stale selected data when a reload returns an empty graph without a reset event", async () => {
    const r = rig();
    const detail = deferred();
    r.api.mockReturnValueOnce(detail.promise);
    const pending = r.fetchGraphDetail("old");
    r.apiPost.mockResolvedValueOnce({ nodes: [], edges: [], totalNodes: 0, totalEdges: 0 });
    await r.loadGraph();
    detail.resolve({ node: oldNode });
    await pending;
    expect(r.graph).toMatchObject({ selectedId: null, detail: null, nodeMap: {}, loaded: true });
  });
});
