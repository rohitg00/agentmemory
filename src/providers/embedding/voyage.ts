import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";
import { fetchWithTimeout } from "../_fetch.js";

const API_URL = "https://api.voyageai.com/v1/embeddings";

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = "voyage";
  // Respect VOYAGE_EMBEDDING_MODEL + VOYAGE_OUTPUT_DIMENSION env vars instead of hardcoding model + dims.
  // Voyage 3 supports {256, 512, 1024, 2048} via output_dimension. Default behavior preserved when envs unset.
  readonly model = getEnvVar("VOYAGE_EMBEDDING_MODEL") || "voyage-code-3";
  readonly dimensions = parseInt(
    getEnvVar("VOYAGE_OUTPUT_DIMENSION") || "1024",
    10,
  );
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
    const body: Record<string, unknown> = {
      model: this.model,
      input: texts,
      input_type: "document",
    };
    if (this.dimensions !== 1024) body.output_dimension = this.dimensions;
    const response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
