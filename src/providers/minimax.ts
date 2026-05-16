import type { MemoryProvider } from '../types.js'
import { getEnvVar } from '../config.js'

/**
 * MiniMax provider using raw fetch to call MiniMax's Anthropic-compatible API.
 *
 * The Anthropic SDK automatically injects `x-stainless-*` headers that MiniMax
 * rejects with 403. This provider bypasses the SDK and calls the API directly.
 *
 * Required env vars (loaded from ~/.agentmemory/.env or process.env):
 *   MINIMAX_API_KEY  — your MiniMax API key
 *   MINIMAX_MODEL    — model name (default: MiniMax-M2.7)
 *   MAX_TOKENS       — max output tokens (default: 800; MiniMax-M2.7 needs ≤800)
 *
 * Optional:
 *   MINIMAX_BASE_URL — base URL without path (default: https://api.minimax.io/anthropic)
 */
export class MinimaxProvider implements MemoryProvider {
  name = 'minimax'
  private apiKey: string
  private model: string
  private maxTokens: number
  private baseUrl: string

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.apiKey = apiKey
    this.model = model
    this.maxTokens = maxTokens
    this.baseUrl =
      getEnvVar('MINIMAX_BASE_URL') || 'https://api.minimax.io/anthropic'
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${this.baseUrl}/v1/messages`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`MiniMax API error ${response.status}: ${text}`)
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const textBlock = data.content?.find((b) => b.type === 'text')
    return textBlock?.text ?? ''
  }
}
