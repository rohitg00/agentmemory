import { vi } from "vitest";
import { KV } from "../../src/state/schema.js";

type Handler = (data: unknown) => Promise<unknown>;

export function currentAuditScope(): string {
  return KV.auditMonth(new Date().toISOString().slice(0, 7));
}

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

export function fakeHandle(id = "h", state: "active" | "pending" = "active") {
  return {
    id,
    state,
    ready: () => Promise.resolve(),
    onStateChange: (_listener: (state: string) => void) => () => {},
    dispose: () => Promise.resolve(),
  };
}

export type BoundRoute = { function_id: string; method: string; path: string; middleware_function_ids?: string[] };
export type BoundState = { function_id: string; scope?: string; key?: string };
type ObservedSource = { function_id: string; args?: Record<string, unknown>; filters?: Record<string, unknown>; capture?: string[] };

function filterValue(filters: Record<string, unknown> | undefined, field: string): string | undefined {
  if (!filters) return undefined;
  const direct = (filters[field] as { $eq?: string } | undefined)?.$eq;
  if (direct !== undefined) return direct;
  const branches = filters.$or as Array<Record<string, unknown>> | undefined;
  return branches ? filterValue(branches[0], field) : undefined;
}

export function recordObservers() {
  const routes: BoundRoute[] = [];
  const states: BoundState[] = [];
  const sources: Array<{ source: ObservedSource; target: string; options?: Record<string, unknown> }> = [];
  const observe = (source: ObservedSource, target: string, options?: Record<string, unknown>) => {
    sources.push({ source, target, options });
    if (source.function_id === "http::on-request" && source.args) {
      routes.push({
        function_id: target,
        method: String(source.args.method),
        path: String(source.args.path),
        ...(source.args.middleware_function_ids ? { middleware_function_ids: source.args.middleware_function_ids as string[] } : {}),
      });
    } else if (source.function_id === "state::on-changed") {
      const scope = filterValue(source.filters, "input.scope");
      const key = filterValue(source.filters, "input.key");
      states.push({ function_id: target, ...(scope !== undefined ? { scope } : {}), ...(key !== undefined ? { key } : {}) });
    }
    return fakeHandle(String(options?.id ?? target));
  };
  return { observe, routes, states, sources };
}
