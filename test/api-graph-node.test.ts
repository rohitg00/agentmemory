import { describe, it, expect, vi } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";
import { getSearchIndex } from "../src/functions/search.js";
import { initializeGraphIndex, reconcileGraphIndexRecord } from "../src/state/graph-retrieval-index.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import { indexObservationSession } from "../src/state/obs-index.js";
import { KV } from "../src/state/schema.js";

type Handler = (req: unknown) => Promise<{ status_code: number; body: Record<string, unknown> }>;

async function setup(seed: Record<string, Record<string, unknown>>) {
  const store = new Map<string, Map<string, unknown>>();
  for (const [scope, rows] of Object.entries(seed)) store.set(scope, new Map(Object.entries(rows)));
  const kv = {
    get: vi.fn(async (scope: string, key: string) => store.get(scope)?.get(key) ?? null),
    set: vi.fn(async (scope: string, key: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
      return value;
    }),
    delete: vi.fn(async (scope: string, key: string) => { store.get(scope)?.delete(key); }),
    list: vi.fn(async () => { throw new Error("Unbounded list forbidden"); }),
  };
  await initializeGraphIndex(kv as never, { status: "ready" });
  for (const [id, row] of Object.entries(seed[KV.graphNodes] ?? {})) await reconcileGraphIndexRecord(kv as never, "node", id, row as never);
  for (const [id, row] of Object.entries(seed[KV.graphEdges] ?? {})) await reconcileGraphIndexRecord(kv as never, "edge", id, row as never);
  for (const row of Object.values(seed[KV.memories] ?? {})) {
    const memory = row as any;
    getSearchIndex().add(memoryToObservation({ content: "", strength: 5, sessionIds: [], ...memory }), "memory");
  }
  const handlers = new Map<string, Handler>();
  const sdk = {
    registerFunction: (id: string, fn: Handler) => handlers.set(id, fn),
    registerTrigger: () => {},
    trigger: vi.fn(async () => ({})),
    on: () => {},
  };
  registerApiTriggers(sdk as never, kv as never);
  return Object.assign((query_params: Record<string, string>) =>
    handlers.get("api::graph-node")!({ headers: {}, query_params, body: {} }), { kv });
}

const node = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) => ({
  id, name, type, properties: {}, sourceObservationIds: [], createdAt: "2026-09-01T00:00:00Z", ...extra,
});

describe("GET /agentmemory/graph/node", () => {
  it("resolves durable observation provenance with a cold search index", async () => {
    const call = await setup({
      [KV.graphNodes]: { cold: node("cold", "Cold source", "concept", { sourceObservationIds: ["obs_cold"] }) },
      [KV.observations("session_cold")]: { obs_cold: { id: "obs_cold", sessionId: "session_cold", title: "Durable evidence" } },
      [KV.sessions]: { session_cold: { id: "session_cold", project: "cold-project" } },
    });
    await indexObservationSession(call.kv as never, "obs_cold", "session_cold");
    getSearchIndex().clear();
    const result = await call({ id: "cold" });
    expect(result.status_code).toBe(200);
    expect(result.body).toMatchObject({ provenance: {
      observationIds: ["obs_cold"], observations: [{ id: "obs_cold", sessionId: "session_cold", title: "Durable evidence" }], projects: ["cold-project"],
    } });
    expect(call.kv.list).not.toHaveBeenCalled();
    await call.kv.delete(KV.observations("session_cold"), "obs_cold");
    expect((await call({ id: "cold" })).status_code).toBe(404);
  });

  it("resolves canonical memory provenance with a cold search index and rejects superseded sources", async () => {
    const memory = { id: "mem_cold", title: "Durable memory", type: "fact", project: "cold-project", isLatest: true, concepts: [], files: [] };
    const call = await setup({
      [KV.graphNodes]: { cold: node("cold", "Cold memory", "concept", { sourceObservationIds: [memory.id] }) },
      [KV.memories]: { [memory.id]: memory },
    });
    getSearchIndex().clear();
    const result = await call({ id: "cold" });
    expect(result.status_code).toBe(200);
    expect(result.body).toMatchObject({ provenance: {
      observationIds: [memory.id], observations: [], memories: [{ id: memory.id, title: memory.title, project: memory.project, via: "observation" }],
    } });
    expect(call.kv.list).not.toHaveBeenCalled();
    await call.kv.set(KV.memories, memory.id, { ...memory, isLatest: false });
    expect((await call({ id: "cold" })).status_code).toBe(404);
  });

  it("returns relations with neighbors and resolves provenance to observations, sessions, projects and memories", async () => {
    const index = getSearchIndex();
    index.add({ id: "obs_gn_1", sessionId: "ses_gn", timestamp: "2026-09-01T00:00:00Z", type: "file_edit", title: "Edit checkout", facts: [], narrative: "edited", concepts: [], files: [], importance: 5 } as never);
    const call = await setup({
      [KV.graphNodes]: {
        gn_a: node("gn_a", "/work/web-app/src/components/Checkout.tsx", "file", { sourceObservationIds: ["obs_gn_1"] }),
        gn_b: node("gn_b", "pricing", "concept"),
        gn_c: node("gn_c", "orders.ts", "file", { properties: { source: "graphify", sourceFile: "src/orders.ts" } }),
      },
      [KV.graphEdges]: {
        ge_1: { id: "ge_1", type: "related_to", sourceNodeId: "gn_a", targetNodeId: "gn_b", weight: 0.4, sourceObservationIds: ["obs_gn_1"], createdAt: "t" },
        ge_2: { id: "ge_2", type: "imports", sourceNodeId: "gn_c", targetNodeId: "gn_a", weight: 0.9, sourceObservationIds: [], createdAt: "t" },
        ge_3: { id: "ge_3", type: "uses", sourceNodeId: "gn_b", targetNodeId: "gn_c", weight: 0.9, sourceObservationIds: [], createdAt: "t" },
      },
      [KV.graphNodeDegree]: { gn_a: 2 },
      [KV.observations("ses_gn")]: {
        obs_gn_1: { id: "obs_gn_1", sessionId: "ses_gn", title: "Edit checkout", type: "file_edit", timestamp: "2026-09-01T00:00:00Z" },
      },
      [KV.sessions]: { ses_gn: { id: "ses_gn", project: "web-app", agentId: "coder", status: "completed", startedAt: "2026-09-01T00:00:00Z" } },
      [KV.memories]: {
        mem_1: { id: "mem_1", title: "Coupons first", type: "bug", project: "web-app", isLatest: true, concepts: [], files: [], sourceObservationIds: ["obs_gn_1"] },
        mem_2: { id: "mem_2", title: "Checkout grid", type: "pattern", isLatest: true, concepts: [], files: ["src/components/Checkout.tsx"] },
        mem_3: { id: "mem_3", title: "Old", type: "fact", isLatest: false, concepts: [], files: [], sourceObservationIds: ["obs_gn_1"] },
        mem_4: { id: "mem_4", title: "Unrelated", type: "fact", isLatest: true, concepts: ["deploy"], files: [] },
      },
    });

    const res = await call({ id: "gn_a" });
    expect(res.status_code).toBe(200);
    const body = res.body as Record<string, any>;
    expect(body.node.id).toBe("gn_a");
    expect(body.degree).toBe(2);
    expect(body.relationsTotal).toBe(2);
    expect(body.relations).toEqual([
      { edgeId: "ge_2", type: "imports", direction: "in", weight: 0.9, observationCount: 0, neighbor: { id: "gn_c", name: "orders.ts", type: "file" } },
      { edgeId: "ge_1", type: "related_to", direction: "out", weight: 0.4, observationCount: 1, neighbor: { id: "gn_b", name: "pricing", type: "concept" } },
    ]);
    expect(body.provenance.observations).toEqual([
      { id: "obs_gn_1", sessionId: "ses_gn", title: "Edit checkout", type: "file_edit", timestamp: "2026-09-01T00:00:00Z" },
    ]);
    expect(body.provenance.sessions).toEqual([
      { id: "ses_gn", project: "web-app", agentId: "coder", status: "completed", startedAt: "2026-09-01T00:00:00Z" },
    ]);
    expect(body.provenance.projects).toEqual(["web-app"]);
    expect(body.provenance.memories).toEqual([
      { id: "mem_2", title: "Checkout grid", type: "pattern", via: "name" },
    ]);
    expect(body.provenance.structural).toBeNull();

    const imported = await call({ id: "gn_c" });
    expect((imported.body as Record<string, any>).provenance.structural).toEqual({ source: "graphify", sourceFile: "src/orders.ts" });
    expect((imported.body as Record<string, any>).provenance.observations).toEqual([]);

    expect((await call({})).status_code).toBe(400);
    expect((await call({ id: "gn_missing" })).status_code).toBe(404);
    index.clear();
  });
});


it("paginates high-degree adjacency without full graph or memory lists", async () => {
  const graphNodes = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`n${i}`, node(`n${i}`, `Node ${i}`, "concept")]));
  const graphEdges = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`e${i}`, {
    id: `e${i}`, sourceNodeId: "n0", targetNodeId: `n${i + 1}`, type: "uses", weight: 1, sourceObservationIds: [], createdAt: "2026-01-01",
  }]));
  const call = await setup({ [KV.graphNodes]: graphNodes, [KV.graphEdges]: graphEdges });
  const first = await call({ id: "n0", limit: "2" });
  expect(first.status_code).toBe(200);
  expect(first.body.relations).toHaveLength(2);
  expect(first.body.relationsTruncated).toBe(true);
  expect(first.body.relationsTotalExact).toBe(false);
  const second = await call({ id: "n0", limit: "2", cursor: first.body.relationsCursor as string });
  expect(second.status_code).toBe(200);
  const firstIds = (first.body.relations as any[]).map((row) => row.edgeId);
  expect((second.body.relations as any[]).every((row) => !firstIds.includes(row.edgeId))).toBe(true);
  expect((await call({ id: "n0", limit: "0" })).status_code).toBe(400);
  expect((await call({ id: "n0", cursor: "not-a-cursor" })).status_code).toBe(400);
});
