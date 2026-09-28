import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";
import { getSearchIndex, rankMemoryIds, setVectorIndex, setEmbeddingProvider } from "../src/functions/search.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import { KV } from "../src/state/schema.js";
import type { Memory } from "../src/types.js";

type Handler = (req: unknown) => Promise<{ status_code: number; body: Record<string, unknown> }>;

function mockKV(seed: Record<string, Record<string, unknown>>) {
  const store = new Map<string, Map<string, unknown>>();
  for (const [scope, rows] of Object.entries(seed)) store.set(scope, new Map(Object.entries(rows)));
  return {
    get: vi.fn(async (scope: string, key: string) => store.get(scope)?.get(key) ?? null),
    set: vi.fn(async (scope: string, key: string, value: unknown) => value),
    delete: vi.fn(async () => {}),
    list: vi.fn(async (scope: string) => Array.from(store.get(scope)?.values() ?? [])),
  };
}

function memory(id: string, updatedAt: string, extra: Partial<Memory> = {}): Memory {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    type: "fact",
    title: id,
    content: `content for ${id}`,
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 7,
    version: 1,
    isLatest: true,
    ...extra,
  } as Memory;
}

function setup(seed: Record<string, Record<string, unknown>>) {
  const handlers = new Map<string, Handler>();
  const sdk = {
    registerFunction: (id: string, fn: Handler) => handlers.set(id, fn),
    registerTrigger: () => {},
    trigger: vi.fn(async () => ({})),
    on: () => {},
  };
  const kv = mockKV(seed);
  registerApiTriggers(sdk as never, kv as never);
  return { handlers, kv };
}

async function call(handlers: Map<string, Handler>, id: string, query_params: Record<string, string>) {
  return handlers.get(id)!({ headers: {}, query_params, body: {} });
}

describe("paginated and filtered list endpoints", () => {
  beforeEach(() => {
    setVectorIndex(null);
    setEmbeddingProvider(null);
  });

  it("walks memories with a cursor, newest first, applying project and type filters", async () => {
    const rows: Record<string, Memory> = {};
    for (let i = 0; i < 7; i++) {
      const id = `mem_${i}`;
      rows[id] = memory(id, `2026-09-0${i + 1}T00:00:00Z`, {
        project: i % 2 === 0 ? "web" : "api",
        type: i === 4 ? "bug" : "fact",
      });
    }
    const { handlers } = setup({ [KV.memories]: rows });

    const first = await call(handlers, "api::memories", { project: "web", limit: "2" });
    expect((first.body.memories as Memory[]).map((m) => m.id)).toEqual(["mem_6", "mem_4"]);
    expect(first.body.total).toBe(4);
    const second = await call(handlers, "api::memories", { project: "web", limit: "2", cursor: first.body.nextCursor as string });
    expect((second.body.memories as Memory[]).map((m) => m.id)).toEqual(["mem_2", "mem_0"]);
    expect(second.body.nextCursor).toBeNull();

    const bugs = await call(handlers, "api::memories", { type: "bug" });
    expect((bugs.body.memories as Memory[]).map((m) => m.id)).toEqual(["mem_4"]);

    const legacy = await call(handlers, "api::memories", { limit: "3", offset: "3" });
    expect((legacy.body.memories as Memory[]).map((m) => m.id)).toEqual(["mem_3", "mem_2", "mem_1"]);
    expect(legacy.body.offset).toBe(3);

    const everything = await call(handlers, "api::memories", {});
    expect((everything.body.memories as Memory[]).length).toBe(7);
    expect(everything.body.nextCursor).toBeNull();
  });

  it("ranks memories with the search index when q is set, keeping filters", async () => {
    const auth = memory("mem_auth", "2026-09-01T00:00:00Z", { title: "jwt auth", content: "rotate jwt refresh tokens nightly", project: "web" });
    const other = memory("mem_db", "2026-09-05T00:00:00Z", { title: "db", content: "postgres vacuum schedule", project: "web" });
    const scoped = memory("mem_auth_api", "2026-09-06T00:00:00Z", { title: "jwt", content: "jwt verification in api gateway", project: "api" });
    const index = getSearchIndex();
    for (const m of [auth, other, scoped]) index.add(memoryToObservation(m));
    const { handlers } = setup({ [KV.memories]: { [auth.id]: auth, [other.id]: other, [scoped.id]: scoped } });

    const res = await call(handlers, "api::memories", { q: "jwt", project: "web" });
    expect((res.body.memories as Memory[]).map((m) => m.id)).toEqual(["mem_auth"]);
    expect(res.body.search).toEqual({ query: "jwt", mode: "keyword" });

    const all = await call(handlers, "api::memories", { q: "jwt", limit: "1" });
    expect((all.body.memories as Memory[]).length).toBe(1);
    expect(all.body.nextCursor).toEqual(expect.any(String));
    for (const m of [auth, other, scoped]) index.remove(m.id);
  });

  it("fuses keyword and vector ranks so a meaning-only match still surfaces", async () => {
    const index = getSearchIndex();
    const keywordHit = memory("mem_kw", "2026-09-01T00:00:00Z", { title: "deploy", content: "deploy pipeline uses canary stage" });
    index.add(memoryToObservation(keywordHit));
    const vectors = new VectorIndex();
    vectors.add("mem_vec", "memory", new Float32Array([1, 0, 0]));
    vectors.add("mem_kw", "memory", new Float32Array([0, 1, 0]));
    vectors.add("obs_1", "s1", new Float32Array([1, 0, 0]));
    setVectorIndex(vectors);
    setEmbeddingProvider({
      name: "fake",
      dimensions: 3,
      embed: async () => new Float32Array([1, 0, 0]),
      embedBatch: async (texts: string[]) => texts.map(() => new Float32Array([1, 0, 0])),
    });
    const ranked = await rankMemoryIds("deploy", 10);
    expect(ranked.mode).toBe("hybrid");
    expect(ranked.ids).toEqual(expect.arrayContaining(["mem_kw", "mem_vec"]));
    expect(ranked.ids).not.toContain("obs_1");
    index.remove(keywordHit.id);
  });

  it("returns project, agent and type facets over latest memories and filters by agent", async () => {
    const rows: Record<string, Memory> = {
      a: memory("a", "2026-09-01T00:00:00Z", { project: "web", agentId: "coder", type: "bug" }),
      b: memory("b", "2026-09-02T00:00:00Z", { project: "web", agentId: "reviewer" }),
      c: memory("c", "2026-09-03T00:00:00Z", { project: "infra", agentId: "coder" }),
      old: memory("old", "2026-08-01T00:00:00Z", { project: "legacy", agentId: "ghost", isLatest: false }),
    };
    const { handlers } = setup({ [KV.memories]: rows });

    const res = await call(handlers, "api::memories", { latest: "true", limit: "1", facets: "true", project: "web" });
    expect(res.body.facets).toEqual({
      projects: [{ value: "web", count: 2 }, { value: "infra", count: 1 }],
      agents: [{ value: "coder", count: 2 }, { value: "reviewer", count: 1 }],
      types: [{ value: "fact", count: 2 }, { value: "bug", count: 1 }],
    });
    expect(res.body.total).toBe(2);

    const plain = await call(handlers, "api::memories", { latest: "true" });
    expect(plain.body.facets).toBeUndefined();

    const coder = await call(handlers, "api::memories", { latest: "true", agentId: "coder" });
    expect((coder.body.memories as Memory[]).map((m) => m.id)).toEqual(["c", "a"]);
  });

  it("maps mem::evolve failures to HTTP status codes", async () => {
    const { handlers } = setup({});
    const evolve = handlers.get("api::evolve")!;
    const sdkTrigger = (code: string) => vi.fn(async () => ({ success: false, code, error: code }));
    const run = async (code: string) => {
      const handlersForCode = new Map<string, Handler>();
      const sdk = { registerFunction: (id: string, fn: Handler) => handlersForCode.set(id, fn), registerTrigger: () => {}, trigger: sdkTrigger(code), on: () => {} };
      registerApiTriggers(sdk as never, mockKV({}) as never);
      return handlersForCode.get("api::evolve")!({ headers: {}, query_params: {}, body: { memoryId: "mem_1", newContent: "x" } });
    };
    expect((await run("not_found")).status_code).toBe(404);
    expect((await run("not_latest")).status_code).toBe(409);
    expect((await run("unchanged")).status_code).toBe(400);
    expect((await evolve({ headers: {}, query_params: {}, body: { memoryId: "mem_1" } })).status_code).toBe(400);
    expect((await evolve({ headers: {}, query_params: {}, body: { memoryId: "mem_1", newContent: "y" } })).status_code).toBe(200);
  });

  it("filters and pages sessions, loading summaries only for the returned page", async () => {
    const sessions: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) {
      sessions[`s${i}`] = {
        id: `s${i}`,
        project: i < 3 ? "web" : "api",
        status: i === 0 ? "active" : "completed",
        startedAt: `2026-09-0${i + 1}T00:00:00Z`,
        firstPrompt: i === 2 ? "Fix the login redirect" : "other",
      };
    }
    const { handlers, kv } = setup({ [KV.sessions]: sessions });

    const page = await call(handlers, "api::sessions", { project: "web", limit: "2" });
    expect((page.body.sessions as Array<{ id: string }>).map((s) => s.id)).toEqual(["s2", "s1"]);
    const summaryReads = kv.get.mock.calls.filter(([scope]) => scope === KV.summaries).length;
    expect(summaryReads).toBe(2);
    const next = await call(handlers, "api::sessions", { project: "web", limit: "2", cursor: page.body.nextCursor as string });
    expect((next.body.sessions as Array<{ id: string }>).map((s) => s.id)).toEqual(["s0"]);
    expect(next.body.nextCursor).toBeNull();

    const active = await call(handlers, "api::sessions", { status: "active" });
    expect((active.body.sessions as Array<{ id: string }>).map((s) => s.id)).toEqual(["s0"]);
    const search = await call(handlers, "api::sessions", { q: "login" });
    expect((search.body.sessions as Array<{ id: string }>).map((s) => s.id)).toEqual(["s2"]);
  });

  it("filters and pages observations inside a session", async () => {
    const observations: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) {
      observations[`o${i}`] = {
        id: `o${i}`,
        sessionId: "s1",
        timestamp: `2026-09-01T00:00:0${i}Z`,
        type: i % 2 === 0 ? "file_edit" : "command_run",
        title: i === 3 ? "npm test failed" : `step ${i}`,
        importance: i,
      };
    }
    const { handlers } = setup({ [KV.observations("s1")]: observations });

    const missing = await call(handlers, "api::observations", {});
    expect(missing.status_code).toBe(400);

    const first = await call(handlers, "api::observations", { sessionId: "s1", limit: "2" });
    expect((first.body.observations as Array<{ id: string }>).map((o) => o.id)).toEqual(["o4", "o3"]);
    expect(first.body.total).toBe(5);
    const rest = await call(handlers, "api::observations", { sessionId: "s1", limit: "5", cursor: first.body.nextCursor as string });
    expect((rest.body.observations as Array<{ id: string }>).map((o) => o.id)).toEqual(["o2", "o1", "o0"]);

    const edits = await call(handlers, "api::observations", { sessionId: "s1", type: "file_edit", minImportance: "2" });
    expect((edits.body.observations as Array<{ id: string }>).map((o) => o.id).sort()).toEqual(["o2", "o4"]);
    const failed = await call(handlers, "api::observations", { sessionId: "s1", q: "FAILED" });
    expect((failed.body.observations as Array<{ id: string }>).map((o) => o.id)).toEqual(["o3"]);
  });
  it("returns session facets over every session in scope and filters by agent", async () => {
    const sessions: Record<string, unknown> = {
      a: { id: "a", project: "web", agentId: "coder", status: "active", startedAt: "2026-09-01T00:00:00Z" },
      b: { id: "b", project: "web", agentId: "reviewer", status: "completed", startedAt: "2026-09-02T00:00:00Z" },
      c: { id: "c", project: "infra", agentId: "coder", status: "completed", startedAt: "2026-09-03T00:00:00Z" },
    };
    const { handlers } = setup({ [KV.sessions]: sessions });
    const res = await call(handlers, "api::sessions", { agentId: "coder", limit: "10", facets: "true" });
    expect((res.body.sessions as Array<{ id: string }>).map((s) => s.id)).toEqual(["c", "a"]);
    expect(res.body.facets).toEqual({
      projects: [{ value: "web", count: 2 }, { value: "infra", count: 1 }],
      agents: [{ value: "coder", count: 2 }, { value: "reviewer", count: 1 }],
      statuses: [{ value: "completed", count: 2 }, { value: "active", count: 1 }],
    });
    const plain = await call(handlers, "api::sessions", { limit: "10" });
    expect(plain.body.facets).toBeUndefined();
  });

  it("lists the memories produced from one session by session id or source observation", async () => {
    const rows: Record<string, Memory> = {
      direct: memory("direct", "2026-09-01T00:00:00Z", { sessionIds: ["s1"] }),
      viaObs: memory("viaObs", "2026-09-02T00:00:00Z", { sessionIds: [], sourceObservationIds: ["o1"] } as Partial<Memory>),
      other: memory("other", "2026-09-03T00:00:00Z", { sessionIds: ["s2"], sourceObservationIds: ["o9"] } as Partial<Memory>),
      unrelated: memory("unrelated", "2026-09-04T00:00:00Z"),
    };
    const { handlers } = setup({
      [KV.memories]: rows,
      [KV.observations("s1")]: { o1: { id: "o1", sessionId: "s1", timestamp: "2026-09-01T00:00:00Z" } },
    });
    const res = await call(handlers, "api::memories", { latest: "true", sessionId: "s1", limit: "20" });
    expect((res.body.memories as Memory[]).map((m) => m.id)).toEqual(["viaObs", "direct"]);
    expect(res.body.total).toBe(2);
  });
  it("locates the session of observation ids through the search index", async () => {
    const index = getSearchIndex();
    index.add({ id: "obs_locate_1", sessionId: "ses_x", timestamp: "2026-09-01T00:00:00Z", type: "file_read", title: "Read", facts: [], narrative: "read a file", concepts: [], files: [], importance: 5 } as never);
    const { handlers } = setup({});
    const res = await call(handlers, "api::observations-locate", { ids: "obs_locate_1,obs_missing" });
    expect(res.body.sessions).toEqual({ obs_locate_1: "ses_x" });
    const bad = await call(handlers, "api::observations-locate", {});
    expect(bad.status_code).toBe(400);
    index.remove("obs_locate_1");
  });
});
