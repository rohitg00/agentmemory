import type { MemoryProvider } from "../types.js";

/**
 * Generic OpenAI-compatible provider.
 * Works with OpenAI, LM Studio, Ollama, vLLM, Groq, OpenRouter, etc.
 */
export class OpenAIProvider implements MemoryProvider {
  constructor(
    public name: string,
    private apiKey: string,
    private model: string,
    private maxTokens: number,
    private baseUrl: string,
    private extraHeaders: Record<string, string> = {},
    private timeoutMs: number = 60_000,
  ) {}

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
    const base = this.baseUrl.replace(/\/+$/, "");
    const path = base.endsWith("/v1") ? "/chat/completions" : "/v1/chat/completions";
    const url = `${base}${path}`;
    const isReasoningModel = this.model.startsWith("o1-") || this.model.startsWith("o3-");
    const body: Record<string, any> = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    if (isReasoningModel) {
      body.max_completion_tokens = this.maxTokens;
    } else {
      body.max_tokens = this.maxTokens;
    }

    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && this.apiKey !== "no-key-required"
          ? { Authorization: `Bearer ${this.apiKey}` }
          : {}),
        ...this.extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${this.name} API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(
        `${this.name} returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return content;
  }
}
