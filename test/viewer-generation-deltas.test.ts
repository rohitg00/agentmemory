import { onLiveEvent } from "../src/viewer/live-events.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV } from "../src/state/schema.js";
import { resetGraphGeneration, setGraphGenerationListener } from "../src/state/graph-generation.js";
import { registerViewerStreamTriggers } from "../src/triggers/viewer-streams.js";
import { getViewerCounts, resetViewerCounts } from "../src/state/viewer-counts.js";
import { setAuditRecordedListener } from "../src/functions/audit.js";
import type { GraphNode, GraphSnapshot } from "../src/types.js";
import { createGraphIndexState } from "./helpers/graph-index-state.js";
import { withoutGraphRecovery } from "../src/state/graph-consistency.js";

function snapshot(count: number): GraphSnapshot {
  const topNodes: GraphNode[] = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`, type: "concept", name: `node ${i}`, properties: {},
    sourceObservationIds: [], createdAt: "2026-10-12T12:00:00.000Z",
  }));
  return {
    version: 1, topNodes, topEdges: [], topDegrees: Object.fromEntries(topNodes.map((n) => [n.id, 0])),
    stats: { totalNodes: count, totalEdges: 0, nodesByType: { concept: count }, edgesByType: {} },
    updatedAt: "2026-10-12T12:00:00.000Z", dirty: false,
  };
}

async function setup() {
  const fixture = createGraphIndexState();
  const { kv } = fixture;
  const handlers = new Map<string, (data: any) => Promise<any>>();
  const sent: Array<{ type: string; data: any }> = [];
  let failSend = false;
  const unsubscribeEvents = onLiveEvent((event) => {
    if (failSend) { failSend = false; throw new Error("simulated SSE listener write failure"); }
    sent.push({ type: event.type, data: structuredClone(event.data) });
  });
  const sdk = {
    registerFunction: vi.fn((id: string, handler: (data: any) => Promise<any>) => handlers.set(id, handler)), registerTrigger: vi.fn(),
    trigger: async ({ function_id, payload }: { function_id: string; payload: any }): Promise<any> => {
      throw new Error(`Unexpected call ${function_id}`);
    },
  };
  await resetGraphGeneration(kv, snapshot(0));
  registerViewerStreamTriggers(sdk as never, kv);
  const write = async (count: number) => {
    for (const node of snapshot(count).topNodes) await kv.set(KV.graphNodes, node.id, node);
    await kv.set(KV.graphSnapshot, "current", snapshot(count));
  };
  const graphEvents = () => sent.filter((e) => e.type === "graph.changed");
  return { ...fixture, sdk, write, graphEvents, handlers, sent, failNextSend: () => { failSend = true; } };
}

afterEach(() => {
  vi.restoreAllMocks(); vi.useRealTimers();
  setGraphGenerationListener(null); setAuditRecordedListener(null); resetViewerCounts();
});

describe("generation graph viewer metadata", () => {
  it("uses bounded index metadata and invalidates the viewer instead of reading snapshot payloads", async () => {
    const { kv, write, graphEvents, calls } = await setup();
    await write(3);
    calls.length = 0;
    await withoutGraphRecovery(() => kv.set(KV.graphSnapshot, "current", { ...snapshot(999), padding: "x".repeat(512 * 1024) }));
    expect(graphEvents().at(-1)?.data).toMatchObject({ source: "snapshot", stats: { totalNodes: 3 }, delta: null });
    expect(Buffer.byteLength(JSON.stringify(graphEvents().at(-1)))).toBeLessThan(4096);
    expect(calls.filter((call) => call.id === "state::get" && call.scope.startsWith(KV.graphSnapshot))).toEqual([]);
  });

  it("retains accurate metadata after listener restart and failed delivery", async () => {
    const { kv, sdk, write, graphEvents, failNextSend } = await setup();
    await write(2);
    failNextSend(); await write(3);
    expect(graphEvents()).toHaveLength(1);
    registerViewerStreamTriggers(sdk as never, kv);
    await write(4);
    expect(graphEvents().at(-1)?.data).toMatchObject({ stats: { totalNodes: 4 }, delta: null });
  });

  it("detects repeated same-timestamp resets, including a lost reset notification", async () => {
    const { kv, write, graphEvents, failNextSend } = await setup();
    await write(2);
    for (const lostReset of [false, true, false]) {
      if (lostReset) failNextSend();
      const before = graphEvents().length;
      await resetGraphGeneration(kv, snapshot(0));
      if (!lostReset) expect(graphEvents()[before].data).toMatchObject({ reset: true, stats: { totalNodes: 0 }, delta: null });
      await write(1);
      expect(graphEvents().at(-1)?.data).toMatchObject({ stats: { totalNodes: 1 }, delta: null,
        generation: await kv.get(KV.graphControl, "generation") });
    }
  });

  it("invalidates after metadata failure and refreshes counts after reset", async () => {
    const { kv, write, graphEvents, intercept } = await setup();
    await write(2);
    expect((await getViewerCounts(kv)).graphNodes).toBe(2);
    let controlReads = 0;
    intercept(async (id, payload) => {
      if (id === "state::get" && payload.scope.startsWith(KV.graphRetrievalControl) && ++controlReads === 3) {
        intercept(); throw new Error("read failed");
      }
    });
    await kv.set(KV.graphSnapshot, "current", snapshot(3));
    expect(graphEvents().at(-1)?.data).toMatchObject({ source: "items", coveredBySnapshot: false });
    await resetGraphGeneration(kv, snapshot(0));
    expect((await getViewerCounts(kv)).graphNodes).toBe(0);
  });

  it("pushes counts after reset and does not mark failed notifications as covering item changes", async () => {
    vi.useFakeTimers();
    const { kv, write, sent, graphEvents, failNextSend } = await setup();
    await write(2); await getViewerCounts(kv);
    await resetGraphGeneration(kv, snapshot(0));
    await vi.advanceTimersByTimeAsync(500);
    expect(sent.filter((e) => e.type === "counts.changed").at(-1)?.data).toMatchObject({ counts: { graphNodes: 0 } });
    await kv.set(KV.graphNodes, "n0", snapshot(1).topNodes[0]);
    failNextSend(); await kv.set(KV.graphSnapshot, "current", snapshot(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(graphEvents().at(-1)?.data).toMatchObject({ source: "items", coveredBySnapshot: true });
  });

  it("tags reconnect metadata with its generation without reading the snapshot", async () => {
    const { kv, write, handlers, calls } = await setup();
    await write(2); calls.length = 0;
    const response = await handlers.get("api::viewer-snapshot")!({ headers: {}, query_params: {} });
    expect(response.body.graph).toMatchObject({ generation: await kv.get(KV.graphControl, "generation"), stats: { totalNodes: 2 } });
    expect(calls.filter((call) => call.id === "state::get" && call.scope.startsWith(KV.graphSnapshot))).toEqual([]);
  });

  it("defers direct-write notifications until the index commit finishes, even beyond the coalescing interval", async () => {
    vi.useFakeTimers();
    const { kv, sent, graphEvents, intercept } = await setup();
    expect((await getViewerCounts(kv)).graphNodes).toBe(0);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    intercept(async (id, payload) => {
      if (id === "state::set" && payload.scope.startsWith(KV.graphRetrievalData)) {
        intercept(); entered(); await gate;
      }
    });
    const mutation = kv.set(KV.graphNodes, "n0", snapshot(1).topNodes[0]);
    await ready;
    try {
      await vi.advanceTimersByTimeAsync(1500);
      expect(graphEvents()).toEqual([]);
    } finally { release(); }
    await mutation;
    await vi.advanceTimersByTimeAsync(1500);
    expect(graphEvents().at(-1)?.data).toMatchObject({ source: "items", nodesChanged: 1 });
    expect(sent.filter((event) => event.type === "counts.changed").at(-1)?.data).toMatchObject({ counts: { graphNodes: 1 } });
  });

  it("does not associate pre-reset counts with the new generation when metadata reads overlap reset", async () => {
    const { kv, write, graphEvents, intercept } = await setup();
    await write(2);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => { entered = r; });
    const gate = new Promise<void>((r) => { release = r; });
    let controlReads = 0;
    intercept(async (id, payload) => {
      if (id === "state::get" && payload.scope.startsWith(KV.graphRetrievalControl) && ++controlReads === 3) {
        intercept(); entered(); await gate;
      }
    });
    const notification = kv.set(KV.graphSnapshot, "current", snapshot(3));
    await ready;
    const oldGeneration = await kv.get(KV.graphControl, "generation");
    const reset = resetGraphGeneration(kv, snapshot(0));
    try { await vi.waitFor(async () => expect(await kv.get(KV.graphControl, "generation")).not.toBe(oldGeneration)); }
    finally { release(); }
    await Promise.all([notification, reset]);
    for (const event of graphEvents().slice(1)) expect(event.data).toMatchObject({ reset: true, stats: { totalNodes: 0 }, delta: null });
  });
});
