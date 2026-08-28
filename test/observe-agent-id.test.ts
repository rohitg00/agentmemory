import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    TriggerAction: {
      ...actual.TriggerAction,
      Void: vi.fn(() => ({ type: "void" })),
    },
  };
});

import { registerObserveFunction } from "../src/functions/observe.js";
import { KV } from "../src/state/schema.js";

function memoryRuntime() {
  const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
  const state = new Map<string, Map<string, unknown>>();
  const bucket = (scope: string) => {
    const current = state.get(scope) ?? new Map<string, unknown>();
    state.set(scope, current);
    return current;
  };
  const kv = {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (bucket(scope).get(key) as T | undefined) ?? null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      bucket(scope).set(key, value);
      return value;
    },
    list: async <T>(scope: string): Promise<T[]> => [...bucket(scope).values()] as T[],
    update: async () => null,
  };
  const sdk = {
    registerFunction(id: string, handler: (payload: unknown) => Promise<unknown>) {
      handlers.set(id, handler);
    },
    trigger: async (
      input: string | { function_id: string; payload: unknown },
      payload?: unknown,
    ) => {
      const id = typeof input === "string" ? input : input.function_id;
      const data = typeof input === "string" ? payload : input.payload;
      const handler = handlers.get(id);
      return handler ? handler(data) : {};
    },
  };
  return { handlers, kv, sdk };
}

describe("mem::observe per-call agent identity", () => {
  const originalAgentId = process.env["AGENT_ID"];

  beforeEach(() => {
    delete process.env["AGENT_ID"];
  });

  afterEach(() => {
    if (originalAgentId === undefined) delete process.env["AGENT_ID"];
    else process.env["AGENT_ID"] = originalAgentId;
  });

  it("uses payload agentId when implicitly creating a session", async () => {
    const { handlers, kv, sdk } = memoryRuntime();
    registerObserveFunction(sdk as never, kv as never);

    await handlers.get("mem::observe")!({
      hookType: "post_tool_use",
      sessionId: "session-1",
      project: "ALPHA-SelfService",
      cwd: "/workspace/ALPHA-SelfService",
      timestamp: "2026-08-27T00:00:00Z",
      data: { tool_name: "conversation", tool_input: "hello", tool_output: "world" },
      agentId: "alpha",
    });

    const session = await kv.get<{ agentId?: string }>(KV.sessions, "session-1");
    expect(session?.agentId).toBe("alpha");
    const observations = await kv.list<{ agentId?: string }>(KV.observations("session-1"));
    expect(observations).toHaveLength(1);
    expect(observations[0].agentId).toBe("alpha");
    const audits = await kv.list<{
      operation: string;
      functionId: string;
      targetIds: string[];
      details: Record<string, unknown>;
    }>(KV.audit);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      operation: "observe",
      functionId: "mem::observe",
      targetIds: [expect.stringMatching(/^obs_/)],
      details: {
        sessionId: "session-1",
        hookType: "post_tool_use",
        agentId: "alpha",
      },
    });
  });

  it("does not let payload agentId override an existing session owner", async () => {
    const { handlers, kv, sdk } = memoryRuntime();
    await kv.set(KV.sessions, "session-1", {
      id: "session-1",
      agentId: "alpha",
      observationCount: 0,
    });
    registerObserveFunction(sdk as never, kv as never);

    await handlers.get("mem::observe")!({
      hookType: "post_tool_use",
      sessionId: "session-1",
      project: "ALPHA-SelfService",
      cwd: "/workspace/ALPHA-SelfService",
      timestamp: "2026-08-27T00:00:00Z",
      data: { tool_name: "conversation" },
      agentId: "beta",
    });

    const observations = await kv.list<{ agentId?: string }>(KV.observations("session-1"));
    expect(observations).toHaveLength(1);
    expect(observations[0].agentId).toBe("alpha");
  });

  it("keeps an existing unscoped session unscoped", async () => {
    const { handlers, kv, sdk } = memoryRuntime();
    await kv.set(KV.sessions, "session-1", {
      id: "session-1",
      observationCount: 0,
    });
    registerObserveFunction(sdk as never, kv as never);

    await handlers.get("mem::observe")!({
      hookType: "post_tool_use",
      sessionId: "session-1",
      project: "legacy-project",
      cwd: "/workspace/legacy-project",
      timestamp: "2026-08-27T00:00:00Z",
      data: { tool_name: "conversation" },
      agentId: "beta",
    });

    const session = await kv.get<{ agentId?: string }>(KV.sessions, "session-1");
    expect(session?.agentId).toBeUndefined();
    const observations = await kv.list<{ agentId?: string }>(KV.observations("session-1"));
    expect(observations).toHaveLength(1);
    expect(observations[0].agentId).toBeUndefined();
  });
});
