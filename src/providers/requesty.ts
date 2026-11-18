import type { MemoryProvider } from "../types.js";
import { fetchWithTimeout } from "./_fetch.js";

export const REQUESTY_CHAT_URL =
  "https://router.requesty.ai/v1/chat/completions";

// The bearer token and prompt body are sent to baseUrl, so refuse anything
// that is not HTTPS up front rather than issuing a plaintext request.
function assertHttpsUrl(baseUrl: string): void {
  let protocol: string;
  try {
    protocol = new URL(baseUrl).protocol;
  } catch {
    throw new Error(`requesty base URL is not a valid URL: ${baseUrl}`);
  }
  if (protocol !== "https:") {
    throw new Error(`requesty base URL must use https: ${baseUrl}`);
  }
}

export class RequestyProvider implements MemoryProvider {
  name = "requesty";
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private baseUrl: string;

  constructor(
    apiKey: string,
    model: string,
    maxTokens: number,
    baseUrl: string = REQUESTY_CHAT_URL,
  ) {
    assertHttpsUrl(baseUrl);
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.baseUrl = baseUrl;
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
    const response = await fetchWithTimeout(this.baseUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/rohitg00/agentmemory",
        "X-Title": "agentmemory",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${this.name} API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices = data.choices as
      | Array<{ message?: { content?: unknown } }>
      | undefined;
    const content = choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error(
        `${this.name} returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return content;
  }
}
