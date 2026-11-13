import type { IIIClient, ObserveSource, ObserverHandle, ObserverOptions } from "iii-sdk";
import { logger } from "../logger.js";
import { GRAPH_SCOPES } from "../state/graph-generation.js";

export type ProviderMode = "observe" | "pending";
export type BindingModes = { state: ProviderMode; http: ProviderMode };

export interface HttpRouteSpec {
  function_id: string;
  config: {
    api_path: string;
    http_method?: string;
    middleware_function_ids?: string[];
    public_webhook?: boolean;
  };
}

export interface StateSpec {
  function_id: string;
  scope: string;
  key?: string;
  maxInFlight?: number;
}

export interface BindingReport {
  state: ProviderMode;
  http: ProviderMode;
  pipeline: "observe" | "inline";
  observers: number;
  failedObservers: number;
  reasons: string[];
}

interface SdkLike {
  observe?: (source: ObserveSource, target: string, options?: ObserverOptions) => ObserverHandle;
}

type BindingKind = "http" | "state" | "pipeline" | "runtime";

interface BoundObserver {
  handle: ObserverHandle;
  kind: BindingKind;
  target: string;
  // Pipeline work that also runs as a direct call while its observer is not active.
  fallback: boolean;
}

const instances = new WeakMap<object, Bindings>();

const HTTP_ARG_KEYS = new Set(["api_path", "http_method", "middleware_function_ids", "public_webhook"]);

const ACTIVATE_TIMEOUT_MS = 30_000;

const ID_CONFLICT_RETRY_DELAYS_MS = [10_000, 20_000, 40_000, 80_000];

export class Bindings {
  private readonly sdk: SdkLike;
  private readonly bound: BoundObserver[] = [];
  private readonly reasons = new Set<string>();
  private readonly inline: boolean;
  private failedObserverCount = 0;
  private readonly boundWatchers = new Set<(entry: BoundObserver) => void>();

  constructor(sdk: SdkLike) {
    this.sdk = sdk;
    const forced = process.env.AGENTMEMORY_BINDINGS;
    if (forced === "trigger") {
      logger.warn("AGENTMEMORY_BINDINGS=trigger is no longer supported on iii 0.26 (triggers were removed); treating it as AGENTMEMORY_BINDINGS=inline");
    }
    this.inline = forced === "inline" || forced === "trigger" || typeof sdk.observe !== "function";
  }

  get handles(): readonly ObserverHandle[] {
    return this.bound.map((entry) => entry.handle);
  }

  get stateHandles(): readonly ObserverHandle[] {
    return this.handlesOf("state");
  }

  onStateHandle(listener: (handle: ObserverHandle) => void): () => void {
    const watch = (entry: { handle: ObserverHandle; kind: BindingKind }) => {
      if (entry.kind === "state") listener(entry.handle);
    };
    this.boundWatchers.add(watch);
    return () => this.boundWatchers.delete(watch);
  }

  get pipeline(): "observe" | "inline" {
    return this.inline ? "inline" : "observe";
  }

  observing(target: string): boolean {
    if (this.inline) return false;
    return this.bound.some((entry) => entry.kind === "pipeline" && entry.target === target && entry.handle.state === "active");
  }

  /** Calls listener with every runtime handle bound for target, including conflict replacements. */
  onRuntimeHandle(target: string, listener: (handle: ObserverHandle) => void): () => void {
    const watch = (entry: BoundObserver) => {
      if (entry.kind === "runtime" && entry.target === target) listener(entry.handle);
    };
    this.boundWatchers.add(watch);
    return () => this.boundWatchers.delete(watch);
  }

  runtimeActive(target: string): boolean {
    return this.bound.some((entry) => entry.kind === "runtime" && entry.target === target && entry.handle.state === "active");
  }

  get modes(): BindingModes {
    return { state: this.modeOf("state"), http: this.modeOf("http") };
  }

  private handlesOf(kind: BindingKind): ObserverHandle[] {
    return this.bound.filter((entry) => entry.kind === kind).map((entry) => entry.handle);
  }

  private modeOf(kind: "state" | "http"): ProviderMode {
    return this.handlesOf(kind).some((handle) => handle.state === "active") ? "observe" : "pending";
  }

  private routeMaxInFlight(): number {
    const raw = process.env.AGENTMEMORY_ROUTE_MAX_IN_FLIGHT;
    if (raw === undefined) return 1024;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65536) return 1024;
    return parsed;
  }

  private observe(
    kind: BindingKind,
    label: string,
    source: ObserveSource,
    target: string,
    options?: ObserverOptions,
    extra: { fallback?: boolean; attempt?: number } = {},
  ): ObserverHandle | null {
    const attempt = extra.attempt ?? 0;
    if (typeof this.sdk.observe !== "function") {
      this.reasons.add("client has no observe(); bindings skipped");
      return null;
    }
    const handle = this.sdk.observe(source, target, options);
    const entry: BoundObserver = { handle, kind, target, fallback: extra.fallback ?? false };
    this.bound.push(entry);
    for (const watch of this.boundWatchers) watch(entry);
    void handle.ready().catch((err: unknown) => {
      const code = (err as { code?: string })?.code ?? String(err);
      if (code === "OBSERVER_ID_CONFLICT" && attempt < ID_CONFLICT_RETRY_DELAYS_MS.length) {
        const delay = ID_CONFLICT_RETRY_DELAYS_MS[attempt];
        logger.warn(`Observer id for ${label} is still held by an earlier connection; retrying`, { attempt: attempt + 1, delayMs: delay });
        const timer = setTimeout(() => {
          void handle.dispose().catch(() => {}).finally(() => {
            const index = this.bound.indexOf(entry);
            if (index >= 0) this.bound.splice(index, 1);
            this.observe(kind, label, source, target, options, { ...extra, attempt: attempt + 1 });
          });
        }, delay);
        timer.unref?.();
        return;
      }
      this.failedObserverCount++;
      this.reasons.add(`${label} observer rejected: ${code}`);
      logger.error(`Observer failed for ${label}`, { error: code });
    });
    return handle;
  }

  http(spec: HttpRouteSpec): void {
    const config = spec.config;
    const method = (config.http_method ?? "GET").toUpperCase();
    const unknown = Object.keys(config).filter((key) => !HTTP_ARG_KEYS.has(key));
    if (unknown.length > 0) {
      throw new Error(`route ${method} ${config.api_path} uses config the http worker does not accept: ${unknown.join(",")}`);
    }
    this.observe(
      "http",
      `route ${method} ${config.api_path}`,
      {
        function_id: "http::on-request",
        args: {
          method,
          path: config.api_path,
          ...(config.middleware_function_ids?.length ? { middleware_function_ids: config.middleware_function_ids } : {}),
          ...(config.public_webhook ? { public_webhook: true } : {}),
        },
      },
      spec.function_id,
      { id: `agentmemory:route:${method} ${config.api_path}`, max_in_flight: this.routeMaxInFlight() },
    );
  }

  state(spec: StateSpec): void {
    const scopeClause = GRAPH_SCOPES.has(spec.scope)
      ? { $or: [{ "input.scope": { $eq: spec.scope } }, { "input.scope": { $prefix: `${spec.scope}:generation:` } }] }
      : { "input.scope": { $eq: spec.scope } };
    const filters = {
      ...scopeClause,
      ...(spec.key !== undefined ? { "input.key": { $eq: spec.key } } : {}),
    };
    this.observe(
      "state",
      `state ${spec.function_id}`,
      { function_id: "state::on-changed", filters, capture: ["input"] },
      spec.function_id,
      { id: `agentmemory:state:${spec.function_id}`, ...(spec.maxInFlight ? { max_in_flight: spec.maxInFlight } : {}) },
    );
  }

  /**
   * Binds a pipeline step. `fallback: true` (the default) means the caller
   * checks `observing(target)` and calls the step directly while the observer
   * is not active; pass `fallback: false` for work that only runs through it.
   */
  observePipeline(
    source: ObserveSource,
    target: string,
    options?: ObserverOptions,
    opts: { fallback?: boolean } = {},
  ): ObserverHandle | null {
    if (this.inline) return null;
    return this.observe("pipeline", `pipeline ${target}`, source, target, options, { fallback: opts.fallback ?? true });
  }

  observeRuntime(source: ObserveSource, target: string, options?: ObserverOptions): ObserverHandle | null {
    return this.observe("runtime", `runtime ${target}`, source, target, options);
  }

  observeStateChanges(filters: Record<string, unknown>, target: string, options?: ObserverOptions): ObserverHandle | null {
    return this.observe("pipeline", `pipeline ${target}`, { function_id: "state::on-changed", filters, capture: ["input"] }, target, options);
  }

  activate(timeoutMs = ACTIVATE_TIMEOUT_MS): Promise<BindingModes> {
    const settled = () => {
      const modes = this.modes;
      return (modes.state === "observe" || this.handlesOf("state").length === 0) &&
        (modes.http === "observe" || this.handlesOf("http").length === 0);
    };
    if (settled()) return Promise.resolve(this.modes);
    return new Promise((resolve) => {
      const unsubscribes: Array<() => void> = [];
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        for (const unsubscribe of unsubscribes) unsubscribe();
        resolve(this.modes);
      };
      const timer = setTimeout(finish, timeoutMs);
      timer.unref?.();
      const watch = ({ handle, kind }: { handle: ObserverHandle; kind: BindingKind }) => {
        if (done || (kind !== "state" && kind !== "http")) return;
        unsubscribes.push(handle.onStateChange(() => { if (settled()) finish(); }));
        if (settled()) finish();
      };
      this.boundWatchers.add(watch);
      unsubscribes.push(() => this.boundWatchers.delete(watch));
      for (const entry of this.bound) watch(entry);
    });
  }

  describe(): BindingReport {
    const modes = this.modes;
    const reasons = new Set(this.reasons);
    if (modes.state === "pending" && this.handlesOf("state").length > 0) reasons.add("state::on-changed observers pending until the state worker connects");
    if (modes.http === "pending" && this.handlesOf("http").length > 0) reasons.add("http::on-request observers pending until the http worker connects");
    const inactive = this.bound.filter((entry) => entry.handle.state !== "active");
    const targets = (entries: BoundObserver[]) => [...new Set(entries.map((entry) => entry.target))].join(", ");
    const directCalls = inactive.filter((entry) => entry.kind === "pipeline" && entry.fallback);
    if (!this.inline && directCalls.length > 0) {
      reasons.add(`${directCalls.length} pipeline observers are not active, so their work runs as direct calls: ${targets(directCalls)}`);
    }
    const stalled = inactive.filter((entry) => entry.kind === "pipeline" && !entry.fallback);
    if (stalled.length > 0) {
      reasons.add(`${stalled.length} observers have no direct-call fallback and are not active, so their work does not run until they activate: ${targets(stalled)}`);
    }
    const runtime = inactive.filter((entry) => entry.kind === "runtime");
    if (runtime.length > 0) {
      reasons.add(`${runtime.length} runtime observers are not active: ${targets(runtime)}`);
    }
    for (const kind of ["state", "http"] as const) {
      if (modes[kind] !== "observe") continue;
      const handles = this.handlesOf(kind);
      const inactive = handles.filter((handle) => handle.state !== "active");
      if (inactive.length === 0) continue;
      const states = [...new Set(inactive.map((handle) => handle.state))].join(", ");
      reasons.add(`${inactive.length} of ${handles.length} ${kind} observers are not active (${states})`);
    }
    return {
      ...modes,
      pipeline: this.pipeline,
      observers: this.bound.length - this.failedObserverCount,
      failedObservers: this.failedObserverCount,
      reasons: [...reasons],
    };
  }
}

export function getBindings(sdk: IIIClient): Bindings {
  let binding = instances.get(sdk);
  if (!binding) {
    binding = new Bindings(sdk as unknown as SdkLike);
    instances.set(sdk, binding);
  }
  return binding;
}
