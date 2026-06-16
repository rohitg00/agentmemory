import type { MemoryProvider } from '../types.js'
import { AsyncLocalStorage } from 'node:async_hooks'

// In-process recursion guard: AsyncLocalStorage tracks a callId per async
// execution context. Concurrent siblings (chunked summarize via Promise.all)
// get separate contexts and don't block each other. Recursive re-entry
// (hook -> /summarize -> query within the same call tree) inherits the
// parent's async context and is detected by checking sdkActiveCalls.
//
// Cross-process recursion guard: process.env.AGENTMEMORY_SDK_CHILD = "1"
// around the SDK call so spawned subprocesses skip their REST callbacks.
// Reference-counted so overlapping calls don't race on env restore.
const sdkContext = new AsyncLocalStorage<number>()
let nextCallId = 0
const sdkActiveCalls = new Map<number, true>()

// Module-level refcount for the process.env marker. A per-call snapshot
// races across overlapping calls: A saves prev=undef, B saves prev="1",
// A's finally restores undef while B is still mid-flight (so any child
// process B spawns won't inherit the marker), and B's finally restores
// "1" — leaking the marker into the global env after the last caller.
// Reference-count instead so only the first entrant snapshots the
// original value and only the last exit restores it.
let sdkActiveCount = 0
let sdkOriginalEnv: string | undefined

type ClaudeAgentSdkModule = typeof import('@anthropic-ai/claude-agent-sdk')

export class AgentSDKProvider implements MemoryProvider {
  name = 'agent-sdk'

  // Memoize the dynamic import so concurrent callers share one resolution
  // instead of racing to resolve the specifier independently. Keeps the
  // SDK out of the cold-start path for users on other providers.
  private sdkPromise: Promise<ClaudeAgentSdkModule> | null = null

  private loadSdk(): Promise<ClaudeAgentSdkModule> {
    if (!this.sdkPromise) {
      this.sdkPromise = import('@anthropic-ai/claude-agent-sdk')
    }
    return this.sdkPromise
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.query(systemPrompt, userPrompt)
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.query(systemPrompt, userPrompt)
  }

  private async query(systemPrompt: string, userPrompt: string): Promise<string> {
    const parentCallId = sdkContext.getStore()
    if (parentCallId !== undefined && sdkActiveCalls.has(parentCallId)) {
      return ''
    }

    const callId = nextCallId++
    sdkActiveCalls.set(callId, true)

    return sdkContext.run(callId, async () => {
      try {
        if (sdkActiveCount === 0) {
          sdkOriginalEnv = process.env.AGENTMEMORY_SDK_CHILD
          process.env.AGENTMEMORY_SDK_CHILD = '1'
        }
        sdkActiveCount++

        try {
          const { query } = await this.loadSdk()

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
              result = (msg as any).result ?? ''
            }
          }
          return result
        } finally {
          sdkActiveCount--
          if (sdkActiveCount === 0) {
            if (sdkOriginalEnv === undefined) {
              delete process.env.AGENTMEMORY_SDK_CHILD
            } else {
              process.env.AGENTMEMORY_SDK_CHILD = sdkOriginalEnv
            }
            sdkOriginalEnv = undefined
          }
        }
      } finally {
        sdkActiveCalls.delete(callId)
      }
    })
  }
}
