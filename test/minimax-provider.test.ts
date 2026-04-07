import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MiniMaxProvider, MINIMAX_MODELS, DEFAULT_MINIMAX_MODEL } from '../src/providers/minimax.js'

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn()
  const MockAnthropic = vi.fn(() => ({
    messages: { create: mockCreate },
  }))
  return { default: MockAnthropic, mockCreate }
})

async function getAnthropic() {
  return await import('@anthropic-ai/sdk')
}

describe('MiniMaxProvider', () => {
  const validApiKey = 'test-minimax-api-key'
  const validModel = 'MiniMax-M2.7'
  const maxTokens = 4096

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an instance with valid config', () => {
    const provider = new MiniMaxProvider(validApiKey, validModel, maxTokens)
    expect(provider).toBeDefined()
    expect(provider.name).toBe('minimax')
  })

  it('creates an instance with custom baseURL', () => {
    const provider = new MiniMaxProvider(
      validApiKey,
      validModel,
      maxTokens,
      'https://custom.minimax.io/anthropic',
    )
    expect(provider).toBeDefined()
    expect(provider.name).toBe('minimax')
  })

  it('exports correct model list', () => {
    expect(MINIMAX_MODELS).toContain('MiniMax-M2.7')
    expect(MINIMAX_MODELS).toContain('MiniMax-M2.7-highspeed')
    expect(MINIMAX_MODELS).toHaveLength(2)
  })

  it('has correct default model', () => {
    expect(DEFAULT_MINIMAX_MODEL).toBe('MiniMax-M2.7')
  })

  it('compress returns text from API response', async () => {
    const { mockCreate } = await getAnthropic() as any
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'compressed result' }],
    })

    const provider = new MiniMaxProvider(validApiKey, validModel, maxTokens)
    const result = await provider.compress('system prompt', 'user prompt')

    expect(result).toBe('compressed result')
    expect(mockCreate).toHaveBeenCalledWith({
      model: validModel,
      max_tokens: maxTokens,
      system: 'system prompt',
      messages: [{ role: 'user', content: 'user prompt' }],
    })
  })

  it('summarize returns text from API response', async () => {
    const { mockCreate } = await getAnthropic() as any
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'summarized result' }],
    })

    const provider = new MiniMaxProvider(validApiKey, validModel, maxTokens)
    const result = await provider.summarize('system prompt', 'user prompt')

    expect(result).toBe('summarized result')
  })

  it('returns empty string when no text block in response', async () => {
    const { mockCreate } = await getAnthropic() as any
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'tool-1', name: 'test', input: {} }],
    })

    const provider = new MiniMaxProvider(validApiKey, validModel, maxTokens)
    const result = await provider.compress('system prompt', 'user prompt')

    expect(result).toBe('')
  })

  it('propagates API errors', async () => {
    const { mockCreate } = await getAnthropic() as any
    mockCreate.mockRejectedValue(new Error('MiniMax API error (401): Unauthorized'))

    const provider = new MiniMaxProvider(validApiKey, validModel, maxTokens)
    await expect(provider.compress('system prompt', 'user prompt')).rejects.toThrow(
      'MiniMax API error',
    )
  })

  it('uses MiniMax-M2.7-highspeed model correctly', async () => {
    const { mockCreate } = await getAnthropic() as any
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'fast result' }],
    })

    const provider = new MiniMaxProvider(validApiKey, 'MiniMax-M2.7-highspeed', maxTokens)
    const result = await provider.compress('sys', 'user')

    expect(result).toBe('fast result')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'MiniMax-M2.7-highspeed' }),
    )
  })
})

describe('MiniMaxProvider default base URL', () => {
  it('uses https://api.minimax.io/anthropic as default base URL', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    new MiniMaxProvider('test-key', 'MiniMax-M2.7', 4096)
    expect(Anthropic).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.minimax.io/anthropic' }),
    )
  })
})
