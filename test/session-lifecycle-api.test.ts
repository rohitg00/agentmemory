import { describe, expect, it, vi } from "vitest";

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import type { Session } from "../src/types.js";

type ApiResponse = {
  status_code: number;
  body: Record<string, unknown>;
};

function makeHarness(sessionRows: Array<[string, unknown]> = []) {
  const store = new Map<string, Map<string, unknown>>([
    [KV.sessions, new Map(sessionRows)],
    [KV.summaries, new Map()],
  ]);
  const functions = new Map<string, Function>();
  const trigger = vi.fn(async () => undefined);
  const update = vi.fn(
    async (
      scope: string,
      key: string,
      ops: Array<{ type: "set" | "remove"; path: string; value?: unknown }>,
    ) => {
      const values = store.get(scope) ?? new Map<string, unknown>();
      store.set(scope, values);
      const existing = values.get(key);
      const next =
        existing && typeof existing === "object"
          ? { ...(existing as Record<string, unknown>) }
          : {};
      for (const op of ops) {
        if (op.type === "remove") delete next[op.path];
        else next[op.path] = op.value;
      }
      values.set(key, next);
      return next;
    },
  );
  const kv = {
    get: vi.fn(async (scope: string, key: string) => {
      if (typeof key !== "string" || key.length === 0) {
        throw new Error("state::get requires a non-empty key");
      }
      return store.get(scope)?.get(key) ?? null;
    }),
    set: vi.fn(),
    update,
    delete: vi.fn(),
    list: vi.fn(async (scope: string) =>
      Array.from(store.get(scope)?.values() ?? []),
    ),
  };
  const sdk = {
    registerFunction: (id: string, handler: Function) => functions.set(id, handler),
    registerTrigger: vi.fn(),
    trigger,
  };

  registerApiTriggers(sdk as never, kv as never);

  return { functions, kv, store, trigger, update };
}

function session(id: string, status: Session["status"] = "active"): Session {
  return {
    id,
    project: "test-project",
    cwd: "/tmp/test-project",
    startedAt: "2026-08-26T00:00:00.000Z",
    status,
    observationCount: 1,
  };
}

describe("session lifecycle API", () => {
  it("treats ending an unknown session as a no-op without creating a partial row", async () => {
    const harness = makeHarness();
    const handler = harness.functions.get("api::session::end")!;

    const response = (await handler({
      body: { sessionId: "agent:dmp-pm:direct:test" },
    })) as ApiResponse;

    expect(response).toEqual({
      status_code: 200,
      body: { success: true, ended: false, reason: "not_found" },
    });
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.store.get(KV.sessions)).toEqual(new Map());
    expect(harness.trigger).not.toHaveBeenCalledWith(
      expect.objectContaining({ function_id: "event::session::stopped" }),
    );
  });

  it("does not treat an existing partial row as a valid session", async () => {
    const sessionId = "agent:dmp-pm:direct:partial";
    const harness = makeHarness([
      [sessionId, { status: "completed", endedAt: "2026-08-26T00:00:00.000Z" }],
    ]);
    const handler = harness.functions.get("api::session::end")!;

    const response = (await handler({ body: { sessionId } })) as ApiResponse;

    expect(response.body).toEqual({
      success: true,
      ended: false,
      reason: "not_found",
    });
    expect(harness.update).not.toHaveBeenCalled();
  });

  it("ends an existing session and publishes the stopped lifecycle once", async () => {
    const sessionId = "agent:dmp-pm:direct:existing";
    const harness = makeHarness([[sessionId, session(sessionId)]]);
    const handler = harness.functions.get("api::session::end")!;

    const response = (await handler({ body: { sessionId } })) as ApiResponse;

    expect(response.body).toEqual({ success: true, ended: true });
    expect(harness.store.get(KV.sessions)?.get(sessionId)).toMatchObject({
      id: sessionId,
      status: "completed",
      endedAt: expect.any(String),
    });
    expect(harness.trigger).toHaveBeenCalledTimes(1);
    expect(harness.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        function_id: "event::session::stopped",
        payload: { sessionId },
      }),
    );
  });

  it("skips malformed rows when listing sessions and never reads an undefined summary key", async () => {
    const valid = session("ses_valid", "completed");
    const harness = makeHarness([
      [valid.id, valid],
      ["agent:dmp-pm:direct:partial", { status: "completed", endedAt: "2026-08-26T00:00:00.000Z" }],
    ]);
    const handler = harness.functions.get("api::sessions")!;

    const response = (await handler({
      headers: {},
      query_params: { agentId: "*" },
    })) as ApiResponse;

    expect(response.status_code).toBe(200);
    expect(response.body.sessions).toEqual([valid]);
    expect(harness.kv.get).toHaveBeenCalledWith(KV.summaries, valid.id);
    expect(harness.kv.get).not.toHaveBeenCalledWith(KV.summaries, undefined);
  });
});
