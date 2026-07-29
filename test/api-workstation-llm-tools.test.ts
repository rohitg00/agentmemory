import { describe, expect, it, vi } from "vitest";

import { registerApiTriggers } from "../src/triggers/api.js";
import { mockKV } from "./helpers/mocks.js";

function captureSdk() {
  const functions = new Map<string, Function>();
  const trigger = vi.fn(async () => ({ success: true }));
  return {
    registerFunction: (
      idOrOpts: string | { id: string },
      handler: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: vi.fn(),
    trigger,
    getFunction: (id: string) => functions.get(id),
  };
}

describe("workstation LLM REST tools", () => {
  it("exposes a body-free LLM smoke endpoint", async () => {
    const sdk = captureSdk();
    registerApiTriggers(sdk as never, mockKV() as never);

    const result = await sdk.getFunction("api::llm-smoke")!({
      headers: {},
      body: { ignored: "not forwarded" },
    });

    expect(result).toMatchObject({ status_code: 200 });
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::llm-smoke",
      payload: {},
    });
  });

  it("validates and whitelists session enrichment inputs", async () => {
    const sdk = captureSdk();
    registerApiTriggers(sdk as never, mockKV() as never);
    const enrichSession = sdk.getFunction("api::enrich-session")!;

    await expect(
      enrichSession({
        headers: {},
        body: {
          sessionId: "ses_123",
          lookback: 2,
          lookahead: 1,
          minImportance: 5,
          unknown: "dropped",
        },
      }),
    ).resolves.toMatchObject({ status_code: 200 });
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::enrich-session",
      payload: {
        sessionId: "ses_123",
        lookback: 2,
        lookahead: 1,
        minImportance: 5,
      },
    });

    sdk.trigger.mockClear();
    await expect(
      enrichSession({
        headers: {},
        body: { sessionId: "ses_123", minImportance: 11 },
      }),
    ).resolves.toMatchObject({ status_code: 400 });
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("validates and whitelists flow-compression selectors", async () => {
    const sdk = captureSdk();
    registerApiTriggers(sdk as never, mockKV() as never);
    const flowCompress = sdk.getFunction("api::flow-compress")!;

    await expect(
      flowCompress({
        headers: {},
        body: {
          actionIds: ["act_1", "act_2"],
          unknown: "dropped",
        },
      }),
    ).resolves.toMatchObject({ status_code: 200 });
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::flow-compress",
      payload: { actionIds: ["act_1", "act_2"] },
    });

    sdk.trigger.mockClear();
    await expect(
      flowCompress({ headers: {}, body: {} }),
    ).resolves.toMatchObject({ status_code: 400 });
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("keeps diagnostic follow-up read-only and argument-free", async () => {
    const sdk = captureSdk();
    registerApiTriggers(sdk as never, mockKV() as never);

    await expect(
      sdk.getFunction("api::diagnostic-followup")!({
        headers: {},
        body: { ignored: "not forwarded" },
      }),
    ).resolves.toMatchObject({ status_code: 200 });
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::diagnostic::followup-stats",
      payload: {},
    });
  });
});
