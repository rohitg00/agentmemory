import Anthropic from '@anthropic-ai/sdk'
import type { MemoryProvider } from '../types.js'
import { logger } from '../logger.js'

// The official SDK's APIError.message embeds the raw upstream response
// body (see @anthropic-ai/sdk/core/error.js -- APIError.makeMessage()).
// That message is what reaches Sentry via captureException, so every SDK
// call in this provider must go through this wrapper rather than let the
// SDK error propagate unmodified. Log the full error locally only; throw
// a fixed, content-free message with just the status.
async function callSafely<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in err ? (err as { status?: number }).status : undefined
    logger.error('Anthropic API call failed', {
      status,
      error: err instanceof Error ? err.message : String(err),
    })
    throw new Error(status ? `Anthropic API error (status ${status})` : 'Anthropic API call failed')
  }
}

export class AnthropicProvider implements MemoryProvider {
  name = 'anthropic'
  private client: Anthropic
  private model: string
  private maxTokens: number

  constructor(apiKey: string, model: string, maxTokens: number, baseURL?: string) {
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })
    this.model = model
    this.maxTokens = maxTokens
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  async describeImage(imageData: string, mimeType: string, prompt: string): Promise<string> {
    const response = await callSafely(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: imageData },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    )

    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock?.text ?? ''
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await callSafely(() =>
      this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    )

    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock?.text ?? ''
  }
}
