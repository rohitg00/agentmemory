import type { MemoryProvider } from "../types.js";

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

export class AnthropicCompatibleProvider implements MemoryProvider {
  name: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private baseUrl: string;
  private extraHeaders: Record<string, string>;
  private errorPrefix: string;

  constructor(
    name: string,
    apiKey: string,
    model: string,
    maxTokens: number,
    baseUrl: string,
    extraHeaders: Record<string, string> = {},
    errorPrefix: string = "API",
  ) {
    this.name = name;
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.baseUrl = baseUrl;
    this.extraHeaders = extraHeaders;
    this.errorPrefix = errorPrefix;
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.request({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.request({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
  }

  async describeImage(
    imageData: string,
    mimeType: string,
    prompt: string,
  ): Promise<string> {
    return this.request({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: imageData,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
  }

  private async request(body: unknown): Promise<string> {
    const url = `${this.baseUrl}/v1/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        ...this.extraHeaders,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        ...(body as Record<string, unknown>),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${this.errorPrefix} error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as AnthropicMessageResponse;
    const textBlock = data.content?.find((b) => b.type === "text");
    return textBlock?.text ?? "";
  }
}
