import { AsyncLocalStorage } from 'node:async_hooks'
import type { MemoryProvider } from '../types.js'

// #781: the recursion guard used to live on `process.env.AGENTMEMORY_SDK_CHILD`
// (#181). #472 then introduced chunked summarize that runs chunks
// concurrently in the same process via Promise.all. The first chunk
// flipped the global env to "1" synchronously before its `await`, and
// every sibling chunk in the same batch immediately bailed out as a
// "child" — returning "" — so half-plus of the chunks failed to parse
// and the summarize threw `too_many_chunks_skipped: N/N`.
//
// Split the guard so each concern uses the right primitive:
//
//   - **In-process** recursion guard: AsyncLocalStorage. Scoped to the
//     async call tree of the SDK query, so concurrent siblings on the
//     same provider instance no longer see each other's marker.
//   - **Cross-process** recursion guard for hooks: still
//     `process.env.AGENTMEMORY_SDK_CHILD = "1"` around the SDK call.
//     Subprocesses spawned by `@anthropic-ai/claude-agent-sdk` inherit
//     `process.env` at spawn time, so the hook scripts (which run as
//     separate processes) still see the marker and skip their REST
//     callback to /summarize. ALS does not cross process boundaries.
const sdkChildContext = new AsyncLocalStorage<true>()

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
    // In-process recursion guard. Concurrent sibling calls (chunked
    // summarize via Promise.all) each have their own ALS frame, so they
    // do not poison each other.
    if (sdkChildContext.getStore()) {
      // We are already inside a Claude Agent SDK-spawned async call
      // tree. Spawning another one would let its plugin-hook-driven
      // Stop loop re-enter /agentmemory/summarize and cause unbounded
      // recursion (#149 follow-up). Degrade to empty string so callers
      // short-circuit. The chunk retry path in src/functions/summarize.ts
      // treats "" as a parse failure but only the in-process re-entry
      // path can reach this branch — legitimate concurrent siblings now
      // run with their own ALS frames.
      return ''
    }

    return sdkChildContext.run(true, async () => {
      // Mark spawned subprocesses (the SDK's underlying Claude session
      // + its hook scripts) as SDK children via process.env. Hook scripts
      // run in separate processes and read process.env to short-circuit
      // their REST callbacks. Reference-counted so overlapping calls
      // don't race each other into restoring stale values.
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
    })
  }
}
