import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";
import { fetchWithTimeout } from "../_fetch.js";

const API_URL = "https://openrouter.ai/api/v1/embeddings";

// Default fallback when no env override + unknown model.
// Matches `openai/text-embedding-3-small`, the prior hardcoded value.
const DEFAULT_DIMENSIONS = 1536;

/**
 * Known dimensions for popular OpenRouter-hosted embedding models.
 * Extend as new models ship. Override via OPENROUTER_EMBEDDING_DIMENSIONS
 * (or OPENAI_EMBEDDING_DIMENSIONS for parity with the OpenAI provider).
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "openai/text-embedding-3-small": 1536,
  "openai/text-embedding-3-large": 3072,
  "openai/text-embedding-ada-002": 1536,
  "qwen/qwen3-embedding-8b": 4096,
  "openrouter/qwen/qwen3-embedding-8b": 4096,
};

function resolveDimensions(model: string, override?: string | null): number {
  if (override !== undefined && override !== null && override.trim().length > 0) {
    const parsed = parseInt(override, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `OPENROUTER_EMBEDDING_DIMENSIONS must be a positive integer, got: ${override}`,
      );
    }
    return parsed;
  }
  return MODEL_DIMENSIONS[model] ?? DEFAULT_DIMENSIONS;
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openrouter";
  readonly dimensions: number;
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getEnvVar("OPENROUTER_API_KEY") || "";
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required");
    this.model =
      getEnvVar("OPENROUTER_EMBEDDING_MODEL") ||
      "openai/text-embedding-3-small";
    // Precedence: OPENROUTER_EMBEDDING_DIMENSIONS (provider-specific)
    //          → OPENAI_EMBEDDING_DIMENSIONS (parity alias with the OpenAI provider)
    //          → MODEL_DIMENSIONS table lookup
    //          → DEFAULT_DIMENSIONS (1536, prior hardcoded value)
    this.dimensions = resolveDimensions(
      this.model,
      getEnvVar("OPENROUTER_EMBEDDING_DIMENSIONS") ||
        getEnvVar("OPENAI_EMBEDDING_DIMENSIONS"),
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
        `OpenRouter embedding failed (${response.status}): ${err}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  }
}
