import type { EmbeddingProvider } from "../../types.js";

type Pipeline = (
  task: string,
  model: string,
) => Promise<
  (
    texts: string[],
    options: { pooling: string; normalize: boolean },
  ) => Promise<{ tolist: () => number[][] }>
>;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly dimensions = 384;
  private extractor: Awaited<ReturnType<Pipeline>> | null = null;

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
      // @ts-ignore - optional peer dependency
      transformers = await import("@xenova/transformers");
    } catch {
      throw new Error(
        "Install @xenova/transformers for local embeddings: npm install @xenova/transformers",
      );
    }

    this.extractor = await transformers.pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
    return this.extractor;
  }
}
