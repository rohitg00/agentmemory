import { AnthropicCompatibleProvider } from "./anthropic-compatible.js";
import { getEnvVar } from "../config.js";

/**
 * Kimi for Coding provider.
 *
 * Kimi's Coding Plan endpoint rejects the default Anthropic SDK User-Agent
 * with HTTP 429 "engine overloaded". We pass a whitelisted User-Agent header.
 *
 * Required env var: KIMI_API_KEY
 * Optional env vars: KIMI_BASE_URL (default: https://api.kimi.com/coding)
 */
export class KimiForCodingProvider extends AnthropicCompatibleProvider {
  constructor(apiKey: string, model: string, maxTokens: number) {
    super(
      "kimi-for-coding",
      apiKey,
      model,
      maxTokens,
      getEnvVar("KIMI_BASE_URL") || "https://api.kimi.com/coding",
      { "User-Agent": "KimiCLI/1.5" },
      "Kimi for Coding",
    );
  }
}
