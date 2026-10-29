import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Bindings, getBindings } from "../src/runtime/bindings.js";
import { KV } from "../src/state/schema.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { logger } from "../src/logger.js";

type Observed = { source: Record<string, unknown>; target: string; options?: Record<string, unknown> };

function makeHandle() {
  const listeners: Array<(s: string, r?: unknown) => void> = [];
  return {
    id: "obs-1",
    state: "pending",
    reason: undefined,
    ready: vi.fn(() => Promise.resolve()),
    onStateChange: (l: (s: string, r?: unknown) => void) => { listeners.push(l); return () => {}; },
    dispose: vi.fn(() => Promise.resolve()),
    emit: (s: string) => listeners.forEach((l) => l(s)),
  };
}

function fakeSdk(functions: string[] | Record<string, unknown>) {
  const registered: unknown[] = [];
  const observed: Observed[] = [];
  const handles: ReturnType<typeof makeHandle>[] = [];
  const sdk = {
    registered,
    observed,
    handles,
    registerTrigger: vi.fn((spec: unknown) => { registered.push(spec); }),
    observe: vi.fn((source: Record<string, unknown>, target: string, options?: Record<string, unknown>) => {
      observed.push({ source, target, options });
      const h = makeHandle();
      handles.push(h);
      return h;
    }),
    trigger: vi.fn(async (req: { function_id: string }) => {
      if (req.function_id === "engine::functions::list") return { functions };
      throw new Error(`unexpected ${req.function_id}`);
    }),
  };
  return sdk;
}

const ROUTE = {
  type: "http" as const,
  function_id: "api::x",
  config: { api_path: "/agentmemory/x", http_method: "POST", middleware_function_ids: ["middleware::api-auth"] },
};

describe("Bindings", () => {
  const env = process.env;
  beforeEach(() => { vi.clearAllMocks(); env.AGENTMEMORY_BINDINGS = undefined; });
  afterEach(() => { env.AGENTMEMORY_BINDINGS = undefined; });

  it("registerTrigger immediately with identical object when sdk lacks observe", async () => {
    const sdk = { registerTrigger: vi.fn(), trigger: vi.fn() };
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    expect(sdk.registerTrigger).toHaveBeenCalledWith(ROUTE);
    b.state({ function_id: "ev::x", scope: KV.memories });
    expect(sdk.registerTrigger).toHaveBeenLastCalledWith({ type: "state", function_id: "ev::x", config: { scope: KV.memories } });
  });

  it("AGENTMEMORY_BINDINGS=trigger forces registerTrigger even with observe", async () => {
    env.AGENTMEMORY_BINDINGS = "trigger";
    const sdk = fakeSdk(["state::get", "http::x", "state::on-changed", "http::on-request"]);
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    await b.activate();
    expect(sdk.registerTrigger).toHaveBeenCalledWith(ROUTE);
    expect(sdk.observe).not.toHaveBeenCalled();
  });

  it("auto mode observes http and state when providers advertise the functions", async () => {
    const sdk = fakeSdk(["state::get", "http::x", "state::on-changed", "http::on-request"]);
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    b.state({ function_id: "ev::mem", scope: KV.memories, maxInFlight: 1 });
    const modes = await b.activate();
    expect(modes).toEqual({ state: "observe", http: "observe" });
    const route = sdk.observed.find((o) => (o.source as { function_id: string }).function_id === "http::on-request")!;
    expect(route.source.args).toEqual({ method: "POST", path: "/agentmemory/x", middleware_function_ids: ["middleware::api-auth"] });
    expect(route.target).toBe("api::x");
    expect(route.options?.id).toBe("agentmemory:route:POST /agentmemory/x");
    const st = sdk.observed.find((o) => (o.source as { function_id: string }).function_id === "state::on-changed")!;
    expect(st.source.deliver).toBe("input");
    expect(st.source.filters).toEqual({ "input.scope": { $eq: KV.memories } });
    expect(st.options).toMatchObject({ id: "agentmemory:state:ev::mem", max_in_flight: 1 });
  });

  it("graph scopes produce an $or prefix filter and key filters are included", async () => {
    const sdk = fakeSdk(["state::get", "http::x", "state::on-changed", "http::on-request"]);
    const b = new Bindings(sdk as never);
    b.state({ function_id: "ev::g", scope: KV.graphNodes, key: "current" });
    await b.activate();
    const st = sdk.observed[0]!;
    expect(st.source.filters).toEqual({
      $or: [
        { "input.scope": { $eq: KV.graphNodes } },
        { "input.scope": { $prefix: `${KV.graphNodes}:generation:` } },
      ],
      "input.key": { $eq: "current" },
    });
  });

  it("routes with unknown config fall back to registerTrigger", async () => {
    const sdk = fakeSdk(["state::get", "http::x", "state::on-changed", "http::on-request"]);
    const b = new Bindings(sdk as never);
    const odd = { ...ROUTE, config: { ...ROUTE.config, timeout_ms: 5000 } };
    b.http(odd);
    await b.activate();
    expect(sdk.registerTrigger).toHaveBeenCalledWith(odd);
    expect(sdk.observed).toHaveLength(0);
    expect(b.describe().routesViaTrigger).toBe(1);
  });

  it("falls back to trigger when the provider function is absent", async () => {
    const sdk = fakeSdk(["state::get", "http::x"]);
    const b = new Bindings(sdk as never);
    b.http(ROUTE);
    b.state({ function_id: "ev::x", scope: KV.memories });
    const modes = await b.activate();
    expect(modes).toEqual({ state: "trigger", http: "trigger" });
    expect(sdk.registerTrigger).toHaveBeenCalledTimes(2);
  });

  it("activate is idempotent and late specs bind immediately", async () => {
    const sdk = fakeSdk(["state::get", "http::x", "state::on-changed", "http::on-request"]);
    const b = new Bindings(sdk as never);
    const first = await b.activate();
    const second = await b.activate();
    expect(second).toEqual(first);
    const calls = sdk.trigger.mock.calls.filter((c) => c[0].function_id === "engine::functions::list").length;
    b.http(ROUTE);
    expect(sdk.observed).toHaveLength(1);
    expect(sdk.trigger.mock.calls.filter((c) => c[0].function_id === "engine::functions::list").length).toBe(calls);
  });

  it("logs ready() rejections with the route", async () => {
    const sdk = fakeSdk(["state::get", "http::x", "http::on-request"]);
    const b = new Bindings(sdk as never);
    const handle = makeHandle();
    handle.ready = vi.fn(() => Promise.reject(Object.assign(new Error("conflict"), { code: "HTTP_ROUTE_CONFLICT" })));
    sdk.observe.mockReturnValueOnce(handle as never);
    b.http(ROUTE);
    await b.activate();
    await Promise.resolve();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("POST /agentmemory/x"),
      expect.objectContaining({ error: "HTTP_ROUTE_CONFLICT" }),
    );
  });

  it("specs registered while detection is in flight bind in the final mode", async () => {
    const sdk = fakeSdk([]);
    let release: (v: unknown) => void;
    const gate = new Promise((r) => { release = r; });
    sdk.trigger.mockImplementation(async (req: { function_id: string }) => {
      if (req.function_id === "engine::functions::list") {
        await gate;
        return { functions: ["state::get", "http::x", "state::on-changed", "http::on-request"] };
      }
      throw new Error(`unexpected ${req.function_id}`);
    });
    const b = new Bindings(sdk as never);
    const act = b.activate();
    b.http(ROUTE);
    release!();
    const modes = await act;
    expect(modes.http).toBe("observe");
    expect(sdk.registerTrigger).not.toHaveBeenCalled();
    expect(sdk.observed).toHaveLength(1);
    expect(sdk.observed[0].source.function_id).toBe("http::on-request");
  });

  it("per-sdk singleton", () => {
    const sdk = { registerTrigger: vi.fn(), trigger: vi.fn() };
    expect(getBindings(sdk as never)).toBe(getBindings(sdk as never));
  });
});
