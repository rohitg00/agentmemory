import Anthropic from '@anthropic-ai/sdk'
import type { MemoryProvider } from '../types.js'

const DEFAULT_BASE_URL = 'https://api.minimax.io/anthropic'
export const MINIMAX_MODELS = ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] as const
export const DEFAULT_MINIMAX_MODEL = 'MiniMax-M2.7'

export class MiniMaxProvider implements MemoryProvider {
  name = 'minimax'
  private client: Anthropic
  private model: string
  private maxTokens: number

  constructor(apiKey: string, model: string, maxTokens: number, baseURL?: string) {
    this.client = new Anthropic({
      apiKey,
      baseURL: baseURL ?? DEFAULT_BASE_URL,
    })
    this.model = model
    this.maxTokens = maxTokens
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock?.text ?? ''
  }
}
