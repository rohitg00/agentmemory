import { describe, expect, it, vi } from "vitest";
import { StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { resetGraphGeneration } from "../src/state/graph-generation.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const secret = "graph-surface-test";
const emptySnapshot = { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, edgesByType: {} } };

function rig() {
  const store = new Map<string, Map<string, unknown>>();
  const handlers = new Map<string, (req: unknown) => Promise<any>>();
  let resetOnNodeRead = false;
  const sdk = {
    registerFunction: (id: string, handler: (req: unknown) => Promise<any>) => handlers.set(id, handler),
    registerTrigger: () => {},
    trigger: async ({ function_id, payload }: { function_id: string; payload: { scope: string; key: string; value?: unknown } }) => {
      const { scope, key, value } = payload;
      if (function_id === "state::get") return store.get(scope)?.get(key) ?? null;
      if (function_id === "state::set") {
        if (!store.has(scope)) store.set(scope, new Map());
        store.get(scope)!.set(key, value);
        return value;
      }
      if (function_id === "state::list") {
        const rows = [...(store.get(scope)?.values() ?? [])];
        if (resetOnNodeRead && (scope === KV.graphNodes || scope.startsWith(`${KV.graphNodes}:generation:`))) {
          resetOnNodeRead = false;
          await resetGraphGeneration(kv, emptySnapshot);
        }
        return rows;
      }
      throw new Error(`Unexpected state operation: ${function_id}`);
    },
  };
  const kv = new StateKV(sdk as never);
  registerApiTriggers(sdk as never, kv, secret);
  registerMcpEndpoints(sdk as never, kv, secret);
  return {
    kv,
    resetDuringNextRead: () => { resetOnNodeRead = true; },
    exportMesh: () => handlers.get("api::mesh-export")!({ headers: { authorization: `Bearer ${secret}` }, query_params: {} }),
    readStats: async () => {
      const result = await handlers.get("mcp::resources::read")!({ headers: { authorization: `Bearer ${secret}` }, body: { uri: "agentmemory://graph/stats" } });
      expect(result.status_code).toBe(200);
      return JSON.parse(result.body.contents[0].text);
    },
  };
}

describe.each(["legacy", "rotated"])("%s graph reads across a concurrent reset", (generation) => {
  async function seeded() {
    const r = rig();
    if (generation === "rotated") await resetGraphGeneration(r.kv, emptySnapshot);
    for (const id of ["node-a", "node-b"]) {
      await r.kv.set(KV.graphNodes, id, { id, type: "file", name: `${id}.ts`, sourceObservationIds: [], createdAt: "2026-10-12T00:00:00Z" });
    }
    await r.kv.set(KV.graphEdges, "edge-a", { id: "edge-a", type: "imports", sourceNodeId: "node-a", targetNodeId: "node-b", createdAt: "2026-10-12T00:00:00Z" });
    r.resetDuringNextRead();
    return r;
  }

  it("exports nodes and edges from one generation, then observes the reset on a new request", async () => {
    const r = await seeded();
    const before = await r.exportMesh();
    expect(before.status_code).toBe(200);
    expect(before.body.graphNodes.map((n: { id: string }) => n.id)).toEqual(["node-a", "node-b"]);
    expect(before.body.graphEdges.map((e: { id: string }) => e.id)).toEqual(["edge-a"]);
    const after = await r.exportMesh();
    expect(after.body.graphNodes).toEqual([]);
    expect(after.body.graphEdges).toEqual([]);
  });

  it("reports consistent MCP counts, then observes the reset on a new resource read", async () => {
    const r = await seeded();
    expect(await r.readStats()).toMatchObject({ totalNodes: 2, totalEdges: 1, nodesByType: { file: 2 }, edgesByType: { imports: 1 } });
    expect(await r.readStats()).toMatchObject({ totalNodes: 0, totalEdges: 0 });
  });
});
