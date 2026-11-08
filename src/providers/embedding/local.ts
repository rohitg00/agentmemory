import type { EmbeddingProvider } from "../../types.js";

type FeatureExtractor = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly model = process.env.LOCAL_EMBEDDING_MODEL?.trim() || "Xenova/all-MiniLM-L6-v2";
  readonly name = this.model === "Xenova/all-MiniLM-L6-v2" ? "local" : `local:${this.model}`;
  readonly dimensions = positiveInteger("LOCAL_EMBEDDING_DIMENSIONS", 384);
  readonly pooling = process.env.LOCAL_EMBEDDING_POOLING?.trim() || "mean";
  private readonly batchSize = positiveInteger("LOCAL_EMBEDDING_BATCH_SIZE", Number.MAX_SAFE_INTEGER);
  private readonly queryPrefix = process.env.LOCAL_EMBEDDING_QUERY_PREFIX || "";
  private readonly documentPrefix = process.env.LOCAL_EMBEDDING_DOCUMENT_PREFIX || "";
  private extractor: Promise<FeatureExtractor> | null = null;

  constructor() {
    if (!["mean", "cls", "first_token", "last_token", "eos"].includes(this.pooling)) {
      throw new Error("LOCAL_EMBEDDING_POOLING must be mean, cls, first_token, last_token, or eos");
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const [result] = await this.extract([this.queryPrefix + text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return this.extract(texts.map((text) => this.documentPrefix + text));
  }

  private async extract(texts: string[]): Promise<Float32Array[]> {
    if (!texts.length) return [];
    const extractor = await this.getExtractor();
    const vectors: Float32Array[] = [];
    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      const output = await extractor(texts.slice(offset, offset + this.batchSize), {
        pooling: this.pooling,
        normalize: true,
      });
      const rows = output.tolist();
      if (rows.length !== Math.min(this.batchSize, texts.length - offset) ||
          rows.some((row) => row.length !== this.dimensions || row.some((n) => !Number.isFinite(n)))) {
        throw new Error(`Local embedding output does not match configured dimensions (${this.dimensions})`);
      }
      vectors.push(...rows.map((row) => new Float32Array(row)));
    }
    return vectors;
  }

  private getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractor) {
      this.extractor = this.loadExtractor().catch((error) => {
        this.extractor = null;
        throw error;
      });
    }
    return this.extractor;
  }

  private async loadExtractor(): Promise<FeatureExtractor> {
    let transformers: typeof import("@huggingface/transformers");
    try {
      transformers = await import("@huggingface/transformers");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
        throw new Error("Install @huggingface/transformers for local embeddings: npm install @huggingface/transformers");
      }
      throw err;
    }
    return await transformers.pipeline("feature-extraction", this.model, {
      dtype: "q8",
      ...(process.env.LOCAL_EMBEDDING_CACHE_DIR ? { cache_dir: process.env.LOCAL_EMBEDDING_CACHE_DIR } : {}),
    }) as FeatureExtractor;
  }
}
