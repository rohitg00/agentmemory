import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";
import { fetchWithTimeout } from "../_fetch.js";

const API_URL = "https://openrouter.ai/api/v1/embeddings";

const DEFAULT_MODEL = "openai/text-embedding-3-small";

/**
 * Known embedding model dimensions accessible via OpenRouter.
 * Extend as new models are added. Override in any case via
 * OPENROUTER_EMBEDDING_DIMENSIONS for models not listed here.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "openai/text-embedding-3-small": 1536,
  "openai/text-embedding-3-large": 3072,
  "openai/text-embedding-ada-002": 1536,
  "qwen/qwen3-embedding-8b": 4096,
  "google/gemini-embedding-001": 3072,
  "cohere/embed-multilingual-v3.0": 1024,
  "cohere/embed-english-v3.0": 1024,
  "cohere/embed-multilingual-light-v3.0": 384,
  "cohere/embed-english-light-v3.0": 384,
};

const DEFAULT_DIMENSIONS = MODEL_DIMENSIONS[DEFAULT_MODEL] ?? 1536;

function resolveDimensions(model: string, override: string | undefined): number {
  if (override !== undefined && override.trim().length > 0) {
    const parsed = Number(override.trim());
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      throw new Error(
        `OPENROUTER_EMBEDDING_DIMENSIONS must be a positive integer, got: ${override}`,
      );
    }
    return parsed;
  }
  if (!(model in MODEL_DIMENSIONS)) {
    console.warn(
      `[agentmemory] Unknown embedding model "${model}" not in MODEL_DIMENSIONS; using default dimensions (${DEFAULT_DIMENSIONS}). Set OPENROUTER_EMBEDDING_DIMENSIONS to override.`,
    );
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
      DEFAULT_MODEL;
    this.dimensions = resolveDimensions(
      this.model,
      getEnvVar("OPENROUTER_EMBEDDING_DIMENSIONS"),
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
