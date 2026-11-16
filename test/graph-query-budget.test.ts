import { describe, expect, it, vi } from "vitest";
import { createGraphIndexState } from "./helpers/graph-index-state.js";
import { queryGraphIndex } from "../src/functions/graph-index-query.js";
import { getGraphIndexStatus, initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { resetGraphGeneration } from "../src/state/graph-generation.js";
import { KV } from "../src/state/schema.js";
import type { GraphNode } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const queryBytes = 4 * 1024 * 1024;

async function largeGraph(): Promise<ReturnType<typeof createGraphIndexState>> {
  const state = createGraphIndexState();
  await initializeGraphIndex(state.kv, { status: "ready" });
  const properties = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`field${i}`, "a".repeat(512)]));
  for (let i = 0; i <= 400; i++) {
    const row: GraphNode = {
      id: `node-${i}`, name: i === 400 ? "zebra-needle" : `common note ${i}`,
      type: "concept", properties, sourceObservationIds: ["obs"], createdAt: "2026-11-12T00:00:00Z",
    };
    await state.kv.set(KV.graphNodes, row.id, row);
  }
  state.calls.length = 0;
  return state;
}

describe("graph query byte budget", () => {
  it("returns bounded matches from a stable index instead of a revision-change warning", async () => {
    const { kv, store, calls, intercept } = await largeGraph();
    const before = await getGraphIndexStatus(kv);
    let readBytes = 0;
    intercept(async (id, payload) => {
      if (id === "state::get" && payload.scope === KV.graphRetrievalData) {
        readBytes += Buffer.byteLength(JSON.stringify(store.get(payload.scope)?.get(payload.key) ?? null));
      }
    });
    const result = await queryGraphIndex(kv, { query: "common", limit: 500 });
    expect(readBytes).toBeGreaterThan(queryBytes);
    expect(readBytes).toBeLessThanOrEqual(queryBytes + 32 * 1024);
    expect(calls.filter(call => call.scope === KV.graphRetrievalData)).toHaveLength(
      calls.filter(call => call.scope === KV.graphRetrievalData && call.id === "state::get").length,
    );
    expect(calls.filter(call => call.scope === KV.graphRetrievalData).length).toBeLessThanOrEqual(2048);
    expect(calls.some(call => call.id === "state::list")).toBe(false);
    expect(await getGraphIndexStatus(kv)).toEqual(before);
    expect(result).toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ type: "concept" })]),
      truncated: true, warning: expect.stringContaining("Graph response is bounded"),
    });
    expect(result.nodes.length).toBeLessThan(400);
    expect(result.nodes.every(node => node.name.startsWith("common note "))).toBe(true);
  });

  it("returns a complete rare-character query against the same large index", async () => {
    const { kv } = await largeGraph();
    const result = await queryGraphIndex(kv, { query: "zebra-needle" });
    expect(result.nodes.map(node => node.id)).toEqual(["node-400"]);
    expect(result).toMatchObject({ truncated: false, totalNodes: 1 });
    expect(result.warning).toBeUndefined();
  });

  it.each(["revision", "build", "generation", "pending"] as const)(
    "still discards bounded matches if the %s changes before the final check",
    async (change) => {
      const { kv, store, intercept } = await largeGraph();
      let readBytes = 0;
      let changed = false;
      intercept(async (id, payload) => {
        if (id !== "state::get") return;
        if (payload.scope === KV.graphRetrievalData) {
          readBytes += Buffer.byteLength(JSON.stringify(store.get(payload.scope)?.get(payload.key) ?? null));
        }
        if (!changed && readBytes > queryBytes && payload.scope === KV.graphRetrievalControl && payload.key === "current") {
          changed = true;
          if (change === "generation") {
            await resetGraphGeneration(kv, { version: 1, dirty: false });
          } else {
            const control = (await getGraphIndexStatus(kv))!;
            await kv.set(KV.graphRetrievalControl, "current", {
              ...control,
              ...(change === "revision" ? { revision: control.revision + 1 }
                : change === "build" ? { buildId: `${control.buildId}-new` }
                : { pending: { kind: "node", id: "pending-node" } }),
            });
          }
        }
      });
      const result = await queryGraphIndex(kv, { query: "common", limit: 500 });
      expect(readBytes).toBeGreaterThan(queryBytes);
      expect(changed).toBe(true);
      expect(result).toMatchObject({ nodes: [], edges: [], truncated: true, warning: expect.stringContaining("changed") });
    },
  );
});
