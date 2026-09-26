import { randomUUID } from "node:crypto";
import type { MemoryProvider } from "../types.js";
import { getEnvVar } from "../config.js";
import { fetchWithTimeout } from "./_fetch.js";
import { buildChatUrl } from "./_openai-shared.js";
import { resolveTimeout } from "./openai.js";

export const OPENCODE_DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1";

// Relay rejects requests without a stable x-opencode-session (HTTP 400
// MissingSessionID, opencode.ai/docs/go). One id per provider instance:
// OPENCODE_SESSION_ID wins, else one UUID.
function resolveSessionId(): string {
  return getEnvVar("OPENCODE_SESSION_ID") || randomUUID();
}

export class OpencodeProvider implements MemoryProvider {
  name: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private baseUrl: string;
  private sessionId: string;

  constructor(
    apiKey: string,
    model: string,
    maxTokens: number,
    baseURL?: string,
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.baseUrl = (baseURL || OPENCODE_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.sessionId = resolveSessionId();
    this.name = "opencode";
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = buildChatUrl(this.baseUrl, false, "");
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "x-opencode-session": this.sessionId,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
      resolveTimeout(),
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${this.name} API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning?: string; reasoning_content?: string };
      }>;
    };
    const message = data.choices?.[0]?.message;
    const content = message?.content;
    if (content) {
      return content;
    }
    // Thinking models may return reasoning without content.
    const reasoning = message?.reasoning ?? message?.reasoning_content;
    if (reasoning) {
      return reasoning;
    }
    throw new Error(
      `${this.name} returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
}
