import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

const API_URL = "https://openrouter.ai/api/v1/embeddings";

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openrouter";
  readonly dimensions = 1536;
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("OPENROUTER_API_KEY") || "";
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required");
    this.model =
      getEnvVar("OPENROUTER_EMBEDDING_MODEL") ||
      "openai/text-embedding-3-small";
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(
        `OpenRouter embedding failed (${response.status}): ${err}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  }
}
