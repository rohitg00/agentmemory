import type { MemoryProvider } from "../types.js";
import { getEnvVar } from "../config.js";
import { fetchWithTimeout } from "./_fetch.js";

const OPENROUTER_REASONING_EFFORTS = new Set([
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "none",
]);

type OpenRouterRequestBody = {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
  reasoning?: {
    effort?: string;
    enabled?: boolean;
    exclude?: boolean;
  };
};

export class OpenRouterProvider implements MemoryProvider {
  name: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private baseUrl: string;
  private isOpenRouter: boolean;
  private reasoningEffort?: string;
  private includeReasoning: boolean;

  constructor(
    apiKey: string,
    model: string,
    maxTokens: number,
    baseUrl: string,
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.baseUrl = baseUrl;
    this.isOpenRouter = baseUrl.includes("openrouter");
    this.name = this.isOpenRouter ? "openrouter" : "gemini";
    this.reasoningEffort = this.isOpenRouter
      ? parseOpenRouterReasoningEffort(getEnvVar("OPENROUTER_REASONING_EFFORT"))
      : undefined;
    this.includeReasoning =
      this.isOpenRouter && parseBoolean(getEnvVar("OPENROUTER_INCLUDE_REASONING"));
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  private async call(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const body: OpenRouterRequestBody = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };
    const reasoning = this.openRouterReasoning();
    if (reasoning) body.reasoning = reasoning;

    const response = await fetchWithTimeout(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(this.isOpenRouter
          ? { "HTTP-Referer": "https://github.com/rohitg00/agentmemory" }
          : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${this.name} API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: unknown;
          reasoning?: unknown;
          reasoning_content?: unknown;
        };
      }>;
    };
    const message = data.choices?.[0]?.message;
    const output = firstNonEmptyString(
      message?.content,
      message?.reasoning,
      message?.reasoning_content,
    );
    if (output) {
      return output;
    }
    throw new Error(
      `${this.name} returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  private openRouterReasoning(): OpenRouterRequestBody["reasoning"] | undefined {
    if (!this.isOpenRouter) return undefined;
    if (this.reasoningEffort) {
      return {
        effort: this.reasoningEffort,
        ...(this.includeReasoning ? { exclude: false } : {}),
      };
    }
    if (this.includeReasoning) {
      return { enabled: true, exclude: false };
    }
    return undefined;
  }
}

function parseOpenRouterReasoningEffort(
  raw: string | null | undefined,
): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  return OPENROUTER_REASONING_EFFORTS.has(value) ? value : undefined;
}

function parseBoolean(raw: string | null | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "true" || value === "1";
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}
