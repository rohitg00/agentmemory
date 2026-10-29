import { describe, it, expect, afterEach } from "vitest";
import { withRegistrationDefaults } from "../src/runtime/registration.js";

function fakeSdk() {
  const calls: Array<{ id: string; handler: unknown; options: unknown }> = [];
  return {
    calls,
    counter: 7,
    registerFunction(id: string, handler: unknown, options?: unknown) {
      calls.push({ id, handler, options });
      return id;
    },
    trigger(input: { function_id: string }) {
      return Promise.resolve({ echoed: input.function_id, counter: this.counter });
    },
  };
}

afterEach(() => {
  delete process.env.AGENTMEMORY_LOCAL_DISPATCH;
});

describe("withRegistrationDefaults", () => {
  it("passes registerFunction options through unchanged when the env is unset", () => {
    const sdk = fakeSdk();
    const wrapped = withRegistrationDefaults(sdk);
    const handler = () => "ok";
    wrapped.registerFunction("mem::a", handler);
    wrapped.registerFunction("mem::b", handler, { observe: { onStart() {} } });
    expect(sdk.calls[0].options).toBeUndefined();
    expect(sdk.calls[1].options).toEqual({ observe: { onStart: expect.any(Function) } });
    expect(sdk.calls[1].options).not.toHaveProperty("localDispatch");
  });

  it("merges localDispatch: false when AGENTMEMORY_LOCAL_DISPATCH is false", () => {
    process.env.AGENTMEMORY_LOCAL_DISPATCH = "false";
    const sdk = fakeSdk();
    const wrapped = withRegistrationDefaults(sdk);
    wrapped.registerFunction("mem::a", () => {}, { observe: { tag: "t" }, invocationTimeoutMs: 5000 });
    expect(sdk.calls[0].options).toEqual({ observe: { tag: "t" }, invocationTimeoutMs: 5000, localDispatch: false });
    wrapped.registerFunction("mem::b", () => {});
    expect(sdk.calls[1].options).toEqual({ localDispatch: false });
  });

  it("honors an explicit localDispatch override request only through the env flag", () => {
    process.env.AGENTMEMORY_LOCAL_DISPATCH = "false";
    const sdk = fakeSdk();
    const wrapped = withRegistrationDefaults(sdk);
    wrapped.registerFunction("mem::a", () => {}, { localDispatch: true });
    expect(sdk.calls[0].options).toEqual({ localDispatch: false });
  });

  it("keeps non-registerFunction methods bound to the target", async () => {
    const sdk = fakeSdk();
    const wrapped = withRegistrationDefaults(sdk);
    await expect(wrapped.trigger({ function_id: "x::y" })).resolves.toEqual({ echoed: "x::y", counter: 7 });
    process.env.AGENTMEMORY_LOCAL_DISPATCH = "false";
    await expect(wrapped.trigger({ function_id: "x::z" })).resolves.toEqual({ echoed: "x::z", counter: 7 });
    expect(wrapped.counter).toBe(7);
  });
});
