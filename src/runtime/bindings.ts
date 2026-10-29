import type { IIIClient, ObserverHandle } from "iii-sdk";
import { logger } from "../logger.js";
import { GRAPH_SCOPES } from "../state/graph-generation.js";

export type BindingModes = { state: "observe" | "trigger"; http: "observe" | "trigger" };

export interface HttpTriggerSpec {
  type: "http";
  function_id: string;
  config: {
    api_path: string;
    http_method?: string;
    middleware_function_ids?: string[];
    public_webhook?: boolean;
    condition_function_id?: string;
    [key: string]: unknown;
  };
}

export interface StateSpec {
  function_id: string;
  scope: string;
  key?: string;
  maxInFlight?: number;
}

interface PendingSpec {
  kind: "http" | "state";
  spec: HttpTriggerSpec | StateSpec;
}

interface PipelineSpec {
  source: Record<string, unknown>;
  target: string;
  options?: Record<string, unknown>;
}

export interface BindingReport {
  state: "observe" | "trigger";
  http: "observe" | "trigger";
  observers: number;
  routesViaTrigger: number;
  reasons: string[];
}

interface SdkLike {
  registerTrigger?: (spec: unknown) => unknown;
  observe?: (source: unknown, target: string, options?: Record<string, unknown>) => ObserverHandle;
  trigger: (input: { function_id: string; payload: unknown }) => Promise<unknown>;
}

const instances = new WeakMap<object, Bindings>();

const OBSERVE_CAPABLE_HTTP_KEYS = new Set([
  "api_path",
  "http_method",
  "middleware_function_ids",
  "public_webhook",
  "condition_function_id",
]);

export class Bindings {
  private readonly sdk: SdkLike;
  private readonly pending: PendingSpec[] = [];
  private readonly pipelinePending: PipelineSpec[] = [];
  private pipelineMode: "observe" | "inline" = "inline";
  private activated: Promise<BindingModes> | null = null;
  private readonly boundHandles: ObserverHandle[] = [];
  private readonly stateBoundHandles: ObserverHandle[] = [];
  private readonly reasons: string[] = [];
  private routesViaTriggerCount = 0;
  modes: BindingModes = { state: "trigger", http: "trigger" };
  private resolved = false;

  constructor(sdk: SdkLike) {
    this.sdk = sdk;
  }

  get handles(): readonly ObserverHandle[] {
    return this.boundHandles;
  }

  get stateHandles(): readonly ObserverHandle[] {
    return this.stateBoundHandles;
  }

  private immediate(): boolean {
    return typeof this.sdk.observe !== "function" || process.env.AGENTMEMORY_BINDINGS === "trigger";
  }

  private routeMaxInFlight(): number {
    const raw = process.env.AGENTMEMORY_ROUTE_MAX_IN_FLIGHT;
    if (raw === undefined) return 1024;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65536) return 1024;
    return parsed;
  }

  http(spec: HttpTriggerSpec): void {
    if (this.resolved || this.immediate()) return this.bindHttp(spec);
    this.pending.push({ kind: "http", spec });
  }

  state(spec: StateSpec): void {
    if (this.resolved || this.immediate()) return this.bindState(spec);
    this.pending.push({ kind: "state", spec });
  }

  get pipeline(): "observe" | "inline" {
    return this.pipelineMode;
  }

  observePipeline(source: Record<string, unknown>, target: string, options?: Record<string, unknown>): ObserverHandle | null {
    if (!this.resolved && !this.immediate()) {
      this.pipelinePending.push({ source, target, options });
      return null;
    }
    if (this.pipelineMode !== "observe" || typeof this.sdk.observe !== "function") return null;
    const handle = this.sdk.observe(source, target, options);
    this.boundHandles.push(handle);
    void handle.ready().catch((err: unknown) => {
      const code = (err as { code?: string })?.code;
      logger.error(`Pipeline observer failed for ${target}`, { error: code ?? String(err) });
    });
    return handle;
  }

  private bindHttp(spec: HttpTriggerSpec): void {
    if (this.modes.http === "observe") return this.observeHttp(spec);
    this.sdk.registerTrigger?.(spec);
  }

  private bindState(spec: StateSpec): void {
    if (this.modes.state === "observe") return this.observeState(spec);
    this.sdk.registerTrigger?.({
      type: "state",
      function_id: spec.function_id,
      config: { scope: spec.scope, ...(spec.key !== undefined ? { key: spec.key } : {}) },
    });
  }

  private observeHttp(spec: HttpTriggerSpec): void {
    const config = spec.config;
    const method = (config.http_method ?? "GET").toUpperCase();
    const extras = Object.keys(config).filter((key) => !OBSERVE_CAPABLE_HTTP_KEYS.has(key));
    if (extras.length > 0) {
      this.routesViaTriggerCount++;
      this.reasons.push(`route ${method} ${config.api_path} uses trigger (unsupported config: ${extras.join(",")})`);
      logger.info("Route bound via registerTrigger (unsupported config for http::on-request)", {
        route: `${method} ${config.api_path}`,
        extras,
      });
      this.sdk.registerTrigger?.(spec);
      return;
    }
    const handle = this.sdk.observe!(
      {
        function_id: "http::on-request",
        args: {
          method,
          path: config.api_path,
          ...(config.middleware_function_ids?.length ? { middleware_function_ids: config.middleware_function_ids } : {}),
          ...(config.public_webhook ? { public_webhook: true } : {}),
          ...(config.condition_function_id ? { condition_function_id: config.condition_function_id } : {}),
        },
      },
      spec.function_id,
      { id: `agentmemory:route:${method} ${config.api_path}`, max_in_flight: this.routeMaxInFlight() },
    );
    this.boundHandles.push(handle);
    void handle.ready().catch((err: unknown) => {
      const code = (err as { code?: string })?.code;
      logger.error(`HTTP observer failed for route ${method} ${config.api_path}`, { error: code ?? String(err) });
    });
  }

  private observeState(spec: StateSpec): void {
    const scopeClause = GRAPH_SCOPES.has(spec.scope)
      ? { $or: [{ "input.scope": { $eq: spec.scope } }, { "input.scope": { $prefix: `${spec.scope}:generation:` } }] }
      : { "input.scope": { $eq: spec.scope } };
    const filters = {
      ...scopeClause,
      ...(spec.key !== undefined ? { "input.key": { $eq: spec.key } } : {}),
    };
    const handle = this.sdk.observe!(
      { function_id: "state::on-changed", filters, capture: ["input"], deliver: "input" },
      spec.function_id,
      { id: `agentmemory:state:${spec.function_id}`, ...(spec.maxInFlight ? { max_in_flight: spec.maxInFlight } : {}) },
    );
    this.boundHandles.push(handle);
    this.stateBoundHandles.push(handle);
    void handle.ready().catch((err: unknown) => {
      const code = (err as { code?: string })?.code;
      logger.error(`State observer failed for ${spec.function_id}`, { scope: spec.scope, error: code ?? String(err) });
    });
  }

  private async probeFunctions(): Promise<Set<string>> {
    try {
      const listed = await this.sdk.trigger({ function_id: "engine::functions::list", payload: {} });
      const entries = Array.isArray(listed)
        ? listed
        : (((listed as { functions?: unknown[] })?.functions ?? []) as unknown[]);
      return new Set(entries.map((entry) => {
        if (typeof entry === "string") return entry;
        const obj = entry as { function_id?: string; id?: string; name?: string };
        return obj.function_id ?? obj.id ?? obj.name ?? "";
      }).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  private async detectModes(): Promise<BindingModes> {
    const forced = process.env.AGENTMEMORY_BINDINGS;
    const deadline = Date.now() + 30_000;
    let delay = 250;
    let functions = new Set<string>();
    while (Date.now() < deadline) {
      functions = await this.probeFunctions();
      const stateProvider = functions.has("state::get");
      const httpProvider = [...functions].some((name) => name.startsWith("http::"));
      if ((stateProvider || forced === "observe") && (httpProvider || forced === "observe")) {
        const modes: BindingModes = {
          state: forced === "observe" ? "observe" : functions.has("state::on-changed") ? "observe" : "trigger",
          http: forced === "observe" ? "observe" : functions.has("http::on-request") ? "observe" : "trigger",
        };
        if (forced === "observe") {
          if (modes.state === "observe" && !functions.has("state::on-changed")) {
            logger.error("AGENTMEMORY_BINDINGS=observe but state::on-changed is not registered; state observers will wait pending until it registers");
          }
          if (modes.http === "observe" && !functions.has("http::on-request")) {
            logger.error("AGENTMEMORY_BINDINGS=observe but http::on-request is not registered; http observers will wait pending until it registers");
          }
        }
        if (modes.state === "trigger") this.reasons.push("state::on-changed absent; state bindings via registerTrigger");
        if (modes.http === "trigger") this.reasons.push("http::on-request absent; http bindings via registerTrigger");
        return modes;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 2000);
    }
    logger.warn("Timed out waiting for state/http workers after 30s; falling back to trigger bindings", {
      haveStateWorker: functions.has("state::get"),
      haveHttpWorker: [...functions].some((name) => name.startsWith("http::")),
    });
    this.reasons.push("provider detection timed out after 30s");
    return { state: "trigger", http: "trigger" };
  }

  async activate(): Promise<BindingModes> {
    if (!this.activated) {
      if (this.immediate()) {
        this.resolved = true;
        this.activated = Promise.resolve(this.modes);
      } else {
        this.activated = this.detectModes().then((modes) => {
          this.modes = modes;
          this.resolved = true;
          this.pipelineMode = typeof this.sdk.observe === "function" && process.env.AGENTMEMORY_BINDINGS !== "trigger" ? "observe" : "inline";
          for (const { spec } of this.pending.splice(0)) {
            if ("type" in spec && spec.type === "http") this.bindHttp(spec as HttpTriggerSpec);
            else this.bindState(spec as StateSpec);
          }
          for (const spec of this.pipelinePending.splice(0)) {
            this.observePipeline(spec.source, spec.target, spec.options);
          }
          return modes;
        });
      }
    }
    return this.activated;
  }

  describe(): BindingReport {
    return {
      state: this.modes.state,
      http: this.modes.http,
      observers: this.boundHandles.length,
      routesViaTrigger: this.routesViaTriggerCount,
      reasons: [...this.reasons],
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
