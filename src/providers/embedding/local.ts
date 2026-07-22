import type { EmbeddingProvider } from "../../types.js";

type FeatureExtractor = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly dimensions = 384;
  private extractor: FeatureExtractor | null = null;

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
    const { pipeline } = await import("@huggingface/transformers").catch(() => {
      throw new Error(
        "Install @huggingface/transformers for local embeddings: npm install @huggingface/transformers",
      );
    });
    this.extractor = (await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8" },
    )) as FeatureExtractor;
    return this.extractor;
  }
}
