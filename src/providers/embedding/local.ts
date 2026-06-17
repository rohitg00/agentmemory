import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";
import { loadTransformers } from "../transformers.js";

export const DEFAULT_LOCAL_EMBEDDING_MODEL =
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

type Pipeline = (
  task: string,
  model: string,
  options?: { local_files_only?: boolean; quantized?: boolean },
) => Promise<
  (
    texts: string[],
    options: { pooling: string; normalize: boolean },
  ) => Promise<{ tolist: () => number[][] }>
>;

const KNOWN_LOCAL_MODEL_DIMENSIONS: Record<string, number> = {
  [DEFAULT_LOCAL_EMBEDDING_MODEL]: 384,
  "Xenova/all-MiniLM-L6-v2": 384,
  "Xenova/bge-large-zh-v1.5": 1024,
  "Xenova/bge-base-zh-v1.5": 768,
  "Xenova/bge-small-zh-v1.5": 512,
  "Xenova/bge-m3": 1024,
  "Xenova/multilingual-e5-large": 1024,
  "Xenova/multilingual-e5-base": 768,
  "Xenova/multilingual-e5-small": 384,
};

const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS =
  KNOWN_LOCAL_MODEL_DIMENSIONS[DEFAULT_LOCAL_EMBEDDING_MODEL] ?? 384;
const LOCAL_DIMENSIONS_ERROR =
  "OPENAI_EMBEDDING_DIMENSIONS must be a positive integer";

function getConfiguredLocalModel(): string {
  return (
    getEnvVar("LOCAL_EMBEDDING_MODEL")?.trim() ||
    getEnvVar("EMBEDDING_MODEL")?.trim() ||
    DEFAULT_LOCAL_EMBEDDING_MODEL
  );
}

function resolveLocalDimensions(
  model: string,
  rawOverride: string | undefined,
): number {
  const trimmed = rawOverride?.trim();
  if (trimmed) {
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`${LOCAL_DIMENSIONS_ERROR}, got: ${rawOverride}`);
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${LOCAL_DIMENSIONS_ERROR}, got: ${rawOverride}`);
    }
    return parsed;
  }
  return (
    KNOWN_LOCAL_MODEL_DIMENSIONS[model] ?? DEFAULT_LOCAL_EMBEDDING_DIMENSIONS
  );
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly dimensions: number;
  private readonly model: string;
  private extractor: Awaited<ReturnType<Pipeline>> | null = null;

  constructor() {
    this.model = getConfiguredLocalModel();
    this.dimensions = resolveLocalDimensions(
      this.model,
      getEnvVar("OPENAI_EMBEDDING_DIMENSIONS"),
    );
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(texts, {
      pooling: "mean",
      normalize: true,
    });
    const vectors = output.tolist();
    return vectors.map((v: number[]) => new Float32Array(v));
  }

  private async getExtractor() {
    if (this.extractor) return this.extractor;

    let transformers: { pipeline: Pipeline };
    try {
      transformers = await loadTransformers<{ pipeline: Pipeline }>();
    } catch {
      throw new Error(
        "Install @xenova/transformers for local embeddings: npm install @xenova/transformers",
      );
    }

    this.extractor = await transformers.pipeline(
      "feature-extraction",
      this.model,
      { local_files_only: true, quantized: false },
    );
    return this.extractor;
  }
}
