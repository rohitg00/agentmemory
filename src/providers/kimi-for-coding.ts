import { AnthropicCompatibleProvider } from "./anthropic-compatible.js";
import { getEnvVar } from "../config.js";

/** Kimi for Coding provider. */
export class KimiForCodingProvider extends AnthropicCompatibleProvider {
  constructor(apiKey: string, model: string, maxTokens: number) {
    super(
      "kimi-for-coding",
      apiKey,
      model,
      maxTokens,
      getEnvVar("KIMI_FOR_CODING_BASE_URL") || "https://api.kimi.com/coding",
      { "User-Agent": "KimiCLI/1.5" },
      "Kimi for Coding",
    );
  }
}
