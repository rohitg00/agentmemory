import type { MemoryProvider } from "../types.js";
import { getEnvVar } from "../config.js";

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_AZURE_API_VERSION = "2024-08-01-preview";

/**
 * OpenAI-compatible LLM provider.
 *
 * Uses raw fetch (no SDK) to support any OpenAI-compatible endpoint:
 *   - OpenAI official
 *   - Azure OpenAI (auto-detected from .openai.azure.com host)
 *   - DeepSeek
 *   - 硅基流动 (SiliconFlow)
 *   - vLLM / LM Studio / Ollama (with OpenAI compatibility layer)
 *   - Any other proxy implementing /v1/chat/completions
 *
 * Required env vars:
 *   OPENAI_API_KEY  — API key
 *
 * Optional:
 *   OPENAI_BASE_URL          — base URL without path (default: https://api.openai.com).
 *                              Azure: https://<resource>.openai.azure.com/openai/deployments/<deployment>
 *   OPENAI_MODEL             — model name (default: gpt-4o-mini)
 *   OPENAI_API_VERSION       — Azure api-version query param (default: 2024-08-01-preview)
 *   OPENAI_TIMEOUT_MS        — outbound fetch timeout in ms (default: 60000)
 *   MAX_TOKENS               — max output tokens (default: from config or 4096)
 *   OPENAI_REASONING_EFFORT  — "low" | "medium" | "high" | "none"
 *                              Passthrough for reasoning models (e.g. Ollama Cloud
 *                              thinking models). Set to "none" to ensure
 *                              message.content is populated instead of only
 *                              message.reasoning.
 */
export class OpenAIProvider implements MemoryProvider {
  name = "openai";
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private baseUrl: string;
  private reasoningEffort?: string;
  private timeoutMs: number;
  private isAzure: boolean;
  private azureApiVersion: string;

  constructor(apiKey: string, model: string, maxTokens: number, baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.baseUrl = (
      baseURL ||
      getEnvVar("OPENAI_BASE_URL") ||
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    this.reasoningEffort = getEnvVar("OPENAI_REASONING_EFFORT") || undefined;
    this.timeoutMs = parseTimeout(getEnvVar("OPENAI_TIMEOUT_MS"));
    this.azureApiVersion =
      getEnvVar("OPENAI_API_VERSION") || DEFAULT_AZURE_API_VERSION;
    this.isAzure = detectAzure(this.baseUrl);
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  private buildUrl(): string {
    // Azure OpenAI carries the deployment in the path and requires
    // `api-version` as a query param. Standard OpenAI-compatible
    // endpoints append /v1/chat/completions to the base.
    if (this.isAzure) {
      const sep = this.baseUrl.includes("?") ? "&" : "?";
      return `${this.baseUrl}/chat/completions${sep}api-version=${encodeURIComponent(this.azureApiVersion)}`;
    }
    return `${this.baseUrl}/v1/chat/completions`;
  }

  private buildHeaders(): Record<string, string> {
    // Azure uses `api-key: <KEY>`; everyone else uses `Authorization: Bearer <KEY>`.
    if (this.isAzure) {
      return {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      };
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = this.buildUrl();
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };
    if (this.reasoningEffort) {
      body.reasoning_effort = this.reasoningEffort;
    }

    // Bound the request with an AbortController so a hung provider
    // can't stall the worker. The other raw-fetch providers
    // (anthropic, gemini, openrouter, minimax) have the same gap
    // tracked in a follow-up issue; this PR fixes it for the new
    // surface only.
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (err) {
      const aborted =
        ac.signal.aborted ||
        (err instanceof Error && err.name === "AbortError");
      if (aborted) {
        throw new Error(
          `OpenAI API request timed out after ${this.timeoutMs}ms — set OPENAI_TIMEOUT_MS to raise the bound or check the provider status.`,
        );
      }
      throw err;
    } finally {
      clearTimeout(t);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
    };
    const message = data.choices?.[0]?.message;
    const content = message?.content;
    if (content) {
      return content;
    }
    // Fallback: some thinking models return reasoning but no content
    const reasoning = message?.reasoning;
    if (reasoning) {
      return reasoning;
    }
    throw new Error(
      `OpenAI returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
}

function parseTimeout(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

function detectAzure(baseUrl: string): boolean {
  // Azure resource URLs land at <resource>.openai.azure.com. The
  // `OPENAI_BASE_URL=https://<r>.openai.azure.com/openai/deployments/<d>`
  // shape is the documented opt-in path.
  try {
    const u = new URL(baseUrl);
    return u.hostname.endsWith(".openai.azure.com");
  } catch {
    return false;
  }
}
