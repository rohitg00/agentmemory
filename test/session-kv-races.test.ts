import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerObserveFunction } from "../src/functions/observe.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { registerEventTriggers } from "../src/triggers/events.js";
import { KV } from "../src/state/schema.js";
import type { Session } from "../src/types.js";

type Gate = { scope: string; key: string; phase: "get" | "set" };

function clone<T>(value: T): T {
  return value === null || value === undefined
    ? value
    : (JSON.parse(JSON.stringify(value)) as T);
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  let gate: (Gate & { release: () => void; promise: Promise<void> }) | null = null;

  function arm(scope: string, key: string, phase: "get" | "set"): () => void {
    let release!: () => void;
    const promise = new Promise<void>((res) => {
      release = res;
    });
    gate = { scope, key, phase, release, promise };
    return release;
  }

  async function maybeWait(scope: string, key: string, phase: "get" | "set") {
    if (gate && gate.scope === scope && gate.key === key && gate.phase === phase) {
      const g = gate;
      gate = null;
      await g.promise;
    }
  }

  return {
    store,
    armGetGate: (scope: string, key: string) => arm(scope, key, "get"),
    armSetGate: (scope: string, key: string) => arm(scope, key, "set"),
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      const value = clone((store.get(scope)?.get(key) as T) ?? null);
      await maybeWait(scope, key, "get");
      return value;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      const stored = clone(data);
      await maybeWait(scope, key, "set");
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, stored);
      return clone(stored);
    },
    update: async (
      scope: string,
      key: string,
      ops: Array<{ type: string; path: string; value?: unknown }>,
    ) => {
      if (!store.has(scope)) store.set(scope, new Map());
      const m = store.get(scope)!;
      const current = clone((m.get(key) as Record<string, unknown>) ?? {});
      for (const op of ops) {
        if (op.type === "set") current[op.path] = op.value;
      }
      m.set(key, current);
      return clone(current);
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? clone(Array.from(m.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    fns,
    registerFunction: (idOrOpts: string | { id: string }, fn: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown; action?: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("KV.sessions concurrent mutation races (finding 3)", () => {
  it("api::session::commit does not revert a concurrent mem::observe's observationCount increment", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerObserveFunction(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never);

    const session: Session = {
      id: "ses_race1",
      project: "/repo",
      cwd: "/repo",
      startedAt: new Date().toISOString(),
      status: "active",
      observationCount: 0,
    };
    await kv.set(KV.sessions, "ses_race1", session);

    const releaseCommitRead = kv.armGetGate(KV.sessions, "ses_race1");

    const commitPromise = sdk.trigger("api::session::commit", {
      body: { sha: "abc123def", sessionId: "ses_race1" },
    });

    await flush();

    const observePromise = sdk.trigger("mem::observe", {
      sessionId: "ses_race1",
      project: "/repo",
      cwd: "/repo",
      hookType: "prompt_submit",
      timestamp: new Date().toISOString(),
      data: { prompt: "do the thing" },
    });

    await flush();
    releaseCommitRead();

    await Promise.all([commitPromise, observePromise]);

    const finalSession = kv.store.get(KV.sessions)?.get("ses_race1") as Session;
    expect(finalSession.observationCount).toBe(1);
    expect(finalSession.commitShas).toEqual(["abc123def"]);
  });

  it("mem::observe's implicit session create does not clobber a concurrent api::session::start's title", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerObserveFunction(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never);
    sdk.fns.set("mem::context", async () => ({ context: "" }));

    const releaseStartWrite = kv.armSetGate(KV.sessions, "ses_race2");

    const startPromise = sdk.trigger("api::session::start", {
      body: {
        sessionId: "ses_race2",
        project: "/repo",
        cwd: "/repo",
        title: "fix the parser",
      },
    });

    await flush();

    const observePromise = sdk.trigger("mem::observe", {
      sessionId: "ses_race2",
      project: "/repo",
      cwd: "/repo",
      hookType: "prompt_submit",
      timestamp: new Date().toISOString(),
      data: { prompt: "fix the parser" },
    });

    await flush();
    releaseStartWrite();

    await Promise.all([startPromise, observePromise]);

    const finalSession = kv.store.get(KV.sessions)?.get("ses_race2") as Session;
    expect(finalSession.summary).toBe("fix the parser");
    expect(finalSession.observationCount).toBe(1);
  });

  it("event::session::started racing mem::observe's implicit create does not revert the observation count to zero", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerEventTriggers(sdk as never, kv as never);
    registerObserveFunction(sdk as never, kv as never);
    sdk.fns.set("mem::context", async () => ({ context: "" }));

    const releaseEventWrite = kv.armSetGate(KV.sessions, "ses_race3");

    const eventPromise = sdk.trigger("event::session::started", {
      sessionId: "ses_race3",
      project: "/repo",
      cwd: "/repo",
    });

    await flush();

    const observePromise = sdk.trigger("mem::observe", {
      sessionId: "ses_race3",
      project: "/repo",
      cwd: "/repo",
      hookType: "prompt_submit",
      timestamp: new Date().toISOString(),
      data: { prompt: "start work" },
    });

    await flush();
    releaseEventWrite();

    await Promise.all([eventPromise, observePromise]);

    const finalSession = kv.store.get(KV.sessions)?.get("ses_race3") as Session;
    expect(finalSession).toBeTruthy();
    expect(finalSession.observationCount).toBe(1);
  });
});
