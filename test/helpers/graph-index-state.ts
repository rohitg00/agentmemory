import { StateKV, applyUpdateOps } from "../../src/state/kv.js";

export function createGraphIndexState(store = new Map<string, Map<string, unknown>>()) {
  const calls: Array<{ id: string; scope: string; key?: string }> = [];
  let intercept: ((id: string, payload: any) => Promise<void>) | undefined;
  const sdk = {
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }): Promise<any> => {
      calls.push({ id, scope: payload.scope, key: payload.key });
      await intercept?.(id, payload);
      const rows = store.get(payload.scope) ?? new Map<string, unknown>();
      if (id === "state::get") return structuredClone(rows.get(payload.key) ?? null);
      if (id === "state::list") return structuredClone([...rows.values()]);
      if (id === "state::delete") { rows.delete(payload.key); return; }
      if (id === "state::set") {
        rows.set(payload.key, structuredClone(payload.value));
        store.set(payload.scope, rows);
        return structuredClone(payload.value);
      }
      if (id === "state::update") {
        const old_value = structuredClone(rows.get(payload.key) ?? null);
        const new_value = applyUpdateOps(old_value, payload.ops);
        rows.set(payload.key, structuredClone(new_value));
        store.set(payload.scope, rows);
        return { old_value, new_value, errors: [] };
      }
      throw new Error(`Unexpected fixture function ${id}`);
    },
  };
  const kv = new StateKV(sdk as never);
  for (const name of ["get", "set", "update", "delete", "list"] as const) {
    Object.defineProperty(kv, name, { value: kv[name].bind(kv), writable: true, enumerable: true, configurable: true });
  }
  return { kv, store, calls, intercept: (fn?: typeof intercept) => { intercept = fn; } };
}
