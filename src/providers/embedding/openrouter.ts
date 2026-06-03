import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";
import { fetchWithTimeout } from "../_fetch.js";

const API_URL = "https://openrouter.ai/api/v1/embeddings";
const DIMENSIONS_ERROR =
  "OPENROUTER_EMBEDDING_DIMENSIONS must be a positive integer";

type OpenRouterEmbeddingRequestBody = {
  model: string;
  input: string[];
  dimensions?: number;
};

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openrouter";
  readonly dimensions: number;
  private apiKey: string;
  private model: string;
  private sendDimensions: boolean;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("OPENROUTER_API_KEY") || "";
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required");
    const configuredDimensions = getEnvVar("OPENROUTER_EMBEDDING_DIMENSIONS");
    this.dimensions = resolveDimensions(configuredDimensions);
    this.sendDimensions = Boolean(configuredDimensions?.trim());
    this.model =
      getEnvVar("OPENROUTER_EMBEDDING_MODEL") ||
      "openai/text-embedding-3-small";
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const body: OpenRouterEmbeddingRequestBody = {
      model: this.model,
      input: texts,
    };
    if (this.sendDimensions) {
      body.dimensions = this.dimensions;
    }

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

function resolveDimensions(raw: string | undefined): number {
  if (!raw) return 1536;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(DIMENSIONS_ERROR);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(DIMENSIONS_ERROR);
  }
  return parsed;
}
