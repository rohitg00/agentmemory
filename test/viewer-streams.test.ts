import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerViewerStreamTriggers } from "../src/triggers/viewer-streams.js";
import { registerEventTriggers } from "../src/triggers/events.js";
import { getViewerCounts, resetViewerCounts } from "../src/state/viewer-counts.js";
import { KV } from "../src/state/schema.js";
import { recordAudit, setAuditRecordedListener } from "../src/functions/audit.js";

type Handler = (payload: unknown) => Promise<unknown>;
type Sent = { type: string; group_id: string; data: Record<string, unknown> };

function mockKV(seed: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, Map<string, unknown>>();
  for (const [scope, rows] of Object.entries(seed)) {
    store.set(scope, new Map(Object.entries(rows)));
  }
  return {
    store,
    get: vi.fn(async (scope: string, key: string) => store.get(scope)?.get(key) ?? null),
    set: vi.fn(async (scope: string, key: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
      return value;
    }),
    delete: vi.fn(async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    }),
    list: vi.fn(async (scope: string) => Array.from(store.get(scope)?.values() ?? [])),
  };
}

function setup(kv = mockKV(), deps: Record<string, unknown> = {}) {
  const handlers = new Map<string, Handler>();
  const triggers: Array<{ type: string; function_id: string; config: Record<string, unknown> }> = [];
  const sent: Sent[] = [];
  const sdk = {
    registerFunction: (id: string, fn: Handler) => handlers.set(id, fn),
    registerTrigger: (t: (typeof triggers)[number]) => triggers.push(t),
    trigger: vi.fn(async (req: { function_id: string; payload: Record<string, unknown> }) => {
      if (req.function_id === "stream::send") sent.push(req.payload as unknown as Sent);
      return {};
    }),
  };
  registerEventTriggers(sdk as never, kv as never);
  registerViewerStreamTriggers(sdk as never, kv as never, deps);
  return { handlers, triggers, sent, kv };
}

const seeded = () =>
  mockKV({
    [KV.sessions]: {
      s1: { id: "s1", status: "active", observationCount: 4 },
      s2: { id: "s2", status: "completed", observationCount: 6 },
    },
    [KV.memories]: {
      m1: { id: "m1", isLatest: true },
      m2: { id: "m2", isLatest: false },
    },
    [KV.lessons]: {
      l1: { id: "l1", content: "a" },
      l2: { id: "l2", content: "b", deleted: true },
    },
    [KV.actions]: { a1: { id: "a1" } },
    [KV.graphSnapshot]: {
      current: { stats: { totalNodes: 12, totalEdges: 7, nodesByType: {}, edgesByType: {} }, updatedAt: "t" },
    },
  });

describe("viewer stream triggers", () => {
  beforeEach(() => resetViewerCounts());
  afterEach(() => {
    vi.useRealTimers();
    resetViewerCounts();
    setAuditRecordedListener(null);
  });

  it("registers a state trigger for every scope the viewer shows", () => {
    const { triggers } = setup();
    const scopes = triggers.filter((t) => t.type === "state").map((t) => t.config.scope);
    for (const scope of [
      KV.sessions,
      KV.memories,
      KV.lessons,
      KV.actions,
      KV.crystals,
      KV.semantic,
      KV.procedural,
      KV.graphSnapshot,
      KV.graphNodes,
      KV.graphEdges,
      KV.config,
      KV.health,
    ]) {
      expect(scopes).toContain(scope);
    }
    const http = triggers.filter((t) => t.type === "http").map((t) => t.config.api_path);
    expect(http).toEqual(expect.arrayContaining(["/agentmemory/viewer/snapshot", "/agentmemory/counts"]));
  });

  it("pushes created, updated and deleted rows for lessons, actions, crystals, semantic, procedural and audit", async () => {
    const { handlers, sent, kv } = setup();
    const lesson = { id: "l9", content: "use pnpm", confidence: 0.6 };
    await handlers.get("event::viewer::lesson-changed")!({ key: "l9", event_type: "state:created", new_value: lesson });
    await handlers.get("event::viewer::lesson-changed")!({
      key: "l9",
      event_type: "state:updated",
      old_value: lesson,
      new_value: { ...lesson, confidence: 0.8 },
    });
    await handlers.get("event::viewer::lesson-changed")!({ key: "l9", event_type: "state:deleted", old_value: lesson, new_value: null });
    await handlers.get("event::viewer::action-changed")!({ key: "a1", event_type: "state:created", new_value: { id: "a1", title: "t" } });
    await handlers.get("event::viewer::crystal-changed")!({ key: "c1", event_type: "state:created", new_value: { id: "c1" } });
    await handlers.get("event::viewer::semantic-changed")!({ key: "f1", event_type: "state:created", new_value: { id: "f1" } });
    await handlers.get("event::viewer::procedural-changed")!({ key: "p1", event_type: "state:created", new_value: { id: "p1" } });
    await recordAudit(kv as never, "forget", "mem::forget", ["m1"]);
    expect(sent.map((e) => e.type)).toEqual([
      "lesson.created",
      "lesson.updated",
      "lesson.deleted",
      "action.created",
      "crystal.created",
      "semantic.created",
      "procedural.created",
      "audit.created",
    ]);
    expect(sent.every((e) => e.group_id === "viewer")).toBe(true);
    expect(sent[1].data).toEqual({ id: "l9", lesson: { ...lesson, confidence: 0.8 } });
    expect(sent[2].data).toEqual({ id: "l9", lesson: null });
    expect(sent[7].data.audit).toMatchObject({ operation: "forget", targetIds: ["m1"] });
  });

  it("pushes graph.changed from the snapshot and coalesces node and edge writes", async () => {
    vi.useFakeTimers();
    const { handlers, sent } = setup();
    await handlers.get("event::viewer::graph-snapshot-changed")!({
      key: "current",
      event_type: "state:updated",
      new_value: { stats: { totalNodes: 3, totalEdges: 2, nodesByType: { file: 3 }, edgesByType: {} }, updatedAt: "u1" },
    });
    await handlers.get("event::viewer::graph-snapshot-changed")!({ key: "other", event_type: "state:updated", new_value: {} });
    for (let i = 0; i < 5; i++) await handlers.get("event::viewer::graph-nodes-changed")!({ key: `n${i}` });
    for (let i = 0; i < 3; i++) await handlers.get("event::viewer::graph-edges-changed")!({ key: `e${i}` });
    expect(sent.map((e) => e.type)).toEqual(["graph.changed"]);
    expect(sent[0].data).toMatchObject({ source: "snapshot", stats: { totalNodes: 3, totalEdges: 2 } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.map((e) => e.type)).toEqual(["graph.changed", "graph.changed"]);
    expect(sent[1].data).toMatchObject({ source: "items", nodesChanged: 5, edgesChanged: 3 });
  });

  it("carries the changed subgraph on graph.changed so the viewer patches without a fetch", async () => {
    vi.useFakeTimers();
    const { handlers, sent } = setup();
    const n1 = { id: "n1", type: "file", name: "a.ts", properties: {}, sourceObservationIds: ["o1"], createdAt: "t" };
    const n2 = { id: "n2", type: "concept", name: "auth", properties: {}, sourceObservationIds: ["o1"], createdAt: "t" };
    const n3 = { id: "n3", type: "file", name: "b.ts", properties: {}, sourceObservationIds: ["o2"], createdAt: "t" };
    const e1 = { id: "e1", type: "related_to", sourceNodeId: "n1", targetNodeId: "n2", weight: 0.4, sourceObservationIds: ["o1"], createdAt: "t" };
    const e2 = { id: "e2", type: "related_to", sourceNodeId: "n2", targetNodeId: "n3", weight: 0.4, sourceObservationIds: ["o2"], createdAt: "t" };
    const stats = { totalNodes: 2, totalEdges: 1, nodesByType: {}, edgesByType: {} };
    const before = { topNodes: [n1, n2], topEdges: [e1], topDegrees: { n1: 1, n2: 1 }, stats, updatedAt: "u1" };
    const after = { topNodes: [n2, n3], topEdges: [e2], topDegrees: { n2: 1, n3: 1 }, stats, updatedAt: "u2" };
    await handlers.get("event::viewer::graph-snapshot-changed")!({ key: "current", event_type: "state:updated", old_value: before, new_value: after });
    expect(sent[0].data.delta).toEqual({
      full: false,
      nodes: [n3],
      edges: [e2],
      removedNodeIds: ["n1"],
      removedEdgeIds: ["e1"],
      degrees: { n3: 1 },
    });
    await handlers.get("event::viewer::graph-snapshot-changed")!({ key: "current", event_type: "state:created", new_value: after });
    expect(sent[1].data.delta).toMatchObject({ full: true, nodes: [n2, n3], removedNodeIds: [] });

    await handlers.get("event::viewer::graph-nodes-changed")!({ key: "n3" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent[2].data).toMatchObject({ source: "items", nodesChanged: 1, coveredBySnapshot: true });

    await vi.advanceTimersByTimeAsync(5000);
    await handlers.get("event::viewer::graph-edges-changed")!({ key: "e9" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent[3].data).toMatchObject({ source: "items", edgesChanged: 1, coveredBySnapshot: false });
  });

  it("drops the delta when the changed subgraph is too large to push", async () => {
    const { handlers, sent } = setup();
    const topNodes = Array.from({ length: 250 }, (_, i) => ({ id: `n${i}`, type: "file", name: `f${i}`, properties: {}, sourceObservationIds: [], createdAt: "t" }));
    await handlers.get("event::viewer::graph-snapshot-changed")!({
      key: "current",
      event_type: "state:updated",
      old_value: { topNodes: [], topEdges: [], topDegrees: {}, stats: {}, updatedAt: "u0" },
      new_value: { topNodes, topEdges: [], topDegrees: {}, stats: { totalNodes: 250, totalEdges: 0, nodesByType: {}, edgesByType: {} }, updatedAt: "u1" },
    });
    expect(sent[0].data.delta).toBeNull();
  });

  it("pushes consolidation.run only for the last pipeline run key", async () => {
    const { handlers, sent } = setup();
    await handlers.get("event::viewer::consolidation-changed")!({ key: "consolidation:lastRun", event_type: "state:updated", new_value: { at: "x" } });
    await handlers.get("event::viewer::consolidation-changed")!({
      key: "consolidation:lastPipelineRun",
      event_type: "state:updated",
      new_value: { at: "2026-09-28T00:00:00Z", tier: "all", results: {} },
    });
    expect(sent).toEqual([
      expect.objectContaining({
        type: "consolidation.run",
        data: expect.objectContaining({ lastRun: { at: "2026-09-28T00:00:00Z", tier: "all", results: {} } }),
      }),
    ]);
    const status = (sent[0].data as { status: { lastRunAt: string; tiers: Array<{ id: string }>; thresholds: unknown } }).status;
    expect(status.lastRunAt).toBe("2026-09-28T00:00:00Z");
    expect(status.tiers.map((t) => t.id)).toEqual(["semantic", "procedural", "relations"]);
    expect(status.thresholds).toMatchObject({ semanticMinSummaries: 5 });
  });

  it("pushes a health event with counts, indexes and the circuit breaker when the health monitor writes", async () => {
    const metricsStore = { getAll: vi.fn(async () => [{ functionId: "mem::observe", totalCalls: 3 }]) };
    const { handlers, sent } = setup(seeded(), { metricsStore, provider: { circuitState: { state: "closed" } } });
    await handlers.get("event::viewer::health-changed")!({ key: "_probe", event_type: "state:updated", new_value: { ts: 1 } });
    await handlers.get("event::viewer::health-changed")!({
      key: "latest",
      event_type: "state:updated",
      new_value: { status: "degraded", alerts: ["heap"], memory: { heapUsed: 1 } },
    });
    expect(sent.map((e) => e.type)).toEqual(["health"]);
    expect(sent[0].data).toMatchObject({
      status: "degraded",
      health: { alerts: ["heap"] },
      circuitBreaker: { state: "closed" },
      functionMetrics: [{ functionId: "mem::observe", totalCalls: 3 }],
      counts: { sessions: 2, observations: 10, memories: 2, latestMemories: 1, lessons: 1, actions: 1, graphNodes: 12, graphEdges: 7 },
      indexes: { bm25Documents: expect.any(Number), vectorDocuments: expect.any(Number) },
    });
    const report = (sent[0].data as { report: { status: string; headline: string; problems: Array<{ code: string; fix?: string }> } | null }).report;
    expect(report).not.toBeNull();
    expect(report!.problems.map((p) => p.code)).toContain("health-alert");
    expect(report!.problems.every((p) => !!p.fix)).toBe(true);
    expect(report!.headline).toMatch(/^Working, but needs attention/);
  });

  it("serves one snapshot with counts, health, flags, graph and consolidation state", async () => {
    const kv = seeded();
    kv.store.set(KV.health, new Map([["latest", { status: "healthy", alerts: [] }]]));
    kv.store.set(KV.config, new Map([["consolidation:lastPipelineRun", { at: "t", tier: "all", results: {} }]]));
    const { handlers } = setup(kv);
    const res = (await handlers.get("api::viewer-snapshot")!({ headers: {}, query_params: {} })) as {
      status_code: number;
      body: Record<string, unknown>;
    };
    expect(res.status_code).toBe(200);
    expect(res.body).toMatchObject({
      service: "agentmemory",
      status: "healthy",
      counts: { sessions: 2, activeSessions: 1, memories: 2 },
      graph: { stats: { totalNodes: 12 } },
      consolidation: { lastRun: { tier: "all" } },
      embeddingProvider: expect.any(String),
    });
    expect(Array.isArray(res.body.flags)).toBe(true);
  });

  it("rejects the snapshot and counts endpoints without the bearer when a secret is set", async () => {
    const { handlers } = setup(mockKV(), { secret: "s3cret" });
    const denied = (await handlers.get("api::counts")!({ headers: {} })) as { status_code: number };
    expect(denied.status_code).toBe(401);
    const allowed = (await handlers.get("api::counts")!({ headers: { authorization: "Bearer s3cret" } })) as {
      status_code: number;
    };
    expect(allowed.status_code).toBe(200);
    const snapshot = (await handlers.get("api::viewer-snapshot")!({ headers: {} })) as { status_code: number };
    expect(snapshot.status_code).toBe(401);
  });
});

describe("viewer counts", () => {
  beforeEach(() => resetViewerCounts());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetViewerCounts();
  });

  it("loads once, then keeps counts current from trigger deltas and pushes counts.changed", async () => {
    vi.useFakeTimers();
    const kv = seeded();
    const { handlers, sent } = setup(kv);
    const first = await getViewerCounts(kv as never);
    expect(first).toMatchObject({ sessions: 2, activeSessions: 1, observations: 10, memories: 2, latestMemories: 1, lessons: 1 });
    const listCalls = kv.list.mock.calls.length;

    await handlers.get("event::session::observation-count-changed")!({
      key: "s1",
      event_type: "state:updated",
      old_value: { id: "s1", status: "active", observationCount: 4 },
      new_value: { id: "s1", status: "completed", observationCount: 5 },
    });
    await handlers.get("event::memory::changed")!({ key: "m3", event_type: "state:created", new_value: { id: "m3", isLatest: true } });
    await handlers.get("event::memory::changed")!({
      key: "m1",
      event_type: "state:updated",
      old_value: { id: "m1", isLatest: true },
      new_value: { id: "m1", isLatest: false },
    });
    await handlers.get("event::viewer::lesson-changed")!({
      key: "l1",
      event_type: "state:updated",
      old_value: { id: "l1" },
      new_value: { id: "l1", deleted: true },
    });
    await handlers.get("event::viewer::graph-snapshot-changed")!({
      key: "current",
      event_type: "state:updated",
      new_value: { stats: { totalNodes: 20, totalEdges: 9, nodesByType: {}, edgesByType: {} }, updatedAt: "u" },
    });

    const after = await getViewerCounts(kv as never);
    expect(kv.list.mock.calls.length).toBe(listCalls);
    expect(after).toMatchObject({
      sessions: 2,
      activeSessions: 0,
      observations: 11,
      memories: 3,
      latestMemories: 1,
      lessons: 0,
      graphNodes: 20,
      graphEdges: 9,
    });

    await vi.advanceTimersByTimeAsync(500);
    const pushes = sent.filter((e) => e.type === "counts.changed");
    expect(pushes).toHaveLength(1);
    expect(pushes[0].data.counts).toMatchObject({ observations: 11, memories: 3, lessons: 0 });
  });

  it("re-reads when a write lands while the first load is in flight", async () => {
    const kv = seeded();
    const { handlers } = setup(kv);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const originalList = kv.list.getMockImplementation()!;
    kv.list.mockImplementationOnce(async (scope: string) => {
      await gate;
      return originalList(scope);
    });
    const pending = getViewerCounts(kv as never);
    kv.store.get(KV.sessions)!.set("s3", { id: "s3", status: "active", observationCount: 1 });
    await handlers.get("event::session::observation-count-changed")!({
      key: "s3",
      event_type: "state:created",
      new_value: { id: "s3", status: "active", observationCount: 1 },
    });
    release();
    const counts = await pending;
    expect(counts).toMatchObject({ sessions: 3, observations: 11 });
  });

  it("counts only in-scope sessions and memories when agent scope is isolated", async () => {
    vi.stubEnv("AGENT_ID", "agent-a");
    vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "isolated");
    const kv = mockKV({
      [KV.sessions]: {
        s1: { id: "s1", agentId: "agent-a", status: "active", observationCount: 2 },
        s2: { id: "s2", agentId: "agent-b", status: "active", observationCount: 9 },
      },
      [KV.memories]: { m1: { id: "m1", agentId: "agent-b", isLatest: true } },
    });
    const { handlers } = setup(kv);
    expect(await getViewerCounts(kv as never)).toMatchObject({ sessions: 1, observations: 2, memories: 0 });
    await handlers.get("event::memory::changed")!({ key: "m2", event_type: "state:created", new_value: { id: "m2", agentId: "agent-b" } });
    expect(await getViewerCounts(kv as never)).toMatchObject({ memories: 0 });
  });
});
