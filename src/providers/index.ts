import type { MemoryProvider, ProviderConfig } from "../types.js";
import { AgentSDKProvider } from "./agent-sdk.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenRouterProvider } from "./openrouter.js";
import { ResilientProvider } from "./resilient.js";
import { getEnvVar } from "../config.js";

export function createProvider(config: ProviderConfig): ResilientProvider {
  let base: MemoryProvider;
  switch (config.provider) {
    case "anthropic":
      base = new AnthropicProvider(
        getEnvVar("ANTHROPIC_API_KEY")!,
        config.model,
        config.maxTokens,
      );
      break;
    case "gemini":
      base = new OpenRouterProvider(
        getEnvVar("GEMINI_API_KEY")!,
        config.model,
        config.maxTokens,
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      );
      break;
    case "openrouter":
      base = new OpenRouterProvider(
        getEnvVar("OPENROUTER_API_KEY")!,
        config.model,
        config.maxTokens,
        "https://openrouter.ai/api/v1/chat/completions",
      );
      break;
    case "agent-sdk":
    default:
      base = new AgentSDKProvider();
      break;
  }
  return new ResilientProvider(base);
}
