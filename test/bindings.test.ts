import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Bindings, getBindings } from "../src/runtime/bindings.js";
import { registerObserverTarget, unwrapObserved } from "../src/runtime/observed.js";
import { KV } from "../src/state/schema.js";
import { registerPipelineObservers } from "../src/runtime/pipeline-observers.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { logger } from "../src/logger.js";

type Observed = { source: Record<string, unknown>; target: string; options?: Record<string, unknown> };

function makeHandle(initial: "active" | "pending" = "active") {
  const listeners = new Set<(state: string) => void>();
  const handle = {
    id: "obs-1",
    state: initial as string,
    reason: undefined,
    ready: vi.fn(() => Promise.resolve()),
    onStateChange: (listener: (state: string) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: vi.fn(() => Promise.resolve()),
    become(next: string) { handle.state = next; for (const listener of listeners) listener(next); },
  };
  return handle;
}

function fakeSdk(initial: "active" | "pending" = "active") {
  const observed: Observed[] = [];
  const handles: ReturnType<typeof makeHandle>[] = [];
  const sdk = {
    observed,
    handles,
    observe: vi.fn((source: Record<string, unknown>, target: string, options?: Record<string, unknown>) => {
      observed.push({ source, target, options });
      const handle = makeHandle(initial);
      handles.push(handle);
      return handle;
    }),
  };
  return sdk;
}

const ROUTE = {
  function_id: "api::x",
  config: { api_path: "/agentmemory/x", http_method: "POST", middleware_function_ids: ["middleware::api-auth"] },
};

describe("Bindings", () => {
  const env = process.env;
  beforeEach(() => { vi.clearAllMocks(); env.AGENTMEMORY_BINDINGS = undefined; });
  afterEach(() => { env.AGENTMEMORY_BINDINGS = undefined; });

  it("observes http::on-request with the route as args right away", () => {
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    expect(sdk.observed).toHaveLength(1);
    const route = sdk.observed[0];
    expect(route.source).toEqual({
      function_id: "http::on-request",
      args: { method: "POST", path: "/agentmemory/x", middleware_function_ids: ["middleware::api-auth"] },
    });
    expect(route.target).toBe("api::x");
    expect(route.options).toEqual({ id: "agentmemory:route:POST /agentmemory/x", max_in_flight: 1024 });
  });

  it("defaults the method to GET and passes public_webhook only when set", () => {
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    b.http({ type: "http", function_id: "api::y", config: { api_path: "/y", public_webhook: true } });
    expect(sdk.observed[0].source.args).toEqual({ method: "GET", path: "/y", public_webhook: true });
  });

  it("refuses route config the http worker does not accept", () => {
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    const odd = { ...ROUTE, config: { ...ROUTE.config, condition_function_id: "x::y" } };
    expect(() => b.http(odd as never)).toThrow(/condition_function_id/);
    expect(sdk.observed).toHaveLength(0);
  });

  it("observes state::on-changed with capture input and a scope filter", () => {
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    b.state({ function_id: "ev::mem", scope: KV.memories, maxInFlight: 1 });
    const st = sdk.observed[0];
    expect(st.source).toEqual({
      function_id: "state::on-changed",
      filters: { "input.scope": { $eq: KV.memories } },
      capture: ["input"],
    });
    expect(st.options).toEqual({ id: "agentmemory:state:ev::mem", max_in_flight: 1 });
    expect(b.stateHandles).toHaveLength(1);
  });

  it("graph scopes produce an $or prefix filter and key filters are included", () => {
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    b.state({ function_id: "ev::g", scope: KV.graphNodes, key: "current" });
    expect(sdk.observed[0].source.filters).toEqual({
      $or: [
        { "input.scope": { $eq: KV.graphNodes } },
        { "input.scope": { $prefix: `${KV.graphNodes}:generation:` } },
      ],
      "input.key": { $eq: "current" },
    });
  });

  it("no observer source carries the removed on or deliver fields", () => {
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    b.state({ function_id: "ev::x", scope: KV.sessions });
    b.observeStateChanges({ "input.scope": { $eq: KV.relations } }, "ev::r");
    for (const { source } of sdk.observed) {
      expect(source).not.toHaveProperty("on");
      expect(source).not.toHaveProperty("deliver");
    }
  });

  it("activate resolves at once when every route and state observer is active", async () => {
    const sdk = fakeSdk("active");
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    b.state({ function_id: "ev::x", scope: KV.memories });
    expect(await b.activate()).toEqual({ state: "observe", http: "observe" });
    expect(b.describe()).toMatchObject({ state: "observe", http: "observe", pipeline: "observe", failedObservers: 0, reasons: [] });
  });

  it("modes follow observer state changes and activate resolves when they settle", async () => {
    const sdk = fakeSdk("pending");
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    b.state({ function_id: "ev::x", scope: KV.memories });
    expect(b.modes).toEqual({ state: "pending", http: "pending" });
    const settled = b.activate();
    sdk.handles[1].become("active");
    expect(b.modes).toEqual({ state: "observe", http: "pending" });
    sdk.handles[0].become("active");
    expect(await settled).toEqual({ state: "observe", http: "observe" });
  });

  it("observes a route again when an earlier connection still holds its observer id", async () => {
    vi.useFakeTimers();
    try {
      const sdk = fakeSdk("active");
      let first = true;
      sdk.observe.mockImplementation((source: Record<string, unknown>, target: string, options?: Record<string, unknown>) => {
        sdk.observed.push({ source, target, options });
        const handle = makeHandle(first ? "error" : "active");
        if (first) handle.ready.mockImplementation(() => Promise.reject(Object.assign(new Error("conflict"), { code: "OBSERVER_ID_CONFLICT" })));
        first = false;
        sdk.handles.push(handle);
        return handle;
      });
      const b = new Bindings(sdk as never);
      b.http(ROUTE);
      await vi.advanceTimersByTimeAsync(0);
      expect(sdk.observed).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sdk.observed).toHaveLength(2);
      expect(sdk.observed[1].options).toEqual(sdk.observed[0].options);
      expect(sdk.handles[0].dispose).toHaveBeenCalled();
      expect(b.handles).toEqual([sdk.handles[1]]);
      expect(b.describe()).toMatchObject({ http: "observe", failedObservers: 0, reasons: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it("activate resolves when a retried route observer becomes active", async () => {
    vi.useFakeTimers();
    try {
      const sdk = fakeSdk("active");
      let first = true;
      sdk.observe.mockImplementation((source: Record<string, unknown>, target: string, options?: Record<string, unknown>) => {
        sdk.observed.push({ source, target, options });
        const handle = makeHandle(first ? "pending" : "active");
        if (first) handle.ready.mockImplementation(() => Promise.reject(Object.assign(new Error("conflict"), { code: "OBSERVER_ID_CONFLICT" })));
        first = false;
        sdk.handles.push(handle);
        return handle;
      });
      const b = new Bindings(sdk as never);
      b.http(ROUTE);
      let modes: unknown = null;
      void b.activate().then((m) => { modes = m; });
      sdk.handles[0].become("error");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(modes).toEqual({ state: "pending", http: "observe" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a route as rejected after the id conflict retries run out", async () => {
    vi.useFakeTimers();
    try {
      const sdk = fakeSdk("active");
      sdk.observe.mockImplementation((source: Record<string, unknown>, target: string, options?: Record<string, unknown>) => {
        sdk.observed.push({ source, target, options });
        const handle = makeHandle("active");
        handle.state = "error";
        handle.ready.mockImplementation(() => Promise.reject(Object.assign(new Error("conflict"), { code: "OBSERVER_ID_CONFLICT" })));
        sdk.handles.push(handle);
        return handle;
      });
      const b = new Bindings(sdk as never);
      b.http(ROUTE);
      await vi.advanceTimersByTimeAsync(200_000);
      expect(sdk.observed).toHaveLength(5);
      expect(b.describe().failedObservers).toBe(1);
      expect(b.describe().reasons).toContain("route POST /agentmemory/x observer rejected: OBSERVER_ID_CONFLICT");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a pipeline target as observed only while its own observer is active", () => {
    const sdk = fakeSdk("pending");
    const b = new Bindings(sdk as never);
    b.observePipeline({ function_id: "mem::observe" }, "mem::compress");
    b.observePipeline({ function_id: "event::session::stopped" }, "mem::post-session-graph");
    expect(b.observing("mem::compress")).toBe(false);
    sdk.handles[0].become("active");
    expect(b.observing("mem::compress")).toBe(true);
    expect(b.observing("mem::post-session-graph")).toBe(false);
    expect(b.describe().reasons).toContain("1 pipeline observers are not active, so their work runs as direct calls: mem::post-session-graph");
    sdk.handles[0].become("error");
    expect(b.observing("mem::compress")).toBe(false);
  });

  it("never reports a pipeline target as observed in inline mode", () => {
    process.env.AGENTMEMORY_BINDINGS = "inline";
    const sdk = fakeSdk("active");
    const b = new Bindings(sdk as never);
    b.observePipeline({ function_id: "mem::observe" }, "mem::compress");
    expect(b.observing("mem::compress")).toBe(false);
  });

  it("reports observers that stay inactive while others of the same provider are active", () => {
    const sdk = fakeSdk("pending");
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    b.http({ ...ROUTE, config: { ...ROUTE.config, api_path: "/agentmemory/other" } });
    sdk.handles[0].become("active");
    expect(b.modes.http).toBe("observe");
    expect(b.describe().reasons).toEqual(["1 of 2 http observers are not active (pending)"]);
    sdk.handles[1].become("active");
    expect(b.describe().reasons).toEqual([]);
  });

  it("activate resolves with pending modes after the deadline and reports why", async () => {
    vi.useFakeTimers();
    try {
      const sdk = fakeSdk("pending");
      const b = new Bindings(sdk as never);
      b.http(ROUTE);
      const modes = b.activate();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await modes).toEqual({ state: "pending", http: "pending" });
      expect(b.describe().reasons).toEqual(["http::on-request observers pending until the http worker connects"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("route observer max_in_flight honors AGENTMEMORY_ROUTE_MAX_IN_FLIGHT and falls back on invalid", () => {
    process.env.AGENTMEMORY_ROUTE_MAX_IN_FLIGHT = "256";
    let sdk = fakeSdk();
    new Bindings(sdk as never).http(ROUTE);
    expect(sdk.observed[0].options?.max_in_flight).toBe(256);
    process.env.AGENTMEMORY_ROUTE_MAX_IN_FLIGHT = "abc";
    sdk = fakeSdk();
    new Bindings(sdk as never).http(ROUTE);
    expect(sdk.observed[0].options?.max_in_flight).toBe(1024);
    process.env.AGENTMEMORY_ROUTE_MAX_IN_FLIGHT = undefined;
  });

  it("logs and counts a rejected observer", async () => {
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    const handle = makeHandle();
    handle.ready = vi.fn(() => Promise.reject(Object.assign(new Error("conflict"), { code: "HTTP_ROUTE_CONFLICT" })));
    sdk.observe.mockReturnValueOnce(handle as never);
    b.http(ROUTE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("POST /agentmemory/x"),
      expect.objectContaining({ error: "HTTP_ROUTE_CONFLICT" }),
    );
    const report = b.describe();
    expect(report.failedObservers).toBe(1);
    expect(report.observers).toBe(0);
    expect(report.reasons.join("\n")).toContain("POST /agentmemory/x observer rejected: HTTP_ROUTE_CONFLICT");
  });

  it("skips bindings and runs the pipeline inline for a client without observe", () => {
    const sdk = {};
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    b.state({ function_id: "ev::x", scope: KV.memories });
    expect(b.pipeline).toBe("inline");
    expect(b.handles).toHaveLength(0);
    expect(b.describe().reasons).toContain("client has no observe(); bindings skipped");
  });

  it("AGENTMEMORY_BINDINGS=trigger is treated as inline with a warning", () => {
    env.AGENTMEMORY_BINDINGS = "trigger";
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("AGENTMEMORY_BINDINGS=trigger"));
    expect(b.pipeline).toBe("inline");
    b.http(ROUTE);
    expect(sdk.observed).toHaveLength(1);
  });

  it("per-sdk singleton", () => {
    const sdk = {};
    expect(getBindings(sdk as never)).toBe(getBindings(sdk as never));
  });
});

describe("observed payloads", () => {
  const activation = { observer_id: "o", activation_id: "a", function_id: "f", namespace: "agentmemory", invocation_id: "i", status: "success", started_at_ms: 1, duration_ms: 2 };

  it("unwraps input and output from an Observed payload", () => {
    expect(unwrapObserved({ ...activation, input: { key: "k" } }, "input")).toEqual({ key: "k" });
    expect(unwrapObserved({ ...activation, output: { observationId: "o1" } }, "output")).toEqual({ observationId: "o1" });
  });

  it("passes a direct call payload through unchanged", () => {
    const direct = { sessionId: "s1", observationId: "o1" };
    expect(unwrapObserved(direct, "input")).toBe(direct);
    expect(unwrapObserved(direct, "output")).toBe(direct);
    expect(unwrapObserved(null, "input")).toBeNull();
  });

  it("registerObserverTarget hands the handler the captured field", async () => {
    const handlers = new Map<string, (payload: unknown) => unknown>();
    const sdk = { registerFunction: (id: string, fn: (payload: unknown) => unknown) => handlers.set(id, fn) };
    registerObserverTarget(sdk as never, "t::in", "input", (payload: { key: string }) => payload.key);
    registerObserverTarget(sdk as never, "t::out", "output", (payload: { id: string }) => payload.id);
    expect(await handlers.get("t::in")!({ ...activation, input: { key: "k" } })).toBe("k");
    expect(await handlers.get("t::out")!({ ...activation, output: { id: "o1" } })).toBe("o1");
    expect(await handlers.get("t::in")!({ key: "direct" })).toBe("direct");
  });
});

describe("observers without a direct-call fallback", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("reports as direct calls only the steps that really fall back", () => {
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true");
    vi.stubEnv("GRAPH_EXTRACTION_ENABLED", "true");
    vi.stubEnv("AGENTMEMORY_REFLECT", "true");
    const sdk = fakeSdk("pending");
    registerPipelineObservers(sdk as never);
    const reasons = getBindings(sdk as never).describe().reasons;
    const direct = reasons.find((line) => line.includes("direct calls")) ?? "";
    for (const target of ["mem::compress", "mem::post-session-graph", "mem::post-session-reflect", "mem::post-session-consolidate"]) {
      expect(direct).toContain(target);
    }
    for (const target of ["mem::post-remember-graph", "mem::record-failure", "mem::on-record-deleted", "event::graph::edge-reaction"]) {
      expect(direct).not.toContain(target);
      expect(reasons.some((line) => line.includes(target) && line.includes("no direct-call fallback"))).toBe(true);
    }
  });
});
