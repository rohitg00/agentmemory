import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

type FeatureExtractor = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

/**
 * Default on-device model. English-only: its WordPiece vocabulary contains
 * roughly 500 CJK characters, so most Chinese/Japanese/Korean text tokenizes
 * to `[UNK]`. Set AGENTMEMORY_LOCAL_EMBEDDING_MODEL to a multilingual model
 * (e.g. Xenova/bge-small-zh-v1.5, Xenova/multilingual-e5-small) for non-English
 * stores.
 */
export const DEFAULT_LOCAL_MODEL = "Xenova/all-MiniLM-L6-v2";

/**
 * Output widths of the models we ship defaults for. The dimension guard in
 * index.ts throws on a mismatch, so an unknown model must supply
 * AGENTMEMORY_LOCAL_EMBEDDING_DIMENSIONS explicitly.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "Xenova/all-MiniLM-L6-v2": 384,
  "Xenova/all-MiniLM-L12-v2": 384,
  "Xenova/bge-small-zh-v1.5": 512,
  "Xenova/bge-base-zh-v1.5": 768,
  "Xenova/multilingual-e5-small": 384,
  "Xenova/multilingual-e5-base": 768,
  "Xenova/multilingual-e5-large": 1024,
};

const DEFAULT_DIMENSIONS = MODEL_DIMENSIONS[DEFAULT_LOCAL_MODEL];

function parseDimensions(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `AGENTMEMORY_LOCAL_EMBEDDING_DIMENSIONS must be a positive integer, got: ${raw}`,
    );
  }
  return parsed;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly dimensions: number;
  readonly model: string;
  private extractor: FeatureExtractor | null = null;

  constructor(options: { model?: string; dimensions?: number } = {}) {
    this.model =
      options.model?.trim() ||
      getEnvVar("AGENTMEMORY_LOCAL_EMBEDDING_MODEL")?.trim() ||
      DEFAULT_LOCAL_MODEL;
    this.dimensions =
      options.dimensions ??
      parseDimensions(getEnvVar("AGENTMEMORY_LOCAL_EMBEDDING_DIMENSIONS")) ??
      MODEL_DIMENSIONS[this.model] ??
      DEFAULT_DIMENSIONS;
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
    return output.tolist().map((v) => new Float32Array(v));
  }

  private async getExtractor() {
    if (this.extractor) return this.extractor;
    let transformers: typeof import("@huggingface/transformers");
    try {
      transformers = await import("@huggingface/transformers");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
        throw new Error(
          "Install @huggingface/transformers for local embeddings: npm install @huggingface/transformers",
        );
      }
      throw err;
    }
    this.extractor = (await transformers.pipeline(
      "feature-extraction",
      this.model,
      { dtype: "q8" },
    )) as FeatureExtractor;
    return this.extractor;
  }
}
