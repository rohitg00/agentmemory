import { AnthropicCompatibleProvider } from "./anthropic-compatible.js";
import { getEnvVar } from "../config.js";

/**
 * MiniMax provider using Anthropic-compatible API.
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
export class MinimaxProvider extends AnthropicCompatibleProvider {
  constructor(apiKey: string, model: string, maxTokens: number) {
    super(
      "minimax",
      apiKey,
      model,
      maxTokens,
      getEnvVar("MINIMAX_BASE_URL") || "https://api.minimax.io/anthropic",
      {},
      "MiniMax",
    );
  }
}
