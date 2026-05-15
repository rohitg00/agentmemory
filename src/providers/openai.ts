import type { MemoryProvider } from "../types.js";
import { getEnvVar } from "../config.js";

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_AZURE_API_VERSION = "2024-10-21";

export class OpenAIProvider implements MemoryProvider {
  name = "openai";
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private baseUrl: string;

  constructor(
    apiKey: string,
    model: string,
    maxTokens: number,
    baseUrl?: string,
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.baseUrl = baseUrl || getEnvVar("OPENAI_BASE_URL") || DEFAULT_BASE_URL;
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  private isAzure(): boolean {
    const url = this.baseUrl.toLowerCase();
    return url.includes("openai.azure.com") || url.includes("/openai/deployments/");
  }

  private buildRequestUrl(): string {
    const path = this.isAzure() ? "chat/completions" : "v1/chat/completions";
    const url = new URL(this.baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path}`;

    if (this.isAzure()) {
      const apiVersion =
        getEnvVar("AZURE_OPENAI_API_VERSION") ||
        url.searchParams.get("api-version") ||
        DEFAULT_AZURE_API_VERSION;
      url.searchParams.set("api-version", apiVersion);
    }

    return url.toString();
  }

  private buildHeaders(): HeadersInit {
    if (this.isAzure()) {
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

  private buildBody(systemPrompt: string, userPrompt: string): string {
    return JSON.stringify({
      ...(this.isAzure() ? {} : { model: this.model }),
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
  }

  private async call(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const response = await fetch(this.buildRequestUrl(), {
      method: "POST",
      headers: this.buildHeaders(),
      body: this.buildBody(systemPrompt, userPrompt),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices = data.choices as
      | Array<{ message: { content: string } }>
      | undefined;
    const content = choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(
        `OpenAI returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return content;
  }
}
