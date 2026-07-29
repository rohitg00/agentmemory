import { getLlmExecutionState } from "../config.js";
import type { MemoryProvider, ProviderConfig } from "../types.js";
import type { ISdk } from "iii-sdk";

const EXPECTED_TOKEN = "AGENTMEMORY_LLM_OK";
const SYSTEM_PROMPT =
  "You are an AgentMemory connectivity probe. Return only the exact token requested.";
const USER_PROMPT = `Return exactly: ${EXPECTED_TOKEN}`;
const MAX_RESPONSE_CHARS = 200;

export type LlmSmokeMetadata = Pick<ProviderConfig, "provider" | "model">;

export function registerLlmSmokeFunction(
  sdk: ISdk,
  provider: MemoryProvider,
  metadata: LlmSmokeMetadata,
): void {
  sdk.registerFunction("mem::llm-smoke", async () => {
    const llmExecutionState = getLlmExecutionState(provider);
    const common = {
      configuredProvider: metadata.provider,
      model: metadata.model,
      providerAdapter: provider.name,
      persistentMutation: false,
    };

    if (llmExecutionState !== "enabled") {
      return {
        success: false,
        error: "llm_execution_disabled",
        llmExecutionState,
        ...common,
      };
    }

    const startedAt = Date.now();
    try {
      const response = (
        await provider.summarize(SYSTEM_PROMPT, USER_PROMPT)
      ).trim();
      const expectedResponseMatched = response.includes(EXPECTED_TOKEN);
      return {
        success: expectedResponseMatched,
        expectedResponseMatched,
        response: response.slice(0, MAX_RESPONSE_CHARS),
        latencyMs: Date.now() - startedAt,
        llmExecutionState,
        ...common,
        ...(expectedResponseMatched ? {} : { error: "unexpected_llm_response" }),
      };
    } catch {
      return {
        success: false,
        error: "llm_provider_call_failed",
        latencyMs: Date.now() - startedAt,
        llmExecutionState,
        ...common,
      };
    }
  });
}
