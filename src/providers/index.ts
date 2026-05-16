import type {
  MemoryProvider,
  ProviderConfig,
  FallbackConfig,
} from "../types.js";
import { AgentSDKProvider } from "./agent-sdk.js";
import { AnthropicProvider } from "./anthropic.js";
import { AzureOpenAIProvider } from "./azure-openai.js";
import { MinimaxProvider } from "./minimax.js";
import { NoopProvider } from "./noop.js";
import { OpenRouterProvider } from "./openrouter.js";
import { ResilientProvider } from "./resilient.js";
import { FallbackChainProvider } from "./fallback-chain.js";
import { getEnvVar } from "../config.js";

export { createEmbeddingProvider, createImageEmbeddingProvider } from "./embedding/index.js";

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
  return new ResilientProvider(createBaseProvider(config));
}

export function createFallbackProvider(
  config: ProviderConfig,
  fallbackConfig: FallbackConfig,
): ResilientProvider {
  if (fallbackConfig.providers.length === 0) {
    return createProvider(config);
  }

  const providers: MemoryProvider[] = [createBaseProvider(config)];
  for (const providerType of fallbackConfig.providers) {
    if (providerType === config.provider) continue;
    try {
      const fbConfig: ProviderConfig = {
        provider: providerType,
        model: config.model,
        maxTokens: config.maxTokens,
      };
      providers.push(createBaseProvider(fbConfig));
    } catch {
      // skip unavailable fallback providers
    }
  }

  if (providers.length > 1) {
    return new ResilientProvider(new FallbackChainProvider(providers));
  }
  return new ResilientProvider(providers[0]);
}

function createBaseProvider(config: ProviderConfig): MemoryProvider {
  switch (config.provider) {
    case "minimax":
      return new MinimaxProvider(
        requireEnvVar("MINIMAX_API_KEY"),
        config.model,
        config.maxTokens,
      );
    case "anthropic":
      return new AnthropicProvider(
        requireEnvVar("ANTHROPIC_API_KEY"),
        config.model,
        config.maxTokens,
        config.baseURL,
      );
    case "gemini": {
      const geminiKey =
        getEnvVar("GEMINI_API_KEY") || getEnvVar("GOOGLE_API_KEY");
      if (!geminiKey) {
        throw new Error(
          "GEMINI_API_KEY (or GOOGLE_API_KEY) is required for the gemini provider",
        );
      }
      return new OpenRouterProvider(
        geminiKey,
        config.model,
        config.maxTokens,
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      );
    }
    case "openrouter":
      return new OpenRouterProvider(
        requireEnvVar("OPENROUTER_API_KEY"),
        config.model,
        config.maxTokens,
        "https://openrouter.ai/api/v1/chat/completions",
      );
    case "azure-openai": {
      const endpoint = config.baseURL || requireEnvVar("AZURE_OPENAI_ENDPOINT");
      const apiVersion = getEnvVar("AZURE_OPENAI_API_VERSION");
      return new AzureOpenAIProvider(
        requireEnvVar("AZURE_OPENAI_API_KEY"),
        endpoint,
        config.model,
        config.maxTokens,
        apiVersion || undefined,
      );
    }
    case "noop":
      return new NoopProvider();
    case "agent-sdk":
    default:
      return new AgentSDKProvider();
  }
}
