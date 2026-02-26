import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

const BATCH_LIMIT = 100;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContent";

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini";
  readonly dimensions = 768;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("GEMINI_API_KEY") || "";
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is required");
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
      const chunk = texts.slice(i, i + BATCH_LIMIT);
      const response = await fetch(`${API_BASE}?key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: chunk.map((t) => ({
            model: "models/text-embedding-004",
            content: { parts: [{ text: t }] },
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini embedding failed (${response.status}): ${err}`);
      }

      const data = (await response.json()) as {
        embeddings: Array<{ values: number[] }>;
      };

      for (const emb of data.embeddings) {
        results.push(new Float32Array(emb.values));
      }
    }

    return results;
  }
}
