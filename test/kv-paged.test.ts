import { describe, it, expect, vi } from "vitest";
import { StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";
import { pinGraphState } from "../src/state/graph-generation.js";
import { encodeCursor } from "../src/state/list-query.js";

type Call = { function_id: string; payload: Record<string, unknown> };

function fakeSdk(store: Map<string, Map<string, unknown>>, opts: { getMany?: boolean; slow?: number } = {}) {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const sdk = {
    calls,
    get maxInFlight() { return maxInFlight; },
    trigger: async (req: Call) => {
      calls.push(req);
      const p = req.payload as { scope: string; key?: string; keys?: string[]; value?: unknown };
      const scope = store.get(p.scope) ?? new Map<string, unknown>();
      if (req.function_id === "engine::functions::list") {
        return { functions: opts.getMany ? [{ id: "state::get_many" }, { id: "state::get" }] : ["state::get", "state::set", "state::list_keys"] };
      }
      if (req.function_id === "state::list_keys") return { keys: [...scope.keys()] };
      if (req.function_id === "state::get_many") {
        if (!opts.getMany) throw new Error("unknown function state::get_many");
        return { values: (p.keys ?? []).map((k) => scope.get(k) ?? null) };
      }
      if (req.function_id === "state::get") {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          if (opts.slow) await new Promise((r) => setTimeout(r, 0));
          return scope.get(p.key!) ?? null;
        } finally { inFlight--; }
      }
      if (req.function_id === "state::list") return [...scope.values()];
      if (req.function_id === "state::set") { scope.set(p.key!, p.value); store.set(p.scope, scope); return p.value; }
      if (req.function_id === "state::delete") { scope.delete(p.key!); return; }
      throw new Error(`unexpected ${req.function_id}`);
    },
  };
  return sdk;
}

const seed = (store: Map<string, Map<string, unknown>>, scope: string, entries: Record<string, unknown>) => {
  store.set(scope, new Map(Object.entries(entries)));
};
const id = (time36: string, suffix: string) => `mem_x_kwghexc${time36}_${suffix}`;

describe("StateKV paged reads", () => {
  it("listKeys accepts both {keys} and bare-array responses", async () => {
    const store = new Map();
    seed(store, KV.insights, { a: { id: "a" }, b: { id: "b" } });
    const kv = new StateKV(fakeSdk(store) as never);
    expect(await kv.listKeys(KV.insights)).toEqual(["a", "b"]);
    const bare = fakeSdk(store);
    const raw = bare.trigger;
    bare.trigger = async (req: Call) => req.function_id === "state::list_keys" ? [...store.get(KV.insights)!.keys()] : raw(req);
    expect(await new StateKV(bare as never).listKeys(KV.insights)).toEqual(["a", "b"]);
  });

  it("getMany preserves input key order and reports null holes", async () => {
    const store = new Map();
    seed(store, KV.semantic, { a: { id: "a", v: 1 }, c: { id: "c", v: 3 } });
    const kv = new StateKV(fakeSdk(store) as never);
    expect(await kv.getMany(KV.semantic, ["c", "missing", "a"])).toEqual([{ id: "c", v: 3 }, null, { id: "a", v: 1 }]);
  });

  it("getMany honours the concurrency bound", async () => {
    const store = new Map();
    seed(store, KV.semantic, Object.fromEntries([...Array(60)].map((_, i) => [`k${i}`, { id: `k${i}` }])));
    const sdk = fakeSdk(store, { slow: 1 });
    const kv = new StateKV(sdk as never);
    await kv.getMany(KV.semantic, [...Array(60)].map((_, i) => `k${i}`), { concurrency: 8 });
    expect(sdk.maxInFlight).toBeLessThanOrEqual(8);
    expect(sdk.maxInFlight).toBeGreaterThan(1);
  });

  it("getMany uses state::get_many when the engine advertises it", async () => {
    const store = new Map();
    seed(store, KV.insights, Object.fromEntries([...Array(1200)].map((_, i) => [`i${i}`, { id: `i${i}` }])));
    const sdk = fakeSdk(store, { getMany: true });
    const kv = new StateKV(sdk as never);
    const out = await kv.getMany(KV.insights, [...Array(1200)].map((_, i) => `i${i}`));
    expect(out).toHaveLength(1200);
    const manyCalls = sdk.calls.filter((c) => c.function_id === "state::get_many");
    expect(manyCalls.length).toBe(3);
    expect(manyCalls.every((c) => (c.payload.keys as string[]).length <= 500)).toBe(true);
    expect(sdk.calls.filter((c) => c.function_id === "state::get").length).toBe(0);
    expect(sdk.calls.filter((c) => c.function_id === "engine::functions::list").length).toBe(1);
  });

  it("getMany falls back to state::get when the probe fails", async () => {
    const store = new Map();
    seed(store, KV.insights, { a: { id: "a" } });
    const sdk = fakeSdk(store);
    const raw = sdk.trigger;
    sdk.trigger = async (req: Call) => req.function_id === "engine::functions::list" ? Promise.reject(new Error("nope")) : raw(req);
    const kv = new StateKV(sdk as never);
    expect(await kv.getMany(KV.insights, ["a"])).toEqual([{ id: "a" }]);
    expect(sdk.calls.some((c) => c.function_id === "state::get_many")).toBe(false);
  });

  it("iterate yields non-null values page by page", async () => {
    const store = new Map();
    seed(store, KV.graphNodes, Object.fromEntries([...Array(5)].map((_, i) => [`n${i}`, { id: `n${i}` }])));
    store.get(KV.graphNodes)!.set("dead", undefined as never);
    store.get(KV.graphNodes)!.delete("dead");
    const sdk = fakeSdk(store);
    sdk.trigger = async (req: Call) => {
      if (req.function_id === "state::list_keys") return { keys: [...store.get(KV.graphNodes)!.keys(), "dead"] };
      if (req.function_id === "state::get") return store.get((req.payload as any).scope)?.get((req.payload as any).key) ?? null;
      if (req.function_id === "engine::functions::list") return [];
      throw new Error("unexpected");
    };
    const kv = new StateKV(sdk as never);
    const pages: unknown[][] = [];
    for await (const page of kv.iterate(KV.graphNodes, { pageSize: 2 })) pages.push(page);
    expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(pages.flat()).toHaveLength(5);
  });

  it("listPage pages desc by generated id time with an opaque cursor", async () => {
    const store = new Map();
    const entries = {
      [id("1", "a")]: { id: id("1", "a") },
      [id("5", "b")]: { id: id("5", "b") },
      [id("3", "c")]: { id: id("3", "c") },
      plain: { id: "plain" },
    };
    seed(store, KV.memories, entries);
    const kv = new StateKV(fakeSdk(store) as never);
    const first = await kv.listPage(KV.memories, { limit: 2 });
    expect(first.total).toBe(4);
    expect(first.items.map((i: any) => i.id)).toEqual([id("5", "b"), id("3", "c")]);
    expect(first.nextCursor).toBeTruthy();
    const second = await kv.listPage(KV.memories, { limit: 2, cursor: first.nextCursor });
    expect(second.items.map((i: any) => i.id)).toEqual([id("1", "a"), "plain"]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("listPage asc order and deleted cursor keys keep paging", async () => {
    const store = new Map();
    const a = id("1", "a"), b = id("3", "b"), c = id("5", "c");
    seed(store, KV.memories, { [a]: { id: a }, [b]: { id: b }, [c]: { id: c } });
    const kv = new StateKV(fakeSdk(store) as never);
    const page = await kv.listPage(KV.memories, { limit: 3, order: "asc", cursor: encodeCursor({ key: id("4", "gone") }) });
    expect(page.items.map((i: any) => i.id)).toEqual([c]);
  });

  it("applies graph scope resolution through the pinned view", async () => {
    const store = new Map();
    seed(store, "mem:graph:control", { generation: "11111111-2222-3333-4444-555555555555" });
    seed(store, `${KV.graphNodes}:generation:11111111-2222-3333-4444-555555555555`, { n1: { id: "n1" } });
    const kv = new StateKV(fakeSdk(store) as never);
    const pinned = await pinGraphState(kv);
    const seen: unknown[] = [];
    for await (const page of pinned.iterate(KV.graphNodes)) seen.push(...page);
    expect(seen).toEqual([{ id: "n1" }]);
  });

  it("redis backend orders each iterate page like insertion", async () => {
    const store = new Map();
    seed(store, KV.insights, { b: { id: "b", createdAt: "2026-01-02T00:00:00Z" }, a: { id: "a", createdAt: "2026-01-01T00:00:00Z" } });
    const kv = new StateKV(fakeSdk(store) as never, { backend: "redis" });
    const pages: { id: string }[][] = [];
    for await (const page of kv.iterate<{ id: string }>(KV.insights, { pageSize: 10 })) pages.push(page);
    expect(pages[0]!.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
