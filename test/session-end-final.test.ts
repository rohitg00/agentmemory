import { afterEach, describe, expect, it, vi } from "vitest";

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

import { registerApiTriggers } from "../src/triggers/api.js";
import { registerSessionFinalizeFunction } from "../src/functions/session-finalize.js";
import { FINALIZE_DUE_KEY } from "../src/functions/session-finalize.js";
import { KV } from "../src/state/schema.js";
import type { Session } from "../src/types.js";

type ApiResponse = {
  status_code: number;
  body: Record<string, unknown>;
};

// Mirrors the harness in test/session-lifecycle-api.test.ts, plus a
// functional config scope and the real idle-finalize function so the
// premature-completion flow can be driven end to end without wall-clock
// waits or an LLM provider.
function makeHarness(sessionRows: Array<[string, unknown]> = []) {
  const store = new Map<string, Map<string, unknown>>([
    [KV.sessions, new Map(sessionRows)],
    [KV.summaries, new Map()],
    [KV.config, new Map()],
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
    set: vi.fn(async (scope: string, key: string, value: unknown) => {
      const values = store.get(scope) ?? new Map<string, unknown>();
      store.set(scope, values);
      values.set(key, value);
      return value;
    }),
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
  registerSessionFinalizeFunction(sdk as never, kv as never);

  return { functions, kv, store, trigger, update };
}

const TURN_ONE_AT = "2026-08-26T00:00:00.000Z";

function session(id: string, status: Session["status"] = "active"): Session {
  return {
    id,
    project: "test-project",
    cwd: "/tmp/test-project",
    startedAt: TURN_ONE_AT,
    updatedAt: TURN_ONE_AT,
    status,
    observationCount: 1,
  };
}

describe("api::session::end honors final across an idle finalize", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("re-runs the stop lifecycle when a final end lands on a session the idle finalizer completed early", async () => {
    const sessionId = "agent:dmp-pm:direct:final-after-idle";
    const harness = makeHarness([[sessionId, session(sessionId)]]);
    const end = harness.functions.get("api::session::end")!;
    const finalize = harness.functions.get("mem::session-finalize")!;

    // Turn-one Stop defers; the idle window lapses and the finalizer
    // completes the session early (this is the summarize that only ever
    // covered turn one). The defer records the stop time, so the idle
    // deadline is derived from the stored updatedAt, >120s in the past.
    await end({ body: { sessionId, final: false } });
    const afterStop = harness.store.get(KV.sessions)?.get(sessionId) as Session;
    const idleDueAt = Date.parse(afterStop.updatedAt!) + 120_001;
    await harness.kv.set(KV.config, FINALIZE_DUE_KEY, { [sessionId]: idleDueAt });
    const finalizeResult = (await finalize({ now: idleDueAt })) as { finalized: number };
    expect(finalizeResult.finalized).toBe(1);
    expect(harness.store.get(KV.sessions)?.get(sessionId)).toMatchObject({
      status: "completed",
    });
    expect(harness.trigger).toHaveBeenCalledTimes(1);

    // The agent kept working and the SessionEnd hook sends final:true.
    // It must still fan out the stop lifecycle so the newer observations
    // get summarized (mem::summarize merges the watermark delta).
    const response = (await end({
      body: { sessionId, final: true },
    })) as ApiResponse;

    expect(response.status_code).toBe(200);
    expect(response.body).toMatchObject({ success: true, ended: false });
    expect(harness.trigger).toHaveBeenCalledTimes(2);
    expect(harness.trigger).toHaveBeenLastCalledWith(
      expect.objectContaining({
        function_id: "event::session::stopped",
        payload: { sessionId },
      }),
    );
    // The session stays completed — no resurrection, no duplicate end.
    expect(harness.store.get(KV.sessions)?.get(sessionId)).toMatchObject({
      status: "completed",
      endedAt: expect.any(String),
    });
  });

  it("keeps non-final ends as no-ops on an already-completed session", async () => {
    const sessionId = "agent:dmp-pm:direct:non-final-noop";
    const harness = makeHarness([[sessionId, session(sessionId, "completed")]]);
    const end = harness.functions.get("api::session::end")!;

    const perTurn = (await end({
      body: { sessionId, final: false },
    })) as ApiResponse;
    expect(perTurn.body).toEqual({
      success: true,
      ended: false,
      reason: "already_completed",
    });

    const noFlag = (await end({ body: { sessionId } })) as ApiResponse;
    expect(noFlag.body).toEqual({
      success: true,
      ended: false,
      reason: "already_completed",
    });

    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.trigger).not.toHaveBeenCalled();
  });

  it("still completes an active session on a final end and fires the stop lifecycle once", async () => {
    const sessionId = "agent:dmp-pm:direct:final-active";
    const harness = makeHarness([[sessionId, session(sessionId)]]);
    const end = harness.functions.get("api::session::end")!;

    const response = (await end({
      body: { sessionId, final: true },
    })) as ApiResponse;

    expect(response.body).toEqual({ success: true, ended: true });
    expect(harness.store.get(KV.sessions)?.get(sessionId)).toMatchObject({
      status: "completed",
    });
    expect(harness.trigger).toHaveBeenCalledTimes(1);
    expect(harness.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        function_id: "event::session::stopped",
        payload: { sessionId },
      }),
    );
  });
});
