import { vi } from "vitest";

type Handler = (data: unknown) => Promise<unknown>;

export function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    update: async (
      scope: string,
      key: string,
      updates: Array<{ path: string; value: unknown }>,
    ): Promise<void> => {
      const entries = store.get(scope);
      if (!entries) return;
      const value = (entries.get(key) as Record<string, unknown>) ?? {};
      for (const u of updates) value[u.path] = u.value;
      entries.set(key, value);
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

export function mockSdk(opts?: { looseTrigger?: boolean }) {
  const functions = new Map<string, Handler>();
  const looseTrigger = opts?.looseTrigger ?? false;
  return {
    fns: functions,
    registerFunction: (
      idOrOpts: string | { id: string },
      handler: Handler,
      _options?: Record<string, unknown>,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: vi.fn(),
    trigger: async (
      idOrInput:
        | string
        | { function_id: string; payload: unknown; action?: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload =
        typeof idOrInput === "string" ? data : (idOrInput.payload as unknown);
      const fn = functions.get(id);
      if (!fn) {
        // looseTrigger mirrors production fan-out where side-effect
        // triggers (cascade, events) may target functions another
        // module registers; tests exercising one module opt in.
        if (looseTrigger) return null;
        throw new Error(`No function: ${id}`);
      }
      return fn(payload);
    },
  };
}
