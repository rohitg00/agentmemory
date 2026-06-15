import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  TriggerAction: {
    Void: () => ({ type: "void" }),
  },
}));

vi.mock("../src/functions/slots.js", () => ({
  isReflectEnabled: vi.fn(() => false),
}));

vi.mock("../src/config.js", () => ({
  isGraphExtractionEnabled: vi.fn(() => false),
}));

vi.mock("../src/logger.js", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { isReflectEnabled } from "../src/functions/slots.js";
import { isGraphExtractionEnabled } from "../src/config.js";
import { logger } from "../src/logger.js";
import { registerEventTriggers } from "../src/triggers/events.js";
import { KV, STREAM } from "../src/state/schema.js";
import type { CompressedObservation, Session } from "../src/types.js";

type RegisteredHandler = (payload: unknown) => Promise<unknown>;

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    }),
    set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    }),
    update: vi.fn(async (scope: string, key: string, updates: Array<{ path: string; value: unknown }>) => {
      const current = { ...((store.get(scope)?.get(key) as Record<string, unknown>) ?? {}) };
      for (const update of updates) current[update.path] = update.value;
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, current);
      return current;
    }),
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    }),
    seed: (scope: string, key: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
    },
  };
}

function mockSdk() {
  const functions = new Map<string, RegisteredHandler>();
  const triggers: Array<{ function_id: string; type: string; config: unknown }> = [];
  const trigger = vi.fn(async (input: { function_id: string; payload: unknown }) => {
    if (input.function_id === "mem::context") return { context: "remembered context" };
    if (input.function_id === "mem::summarize") return { summary: input.payload };
    if (input.function_id === "mem::observe") return { observed: input.payload };
    if (input.function_id === "stream::send") return { streamed: input.payload };
    if (input.function_id === "mem::slot-reflect") return { reflected: input.payload };
    if (input.function_id === "mem::graph-extract") return { extracted: input.payload };
    const handler = functions.get(input.function_id);
    if (!handler) throw new Error(`No function: ${input.function_id}`);
    return handler(input.payload);
  });
  return {
    registerFunction: (id: string, handler: RegisteredHandler) => {
      functions.set(id, handler);
    },
    registerTrigger: (triggerConfig: { function_id: string; type: string; config: unknown }) => {
      triggers.push(triggerConfig);
    },
    trigger,
    getFunction: (id: string) => functions.get(id),
    triggers,
  };
}

describe("event trigger boundaries", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    vi.mocked(isReflectEnabled).mockReturnValue(false);
    vi.mocked(isGraphExtractionEnabled).mockReturnValue(false);
    vi.mocked(logger.warn).mockClear();
    sdk = mockSdk();
    kv = mockKV();
    registerEventTriggers(sdk as never, kv as never);
  });

  it("registers all durable and state event triggers", () => {
    expect(sdk.triggers.map((trigger) => trigger.function_id)).toEqual([
      "event::session::started",
      "event::observation",
      "event::session::stopped",
      "event::session::ended",
      "event::session::observation-count-changed",
    ]);
    expect(sdk.triggers.at(-1)).toMatchObject({
      type: "state",
      config: { scope: KV.sessions },
    });
  });

  it("starts a session and returns context from the memory function", async () => {
    const handler = sdk.getFunction("event::session::started")!;
    const result = (await handler({
      sessionId: "ses_1",
      project: "git:repo",
      cwd: "/repo",
    })) as { session: Session; context: string };

    expect(result.context).toBe("remembered context");
    expect(result.session).toMatchObject({
      id: "ses_1",
      project: "git:repo",
      cwd: "/repo",
      status: "active",
      observationCount: 0,
    });
    expect(kv.set).toHaveBeenCalledWith(KV.sessions, "ses_1", expect.objectContaining({
      id: "ses_1",
    }));
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::context",
      payload: { sessionId: "ses_1", project: "git:repo" },
    });
  });

  it("forwards observation hook payloads to mem::observe", async () => {
    const handler = sdk.getFunction("event::observation")!;
    const payload = {
      hookType: "post_tool_use",
      sessionId: "ses_1",
      project: "git:repo",
      cwd: "/repo",
      timestamp: "2026-06-14T00:00:00.000Z",
      data: { tool: "pytest" },
    };

    await expect(handler(payload)).resolves.toEqual({ observed: payload });
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::observe",
      payload,
    });
  });

  it("summarizes stopped sessions without optional reflect or graph fanout when flags are disabled", async () => {
    const handler = sdk.getFunction("event::session::stopped")!;
    const result = await handler({ sessionId: "ses_1" });

    expect(result).toEqual({ summary: { sessionId: "ses_1" } });
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::summarize",
      payload: { sessionId: "ses_1" },
    });
    expect(sdk.trigger).not.toHaveBeenCalledWith(expect.objectContaining({
      function_id: "mem::slot-reflect",
    }));
    expect(sdk.trigger).not.toHaveBeenCalledWith(expect.objectContaining({
      function_id: "mem::graph-extract",
    }));
  });

  it("starts reflect and graph fanout for stopped sessions when flags are enabled", async () => {
    vi.mocked(isReflectEnabled).mockReturnValue(true);
    vi.mocked(isGraphExtractionEnabled).mockReturnValue(true);
    kv.seed(KV.observations("ses_1"), "obs_1", {
      id: "obs_1",
      title: "compressed",
    } satisfies Partial<CompressedObservation>);
    kv.seed(KV.observations("ses_1"), "obs_2", {
      id: "obs_2",
    } satisfies Partial<CompressedObservation>);

    const handler = sdk.getFunction("event::session::stopped")!;
    await handler({ sessionId: "ses_1" });

    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::slot-reflect",
      payload: { sessionId: "ses_1" },
      action: { type: "void" },
    });
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::graph-extract",
      payload: { observations: [{ id: "obs_1", title: "compressed" }] },
      action: { type: "void" },
    });
  });

  it("skips graph extraction when graph is enabled but no compressed observations exist", async () => {
    vi.mocked(isGraphExtractionEnabled).mockReturnValue(true);
    kv.seed(KV.observations("ses_1"), "obs_1", {
      id: "obs_1",
    } satisfies Partial<CompressedObservation>);

    const handler = sdk.getFunction("event::session::stopped")!;
    await handler({ sessionId: "ses_1" });

    expect(sdk.trigger).not.toHaveBeenCalledWith(expect.objectContaining({
      function_id: "mem::graph-extract",
    }));
  });

  it("logs optional stopped-session fanout failures without failing the summary", async () => {
    vi.mocked(isReflectEnabled).mockReturnValue(true);
    vi.mocked(isGraphExtractionEnabled).mockReturnValue(true);
    sdk.trigger.mockImplementationOnce(async () => ({ summary: "ok" }));
    sdk.trigger.mockImplementationOnce(() => {
      throw new Error("reflect failed");
    });
    kv.list.mockRejectedValueOnce(new Error("graph list failed"));

    const handler = sdk.getFunction("event::session::stopped")!;
    await expect(handler({ sessionId: "ses_1" })).resolves.toEqual({ summary: "ok" });

    expect(logger.warn).toHaveBeenCalledWith("slot-reflect trigger failed", expect.objectContaining({
      sessionId: "ses_1",
      error: "reflect failed",
    }));
    expect(logger.warn).toHaveBeenCalledWith("graph-extract trigger failed", expect.objectContaining({
      sessionId: "ses_1",
      error: "graph list failed",
    }));
  });

  it("marks ended sessions complete", async () => {
    const handler = sdk.getFunction("event::session::ended")!;
    await expect(handler({ sessionId: "ses_1" })).resolves.toEqual({ success: true });

    expect(kv.update).toHaveBeenCalledWith(KV.sessions, "ses_1", [
      { type: "set", path: "endedAt", value: expect.any(String) },
      { type: "set", path: "status", value: "completed" },
    ]);
  });

  it("skips live activity events for deletes and non-increments", async () => {
    const handler = sdk.getFunction("event::session::observation-count-changed")!;

    await expect(handler({
      key: "ses_1",
      event_type: "delete",
    })).resolves.toEqual({ skipped: true });
    await expect(handler({
      key: "ses_1",
      event_type: "update",
      old_value: { observationCount: 2 },
      new_value: { observationCount: 2 },
    })).resolves.toEqual({ skipped: true });

    expect(sdk.trigger).not.toHaveBeenCalledWith(expect.objectContaining({
      function_id: "stream::send",
    }));
  });

  it("emits live activity events when observation count increases", async () => {
    const handler = sdk.getFunction("event::session::observation-count-changed")!;

    await expect(handler({
      key: "ses_1",
      event_type: "update",
      old_value: { observationCount: 2 },
      new_value: { observationCount: 5, updatedAt: "2026-06-14T01:02:03.000Z" },
    })).resolves.toEqual({ emitted: true });

    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "stream::send",
      payload: expect.objectContaining({
        stream_name: STREAM.name,
        group_id: STREAM.viewerGroup,
        type: "session.activity",
        data: {
          sessionId: "ses_1",
          observationCount: 5,
          delta: 3,
          updatedAt: "2026-06-14T01:02:03.000Z",
        },
      }),
      action: { type: "void" },
    });
  });

  it("uses the current timestamp when live activity has no updatedAt", async () => {
    const handler = sdk.getFunction("event::session::observation-count-changed")!;

    await expect(handler({
      key: "ses_1",
      event_type: "update",
      old_value: undefined,
      new_value: { observationCount: 1 },
    })).resolves.toEqual({ emitted: true });

    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "stream::send",
      payload: expect.objectContaining({
        data: expect.objectContaining({
          observationCount: 1,
          delta: 1,
          updatedAt: expect.any(String),
        }),
      }),
      action: { type: "void" },
    });
  });
});
