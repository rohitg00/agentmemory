import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

const API_URL = "https://api.voyageai.com/v1/embeddings";

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = "voyage";
  readonly dimensions = 1024;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("VOYAGE_API_KEY") || "";
    if (!this.apiKey) throw new Error("VOYAGE_API_KEY is required");
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
        model: "voyage-code-3",
        input: texts,
        input_type: "document",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Voyage embedding failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  }
}
