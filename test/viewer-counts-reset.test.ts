import { afterEach, describe, expect, it, vi } from "vitest";
import { KV } from "../src/state/schema.js";
import type { StateKV } from "../src/state/kv.js";
import {
  getViewerCounts, invalidateViewerCounts, noteGraphStats,
  readViewerGraphMetadata, resetViewerCounts, setViewerCountsEmitter,
} from "../src/state/viewer-counts.js";
import { createGraphIndexState } from "./helpers/graph-index-state.js";

const control = (nodes: number) => ({ schema: 2, buildId: "test", status: "ready", revision: 0, nodes, edges: 0, historyEdges: 0, incompleteRecords: 0, nodesByType: {}, edgesByType: {}, otherTypes: 0, updatedAt: "now" });

const stats = (totalNodes: number) => ({ totalNodes, totalEdges: 0, nodesByType: {}, edgesByType: {} });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

afterEach(() => { resetViewerCounts(); vi.useRealTimers(); });

describe("viewer count invalidation", () => {
  it.each([null, { status: "building" }, { status: "paused" }, { pending: { kind: "node", id: "a" } }, { batchPending: true }, { revision: -1 }])(
    "keeps unknown or unavailable graph counts unknown without touching the legacy snapshot: %j", async (overrides) => {
      const { kv, store, calls } = createGraphIndexState();
      store.set(KV.graphSnapshot, new Map([["current", { stats: stats(9000), payload: "x".repeat(512 * 1024) }]]));
      if (overrides) store.set(KV.graphRetrievalControl, new Map([["current", { ...control(5), ...overrides }]]));
      expect(await getViewerCounts(kv)).toMatchObject({ graphNodes: null, graphEdges: null });
      expect(calls.some((call) => call.scope === KV.graphSnapshot || call.scope === KV.graphNodes || call.scope === KV.graphEdges)).toBe(false);
    },
  );

  it("refreshes cached graph totals from maintained control without rescanning other scopes", async () => {
    const { kv, store, calls } = createGraphIndexState();
    store.set(KV.graphRetrievalControl, new Map([["current", control(2)]]));
    expect((await getViewerCounts(kv)).graphNodes).toBe(2);
    calls.length = 0;
    store.get(KV.graphRetrievalControl)!.set("current", control(3));
    expect((await getViewerCounts(kv)).graphNodes).toBe(3);
    expect(calls.every((call) => call.id === "state::get" && [KV.graphControl, KV.graphRetrievalControl].includes(call.scope))).toBe(true);
    expect(await readViewerGraphMetadata(kv)).toMatchObject({ stats: { totalNodes: 3 }, graphIndex: { status: "ready" } });
  });

  it("reloads reset counts and preserves the live emitter", async () => {
    vi.useFakeTimers();
    let total = 2;
    const kv = { list: async () => [], get: async (scope: string) => scope === KV.graphRetrievalControl ? control(total) : null } as unknown as StateKV;
    const emit = vi.fn();
    setViewerCountsEmitter(emit);
    expect((await getViewerCounts(kv)).graphNodes).toBe(2);
    total = 0;
    invalidateViewerCounts();
    expect((await getViewerCounts(kv)).graphNodes).toBe(0);
    noteGraphStats(stats(1));
    await vi.advanceTimersByTimeAsync(500);
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ graphNodes: 1 }));
  });

  it("does not retain stale counts when invalidated during both load attempts", async () => {
    const entered = [deferred(), deferred()];
    const release = [deferred(), deferred()];
    let reads = 0;
    let total = 2;
    const kv = {
      list: async () => [],
      get: async (scope: string) => {
        if (scope !== KV.graphRetrievalControl) return null;
        const result = control(total);
        const index = reads++;
        if (index < 2) { entered[index].resolve(); await release[index].promise; }
        return result;
      },
    } as unknown as StateKV;
    const pending = getViewerCounts(kv);
    await entered[0].promise;
    total = 1;
    invalidateViewerCounts();
    release[0].resolve();
    await entered[1].promise;
    total = 0;
    invalidateViewerCounts();
    release[1].resolve();
    await pending;
    expect((await getViewerCounts(kv)).graphNodes).toBe(0);
    expect(reads).toBe(3);
  });
});
