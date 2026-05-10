import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "nomic-embed-text:latest";

const MODEL_DIMENSIONS: Record<string, number> = {
  "nomic-embed-text": 768,
  "nomic-embed-text:latest": 768,
  "mxbai-embed-large": 1024,
  "mxbai-embed-large:latest": 1024,
};

function resolveDimensions(model: string, override: string | undefined): number {
  if (override !== undefined && override.trim().length > 0) {
    const parsed = parseInt(override, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `OLLAMA_EMBEDDING_DIMENSIONS must be a positive integer, got: ${override}`,
      );
    }
    return parsed;
  }
  return MODEL_DIMENSIONS[model] ?? MODEL_DIMENSIONS[DEFAULT_MODEL] ?? 768;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama";
  readonly dimensions: number;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = (
      getEnvVar("OLLAMA_BASE_URL") || DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    this.model = getEnvVar("OLLAMA_EMBEDDING_MODEL") || DEFAULT_MODEL;
    this.dimensions = resolveDimensions(
      this.model,
      getEnvVar("OLLAMA_EMBEDDING_DIMENSIONS"),
    );
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama embedding failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      embeddings?: number[][];
    };
    if (!Array.isArray(data.embeddings)) {
      throw new Error("Ollama embedding response did not include embeddings");
    }

    return data.embeddings.map((embedding) => new Float32Array(embedding));
  }
}
