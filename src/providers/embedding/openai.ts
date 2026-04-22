import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "text-embedding-3-small";

/**
 * Known OpenAI embedding model dimensions. Extend as new models ship.
 * Override in any case via OPENAI_EMBEDDING_DIMENSIONS for custom or
 * self-hosted OpenAI-compatible endpoints returning non-standard sizes.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

const DEFAULT_DIMENSIONS = MODEL_DIMENSIONS[DEFAULT_MODEL] ?? 1536;

function resolveDimensions(model: string, override: string | undefined): number {
  if (override !== undefined && override.trim().length > 0) {
    const parsed = parseInt(override, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `OPENAI_EMBEDDING_DIMENSIONS must be a positive integer, got: ${override}`,
      );
    }
    return parsed;
  }
  return MODEL_DIMENSIONS[model] ?? DEFAULT_DIMENSIONS;
}

/**
 * OpenAI-compatible embedding provider.
 *
 * Required env vars:
 *   OPENAI_API_KEY            — API key
 *
 * Optional:
 *   OPENAI_BASE_URL           — base URL without path (default: https://api.openai.com)
 *   OPENAI_EMBEDDING_MODEL    — model name (default: text-embedding-3-small)
 *   OPENAI_EMBEDDING_DIMENSIONS — override reported dimensions (required for
 *                                 custom / self-hosted models not in the
 *                                 MODEL_DIMENSIONS table above)
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions: number;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("OPENAI_API_KEY") || "";
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is required");
    this.baseUrl =
      getEnvVar("OPENAI_BASE_URL") || DEFAULT_BASE_URL;
    this.model =
      getEnvVar("OPENAI_EMBEDDING_MODEL") || DEFAULT_MODEL;
    this.dimensions = resolveDimensions(
      this.model,
      getEnvVar("OPENAI_EMBEDDING_DIMENSIONS"),
    );
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const url = `${this.baseUrl}/v1/embeddings`;
    const response = await fetch(url, {
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
      throw new Error(`OpenAI embedding failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  }
}
