import type { MemoryProvider, ProviderConfig } from "../types.js";
import { AgentSDKProvider } from "./agent-sdk.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenRouterProvider } from "./openrouter.js";
import { ResilientProvider } from "./resilient.js";
import { getEnvVar } from "../config.js";

function requireEnvVar(key: string): string {
  const value = getEnvVar(key);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. Set it in ~/.agentmemory/.env or as an environment variable.`,
    );
  }
  return value;
}

export function createProvider(config: ProviderConfig): ResilientProvider {
  let base: MemoryProvider;
  switch (config.provider) {
    case "anthropic":
      base = new AnthropicProvider(
        requireEnvVar("ANTHROPIC_API_KEY"),
        config.model,
        config.maxTokens,
      );
      break;
    case "gemini":
      base = new OpenRouterProvider(
        requireEnvVar("GEMINI_API_KEY"),
        config.model,
        config.maxTokens,
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      );
      break;
    case "openrouter":
      base = new OpenRouterProvider(
        requireEnvVar("OPENROUTER_API_KEY"),
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
