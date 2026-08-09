import type { MemoryProvider } from "../types.js";
import { getEnvVar } from "../config.js";
import { fetchWithTimeout } from "./_fetch.js";
import {
  CLOUDFLARE_DEFAULT_CHAT_MODEL,
  buildHeaders,
  parsePositiveInt,
  resolveEndpoint,
  resolveGatewayId,
} from "./_cloudflare-shared.js";

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Cloudflare Workers AI chat-completion provider.
 *
 * Talks to the OpenAI-compatible `/ai/v1/chat/completions` endpoint.
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN  — Workers AI API token
 *   CLOUDFLARE_ACCOUNT_ID — used to build the endpoint URL; not needed when
 *                           CLOUDFLARE_AI_BASE_URL is set
 *
 * Optional:
 *   CLOUDFLARE_MODEL          — chat model (default: CLOUDFLARE_DEFAULT_CHAT_MODEL)
 *   CLOUDFLARE_AI_BASE_URL    — full chat endpoint override
 *   CLOUDFLARE_AI_GATEWAY_ID  — route through a named AI Gateway (see below)
 *   CLOUDFLARE_TIMEOUT_MS     — per-request timeout; falls back to
 *                               AGENTMEMORY_LLM_TIMEOUT_MS, then 60s
 *
 * AI Gateway: the default endpoint already flows through the account's default
 * gateway, so logging, caching, rate limiting and guardrails apply without any
 * configuration. CLOUDFLARE_AI_GATEWAY_ID pins a specific gateway instead —
 * Cloudflare selects it by the cf-aig-gateway-id header, not by a different URL.
 */
export class CloudflareProvider implements MemoryProvider {
  name = "cloudflare";
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private baseUrl: string;
  private timeoutMs: number;
  private gatewayId: string | undefined;

  constructor(apiKey: string, model: string, maxTokens: number, baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model || CLOUDFLARE_DEFAULT_CHAT_MODEL;
    this.maxTokens = maxTokens;
    this.baseUrl =
      baseURL || resolveEndpoint("chat/completions", "CLOUDFLARE_AI_BASE_URL", "chat");
    this.timeoutMs = resolveTimeout();
    this.gatewayId = resolveGatewayId();
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetchWithTimeout(
      this.baseUrl,
      {
        method: "POST",
        headers: buildHeaders(this.apiKey, this.gatewayId),
        body: JSON.stringify({
          model: this.model,
          // Workers AI accepts max_tokens across its catalogue; newer
          // OpenAI-compatible shims read max_completion_tokens instead and
          // ignore unknown keys, so sending both keeps every @cf model bounded.
          max_tokens: this.maxTokens,
          max_completion_tokens: this.maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
      this.timeoutMs,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cloudflare API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string | null;
        message?: { content?: string | null };
        text?: string | null;
      }>;
    };
    const choice = data.choices?.[0];
    // Deliberately no `reasoning` fallback. Reasoning models (@cf/zai-org/glm-*,
    // qwq, deepseek-r1) return content:null plus a populated `reasoning` field
    // when the token budget is spent thinking. Treating that chain-of-thought as
    // the answer writes model scratchpad into memory and feeds it to the XML
    // parsers in summarize.ts, which is worse than failing loudly.
    const content = choice?.message?.content ?? choice?.text;
    if (!content || !content.trim()) {
      if (choice?.finish_reason === "length") {
        throw new Error(
          `Cloudflare model ${this.model} hit the token limit before emitting content ` +
            `(finish_reason=length). Reasoning models need a larger MAX_TOKENS, ` +
            `currently ${this.maxTokens}.`,
        );
      }
      throw new Error(
        `Cloudflare returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return content;
  }
}

function resolveTimeout(): number {
  const raw = getEnvVar("CLOUDFLARE_TIMEOUT_MS") || getEnvVar("AGENTMEMORY_LLM_TIMEOUT_MS");
  const parsed = parsePositiveInt(raw);
  return parsed ?? DEFAULT_TIMEOUT_MS;
}
