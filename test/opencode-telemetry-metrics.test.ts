import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KV } from "../src/state/schema.js";
import type { Session, CompressedObservation } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
    update: async (
      scope: string,
      key: string,
      updates: Array<{ path: string; value: unknown }>,
    ) => {
      const m = store.get(scope);
      if (!m) return;
      const v = (m.get(key) as Record<string, unknown>) ?? {};
      for (const u of updates) v[u.path] = u.value;
      m.set(key, v);
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  const triggered: Array<{ id: string; data: unknown }> = [];
  return {
    fns,
    triggered,
    registerFunction: (
      idOrOpts: string | { id: string },
      fn: Function,
      _options?: Record<string, unknown>,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
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
        typeof idOrInput === "string" ? data : idOrInput.payload;
      triggered.push({ id, data: payload });
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

describe("OpenCode telemetry metrics & synthetic routing", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env["AGENTMEMORY_AUTO_COMPRESS"];
  });

  afterEach(() => {
    delete process.env["AGENTMEMORY_AUTO_COMPRESS"];
  });

  it("aggregates assistant_message into session.metrics without creating observations or triggering compress", async () => {
    const { registerObserveFunction } = await import(
      "../src/functions/observe.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);

    const sessionId = "ses_metrics_1";
    await kv.set(KV.sessions, sessionId, {
      id: sessionId,
      project: "test_proj",
      cwd: "/test",
      startedAt: new Date().toISOString(),
      status: "active",
      observationCount: 0,
    });

    const result1 = await sdk.trigger("mem::observe", {
      sessionId,
      hookType: "assistant_message",
      timestamp: new Date().toISOString(),
      data: {
        modelID: "claude-3-7-sonnet",
        cost: 0.005,
        duration_ms: 1200,
        tokens: {
          input: 100,
          output: 50,
          reasoning: 20,
          cache_read: 300,
          cache_write: 50,
        },
      },
    });

    expect(result1).toEqual({
      success: true,
      sessionId,
      telemetry: true,
    });

    const sessionAfter1 = await kv.get<Session>(KV.sessions, sessionId);
    expect(sessionAfter1).toBeDefined();
    expect(sessionAfter1?.observationCount).toBe(0);
    expect(sessionAfter1?.metrics).toEqual({
      tokens: {
        input: 100,
        output: 50,
        reasoning: 20,
        cacheRead: 300,
        cacheWrite: 50,
      },
      cost: 0.005,
      durationMs: 1200,
      turnCount: 1,
      models: {
        "claude-3-7-sonnet": 1,
      },
    });

    // Verify second message aggregates (handling snake_case & camelCase variations)
    const result2 = await sdk.trigger("mem::observe", {
      sessionId,
      hookType: "assistant_message",
      timestamp: new Date().toISOString(),
      data: {
        model: "claude-3-7-sonnet",
        cost: 0.01,
        durationMs: 800,
        input_tokens: 50,
        output_tokens: 25,
        reasoning_tokens: 10,
        tokens: {
          cacheRead: 100,
          cacheWrite: 20,
        },
      },
    });

    expect(result2).toEqual({
      success: true,
      sessionId,
      telemetry: true,
    });

    const sessionAfter2 = await kv.get<Session>(KV.sessions, sessionId);
    expect(sessionAfter2?.metrics?.tokens).toEqual({
      input: 150,
      output: 75,
      reasoning: 30,
      cacheRead: 400,
      cacheWrite: 70,
    });
    expect(sessionAfter2?.metrics?.cost).toBeCloseTo(0.015);
    expect(sessionAfter2?.metrics?.durationMs).toBe(2000);
    expect(sessionAfter2?.metrics?.turnCount).toBe(2);
    expect(sessionAfter2?.metrics?.models["claude-3-7-sonnet"]).toBe(2);
    expect(sessionAfter2?.observationCount).toBe(0);

    // Verify NO observations in KV.observations
    const obsList = await kv.list(KV.observations(sessionId));
    expect(obsList).toHaveLength(0);

    // Verify mem::compress was NOT triggered
    const compressCalls = sdk.triggered.filter((t) => t.id === "mem::compress");
    expect(compressCalls).toHaveLength(0);
  });

  it("creates observation for command_executed with raw.toolName and raw.toolInput, using synthetic compression even with auto-compress enabled", async () => {
    process.env["AGENTMEMORY_AUTO_COMPRESS"] = "true";
    const { registerObserveFunction } = await import(
      "../src/functions/observe.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);

    const sessionId = "ses_cmd_1";
    await kv.set(KV.sessions, sessionId, {
      id: sessionId,
      project: "test_proj",
      cwd: "/test",
      startedAt: new Date().toISOString(),
      status: "active",
      observationCount: 0,
    });

    const result = (await sdk.trigger("mem::observe", {
      sessionId,
      project: "test_proj",
      cwd: "/test",
      hookType: "command_executed",
      timestamp: new Date().toISOString(),
      data: {
        name: "git status",
        arguments: "--short",
      },
    })) as { observationId: string };

    expect(result.observationId).toBeTruthy();

    // mem::compress must NOT be triggered for Class A command_executed
    const compressCalls = sdk.triggered.filter((t) => t.id === "mem::compress");
    expect(compressCalls).toHaveLength(0);

    // Observation must be created in KV.observations
    const obsList = await kv.list<CompressedObservation>(
      KV.observations(sessionId),
    );
    expect(obsList).toHaveLength(1);
    const obs = obsList[0];
    expect(obs.title).toBe("Executed command: git status");
    expect(obs.type).toBe("command_run");
    expect(obs.subtitle).toBe("--short");

    // Check that stream events were published
    const streamCalls = sdk.triggered.filter((t) => t.id === "stream::send" || t.id === "stream::set");
    expect(streamCalls.length).toBeGreaterThan(0);
    const compressedViewerStream = sdk.triggered.find(
      (t) =>
        t.id === "stream::send" &&
        (t.data as any)?.type === "compressed_observation",
    );
    expect(compressedViewerStream).toBeDefined();
  });

  it("handles other Class A hooks (patch_applied, subagent_start, task_completed) via synthetic compression without mem::compress", async () => {
    process.env["AGENTMEMORY_AUTO_COMPRESS"] = "true";
    const { registerObserveFunction } = await import(
      "../src/functions/observe.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);

    const sessionId = "ses_class_a";
    await kv.set(KV.sessions, sessionId, {
      id: sessionId,
      project: "test_proj",
      cwd: "/test",
      startedAt: new Date().toISOString(),
      status: "active",
      observationCount: 0,
    });

    // 1. patch_applied
    await sdk.trigger("mem::observe", {
      sessionId,
      project: "test_proj",
      cwd: "/test",
      hookType: "patch_applied",
      timestamp: new Date().toISOString(),
      data: {
        files: ["src/foo.ts", "src/bar.ts"],
      },
    });

    // 2. subagent_start
    await sdk.trigger("mem::observe", {
      sessionId,
      project: "test_proj",
      cwd: "/test",
      hookType: "subagent_start",
      timestamp: new Date().toISOString(),
      data: {
        agent: "code-reviewer",
      },
    });

    // 3. task_completed
    await sdk.trigger("mem::observe", {
      sessionId,
      project: "test_proj",
      cwd: "/test",
      hookType: "task_completed",
      timestamp: new Date().toISOString(),
      data: {},
    });

    const compressCalls = sdk.triggered.filter((t) => t.id === "mem::compress");
    expect(compressCalls).toHaveLength(0);

    const obsList = await kv.list<CompressedObservation>(
      KV.observations(sessionId),
    );
    expect(obsList).toHaveLength(3);
    const titles = obsList.map((o) => o.title);
    expect(titles).toContain("Applied patch to 2 file(s)");
    expect(titles).toContain("Started subagent: code-reviewer");
    expect(titles).toContain("Task completed");

    const patchObs = obsList.find((o) => o.title.includes("patch"));
    expect(patchObs?.files).toEqual(["src/foo.ts", "src/bar.ts"]);
    expect(patchObs?.subtitle).toContain("src/foo.ts, src/bar.ts");
  });

  it("implicitly creates session and rounds floating point costs for assistant_message", async () => {
    const { registerObserveFunction } = await import(
      "../src/functions/observe.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);

    const sessionId = "ses_implicit_test";
    // Observe without existing session in KV
    await sdk.trigger("mem::observe", {
      sessionId,
      project: "my_project",
      cwd: "/my/cwd",
      hookType: "assistant_message",
      timestamp: new Date().toISOString(),
      data: {
        tokens: { input: 100, output: 50, reasoning: 20 },
        cost: 0.000015000000000000002,
        modelID: "claude-3-7-sonnet",
      },
    });

    const session = await kv.get<Session>(KV.sessions, sessionId);
    expect(session).toBeDefined();
    expect(session?.project).toBe("my_project");
    expect(session?.cwd).toBe("/my/cwd");
    expect(session?.observationCount).toBe(0);
    expect(session?.metrics?.turnCount).toBe(1);
    expect(session?.metrics?.tokens.reasoning).toBe(20);
    expect(session?.metrics?.cost).toBe(0.000015);
    expect(session?.metrics?.models["claude-3-7-sonnet"]).toBe(1);
  });
});
