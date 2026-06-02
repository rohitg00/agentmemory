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
      // their REST callbacks. The set/restore window is the duration of
      // the SDK call. Concurrent in-process siblings all want the value
      // to be "1" during their respective SDK calls anyway, so the
      // race on the global is benign for the env-inheritance purpose.
      const prev = process.env.AGENTMEMORY_SDK_CHILD
      process.env.AGENTMEMORY_SDK_CHILD = '1'

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
        if (prev === undefined) {
          delete process.env.AGENTMEMORY_SDK_CHILD
        } else {
          process.env.AGENTMEMORY_SDK_CHILD = prev
        }
      }
    })
  }
}
