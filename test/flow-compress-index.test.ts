import { afterEach, describe, expect, it, vi } from "vitest";
import { registerFlowCompressFunction } from "../src/functions/flow-compress.js";
import { registerWorkingMemoryFunctions } from "../src/functions/working-memory.js";
import { getSearchIndex } from "../src/functions/search.js";
import type { Action, Memory } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const SUMMARY = "<summary><goal>Quasar deploy pipeline</goal><outcome>Shipped</outcome><lesson>Cache credentials early</lesson></summary>";

function action(id: string, project = "proj-a"): Action {
  const ts = "2026-11-20T00:00:00.000Z";
  return {
    id, title: `Finish ${id}`, description: `Work for ${id}`, status: "done", priority: 1,
    createdAt: ts, updatedAt: ts, createdBy: "agent-a", project, tags: [],
    sourceObservationIds: [], sourceMemoryIds: [], result: "shipped",
  };
}

function store(actions: Action[]) {
  const data = new Map<string, Map<string, unknown>>([["mem:actions", new Map(actions.map((a) => [a.id, a]))]]);
  const kv = {
    get: async (scope: string, id: string) => structuredClone(data.get(scope)?.get(id) ?? null),
    set: async (scope: string, id: string, value: unknown) => {
      if (!data.has(scope)) data.set(scope, new Map());
      data.get(scope)!.set(id, structuredClone(value));
      return value;
    },
    delete: async (scope: string, id: string) => { data.get(scope)?.delete(id); },
    list: async (scope: string) => structuredClone([...(data.get(scope)?.values() ?? [])]),
  };
  const memories = () => [...(data.get("mem:memories")?.values() ?? [])] as Memory[];
  return { kv, memories };
}

function flowCompress(actions: Action[], reply: string | (() => Promise<string>) = SUMMARY) {
  const s = store(actions);
  let handler!: (data: object) => Promise<Record<string, unknown>>;
  const sdk = { registerFunction: (_: string, fn: typeof handler) => { handler = fn; } };
  const summarize = vi.fn(typeof reply === "string" ? async () => reply : reply);
  registerFlowCompressFunction(sdk as never, s.kv as never, { summarize } as never);
  return { call: handler, ...s };
}

afterEach(() => getSearchIndex().clear());

describe("mem::flow-compress", () => {
  it("indexes the memory so search finds it as soon as the call returns", async () => {
    const f = flowCompress([action("act_1")]);
    const result = await f.call({ actionIds: ["act_1"], agentId: " agent-x " });
    expect(result.success).toBe(true);
    const id = result.memoryId as string;
    expect(getSearchIndex().search("quasar deploy pipeline", 5, "memory").map((r) => r.obsId)).toContain(id);
    expect(f.memories()[0]).toMatchObject({ id, title: "Quasar deploy pipeline", agentId: "agent-x", project: "proj-a", isLatest: true });
  });

  it("stores nothing when the reply has no summary sections", async () => {
    const f = flowCompress([action("act_1")], "Sorry, I cannot help with that.");
    expect(await f.call({ actionIds: ["act_1"] })).toMatchObject({ success: false, error: "summary could not be parsed" });
    expect(f.memories()).toEqual([]);
    expect(getSearchIndex().size).toBe(0);
  });

  it("supersedes the earlier memory when the same actions are compressed again", async () => {
    const f = flowCompress([action("act_1"), action("act_2")]);
    const first = await f.call({ actionIds: ["act_1", "act_2"] });
    const second = await f.call({ actionIds: ["act_2", "act_1"] });
    expect(second.supersededId).toBe(first.memoryId);
    const byId = new Map(f.memories().map((m) => [m.id, m]));
    expect(byId.get(first.memoryId as string)?.isLatest).toBe(false);
    expect(byId.get(second.memoryId as string)).toMatchObject({ isLatest: true, version: 2, parentId: first.memoryId });
    expect(getSearchIndex().has(first.memoryId as string)).toBe(false);
    expect(getSearchIndex().has(second.memoryId as string)).toBe(true);
  });

  it("stamps a project only when every compressed action belongs to it", async () => {
    const mixed = flowCompress([action("act_1", "proj-a"), action("act_2", "proj-b")]);
    await mixed.call({ actionIds: ["act_1", "act_2"] });
    expect(mixed.memories()[0].project).toBeUndefined();

    const mismatch = flowCompress([action("act_1", "proj-a")]);
    await mismatch.call({ actionIds: ["act_1"], project: "proj-b" });
    expect(mismatch.memories()[0].project).toBeUndefined();
  });

  it("rejects malformed input before calling the provider", async () => {
    const f = flowCompress([action("act_1")]);
    expect(await f.call({ actionIds: "act_1" })).toMatchObject({ success: false });
    expect(await f.call({ runId: 7 })).toMatchObject({ success: false });
    expect(f.memories()).toEqual([]);
  });
});

describe("mem::auto-page", () => {
  it("indexes the archival memories it creates", async () => {
    const s = store([]);
    const now = new Date().toISOString();
    for (let i = 0; i < 3; i++) {
      await s.kv.set("mem:core-memory", `core_${i}`, {
        id: `core_${i}`, content: `Nebula paging note ${i} `.repeat(40), importance: 1,
        pinned: false, accessCount: 0, lastAccessedAt: now, createdAt: now,
      });
    }
    const handlers: Record<string, (data: object) => Promise<Record<string, unknown>>> = {};
    registerWorkingMemoryFunctions({ registerFunction: (id: string, fn: never) => { handlers[id] = fn; } } as never, s.kv as never, 100);
    const result = await handlers["mem::auto-page"]({ budget: 100 });
    expect(result.paged).toBeGreaterThan(0);
    const archived = s.memories();
    expect(archived).toHaveLength(result.paged as number);
    for (const memory of archived) expect(getSearchIndex().has(memory.id)).toBe(true);
  });
});
