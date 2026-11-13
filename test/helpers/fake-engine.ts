import { applyUpdateOps } from "../../src/state/kv.js";

type UpdateOp = Parameters<typeof applyUpdateOps>[1][number];

type Handler = (payload: unknown, ...rest: unknown[]) => unknown;
type ObserverState = "active" | "pending" | "suspended" | "rejected";

export class FakeObserverHandle {
  state: ObserverState = "active";
  private readonly listeners = new Set<(state: ObserverState) => void>();

  constructor(readonly id: string) {}

  ready(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }

  onStateChange(listener: (state: ObserverState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  become(next: ObserverState): void {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

export interface ObservedSource {
  function_id: string;
  args?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  capture?: string[];
}

/**
 * In-memory stand-in for an iii engine plus its state worker. It is enough to
 * boot the real src/index.ts main(): state::* calls hit a Map, observers come
 * back active, and calls to the worker's own functions run their handlers.
 */
export class FakeEngine {
  readonly store = new Map<string, Map<string, unknown>>();
  readonly functions = new Map<string, Handler>();
  readonly calls: Array<{ function_id: string; payload: unknown }> = [];
  readonly observers: Array<{ source: ObservedSource; target: string; options?: Record<string, unknown>; handle: FakeObserverHandle }> = [];
  failGet: ((scope: string, key: string) => boolean) | null = null;
  workers: Array<Record<string, unknown>> = [{ worker_id: "w-self", worker_name: "agentmemory" }];

  readonly client = {
    registerFunction: (id: string, handler: Handler) => {
      this.functions.set(id, handler);
      return { id, unregister: () => this.functions.delete(id) };
    },
    trigger: (request: { function_id: string; payload?: unknown; action?: unknown }) => this.trigger(request),
    observe: (source: ObservedSource, target: string, options?: Record<string, unknown>) => {
      const handle = new FakeObserverHandle(String(options?.id ?? `observer-${this.observers.length}`));
      this.observers.push({ source, target, options, handle });
      return handle;
    },
    on: () => {},
    shutdown: async () => {},
  };

  callsTo(functionId: string): number {
    return this.calls.filter((call) => call.function_id === functionId).length;
  }

  private scope(name: string): Map<string, unknown> {
    let scope = this.store.get(name);
    if (!scope) {
      scope = new Map();
      this.store.set(name, scope);
    }
    return scope;
  }

  async trigger(request: { function_id: string; payload?: unknown; action?: unknown }): Promise<unknown> {
    const { function_id } = request;
    this.calls.push({ function_id, payload: request.payload });
    const p = (request.payload ?? {}) as { scope: string; key: string; value?: unknown; ops?: UpdateOp[] };
    switch (function_id) {
      case "state::get": {
        if (this.failGet?.(p.scope, p.key)) throw Object.assign(new Error("state read failed"), { code: "io_error" });
        const value = this.scope(p.scope).get(p.key);
        return value === undefined ? null : structuredClone(value);
      }
      case "state::set": {
        const scope = this.scope(p.scope);
        const old = scope.get(p.key) ?? null;
        scope.set(p.key, structuredClone(p.value));
        return { old_value: old, new_value: p.value };
      }
      case "state::update": {
        const scope = this.scope(p.scope);
        const old = scope.get(p.key) ?? null;
        const next = applyUpdateOps(structuredClone(old), p.ops ?? []);
        scope.set(p.key, next);
        return { old_value: old, new_value: next, errors: [] };
      }
      case "state::delete": {
        const scope = this.scope(p.scope);
        const old = scope.get(p.key) ?? null;
        scope.delete(p.key);
        return { old_value: old };
      }
      case "state::list":
        return [...this.scope(p.scope).values()].map((value) => structuredClone(value));
      case "state::list_keys":
        return [...this.scope(p.scope).keys()];
      case "state::list_groups":
        return { groups: [...this.store.keys()] };
      case "engine::workers::list":
        return { workers: this.workers.map((worker) => ({ ...worker })) };
    }
    const handler = this.functions.get(function_id);
    if (!handler) throw Object.assign(new Error(`function_not_found: ${function_id}`), { code: "function_not_found" });
    if (request.action) {
      void Promise.resolve().then(() => handler(request.payload)).catch(() => {});
      return undefined;
    }
    return handler(request.payload);
  }
}

export const engine = new FakeEngine();
