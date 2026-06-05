import { describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";

function mockKV() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(async () => []),
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  const overrides = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: vi.fn(),
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      if (overrides.has(id)) return overrides.get(id)!(payload);
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
    overrideTrigger: (id: string, handler: Function) => {
      overrides.set(id, handler);
    },
  };
}

describe("API project boundary validation", () => {
  it("rejects malformed file-context bodies before calling mem::file-context", async () => {
    const sdk = mockSdk();
    registerApiTriggers(sdk as never, mockKV() as never);
    const downstream = vi.fn();
    sdk.overrideTrigger("mem::file-context", downstream);

    for (const body of [
      {},
      { sessionId: "ses_1", files: [42] },
      { sessionId: "   ", files: ["src/file.ts"] },
      { sessionId: "ses_1", files: ["   "] },
    ]) {
      const result = await sdk.trigger("api::file-context", { body });
      expect(result).toMatchObject({
        status_code: 400,
        body: {
          error: "sessionId (string) and files (string[]) are required",
        },
      });
    }

    expect(downstream).not.toHaveBeenCalled();
  });

  it("rejects non-string project values at the HTTP boundary", async () => {
    const sdk = mockSdk();
    registerApiTriggers(sdk as never, mockKV() as never);

    const result = await sdk.trigger("api::consolidate", {
      body: { project: 123, minObservations: 1 },
    });

    expect(result).toMatchObject({
      status_code: 400,
      body: { error: "project must be a string for api::consolidate" },
    });
  });

  it("rejects unsupported consolidate-pipeline tiers", async () => {
    const sdk = mockSdk();
    registerApiTriggers(sdk as never, mockKV() as never);
    const downstream = vi.fn();
    sdk.overrideTrigger("mem::consolidate-pipeline", downstream);

    const result = await sdk.trigger("api::consolidate-pipeline", {
      body: { tier: "foo" },
    });

    expect(result).toMatchObject({
      status_code: 400,
      body: {
        error: "tier must be one of: all, semantic, reflect, procedural, decay",
      },
    });
    expect(downstream).not.toHaveBeenCalled();
  });
});
