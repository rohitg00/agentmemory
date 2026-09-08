import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";
import { fetchWithTimeout } from "../_fetch.js";
import { resolveDimensions } from "./_dimensions.js";

const API_URL = "https://router.requesty.ai/v1/embeddings";

const DEFAULT_MODEL = "openai/text-embedding-3-small";

export class RequestyEmbeddingProvider implements EmbeddingProvider {
  readonly name = "requesty";
  readonly dimensions: number;
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("REQUESTY_API_KEY") || "";
    if (!this.apiKey) throw new Error("REQUESTY_API_KEY is required");
    this.model = getEnvVar("REQUESTY_EMBEDDING_MODEL") || DEFAULT_MODEL;
    this.dimensions = resolveDimensions(
      this.model,
      getEnvVar("REQUESTY_EMBEDDING_DIMENSIONS"),
      "REQUESTY_EMBEDDING_DIMENSIONS",
    );
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetchWithTimeout(API_URL, {
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
        `Requesty embedding failed (${response.status}): ${err}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  }
}
