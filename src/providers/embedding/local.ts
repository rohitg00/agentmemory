import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

type FeatureExtractor = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly dimensions: number;
  private extractor: FeatureExtractor | null = null;
  private model: string;

  constructor() {
    this.model = getEnvVar("LOCAL_EMBEDDING_MODEL") || "Xenova/all-MiniLM-L6-v2";
    const dim = getEnvVar("LOCAL_EMBEDDING_DIMENSIONS");
    const dimensions = dim ? Number(dim) : 384;
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0) {
      throw new Error(
        "LOCAL_EMBEDDING_DIMENSIONS must be a positive safe integer",
      );
    }
    this.dimensions = dimensions;
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
