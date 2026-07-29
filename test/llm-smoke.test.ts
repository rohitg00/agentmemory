import { afterEach, describe, expect, it, vi } from "vitest";

import { registerLlmSmokeFunction } from "../src/functions/llm-smoke.js";
import type { MemoryProvider } from "../src/types.js";
import { mockSdk } from "./helpers/mocks.js";

const ORIGINAL_DISABLE_LLM_TOOLS =
  process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"];

afterEach(() => {
  if (ORIGINAL_DISABLE_LLM_TOOLS === undefined) {
    delete process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"];
  } else {
    process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"] =
      ORIGINAL_DISABLE_LLM_TOOLS;
  }
});

function provider(response = "AGENTMEMORY_LLM_OK"): MemoryProvider {
  return {
    name: "resilient(openai)",
    kind: "llm",
    compress: vi.fn(async () => response),
    summarize: vi.fn(async () => response),
  };
}

describe("mem::llm-smoke", () => {
  it("runs a fixed prompt and reports provider/model evidence without persistence", async () => {
    delete process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"];
    const sdk = mockSdk();
    const llm = provider();
    registerLlmSmokeFunction(sdk as never, llm, {
      provider: "openai",
      model: "deepseek-v4-pro",
    });

    const result = (await sdk.trigger("mem::llm-smoke", {})) as Record<
      string,
      unknown
    >;

    expect(result).toMatchObject({
      success: true,
      expectedResponseMatched: true,
      response: "AGENTMEMORY_LLM_OK",
      configuredProvider: "openai",
      model: "deepseek-v4-pro",
      providerAdapter: "resilient(openai)",
      llmExecutionState: "enabled",
      persistentMutation: false,
    });
    expect(result["latencyMs"]).toEqual(expect.any(Number));
    expect(llm.summarize).toHaveBeenCalledOnce();
    expect(llm.summarize).toHaveBeenCalledWith(
      expect.stringContaining("connectivity probe"),
      "Return exactly: AGENTMEMORY_LLM_OK",
    );
  });

  it("does not call the provider when LLM tools are disabled", async () => {
    process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"] = "true";
    const sdk = mockSdk();
    const llm = provider();
    registerLlmSmokeFunction(sdk as never, llm, {
      provider: "openai",
      model: "deepseek-v4-pro",
    });

    await expect(sdk.trigger("mem::llm-smoke", {})).resolves.toMatchObject({
      success: false,
      error: "llm_execution_disabled",
      llmExecutionState: "disabled",
      persistentMutation: false,
    });
    expect(llm.summarize).not.toHaveBeenCalled();
  });

  it("fails closed when the provider response misses the expected token", async () => {
    delete process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"];
    const sdk = mockSdk();
    registerLlmSmokeFunction(sdk as never, provider("unexpected"), {
      provider: "openai",
      model: "deepseek-v4-pro",
    });

    await expect(sdk.trigger("mem::llm-smoke", {})).resolves.toMatchObject({
      success: false,
      error: "unexpected_llm_response",
      expectedResponseMatched: false,
      persistentMutation: false,
    });
  });
});
