import { describe, expect, it, vi } from "vitest";
import type { IIIClient } from "iii-sdk";
import { KV } from "../src/state/schema.js";
import { assertStateReady, waitForStateReady } from "../src/state/state-readiness.js";

type TriggerCall = {
  function_id: string;
  payload: { scope: string; key?: string };
  timeoutMs?: number;
};

function missingFunction(functionId: string): Error & { code: string } {
  const error = new Error(
    `function_not_found: Function ${functionId} not found in namespace agentmemory`,
  ) as Error & { code: string };
  error.code = "function_not_found";
  return error;
}

function asClient(trigger: unknown): Pick<IIIClient, "trigger"> {
  return { trigger } as unknown as Pick<IIIClient, "trigger">;
}

describe("waitForStateReady", () => {
  it("returns immediately when the state functions are registered", async () => {
    const trigger = vi.fn(async () => null);

    const result = await waitForStateReady(asClient(trigger), { now: () => 0 });

    expect(result).toEqual({ ready: true, waitedMs: 0, attempts: 1 });
    expect(
      trigger.mock.calls.map(([call]) => (call as TriggerCall).function_id),
    ).toEqual(["state::list", "state::get"]);
    expect(trigger).toHaveBeenNthCalledWith(1, {
      function_id: "state::list",
      payload: { scope: KV.config },
      timeoutMs: 2000,
    });
    expect(trigger).toHaveBeenNthCalledWith(2, {
      function_id: "state::get",
      payload: { scope: KV.config, key: expect.any(String) },
      timeoutMs: 2000,
    });
  });

  it("retries a probe timeout and proceeds once the connection answers", async () => {
    let clock = 0;
    let calls = 0;
    const trigger = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("Invocation timeout after 2000ms");
      return null;
    });

    const result = await waitForStateReady(asClient(trigger), {
      timeoutMs: 1000,
      intervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    expect(result).toEqual({ ready: true, waitedMs: 100, attempts: 2 });
    expect(trigger).toHaveBeenCalledTimes(3);
  });

  it("returns not-ready when every probe times out", async () => {
    let clock = 0;
    const trigger = vi.fn(async () => {
      throw new Error("Invocation timeout after 2000ms");
    });

    const result = await waitForStateReady(asClient(trigger), {
      timeoutMs: 250,
      intervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    expect(result).toEqual({
      ready: false,
      waitedMs: 250,
      attempts: 4,
      error: "Invocation timeout after 2000ms",
    });
    expect(trigger).toHaveBeenCalledTimes(4);
  });

  it("retries when the engine has registered neither function yet", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    let calls = 0;
    const trigger = vi.fn(async (call: TriggerCall) => {
      calls += 1;
      if (calls <= 2) throw missingFunction(call.function_id);
      return null;
    });

    const result = await waitForStateReady(asClient(trigger), {
      timeoutMs: 1000,
      intervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });

    expect(result).toEqual({ ready: true, waitedMs: 200, attempts: 3 });
    expect(sleeps).toEqual([100, 100]);
    expect(trigger).toHaveBeenCalledTimes(4);
    expect(trigger).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        function_id: "state::list",
        timeoutMs: 800,
      }),
    );
    expect(trigger).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        function_id: "state::get",
        timeoutMs: 800,
      }),
    );
  });

  it("waits when only state::get is still missing", async () => {
    let clock = 0;
    let getCalls = 0;
    const trigger = vi.fn(async (call: TriggerCall) => {
      if (call.function_id === "state::get") {
        getCalls += 1;
        if (getCalls <= 2) throw missingFunction(call.function_id);
      }
      return null;
    });

    const result = await waitForStateReady(asClient(trigger), {
      timeoutMs: 1000,
      intervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    expect(result).toEqual({ ready: true, waitedMs: 200, attempts: 3 });
    expect(getCalls).toBe(3);
  });

  it("returns not-ready at the timeout when the functions never register", async () => {
    let clock = 0;
    const trigger = vi.fn(async (call: TriggerCall) => {
      throw missingFunction(call.function_id);
    });

    const result = await waitForStateReady(asClient(trigger), {
      timeoutMs: 250,
      intervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    expect(result).toEqual({
      ready: false,
      waitedMs: 250,
      attempts: 4,
      error: expect.stringContaining("function_not_found"),
    });
    expect(trigger).toHaveBeenCalledTimes(4);
  });

  it("does not wait on a failure that the readiness probe cannot fix", async () => {
    const trigger = vi.fn(async () => {
      throw new Error("payload_too_large: Serialized JSON envelope is too big");
    });
    const sleep = vi.fn(async () => undefined);

    const result = await waitForStateReady(asClient(trigger), {
      timeoutMs: 1000,
      intervalMs: 100,
      now: () => 0,
      sleep,
    });

    expect(result).toEqual({
      ready: false,
      waitedMs: 0,
      attempts: 1,
      error: "payload_too_large: Serialized JSON envelope is too big",
    });
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("assertStateReady", () => {
  it("throws when readiness failed so the worker exits instead of reporting Ready", () => {
    expect(() =>
      assertStateReady({
        ready: false,
        waitedMs: 15000,
        attempts: 150,
        error: "Function state::list not found in namespace agentmemory",
      }),
    ).toThrow(/State worker did not become ready within 15000ms/);
  });

  it("accepts a ready state", () => {
    expect(() =>
      assertStateReady({ ready: true, waitedMs: 5, attempts: 1 }),
    ).not.toThrow();
  });
});
