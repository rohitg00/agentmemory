import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerObserveFunction } from "../src/functions/observe.js";
import { STREAM } from "../src/state/schema.js";
import { resetViewerStreamTracker } from "../src/state/viewer-stream.js";

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
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, (payload: unknown) => Promise<unknown>>();
  const trigger = vi.fn(
    async (input: { function_id: string; payload: unknown }) => {
      const fn = fns.get(input.function_id);
      return fn ? fn(input.payload) : null;
    },
  );
  return {
    registerFunction: (
      idOrOpts: string | { id: string },
      fn: (payload: unknown) => Promise<unknown>,
    ) => {
      fns.set(typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id, fn);
    },
    registerTrigger: () => {},
    trigger,
  };
}

function observePayload(sessionId: string, i: number) {
  return {
    sessionId,
    project: "agentmemory",
    cwd: "/tmp/agentmemory",
    hookType: "post_tool_use",
    timestamp: new Date().toISOString(),
    data: {
      tool_name: "Bash",
      tool_input: { command: `echo probe-${i}` },
      tool_output: `probe-${i} output`,
    },
  };
}

type StreamCall = {
  function_id: string;
  payload: { stream_name?: string; group_id?: string; item_id?: string };
};

describe("observe no longer writes per-session mem-live groups", () => {
  beforeEach(() => {
    resetViewerStreamTracker();
    delete process.env.AGENTMEMORY_VIEWER_STREAM_MAX;
  });

  afterEach(() => {
    delete process.env.AGENTMEMORY_VIEWER_STREAM_MAX;
  });

  it("never targets group_id === sessionId on any stream:: call", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);

    const sessionId = "ses_no_per_session_stream";
    await sdk.trigger({ function_id: "mem::observe", payload: observePayload(sessionId, 0) });
    await sdk.trigger({ function_id: "mem::observe", payload: observePayload(sessionId, 1) });

    const streamCalls = sdk.trigger.mock.calls
      .map((c) => c[0] as StreamCall)
      .filter((c) => c.function_id.startsWith("stream::"));

    expect(streamCalls.length).toBeGreaterThan(0);
    for (const call of streamCalls) {
      expect(call.payload.group_id).not.toBe(sessionId);
      expect(call.payload.group_id).toBe(STREAM.viewerGroup);
    }
  });

  it("prunes the viewer group once enough observations accumulate past the configured cap", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "10";
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);

    const sessionId = "ses_prune_wiring";
    for (let i = 0; i < 55; i++) {
      await sdk.trigger({ function_id: "mem::observe", payload: observePayload(sessionId, i) });
    }

    const deleteCalls = sdk.trigger.mock.calls
      .map((c) => c[0] as StreamCall)
      .filter((c) => c.function_id === "stream::delete");

    expect(deleteCalls.length).toBeGreaterThan(0);
    for (const call of deleteCalls) {
      expect(call.payload.group_id).toBe(STREAM.viewerGroup);
    }
  });
});
