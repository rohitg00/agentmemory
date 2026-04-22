import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions = 1536;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey?: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey || getEnvVar("OPENAI_API_KEY") || "no-key-required";
    this.baseUrl = baseUrl || "https://api.openai.com/v1/embeddings";
    this.model = model || "text-embedding-3-small";
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        ...(this.apiKey && this.apiKey !== "no-key-required"
          ? { Authorization: `Bearer ${this.apiKey}` }
          : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI embedding failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  }
}
