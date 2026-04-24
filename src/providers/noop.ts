import type { MemoryProvider } from "../types.js";

/**
 * Returns empty strings for every call. Used when no LLM API key is set
 * AND the user has not opted into the agent-sdk fallback via
 * AGENTMEMORY_ALLOW_AGENT_SDK=true. Callers (compress, summarize) must
 * detect the empty result and short-circuit instead of spawning a
 * provider session (#149 / Stop-hook recursion loop fix).
 */
export class NoopProvider implements MemoryProvider {
  name = "noop";

  async compress(): Promise<string> {
    return "";
  }

  async summarize(): Promise<string> {
    return "";
  }
}
