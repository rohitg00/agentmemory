import { afterEach, describe, expect, it } from "vitest";
import { MetricsStore } from "../src/eval/metrics-store.js";
import { registerSummarizeFunction } from "../src/functions/summarize.js";
import { NoopProvider } from "../src/providers/noop.js";
import { ResilientProvider } from "../src/providers/resilient.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("LLM runtime state APIs", () => {
  it("marks LLM metrics disabled and returns summarize as a non-error skip", async () => {
    process.env["AGENTMEMORY_DISABLE_LLM_TOOLS"] = "true";
    const sdk = mockSdk();
    const kv = mockKV();
    const metrics = new MetricsStore(kv as never);
    await metrics.recordSkipped(
      "mem::summarize",
      1,
      "llm_tools_disabled",
    );
    const provider = new ResilientProvider(new NoopProvider());
    registerSummarizeFunction(sdk as never, kv as never, provider, metrics);
    registerApiTriggers(
      sdk as never,
      kv as never,
      undefined,
      metrics,
      provider,
      { provider: "openai", model: "deepseek-v4-pro" },
    );

    const health = (await sdk.trigger("api::health", {
      headers: {},
    })) as { body: Record<string, unknown> };
    const functionMetrics = health.body["functionMetrics"] as Array<
      Record<string, unknown>
    >;
    expect(health.body).toMatchObject({
      llmToolsDisabled: true,
      llmExecutionState: "disabled",
      llmProvider: "resilient(noop)",
      llmConfiguredProvider: "openai",
      llmModel: "deepseek-v4-pro",
    });
    expect(functionMetrics).toContainEqual(
      expect.objectContaining({
        functionId: "mem::summarize",
        failureCount: 0,
        skippedCount: 1,
        runtimeState: "disabled",
      }),
    );

    const summarize = await sdk.trigger("api::summarize", {
      headers: {},
      body: { sessionId: "ses_disabled" },
    });
    expect(summarize).toEqual({
      status_code: 200,
      body: {
        success: true,
        outcome: "skipped_disabled",
        skipped: "llm_tools_disabled",
      },
    });
  });
});
