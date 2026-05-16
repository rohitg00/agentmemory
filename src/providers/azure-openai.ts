import type { MemoryProvider } from "../types.js";

export class AzureOpenAIProvider implements MemoryProvider {
  name = "azure-openai";
  private apiKey: string;
  private endpoint: string;
  private deploymentName: string;
  private apiVersion: string;
  private maxTokens: number;

  constructor(
    apiKey: string,
    endpoint: string,
    deploymentName: string,
    maxTokens: number,
    apiVersion = "2024-08-01-preview",
  ) {
    this.apiKey = apiKey;
    this.endpoint = endpoint.replace(/\/$/, "");
    this.deploymentName = deploymentName;
    this.maxTokens = maxTokens;
    this.apiVersion = apiVersion;
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.call(systemPrompt, userPrompt);
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const url =
      `${this.endpoint}/openai/deployments/${this.deploymentName}` +
      `/chat/completions?api-version=${this.apiVersion}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify({
        model: this.deploymentName,
        max_tokens: this.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`azure-openai API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices = data.choices as
      | Array<{ message: { content: string } }>
      | undefined;
    const content = choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(
        `azure-openai returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return content;
  }
}
