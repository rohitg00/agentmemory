import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Bindings, getBindings } from "../src/runtime/bindings.js";
import { registerPipelineObservers } from "../src/runtime/pipeline-observers.js";
import { KV } from "../src/state/schema.js";
import type { GraphExtractMark } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../src/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config.js")>();
  return { ...actual, isAutoCompressEnabled: () => envFlags.autoCompress, isReflectEnabled: () => envFlags.reflect, isGraphExtractionEnabled: () => envFlags.graphLlm, isConsolidationEnabled: () => envFlags.consolidation, compressMaxConcurrent: () => envFlags.maxConcurrent, isGraphStructuralEnabled: () => envFlags.structural };
});
vi.mock("../src/functions/slots.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/functions/slots.js")>();
  return { ...actual, isReflectEnabled: () => envFlags.reflect };
});

const envFlags = { autoCompress: true, reflect: false, graphLlm: false, consolidation: true, maxConcurrent: 3, structural: true };

function handle() {
  return { id: "h", state: "active", ready: () => Promise.resolve(), onStateChange: () => () => {}, dispose: () => Promise.resolve() };
}

function fakeSdk(functions: string[] = ["state::get", "http::x", "state::on-changed", "http::on-request"]) {
  const observed: Array<{ source: Record<string, unknown>; target: string; options?: Record<string, unknown> }> = [];
  const triggers: Array<{ function_id: string; payload: unknown }> = [];
  const sdk = {
    observed,
    triggers,
    registerTrigger: vi.fn(),
    registerFunction: vi.fn((id: string, handler: unknown) => {
      (sdk as Record<string, unknown>)[`fn:${id}`] = handler;
    }),
    observe: vi.fn((source: Record<string, unknown>, target: string, options?: Record<string, unknown>) => {
      observed.push({ source, target, options });
      return handle();
    }),
    trigger: vi.fn(async (req: { function_id: string; payload: unknown }) => {
      triggers.push({ function_id: req.function_id, payload: req.payload });
      if (req.function_id === "engine::functions::list") return { functions };
      return {};
    }),
  };
  return sdk;
}

async function activatedBindings(sdk: ReturnType<typeof fakeSdk>) {
  const b = new Bindings(sdk as never);
  await b.activate();
  return b;
}

describe("observer pipeline", () => {
  beforeEach(() => {
    envFlags.autoCompress = true; envFlags.reflect = false; envFlags.graphLlm = false;
    envFlags.consolidation = true; envFlags.maxConcurrent = 3; envFlags.structural = true;
    process.env.AGENTMEMORY_BINDINGS = undefined;
  });
  afterEach(() => { process.env.AGENTMEMORY_BINDINGS = undefined; });

  it("pipeline is observe after activation with observe-capable sdk, inline before", async () => {
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    expect(b.pipeline).toBe("inline");
    await b.activate();
    expect(b.pipeline).toBe("observe");
  });

  it("pipeline stays inline with AGENTMEMORY_BINDINGS=trigger and without observe", async () => {
    process.env.AGENTMEMORY_BINDINGS = "trigger";
    const sdk = fakeSdk();
    const b = new Bindings(sdk as never);
    await b.activate();
    expect(b.pipeline).toBe("inline");
    const sdk2 = { registerTrigger: vi.fn(), trigger: vi.fn() };
    const b2 = new Bindings(sdk2 as never);
    await b2.activate();
    expect(b2.pipeline).toBe("inline");
  });

  it("observePipeline buffers until activation then creates the observer", async () => {
    const sdk = fakeSdk();
    const b = getBindings(sdk as never);
    b.observePipeline({ function_id: "x::y" }, "mem::z", { id: "agentmemory:pipeline:test" });
    expect(sdk.observed).toHaveLength(0);
    await b.activate();
    expect(sdk.observed).toHaveLength(1);
    expect(sdk.observed[0].target).toBe("mem::z");
    expect(b.handles).toHaveLength(1);
  });

  it("observePipeline is a no-op in inline mode", async () => {
    process.env.AGENTMEMORY_BINDINGS = "trigger";
    const sdk = fakeSdk();
    const b = getBindings(sdk as never);
    await b.activate();
    expect(b.observePipeline({ function_id: "x::y" }, "mem::z", {})).toBeNull();
    expect(sdk.observed).toHaveLength(0);
  });

  it("registerPipelineObservers issues the compress observer spec", async () => {
    const sdk = fakeSdk();
    const b = getBindings(sdk as never);
    registerPipelineObservers(sdk as never);
    await b.activate();
    const compress = sdk.observed.find((o) => o.options?.id === "agentmemory:pipeline:compress-on-capture")!;
    expect(compress.source).toEqual({
      function_id: "mem::observe",
      filters: { "output.observationId": { $exists: true }, "output.deduplicated": { $ne: true } },
      capture: ["output"],
      deliver: "output",
    });
    expect(compress.target).toBe("mem::compress");
    expect(compress.options?.max_in_flight).toBe(3);
  });

  it("compress observer absent when auto-compress disabled", async () => {
    envFlags.autoCompress = false;
    const sdk = fakeSdk();
    const b = getBindings(sdk as never);
    registerPipelineObservers(sdk as never);
    await b.activate();
    expect(sdk.observed.find((o) => o.options?.id === "agentmemory:pipeline:compress-on-capture")).toBeUndefined();
  });

  it("post-session observers: graph always, reflect gated, consolidate filtered", async () => {
    envFlags.reflect = true;
    const sdk = fakeSdk();
    const b = getBindings(sdk as never);
    registerPipelineObservers(sdk as never);
    await b.activate();
    const graph = sdk.observed.find((o) => o.options?.id === "agentmemory:pipeline:post-session-graph")!;
    expect(graph.source).toMatchObject({ function_id: "event::session::stopped", deliver: "input", filters: { "output.unchanged": { $ne: true } } });
    expect(graph.options?.max_in_flight).toBe(1);
    const reflect = sdk.observed.find((o) => o.options?.id === "agentmemory:pipeline:post-session-reflect");
    expect(reflect).toBeTruthy();
    const consolidate = sdk.observed.find((o) => o.options?.id === "agentmemory:pipeline:post-session-consolidate")!;
    expect((consolidate.source.filters as Record<string, unknown>)["input.skipConsolidation"]).toEqual({ $ne: true });
    const remember = sdk.observed.find((o) => o.options?.id === "agentmemory:pipeline:post-remember-graph");
    expect(remember).toBeUndefined();
  });

  it("reflect observer absent when reflect disabled; remember observer present when graph extraction enabled", async () => {
    envFlags.reflect = false;
    envFlags.graphLlm = true;
    const sdk = fakeSdk();
    const b = getBindings(sdk as never);
    registerPipelineObservers(sdk as never);
    await b.activate();
    expect(sdk.observed.find((o) => o.options?.id === "agentmemory:pipeline:post-session-reflect")).toBeUndefined();
    const remember = sdk.observed.find((o) => o.options?.id === "agentmemory:pipeline:post-remember-graph")!;
    expect(remember).toBeTruthy();
    expect(remember.source).toMatchObject({ function_id: "mem::remember", capture: ["input", "output"] });
    expect(remember.options?.max_in_flight).toBe(1);
  });
});

describe("post-session-graph delta marker", () => {
  it("only extracts new observations and advances marker on success", async () => {
    const { registerPostSessionFunctions } = await import("../src/functions/post-session.js");
    const sdk = { functions: new Map<string, (d: unknown) => Promise<unknown>>(), trigger: vi.fn(async (req: { function_id: string; payload: unknown }) => {
      if (req.function_id === "mem::graph-extract") return { nodes: 1 };
      return {};
    }), registerFunction: function (id: string, h: (d: unknown) => Promise<unknown>) { this.functions.set(id, h); } };
    const marks = new Map<string, GraphExtractMark>();
    const obs = [
      { id: "o1", title: "old", timestamp: "2026-01-01T00:00:00Z" },
      { id: "o2", title: "new1", timestamp: "2026-02-01T00:00:00Z" },
      { id: "o3", title: "new2", timestamp: "2026-03-01T00:00:00Z" },
      { id: "o4", title: "", timestamp: "2026-04-01T00:00:00Z" },
    ];
    const kv = {
      get: vi.fn(async (_s: string, k: string) => marks.get(k) ?? null),
      set: vi.fn(async (_s: string, k: string, v: GraphExtractMark) => { marks.set(k, v); }),
      iterate: async function* () { yield obs; },
      backend: "file",
    };
    marks.set("s1", { sessionId: "s1", lastObservationTimestamp: "2026-01-15T00:00:00Z", extractedCount: 1, updatedAt: "2026-01-15T00:00:00Z" });
    registerPostSessionFunctions(sdk as never, kv as never);
    const result = await sdk.functions.get("mem::post-session-graph")!({ sessionId: "s1" });
    const call = sdk.trigger.mock.calls.find((c) => c[0].function_id === "mem::graph-extract")!;
    expect((call[0].payload as { observations: Array<{ id: string }> }).observations.map((o) => o.id)).toEqual(["o2", "o3"]);
    expect(marks.get("s1")!.lastObservationTimestamp).toBe("2026-03-01T00:00:00Z");
    expect(marks.get("s1")!.extractedCount).toBe(3);
    expect(result).toEqual({ extracted: 2 });
  });

  it("marker does not advance when extract fails", async () => {
    const { registerPostSessionFunctions } = await import("../src/functions/post-session.js");
    const sdk = { functions: new Map<string, (d: unknown) => Promise<unknown>>(), trigger: vi.fn(async () => { throw new Error("boom"); }), registerFunction: function (id: string, h: (d: unknown) => Promise<unknown>) { this.functions.set(id, h); } };
    const marks = new Map<string, GraphExtractMark>();
    const kv = {
      get: vi.fn(async (_s: string, k: string) => marks.get(k) ?? null),
      set: vi.fn(async (_s: string, k: string, v: GraphExtractMark) => { marks.set(k, v); }),
      iterate: async function* () { yield [{ id: "o1", title: "x", timestamp: "2026-02-01T00:00:00Z" }]; },
      backend: "file",
    };
    marks.set("s1", { sessionId: "s1", lastObservationTimestamp: "2026-01-01T00:00:00Z", extractedCount: 0, updatedAt: "2026-01-01T00:00:00Z" });
    registerPostSessionFunctions(sdk as never, kv as never);
    await expect(sdk.functions.get("mem::post-session-graph")!({ sessionId: "s1" })).rejects.toThrow("boom");
    expect(marks.get("s1")!.lastObservationTimestamp).toBe("2026-01-01T00:00:00Z");
  });
});

describe("compression sweep", () => {
  it("selects only old pending/failed observations, bounded, single-flight", async () => {
    const { createCompressionSweep } = await import("../src/functions/compression-sweep.js");
    const sent: unknown[] = [];
    const sdk = { trigger: vi.fn(async (req: { function_id: string; payload: unknown }) => { sent.push(req.payload); return {}; }) };
    const sessions = [{ id: "s1" }];
    const now = Date.now();
    const obs = Array.from({ length: 60 }, (_, i) => ({
      id: `o${i}`,
      title: "t",
      timestamp: new Date(now - (i < 55 ? 10 * 60_000 : 60_000)).toISOString(),
      compression: { status: "pending", attempts: 0, revision: "r" },
    }));
    const kv = {
      list: vi.fn(async () => sessions),
      iterate: async function* () { yield obs; },
      backend: "file",
    };
    const run = createCompressionSweep(sdk as never, kv as never);
    const [r1, r2] = await Promise.all([run(), run()]);
    expect(r1.dispatched).toBe(50);
    expect(r2.dispatched).toBe(50);
    expect(sent).toHaveLength(50);
  });
});

describe("post-remember-graph", () => {
  it("builds an observation-shaped extract payload from the saved memory", async () => {
    const { registerPostSessionFunctions } = await import("../src/functions/post-session.js");
    const sdk = { functions: new Map<string, (d: unknown) => Promise<unknown>>(), trigger: vi.fn(async () => ({ ok: true })), registerFunction: function (id: string, h: (d: unknown) => Promise<unknown>) { this.functions.set(id, h); } };
    registerPostSessionFunctions(sdk as never, { get: vi.fn(), set: vi.fn(), iterate: async function* () {}, backend: "file" } as never);
    await sdk.functions.get("mem::post-remember-graph")!({
      input: { content: "prefer pnpm over npm", type: "preference", concepts: ["tooling"] },
      output: { success: true, memory: { id: "m1", title: "use pnpm", content: "prefer pnpm over npm", type: "preference", createdAt: "2026-01-01T00:00:00Z", concepts: ["tooling"] } },
    });
    const call = sdk.trigger.mock.calls.find((c) => c[0].function_id === "mem::graph-extract")!;
    const obs = (call[0].payload as { observations: Array<Record<string, unknown>> }).observations;
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ id: "m1", title: "use pnpm", narrative: "prefer pnpm over npm", hookType: "remember" });
  });

  it("skips when remember output has no memory", async () => {
    const { registerPostSessionFunctions } = await import("../src/functions/post-session.js");
    const sdk = { functions: new Map<string, (d: unknown) => Promise<unknown>>(), trigger: vi.fn(async () => ({})), registerFunction: function (id: string, h: (d: unknown) => Promise<unknown>) { this.functions.set(id, h); } };
    registerPostSessionFunctions(sdk as never, { get: vi.fn(), set: vi.fn(), backend: "file" } as never);
    const result = await sdk.functions.get("mem::post-remember-graph")!({ output: { success: false } });
    expect(result).toEqual({ skipped: "no_memory" });
    expect(sdk.trigger).not.toHaveBeenCalled();
  });
});

describe("env parsing", () => {
  it("compressMaxConcurrent default and strict integer", async () => {
    envFlags.maxConcurrent = 7;
    const mod = await import("../src/config.js");
    expect(mod.compressMaxConcurrent()).toBe(7);
  });
});
