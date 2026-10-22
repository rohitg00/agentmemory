import { OpenAIProvider } from "./openai.js";

/**
 * DeepSeek LLM provider.
 *
 * DeepSeek exposes an OpenAI-compatible /v1/chat/completions endpoint, so
 * we re-use OpenAIProvider's raw-fetch transport with DeepSeek defaults.
 *
 * Required env vars:
 *   DEEPSEEK_API_KEY  — API key from https://platform.deepseek.com
 *
 * Optional:
 *   DEEPSEEK_BASE_URL    — base URL override (default: https://api.deepseek.com)
 *   DEEPSEEK_MODEL       — model name (default: deepseek-chat).
 *                          Also accepted: deepseek-reasoner.
 *
 * Notes:
 *   - The OpenAIProvider already reads OPENAI_TIMEOUT_MS / OPENAI_REASONING_EFFORT.
 *     Those are honored here too because we delegate via inheritance.
 *   - DeepSeek does not implement Azure routing, so isAzure auto-detection
 *     stays false.
 */
const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

export class DeepSeekProvider extends OpenAIProvider {
  name = "deepseek";

  constructor(apiKey: string, model: string, maxTokens: number, baseURL?: string) {
    super(
      apiKey,
      model || DEEPSEEK_DEFAULT_MODEL,
      maxTokens,
      baseURL || DEEPSEEK_DEFAULT_BASE_URL,
    );
  }
}
