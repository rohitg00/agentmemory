import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { getSearchIndex } from "../src/functions/search.js";
import { HybridSearch } from "../src/state/hybrid-search.js";
import { KV } from "../src/state/schema.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import type { CompressedObservation, Memory } from "../src/types.js";

function fixture() {
  const store = new Map<string, Map<string, unknown>>();
  const kv = {
    get: async (scope: string, key: string) => store.get(scope)?.get(key) ?? null,
    set: async (scope: string, key: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
      return value;
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async (scope: string) => Array.from(store.get(scope)?.values() ?? []),
  };
  const index = getSearchIndex();
  const hybrid = new HybridSearch(index, null, null, kv as never, 0.4, 0.6, 0);
  const searchFn = vi.fn((...args: Parameters<HybridSearch["search"]>) => hybrid.search(...args));
  let handle!: (data: Record<string, unknown>) => Promise<{ results: Array<{ obsId: string }> }>;
  const sdk = {
    registerFunction: (_id: string, fn: typeof handle) => { handle = fn; },
    trigger: vi.fn(async () => ({ success: true, lessons: [] })),
  };
  registerSmartSearchFunction(sdk as never, kv as never, searchFn);

  const add = async (id: string, sessionId: string, project: string, agentId: string, text: string) => {
    const observation: CompressedObservation = {
      id, sessionId, agentId, timestamp: "2026-01-01T00:00:00Z", type: "discovery",
      title: text, narrative: text, facts: [], concepts: [], files: [], importance: 5,
    };
    index.add(observation);
    await kv.set(KV.observations(sessionId), id, observation);
    await kv.set(KV.sessions, sessionId, { id: sessionId, project });
  };
  const addStale = (id: string, sessionId: string, text: string) => {
    index.add({
      id, sessionId, timestamp: "2026-01-01T00:00:00Z", type: "discovery",
      title: text, narrative: text, facts: [], concepts: [], files: [], importance: 5,
    });
  };
  const addMemory = async (id: string, project: string, agentId: string, text: string) => {
    const memory: Memory = {
      id, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", type: "fact",
      title: text, content: text, concepts: [], files: [], sessionIds: [], strength: 5,
      version: 1, isLatest: true, agentId, project,
    };
    index.add(memoryToObservation(memory), "memory");
    await kv.set(KV.memories, id, memory);
  };
  const query = async (data: Record<string, unknown>) =>
    (await handle({ query: "deploy rollback", includeLessons: false, ...data })).results.map((r) => r.obsId).sort();
  return { add, addStale, addMemory, query, searchFn };
}

describe("smart search scoped ranking", () => {
  afterEach(() => getSearchIndex().clear());

  const weaker = "deploy rollback notes kept for the alpha service while the staging cluster was drained overnight";

  it.each([
    ["project", { project: "alpha" }],
    ["agent", { agentId: "agent-a" }],
  ])("returns in-scope observations ranked below 997 stronger out-of-scope ones (%s filter)", async (_name, scope) => {
    const f = fixture();
    for (let i = 0; i < 997; i++) await f.add(`obs_b_${i}`, `ses_b_${i}`, "beta", "agent-b", "deploy rollback");
    for (let i = 0; i < 3; i++) await f.add(`obs_a_${i}`, "ses_a", "alpha", "agent-a", weaker);

    for (const limit of [5, 20, 100]) {
      expect(await f.query({ ...scope, limit })).toEqual(["obs_a_0", "obs_a_1", "obs_a_2"]);
    }
    expect(f.searchFn).toHaveBeenCalledTimes(6);
  });

  it.each([
    ["project", { project: "alpha" }],
    ["agent", { agentId: "agent-a" }],
  ])("returns in-scope saved memories ranked below 997 stronger out-of-scope ones (%s filter)", async (_name, scope) => {
    const f = fixture();
    for (let i = 0; i < 997; i++) await f.addMemory(`mem_b_${i}`, "beta", "agent-b", "deploy rollback");
    for (let i = 0; i < 3; i++) await f.addMemory(`mem_a_${i}`, "alpha", "agent-a", weaker);

    for (const limit of [5, 20, 100]) {
      expect(await f.query({ ...scope, limit })).toEqual(["mem_a_0", "mem_a_1", "mem_a_2"]);
    }
    expect(f.searchFn).toHaveBeenCalledTimes(6);
  });

  it("completes a page that the first window left one row short", async () => {
    const f = fixture();
    for (let i = 0; i < 181; i++) await f.add(`obs_b_${i}`, `ses_b_${i}`, "beta", "agent-b", "deploy rollback");
    for (let i = 0; i < 20; i++) await f.add(`obs_a_${i}`, `ses_a_${i}`, "alpha", "agent-a", weaker);

    expect(await f.query({ project: "alpha", limit: 20 })).toHaveLength(20);
    expect(f.searchFn).toHaveBeenCalledTimes(2);
  });

  it("ranks again when an index entry without a stored record shortens the first window", async () => {
    const f = fixture();
    f.addStale("obs_gone", "ses_gone", "deploy rollback deploy rollback");
    for (let i = 0; i < 400; i++) await f.add(`obs_b_${i}`, `ses_b_${i}`, "beta", "agent-b", "deploy rollback");
    for (let i = 0; i < 3; i++) await f.add(`obs_a_${i}`, "ses_a", "alpha", "agent-a", weaker);

    expect(await f.query({ project: "alpha", limit: 20 })).toEqual(["obs_a_0", "obs_a_1", "obs_a_2"]);
  });

  it("keeps first-pass hits when the deeper ranking returns fewer", async () => {
    const f = fixture();
    for (let i = 0; i < 400; i++) await f.add(`obs_b_${i}`, `ses_b_${i}`, "beta", "agent-b", "deploy rollback");
    for (let i = 0; i < 3; i++) await f.add(`obs_a_${i}`, "ses_a", "alpha", "agent-a", "deploy rollback deploy rollback");
    const first = f.searchFn.getMockImplementation()!;
    f.searchFn.mockImplementationOnce(first).mockImplementationOnce(async () => []);

    expect(await f.query({ project: "alpha", limit: 20 })).toEqual(["obs_a_0", "obs_a_1", "obs_a_2"]);
    expect(f.searchFn).toHaveBeenCalledTimes(2);
  });

  it("keeps the requested layer on the deeper ranking", async () => {
    const f = fixture();
    for (let i = 0; i < 997; i++) await f.add(`obs_o_${i}`, `ses_o_${i}`, "alpha", "agent-a", "deploy rollback");
    for (let i = 0; i < 400; i++) await f.addMemory(`mem_b_${i}`, "beta", "agent-b", "deploy rollback");
    for (let i = 0; i < 3; i++) await f.addMemory(`mem_a_${i}`, "alpha", "agent-a", weaker);

    expect(await f.query({ project: "alpha", targetLayer: "memory" })).toEqual(["mem_a_0", "mem_a_1", "mem_a_2"]);
  });

  it("keeps a scoped search that fills its page to one ranking pass", async () => {
    const f = fixture();
    for (let i = 0; i < 250; i++) await f.add(`obs_a_${i}`, `ses_a_${i}`, "alpha", "agent-a", "deploy rollback");

    expect(await f.query({ project: "alpha", limit: 20 })).toHaveLength(20);
    expect(f.searchFn).toHaveBeenCalledTimes(1);
  });

  it("keeps one ranking pass when a stale index entry sits inside a window that covers the index", async () => {
    const f = fixture();
    f.addStale("obs_gone", "ses_gone", "deploy rollback deploy rollback");
    for (let i = 0; i < 150; i++) await f.add(`obs_b_${i}`, `ses_b_${i}`, "beta", "agent-b", "deploy rollback");
    for (let i = 0; i < 3; i++) await f.add(`obs_a_${i}`, "ses_a", "alpha", "agent-a", weaker);

    expect(await f.query({ project: "alpha", limit: 20 })).toEqual(["obs_a_0", "obs_a_1", "obs_a_2"]);
    expect(f.searchFn).toHaveBeenCalledTimes(1);
  });

  describe.each([
    ["project", { project: "alpha" }],
    ["agent", { agentId: "agent-a" }],
  ])("first window boundary (%s filter)", (_name, scope) => {
    it.each([
      [153, 20, 1],
      [200, 20, 1],
      [201, 20, 2],
      [100, 5, 1],
      [101, 5, 2],
      [300, 40, 1],
      [301, 40, 2],
    ])("an index of %i entries at limit %i ranks %i time(s)", async (indexSize, limit, calls) => {
      const f = fixture();
      for (let i = 0; i < indexSize - 3; i++) await f.add(`obs_b_${i}`, `ses_b_${i}`, "beta", "agent-b", "deploy rollback");
      for (let i = 0; i < 3; i++) await f.add(`obs_a_${i}`, "ses_a", "alpha", "agent-a", weaker);

      expect(await f.query({ ...scope, limit })).toEqual(["obs_a_0", "obs_a_1", "obs_a_2"]);
      expect(f.searchFn).toHaveBeenCalledTimes(calls);
    });
  });

  it("leaves an unscoped search at one ranking pass with the requested limit", async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await f.add(`obs_a_${i}`, `ses_a_${i}`, "alpha", "agent-a", "deploy rollback");
    for (let i = 0; i < 30; i++) await f.add(`obs_x_${i}`, `ses_x_${i}`, "alpha", "agent-a", "cache warmup schedule");

    expect(await f.query({ limit: 20 })).toHaveLength(5);
    expect(f.searchFn.mock.calls.map((call) => call[1])).toEqual([20]);
  });
});
