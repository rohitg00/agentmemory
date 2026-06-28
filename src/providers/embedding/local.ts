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

    let transformers: {
      pipeline: Pipeline;
      env: { localModelPath: string; cacheDir: string };
    };
    try {
      // @ts-ignore - optional peer dependency
      transformers = await import("@xenova/transformers");
    } catch {
      throw new Error(
        "Install @xenova/transformers for local embeddings: npm install @xenova/transformers",
      );
    }

    // Pre-downloaded models (offline / restricted-network setups) live in
    // ~/.cache/Xenova/ by convention. @xenova/transformers defaults
    // localModelPath to its own install dir — which is deep inside npm's
    // global node_modules and rarely holds pre-downloaded files. When
    // XENOVA_CACHE_HOME is set, redirect both the local-model lookup and
    // the download cache so the library finds existing files without a
    // network fetch.
    const cacheHome = process.env["XENOVA_CACHE_HOME"];
    if (cacheHome) {
      transformers.env.localModelPath = cacheHome;
      transformers.env.cacheDir = cacheHome;
    }

    this.extractor = await transformers.pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
    return this.extractor;
  }
}
