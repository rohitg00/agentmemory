import type { MemoryProvider } from '../types.js'

export class AgentSDKProvider implements MemoryProvider {
  name = 'agent-sdk'

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.query(systemPrompt, userPrompt)
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.query(systemPrompt, userPrompt)
  }

  private async query(systemPrompt: string, userPrompt: string): Promise<string> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')

    const messages = query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        maxTurns: 1,
        allowedTools: [],
      },
    })

    let result = ''
    for await (const msg of messages) {
      if (msg.type === 'result') {
        result = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result)
      }
    }
    return result
  }
}
