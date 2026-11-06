import { afterEach, describe, expect, it, vi } from "vitest";
import { StateKV, applyUpdateOps, type StateBackend } from "../src/state/kv.js";
import { pinGraphState, setGraphGenerationListener } from "../src/state/graph-generation.js";
import { KV } from "../src/state/schema.js";

type Op = { type: string; path: string; value?: unknown };
type Request = { function_id: string; payload: { scope: string; key: string; value?: unknown; ops?: Op[] } };
type UpdateResult = { old_value: unknown; new_value: unknown; errors: unknown[] };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function nextTurn() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function setup(backend: StateBackend = "redis") {
  const rows = new Map<string, Map<string, unknown>>();
  const read = (scope: string, key: string) => structuredClone(rows.get(scope)?.get(key) ?? null);
  const write = (scope: string, key: string, value: unknown) => {
    if (!rows.has(scope)) rows.set(scope, new Map());
    rows.get(scope)!.set(key, structuredClone(value));
  };
  let gate: {
    functionId: string; scope: string; key: string; after: boolean; error?: string;
    entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred>;
  } | undefined;
  const sdk = {
    trigger: vi.fn(async (request: Request) => {
      const { function_id: id, payload: p } = request;
      const active = gate?.functionId === id && gate.scope === p.scope && gate.key === p.key ? gate : undefined;
      if (active) gate = undefined;
      const wait = async () => {
        active!.entered.resolve();
        await active!.released.promise;
        if (active!.error) throw new Error(active!.error);
      };
      if (active && !active.after) await wait();
      const old = read(p.scope, p.key);
      let result: unknown;
      if (id === "state::get") result = old;
      else if (id === "state::set") {
        write(p.scope, p.key, p.value);
        result = { old_value: old, new_value: p.value };
      } else if (id === "state::delete") {
        rows.get(p.scope)?.delete(p.key);
        result = old;
      } else if (id === "state::update") {
        let next = old;
        for (const op of p.ops ?? []) {
          if (op.type === "increment") {
            const current = (next ?? {}) as Record<string, unknown>;
            next = { ...current, [op.path]: Number(current[op.path] ?? 0) + Number(op.value) };
          } else next = applyUpdateOps(next, [op]);
        }
        write(p.scope, p.key, next);
        result = { old_value: old, new_value: next, errors: [] };
      } else throw new Error(`Unexpected state request: ${id}`);
      if (active?.after) await wait();
      return result;
    }),
  };
  const kv = new StateKV(sdk as never, { backend });
  function pause(functionId: string, scope: string, key: string, options: { after?: boolean; error?: string } = {}) {
    const entered = deferred();
    const released = deferred();
    gate = { functionId, scope, key, after: options.after ?? false, error: options.error, entered, released };
    return { entered: entered.promise, release: released.resolve };
  }
  return { kv, sdk, read, pause };
}

afterEach(() => setGraphGenerationListener(null));

describe("Redis StateKV mutation ordering", () => {
  it.each(["set", "delete"] as const)("keeps a later %s after an in-flight local update", async (operation) => {
    const { kv, read, pause } = setup();
    await kv.set("scope", "key", { original: true });
    const gate = pause("state::get", "scope", "key", { after: true });
    const update = kv.update("scope", "key", [{ type: "set", path: "updated", value: true }]);
    await gate.entered;
    const later = operation === "set" ? kv.set("scope", "key", { replacement: true }) : kv.delete("scope", "key");
    await nextTurn();
    gate.release();
    await Promise.all([update, later]);
    expect(read("scope", "key")).toEqual(operation === "set" ? { replacement: true } : null);
  });

  it.each(["set", "delete"] as const)("starts a local update from an earlier pending %s", async (operation) => {
    const { kv, read, pause } = setup();
    await kv.set("scope", "key", { original: true });
    const gate = pause(`state::${operation}`, "scope", "key");
    const earlier = operation === "set" ? kv.set("scope", "key", { replacement: true }) : kv.delete("scope", "key");
    await gate.entered;
    const update = kv.update<UpdateResult>("scope", "key", [{ type: "set", path: "updated", value: true }]);
    await nextTurn();
    gate.release();
    const [, result] = await Promise.all([earlier, update]);
    expect(result.old_value).toEqual(operation === "set" ? { replacement: true } : null);
    expect(read("scope", "key")).toEqual(operation === "set" ? { replacement: true, updated: true } : { updated: true });
  });

  it.each([false, true])("serializes local and native updates, native first: %s", async (nativeFirst) => {
    const { kv, read, pause } = setup();
    await kv.set("scope", "key", { count: 0 });
    const local = () => kv.update<UpdateResult>("scope", "key", [{ type: "set", path: "updated", value: true }]);
    const native = () => kv.update<UpdateResult>("scope", "key", [{ type: "increment", path: "count", value: 1 }]);
    const gate = pause(nativeFirst ? "state::update" : "state::get", "scope", "key", { after: !nativeFirst });
    const first = nativeFirst ? native() : local();
    await gate.entered;
    const second = nativeFirst ? local() : native();
    await nextTurn();
    gate.release();
    const [, result] = await Promise.all([first, second]);
    expect(result.old_value).toEqual(nativeFirst ? { count: 1 } : { count: 0, updated: true });
    expect(read("scope", "key")).toEqual({ count: 1, updated: true });
  });

  it("lets independent keys and scopes finish while another key is blocked", async () => {
    const { kv, read, pause } = setup();
    const gate = pause("state::get", "scope", "key", { after: true });
    const blocked = kv.update("scope", "key", [{ type: "set", path: "updated", value: true }]);
    await gate.entered;
    try {
      await Promise.all([kv.set("scope", "other", { independent: true }), kv.set("other", "key", { independent: true })]);
      expect(read("scope", "other")).toEqual({ independent: true });
      expect(read("other", "key")).toEqual({ independent: true });
      expect(read("scope", "key")).toBeNull();
    } finally {
      gate.release();
      await blocked;
    }
  });

  it("orders mutations from StateKV instances sharing the same engine", async () => {
    const { kv, sdk, read, pause } = setup();
    const other = new StateKV(sdk as never, { backend: "redis" });
    await kv.set("scope", "key", { original: true });
    const gate = pause("state::get", "scope", "key", { after: true });
    const update = kv.update("scope", "key", [{ type: "set", path: "updated", value: true }]);
    await gate.entered;
    const deletion = other.delete("scope", "key");
    await nextTurn();
    gate.release();
    await Promise.all([update, deletion]);
    expect(read("scope", "key")).toBeNull();
  });

  it.each(["get", "local-set", "set", "update", "delete"] as const)("releases the mutation queue after a %s failure", async (operation) => {
    const { kv, read, pause } = setup();
    await kv.set("scope", "key", { original: true });
    const id = operation === "local-set" ? "set" : operation;
    const gate = pause(`state::${id}`, "scope", "key", { error: "write unavailable" });
    const failed = operation === "set" ? kv.set("scope", "key", { lost: true })
      : operation === "delete" ? kv.delete("scope", "key")
      : kv.update("scope", "key", [{ type: operation === "update" ? "increment" : "set", path: "lost", value: 1 }]);
    const rejection = expect(failed).rejects.toThrow("write unavailable");
    await gate.entered;
    const next = kv.update("scope", "key", [{ type: "set", path: "recovered", value: true }]);
    await nextTurn();
    gate.release();
    await Promise.all([rejection, next]);
    expect(read("scope", "key")).toEqual({ original: true, recovered: true });
  });

  it("preserves set and native update responses while delete resolves without a value", async () => {
    const { kv } = setup();
    await expect(kv.set("scope", "key", { count: 1 })).resolves.toEqual({ old_value: null, new_value: { count: 1 } });
    await expect(kv.update("scope", "key", [{ type: "increment", path: "count", value: 1 }])).resolves.toEqual({ old_value: { count: 1 }, new_value: { count: 2 }, errors: [] });
    await expect(kv.delete("scope", "key")).resolves.toBeUndefined();
  });

  it("keeps file mutations on the engine's direct path", async () => {
    const { kv, read, pause } = setup("file");
    await kv.set("scope", "key", { original: true });
    const gate = pause("state::set", "scope", "key");
    const set = kv.set("scope", "key", { replacement: true });
    await gate.entered;
    try {
      await kv.delete("scope", "key");
      expect(read("scope", "key")).toBeNull();
    } finally {
      gate.release();
      await set;
    }
  });
});

describe("Redis graph mutation ordering", () => {
  const oldGeneration = "10000000-0000-4000-8000-000000000001";
  const newGeneration = "10000000-0000-4000-8000-000000000002";

  it.each(["set", "delete", "update", "native"] as const)("keeps a queued %s in its resolved graph generation", async (operation) => {
    const { kv, read, pause } = setup();
    await kv.set(KV.graphControl, "generation", oldGeneration);
    await kv.set(KV.graphNodes, "key", { count: 0 });
    const pinned = await pinGraphState(kv);
    const oldScope = `${KV.graphNodes}:generation:${oldGeneration}`;
    const gate = pause("state::get", oldScope, "key", { after: true });
    const first = pinned.update(KV.graphNodes, "key", [{ type: "set", path: "first", value: true }]);
    await gate.entered;
    const queued = operation === "set" ? kv.set(KV.graphNodes, "key", { replacement: true })
      : operation === "delete" ? kv.delete(KV.graphNodes, "key")
      : kv.update(KV.graphNodes, "key", [{ type: operation === "native" ? "increment" : "set", path: "count", value: 1 }]);
    await nextTurn();
    await kv.set(KV.graphControl, "generation", newGeneration);
    await kv.set(KV.graphNodes, "key", { fresh: true });
    gate.release();
    await Promise.all([first, queued]);
    expect(await kv.get(KV.graphNodes, "key")).toEqual({ fresh: true });
    expect(read(oldScope, "key")).toEqual(operation === "set" ? { replacement: true }
      : operation === "delete" ? null : { count: 1, first: true });
  });

  it("releases the mutation lock before a graph listener updates the same key", async () => {
    const { kv } = setup();
    await kv.set(KV.graphControl, "generation", newGeneration);
    await kv.set(KV.graphNodes, "reentrant", { count: 0 });
    let reentered = false;
    setGraphGenerationListener(async (kind) => {
      if (kind !== "nodes" || reentered) return;
      reentered = true;
      await kv.update(KV.graphNodes, "reentrant", [{ type: "set", path: "count", value: 1 }]);
    });
    const updated = kv.update(KV.graphNodes, "reentrant", [{ type: "set", path: "updated", value: true }]);
    await Promise.race([
      updated,
      nextTurn().then(() => { throw new Error("Graph listener cannot reenter the mutation queue"); }),
    ]);
    expect(reentered).toBe(true);
    expect(await kv.get(KV.graphNodes, "reentrant")).toEqual({ count: 1, updated: true });
  });
});
