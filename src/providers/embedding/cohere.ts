import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

const API_URL = "https://api.cohere.ai/v1/embed";

export class CohereEmbeddingProvider implements EmbeddingProvider {
  readonly name = "cohere";
  readonly dimensions = 1024;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("COHERE_API_KEY") || "";
    if (!this.apiKey) throw new Error("COHERE_API_KEY is required");
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
        model: "embed-english-v3.0",
        texts,
        input_type: "search_document",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cohere embedding failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      embeddings: number[][];
    };

    return data.embeddings.map((e) => new Float32Array(e));
  }
}
