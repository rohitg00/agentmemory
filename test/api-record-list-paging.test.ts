import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import { StateKV } from "../src/state/kv.js";
import { SAFE_PAYLOAD_BYTES } from "../src/state/frame-guard.js";

const SECRET = "record-list-secret";

function rig() {
  const store = new Map<string, Map<string, unknown>>();
  const fns = new Map<string, Function>();
  const listed: string[] = [];
  const sdk = {
    registerFunction: (id: string | { id: string }, h: Function) => fns.set(typeof id === "string" ? id : id.id, h),
    registerTrigger: () => {},
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }): Promise<any> => {
      if (!id.startsWith("state::")) return fns.get(id)?.(payload);
      const rows = store.get(payload.scope) ?? new Map<string, unknown>();
      store.set(payload.scope, rows);
      if (id === "state::get") return rows.get(payload.key) ?? null;
      if (id === "state::set") { rows.set(payload.key, payload.value); return payload.value; }
      if (id === "state::list_keys") return { keys: [...rows.keys()] };
      if (id === "state::list") { listed.push(payload.scope); return [...rows.values()]; }
      throw new Error(`unexpected state call ${id}`);
    },
  };
  const kv = new StateKV(sdk as never);
  registerApiTriggers(sdk as never, kv, SECRET);
  const get = (fn: string, query: Record<string, string> = {}) =>
    fns.get(fn)!({ headers: { authorization: `Bearer ${SECRET}` }, query_params: query }) as Promise<{
      status_code: number;
      body: Record<string, any>;
    }>;
  return { kv, get, listed };
}

const id = (prefix: string, i: number) => `${prefix}_${(1_800_000_000_000 + i).toString(36)}_${i}`;

function fact(i: number, size = 8) {
  return { id: id("sem", i), fact: "f".repeat(size), confidence: 0.5, sourceSessionIds: [], accessCount: 0, createdAt: "", updatedAt: "" };
}

function procedure(i: number) {
  return { id: id("proc", i), name: `p${i}`, steps: [], triggerCondition: "", frequency: 1, sourceSessionIds: [], createdAt: "", updatedAt: "" };
}

async function walk(r: ReturnType<typeof rig>, fn: string, key: string, limit: string) {
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const res = await r.get(fn, { limit, ...(cursor ? { cursor } : {}) });
    expect(res.status_code).toBe(200);
    ids.push(...res.body[key].map((row: { id: string }) => row.id));
    cursor = res.body.nextCursor;
    pages++;
  } while (cursor && pages < 100);
  return { ids, pages };
}

describe("semantic and procedural list paging", () => {
  it("returns every record in one response without nextCursor when the scope fits", async () => {
    const r = rig();
    for (let i = 0; i < 3; i++) await r.kv.set(KV.semantic, fact(i).id, fact(i));
    const res = await r.get("api::semantic-list");
    expect(res.status_code).toBe(200);
    expect(res.body.semantic).toHaveLength(3);
    expect(res.body).not.toHaveProperty("nextCursor");
    expect(r.listed).toEqual([]);
  });

  it("honors limit and walks every semantic record once through nextCursor", async () => {
    const r = rig();
    for (let i = 0; i < 7; i++) await r.kv.set(KV.semantic, fact(i).id, fact(i));
    const first = await r.get("api::semantic-list", { limit: "3" });
    expect(first.body.semantic).toHaveLength(3);
    expect(typeof first.body.nextCursor).toBe("string");
    const { ids, pages } = await walk(r, "api::semantic-list", "semantic", "3");
    expect(pages).toBe(3);
    expect(new Set(ids).size).toBe(7);
    expect(r.listed).toEqual([]);
  });

  it("pages procedural records the same way", async () => {
    const r = rig();
    for (let i = 0; i < 5; i++) await r.kv.set(KV.procedural, procedure(i).id, procedure(i));
    const { ids, pages } = await walk(r, "api::procedural-list", "procedural", "2");
    expect(pages).toBe(3);
    expect(new Set(ids).size).toBe(5);
  });

  it("caps limit at the list page maximum", async () => {
    const r = rig();
    for (let i = 0; i < 502; i++) await r.kv.set(KV.semantic, fact(i).id, fact(i));
    const res = await r.get("api::semantic-list", { limit: "100000" });
    expect(res.body.semantic).toHaveLength(500);
    expect(typeof res.body.nextCursor).toBe("string");
  });

  it("ends a page early when the records would exceed the transport budget", async () => {
    const r = rig();
    const size = Math.ceil(SAFE_PAYLOAD_BYTES / 3);
    for (let i = 0; i < 4; i++) await r.kv.set(KV.semantic, fact(i).id, fact(i, size));
    const first = await r.get("api::semantic-list", { limit: "50" });
    expect(first.body.semantic.length).toBeLessThan(4);
    expect(JSON.stringify(first.body).length).toBeLessThan(SAFE_PAYLOAD_BYTES);
    expect(typeof first.body.nextCursor).toBe("string");
    const { ids } = await walk(r, "api::semantic-list", "semantic", "50");
    expect(new Set(ids).size).toBe(4);
  });
});
