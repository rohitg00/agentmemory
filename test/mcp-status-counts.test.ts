import { describe, expect, it, vi } from "vitest";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";
import { StateKV, type StateBackend } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import type { Memory, Session } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type ReadRequest = {
  body?: { uri?: unknown };
  headers: Record<string, string>;
  query_params: Record<string, string>;
};
type Reply = { status_code: number; body: unknown };
type Handler = (request: ReadRequest) => Promise<Reply>;
type Store = Map<string, Map<string, unknown>>;
type Transfer = { functionId: string; scope: string; records: number };
type Options = {
  backend?: StateBackend;
  keyErrors?: Set<string>;
  listErrors?: Set<string>;
  extraKeys?: Map<string, string[]>;
  afterKeys?: (scope: string, store: Store) => void;
};

const uri = "agentmemory://status";
const at = "2026-11-10T10:00:00.000Z";

function session(id: string, project: string): Session {
  return { id, project, cwd: project, startedAt: at, status: "active", observationCount: 3 };
}

function memory(index: number): Memory {
  return {
    id: `mem_${index}`, createdAt: at, updatedAt: at,
    type: "pattern", title: `Pattern ${index}`,
    content: `Stored payload ${index} `.repeat(64), concepts: [], files: [],
    sessionIds: [index % 2 ? "ses_b" : "ses_a"], strength: 5,
    version: index % 2 + 1, isLatest: index % 2 === 0,
  };
}

function seededStore(): Store {
  return new Map([
    [KV.sessions, new Map<string, unknown>([
      ["ses_a", session("ses_a", "/alpha")],
      ["ses_b", session("ses_b", "/beta")],
      ["ses_c", session("ses_c", "/alpha")],
    ])],
    [KV.memories, new Map<string, unknown>(Array.from({ length: 401 }, (_, index) => {
      const row = memory(index);
      return [row.id, row];
    }))],
    [KV.health, new Map<string, unknown>([["current", { timestamp: at, status: "healthy" }]])],
  ]);
}

function rig(options: Options = {}, store = seededStore()) {
  const functions = new Map<string, Handler>();
  const transfers: Transfer[] = [];
  const sdk = {
    registerFunction: (name: string, handler: Handler) => functions.set(name, handler),
    registerTrigger: vi.fn(),
    trigger: async ({ function_id, payload }: {
      function_id: string; payload: { scope: string; key?: string };
    }): Promise<unknown> => {
      const { scope, key } = payload;
      const rows = store.get(scope) ?? new Map<string, unknown>();
      if (function_id === "state::list_keys") {
        if (options.keyErrors?.has(scope)) throw new Error("key listing unavailable");
        const keys = [...rows.keys(), ...(options.extraKeys?.get(scope) ?? [])];
        options.afterKeys?.(scope, store);
        transfers.push({ functionId: function_id, scope, records: 0 });
        return options.backend === "redis" ? keys : { keys };
      }
      if (function_id === "state::list") {
        if (options.listErrors?.has(scope)) throw new Error("value listing unavailable");
        const values = structuredClone([...rows.values()]);
        transfers.push({ functionId: function_id, scope, records: values.length });
        return values;
      }
      if (function_id === "state::get" && key !== undefined) {
        const value = structuredClone(rows.get(key) ?? null);
        transfers.push({ functionId: function_id, scope, records: value === null ? 0 : 1 });
        return value;
      }
      throw new Error(`Unexpected transport call: ${function_id}`);
    },
  };
  const kv = new StateKV(sdk as never, { backend: options.backend });
  registerMcpEndpoints(sdk as never, kv, "status-secret");
  const read = async (requestedUri: unknown = uri, authorized = true) => {
    const handler = functions.get("mcp::resources::read");
    if (!handler) throw new Error("Existing MCP resource handler was not registered");
    return handler({ body: { uri: requestedUri }, query_params: {},
      headers: authorized ? { authorization: "Bearer status-secret" } : {} });
  };
  return { kv, sdk, store, functions, transfers, read };
}

function expected(sessionCount: number, memoryCount: number, healthStatus: string): Reply {
  return { status_code: 200, body: { contents: [{ uri, mimeType: "application/json",
    text: JSON.stringify({ sessionCount, memoryCount, healthStatus }) }] } };
}

describe("MCP status stored-key counts", () => {
  for (const backend of ["file", "redis"] as const) {
    it(`reads 3 sessions and all 401 memory versions without value transfers (${backend})`, async () => {
      const r = rig({ backend });
      expect(await r.read()).toEqual(expected(3, 401, "available"));
      expect({
        lists: r.transfers.filter(row => row.functionId === "state::list").length,
        gets: r.transfers.filter(row => row.functionId === "state::get").length,
        records: r.transfers.reduce((sum, row) => sum + row.records, 0),
      }).toEqual({ lists: 0, gets: 0, records: 0 });
      expect(r.transfers.map(row => row.scope)).toEqual([KV.sessions, KV.memories, KV.health]);
    });

    it(`returns exact empty resource contents (${backend})`, async () => {
      const r = rig({ backend }, new Map());
      expect(await r.read()).toEqual(expected(0, 0, "no-data"));
    });
  }

  it("counts listed null and orphan keys under the requested stored-key contract", async () => {
    const r = rig({ extraKeys: new Map([[KV.memories, ["mem_orphan"]]]) });
    r.store.get(KV.memories)!.set("mem_null", null);
    expect(await r.read()).toEqual(expected(3, 403, "available"));
    expect(r.transfers.some(row => row.functionId === "state::get")).toBe(false);
  });

  it("counts the listed snapshot during deletion and reflects deletion on the next read", async () => {
    let deleted = false;
    const r = rig({ afterKeys: (scope, store) => {
      if (scope === KV.memories && !deleted) {
        deleted = true;
        store.get(KV.memories)!.delete("mem_0");
      }
    } });
    expect(await r.read()).toEqual(expected(3, 401, "available"));
    expect(deleted).toBe(true);
    expect(await r.read()).toEqual(expected(3, 400, "available"));
  });

  it("uses value-list fallback when the production backend rejects key listing", async () => {
    const r = rig({ keyErrors: new Set([KV.sessions, KV.memories, KV.health]) });
    expect(await r.read()).toEqual(expected(3, 401, "available"));
    expect(r.transfers.map(row => [row.functionId, row.scope])).toEqual([
      ["state::list", KV.sessions], ["state::list", KV.memories], ["state::list", KV.health],
    ]);
  });

  it("counts fallback value rows including a stored null", async () => {
    const r = rig({ keyErrors: new Set([KV.memories]) });
    r.store.get(KV.memories)!.set("mem_null", null);
    expect(await r.read()).toEqual(expected(3, 402, "available"));
  });

  it("keeps the existing standalone InMemoryKV adapter working without a count API", async () => {
    const r = rig();
    const legacy = new InMemoryKV();
    await legacy.set(KV.sessions, "ses_a", session("ses_a", "/alpha"));
    await legacy.set(KV.memories, "mem_0", memory(0));
    await legacy.set(KV.health, "current", { timestamp: at });
    const listed = vi.spyOn(legacy, "list");
    registerMcpEndpoints(r.sdk as never, legacy as never, "status-secret");
    expect(await r.read()).toEqual(expected(1, 1, "available"));
    expect(listed.mock.calls.map(([scope]) => scope)).toEqual([KV.sessions, KV.memories, KV.health]);
    expect(r.transfers).toEqual([]);
  });

  it("reflects additions and deletions immediately without a count cache", async () => {
    const r = rig();
    expect(await r.read()).toEqual(expected(3, 401, "available"));
    r.store.get(KV.sessions)!.set("ses_new", session("ses_new", "/beta"));
    r.store.get(KV.memories)!.set("mem_401", memory(401));
    r.store.get(KV.health)!.clear();
    expect(await r.read()).toEqual(expected(4, 402, "no-data"));
    r.store.get(KV.sessions)!.delete("ses_new");
    r.store.get(KV.memories)!.delete("mem_401");
    expect(await r.read()).toEqual(expected(3, 401, "no-data"));
  });

  for (const scope of [KV.sessions, KV.memories]) {
    it(`reports an error when both count routes fail for ${scope}`, async () => {
      const r = rig({ keyErrors: new Set([scope]), listErrors: new Set([scope]) });
      expect(await r.read()).toEqual({ status_code: 500, body: { error: "Internal error" } });
    });
  }

  it("keeps health failures as no-data", async () => {
    const r = rig({ keyErrors: new Set([KV.health]), listErrors: new Set([KV.health]) });
    expect(await r.read()).toEqual(expected(3, 401, "no-data"));
  });

  it("preserves resource authentication and URI validation without reading state", async () => {
    const r = rig();
    expect((await r.read(uri, false)).status_code).toBe(401);
    expect(await r.read("agentmemory://not-a-resource")).toEqual({
      status_code: 404, body: { error: "Unknown resource: agentmemory://not-a-resource" },
    });
    expect(await r.read(42)).toEqual({ status_code: 400, body: { error: "uri is required" } });
    expect(r.transfers).toEqual([]);
  });
});
