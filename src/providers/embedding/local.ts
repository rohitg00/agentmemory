import type { EmbeddingProvider } from "../../types.js";
import { getEnvVar } from "../../config.js";

type Pipeline = (
  task: string,
  model: string,
) => Promise<
  (
    texts: string[],
    options: { pooling: string; normalize: boolean },
  ) => Promise<{ tolist: () => number[][] }>
>;

/** 已知模型的嵌入维度映射表（未列出的模型需通过 OPENAI_EMBEDDING_DIMENSIONS 指定） */
const KNOWN_DIMS: Record<string, number> = {
  // MiniLM 系列（英文）
  "Xenova/all-MiniLM-L6-v2": 384,
  // BGE 中文系列
  "Xenova/bge-large-zh-v1.5": 1024,
  "Xenova/bge-base-zh-v1.5": 768,
  "Xenova/bge-small-zh-v1.5": 512,
  // BGE 多语言系列
  "Xenova/bge-m3": 1024,
  // 多语言 MiniLM
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2": 384,
  // E5 多语言系列
  "Xenova/multilingual-e5-large": 1024,
  "Xenova/multilingual-e5-base": 768,
  "Xenova/multilingual-e5-small": 384,
};

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_DIMS = 384;

function resolveDimensions(
  modelName: string,
  override: string | undefined,
): number {
  if (override !== undefined && override.trim().length > 0) {
    const parsed = parseInt(override, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `OPENAI_EMBEDDING_DIMENSIONS must be a positive integer, got: ${override}`,
      );
    }
    return parsed;
  }
  return KNOWN_DIMS[modelName] ?? DEFAULT_DIMS;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly dimensions: number;
  private modelName: string;
  private extractor: Awaited<ReturnType<Pipeline>> | null = null;

  constructor() {
    this.modelName = getEnvVar("EMBEDDING_MODEL") || DEFAULT_MODEL;
    this.dimensions = resolveDimensions(
      this.modelName,
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
      // @ts-ignore - optional peer dependency
      transformers = await import("@xenova/transformers");
    } catch {
      throw new Error(
        "Install @xenova/transformers for local embeddings: npm install @xenova/transformers",
      );
    }

    this.extractor = await transformers.pipeline(
      "feature-extraction",
      this.modelName,
      { local_files_only: true, quantized: false },
    );
    return this.extractor;
  }
}
