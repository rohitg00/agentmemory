import type { MemoryProvider } from '../types.js'
import { fetchWithTimeout } from './_fetch.js'

type AnthropicContent =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: {
        type: 'base64'
        media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
        data: string
      }
    }

type AnthropicMessage = {
  role: 'user'
  content: string | AnthropicContent[]
}

export class AnthropicProvider implements MemoryProvider {
  name = 'anthropic'
  private apiKey: string
  private model: string
  private compressModel?: string
  private maxTokens: number
  private baseUrl: string

  constructor(
    apiKey: string,
    model: string,
    maxTokens: number,
    baseURL?: string,
    compressModel?: string,
  ) {
    this.apiKey = apiKey
    this.model = model
    this.compressModel = compressModel
    this.maxTokens = maxTokens
    this.baseUrl = (baseURL || 'https://api.anthropic.com').replace(/\/+$/, '')
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt, this.compressModel)
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt)
  }

  async describeImage(imageData: string, mimeType: string, prompt: string): Promise<string> {
    return this.callMessages(this.model, [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
            data: imageData,
          },
        },
        { type: 'text', text: prompt },
      ],
    }])
  }

  private async call(
    systemPrompt: string,
    userPrompt: string,
    modelOverride?: string,
  ): Promise<string> {
    return this.callMessages(modelOverride ?? this.model, [{ role: 'user', content: userPrompt }], systemPrompt)
  }

  private async callMessages(
    model: string,
    messages: AnthropicMessage[],
    systemPrompt?: string,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      max_tokens: this.maxTokens,
      messages,
    }
    if (systemPrompt) body.system = systemPrompt

    const response = await fetchWithTimeout(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new Error(`Anthropic API error (${response.status})`)
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const textBlock = data.content?.find((b) => b.type === 'text')
    return textBlock?.text ?? ''
  }
}
