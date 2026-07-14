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
  readonly dimensions: number;
  private readonly modelName: string;
  private readonly modelDir: string | undefined;
  private extractor: Awaited<ReturnType<Pipeline>> | null = null;

  constructor() {
    this.modelName = process.env["AGENTMEMORY_LOCAL_EMBEDDING_MODEL"] || "Xenova/all-MiniLM-L6-v2";
    this.modelDir = process.env["AGENTMEMORY_LOCAL_EMBEDDING_MODEL_DIR"] || undefined;

    // Known dimensions for common models. Falls back to 384 (MiniLM default).
    const KNOWN_DIMS: Record<string, number> = {
      "Xenova/all-MiniLM-L6-v2": 384,
      "Xenova/bge-m3": 1024,
      "Xenova/multilingual-e5-large": 1024,
      "Xenova/bge-small-en-v1.5": 384,
      "Xenova/bge-base-en-v1.5": 768,
      "Xenova/bge-large-en-v1.5": 1024,
    };
    this.dimensions = KNOWN_DIMS[this.modelName] || 384;
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

    let transformers: { pipeline: Pipeline; env: Record<string, unknown> };
    try {
      // @ts-ignore - optional peer dependency
      transformers = await import("@xenova/transformers");
    } catch {
      throw new Error(
        "Install @xenova/transformers for local embeddings: npm install @xenova/transformers",
      );
    }

    // Allow custom model cache directory (e.g. for pre-downloaded models).
    if (this.modelDir) {
      transformers.env.localModelPath = this.modelDir + "/";
      transformers.env.cacheDir = this.modelDir;
    }

    // Allow HuggingFace mirror endpoint for users behind firewalls.
    const hfEndpoint = process.env["HF_ENDPOINT"] || "";
    if (hfEndpoint) {
      transformers.env.remoteHost = hfEndpoint.endsWith("/")
        ? hfEndpoint
        : hfEndpoint + "/";
    }

    this.extractor = await transformers.pipeline(
      "feature-extraction",
      this.modelName,
    );
    return this.extractor;
  }
}
