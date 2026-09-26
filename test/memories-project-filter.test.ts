import { describe, it, expect, beforeEach } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import { mockSdk, mockKV } from "./helpers/mocks.js";
import type { Memory } from "../src/types.js";

// #918: GET /agentmemory/memories must honor the `project` query param.
// Reproduces the issue fixture: 9 memories across `witto` (5) and
// `_shared` (4). The list (and ?count=true totals) must scope to the
// requested project, matching POST /agentmemory/search semantics.
describe("api::memories project filter (#918)", () => {
  function makeMemory(id: string, project: string): Memory {
    return {
      id,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      type: "fact",
      title: id,
      content: `content for ${id}`,
      concepts: [],
      files: [],
      sessionIds: [],
      strength: 1,
      version: 1,
      isLatest: true,
      project,
    };
  }

  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    const memories = [
      ...Array.from({ length: 5 }, (_, i) => makeMemory(`witto-${i}`, "witto")),
      ...Array.from({ length: 4 }, (_, i) =>
        makeMemory(`shared-${i}`, "_shared"),
      ),
    ];
    for (const m of memories) await kv.set(KV.memories, m.id, m);
    // no secret → checkAuth is a no-op, mirroring an open self-hosted install
    registerApiTriggers(sdk as never, kv as never);
  });

  async function list(query: Record<string, string>) {
    return (await sdk.trigger("api::memories", { query_params: query })) as {
      status_code: number;
      body: { memories: Memory[]; total: number };
    };
  }

  it("with no project param, returns all 9 (back-compat)", async () => {
    const res = await list({});
    expect(res.status_code).toBe(200);
    expect(res.body.memories).toHaveLength(9);
    expect(res.body.total).toBe(9);
  });

  it("?project=witto returns only the 5 witto memories", async () => {
    const res = await list({ project: "witto" });
    expect(res.body.memories).toHaveLength(5);
    expect([...new Set(res.body.memories.map((m) => m.project))]).toEqual([
      "witto",
    ]);
    expect(res.body.total).toBe(5);
  });

  it("?project=nonexistent-xyz returns 0 (not the whole corpus)", async () => {
    const res = await list({ project: "nonexistent-xyz" });
    expect(res.body.memories).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("?count=true totals respect the project scope", async () => {
    const res = (await sdk.trigger("api::memories", {
      query_params: { count: "true", project: "_shared" },
    })) as { body: { total: number; latestCount: number } };
    expect(res.body.total).toBe(4);
    expect(res.body.latestCount).toBe(4);
  });

  it("blank/whitespace project param is ignored (returns all)", async () => {
    const res = await list({ project: "   " });
    expect(res.body.memories).toHaveLength(9);
  });
});
