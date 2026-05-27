import { afterEach, describe, expect, it } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";
import { registerEventTriggers } from "../src/triggers/events.js";
import type { CompressedObservation, Session } from "../src/types.js";
import { KV } from "../src/state/schema.js";

type Handler = (payload: unknown) => unknown | Promise<unknown>;
type Store = Map<string, Map<string, unknown>>;

function mockKV(store: Store) {
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    update: async <T>(
      scope: string,
      key: string,
      ops: Array<{ type: string; path: string; value?: unknown }>,
    ): Promise<T> => {
      const current = {
        ...((store.get(scope)?.get(key) as Record<string, unknown>) ?? {}),
      };
      for (const op of ops) {
        if (op.type === "set") current[op.path] = op.value;
      }
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, current);
      return current as T;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const handlers = new Map<string, Handler>();
  const calls: Array<{ function_id: string; payload: unknown }> = [];
  return {
    calls,
    sdk: {
      registerFunction: (id: string, handler: Handler) => {
        handlers.set(id, handler);
      },
      registerTrigger: () => {},
      trigger: async (input: { function_id: string; payload: unknown }) => {
        calls.push(input);
        const handler = handlers.get(input.function_id);
        if (!handler) throw new Error(`missing handler: ${input.function_id}`);
        return handler(input.payload);
      },
      triggerVoid: (function_id: string, payload: unknown) => {
        calls.push({ function_id, payload });
        const handler = handlers.get(function_id);
        if (handler) void handler(payload);
      },
    },
  };
}

function makeSession(id: string): Session {
  return {
    id,
    project: "agentmemory",
    cwd: "/repo/agentmemory",
    startedAt: new Date().toISOString(),
    status: "active",
    observationCount: 2,
  };
}

function makeObservation(sessionId: string): CompressedObservation {
  return {
    id: "obs_manual_end",
    sessionId,
    timestamp: new Date().toISOString(),
    type: "decision",
    title: "Manual end should update graph",
    facts: ["Manual session end should trigger graph extraction"],
    narrative: "Manual End Session should run stopped-session processing.",
    concepts: ["manual session end", "graph extraction"],
    files: ["src/triggers/api.ts"],
    importance: 8,
  };
}

describe("api::session::end", () => {
  const originalGraphFlag = process.env["GRAPH_EXTRACTION_ENABLED"];

  afterEach(() => {
    if (originalGraphFlag === undefined) {
      delete process.env["GRAPH_EXTRACTION_ENABLED"];
    } else {
      process.env["GRAPH_EXTRACTION_ENABLED"] = originalGraphFlag;
    }
  });

  it("runs graph extraction once when manually ending a session", async () => {
    process.env["GRAPH_EXTRACTION_ENABLED"] = "true";
    const sessionId = "ses_manual_end";
    const store: Store = new Map([
      [KV.sessions, new Map([[sessionId, makeSession(sessionId)]])],
      [
        KV.observations(sessionId),
        new Map([["obs_manual_end", makeObservation(sessionId)]]),
      ],
    ]);
    const kv = mockKV(store);
    const { sdk, calls } = mockSdk();
    let graphExtractCompleted = false;

    registerApiTriggers(sdk as never, kv as never);
    registerEventTriggers(sdk as never, kv as never);
    sdk.registerFunction("mem::summarize", async (payload) => {
      expect(payload).toEqual({ sessionId });
      return { success: true };
    });
    sdk.registerFunction("mem::graph-extract", async (payload) => {
      expect(payload).toMatchObject({
        observations: [{ id: "obs_manual_end" }],
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
      graphExtractCompleted = true;
      return { success: true };
    });

    const first = (await sdk.trigger({
      function_id: "api::session::end",
      payload: { body: { sessionId } },
    })) as { status_code: number; body: { success: boolean } };
    const second = (await sdk.trigger({
      function_id: "api::session::end",
      payload: { body: { sessionId } },
    })) as { status_code: number; body: { success: boolean } };

    expect(first.status_code).toBe(200);
    expect(second.status_code).toBe(200);
    expect(first.body.success).toBe(true);
    expect(second.body.success).toBe(true);
    expect(await kv.get<Session>(KV.sessions, sessionId)).toMatchObject({
      status: "completed",
    });
    expect(graphExtractCompleted).toBe(true);
    expect(
      calls.filter((call) => call.function_id === "mem::graph-extract"),
    ).toHaveLength(1);
  });
});
