import type { MemoryProvider, ProviderConfig } from '../types.js'
import { AgentSDKProvider } from './agent-sdk.js'
import { AnthropicProvider } from './anthropic.js'
import { OpenRouterProvider } from './openrouter.js'
import { getEnvVar } from '../config.js'

export function createProvider(config: ProviderConfig): MemoryProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(getEnvVar('ANTHROPIC_API_KEY')!, config.model, config.maxTokens)
    case 'gemini':
      return new OpenRouterProvider(
        getEnvVar('GEMINI_API_KEY')!,
        config.model,
        config.maxTokens,
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      )
    case 'openrouter':
      return new OpenRouterProvider(
        getEnvVar('OPENROUTER_API_KEY')!,
        config.model,
        config.maxTokens,
        'https://openrouter.ai/api/v1/chat/completions'
      )
    case 'agent-sdk':
    default:
      return new AgentSDKProvider()
  }
}
