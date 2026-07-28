import { readFile } from "node:fs/promises";
import type { RawImage } from "@huggingface/transformers";
import type { EmbeddingProvider } from "../../types.js";

type TransformersModule = typeof import("@huggingface/transformers");
type ClipPipeline = (
  input: string[] | RawImage | RawImage[],
  options?: { pooling?: string; normalize?: boolean },
) => Promise<{ tolist: () => number[][]; data: Float32Array }>;

const DEFAULT_MODEL = "Xenova/clip-vit-base-patch32";

export class ClipEmbeddingProvider implements EmbeddingProvider {
  readonly name = "clip";
  readonly dimensions = 512;
  private textExtractor: ClipPipeline | null = null;
  private imageExtractor: ClipPipeline | null = null;
  private readonly modelId: string;

  constructor(modelId: string = DEFAULT_MODEL) {
    this.modelId = modelId;
  }

  async embed(text: string): Promise<Float32Array> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const extractor = await this.getTextExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist().map((v) => new Float32Array(v));
  }

  async embedImage(src: string): Promise<Float32Array> {
    const t = await loadTransformers();
    const image = await loadImage(t, src);
    const extractor = await this.getImageExtractor();
    const output = await extractor(image);
    const vec = output.data ?? new Float32Array(output.tolist()[0] || []);
    return normalize(vec);
  }

  private async getTextExtractor(): Promise<ClipPipeline> {
    if (this.textExtractor) return this.textExtractor;
    const t = await loadTransformers();
    this.textExtractor = (await t.pipeline("feature-extraction", this.modelId, { dtype: "q8" })) as ClipPipeline;
    return this.textExtractor;
  }

  private async getImageExtractor(): Promise<ClipPipeline> {
    if (this.imageExtractor) return this.imageExtractor;
    const t = await loadTransformers();
    this.imageExtractor = (await t.pipeline("image-feature-extraction", this.modelId, { dtype: "q8" })) as ClipPipeline;
    return this.imageExtractor;
  }
}

async function loadTransformers(): Promise<TransformersModule> {
  try {
    return await import("@huggingface/transformers");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      throw new Error(
        "Install @huggingface/transformers for CLIP embeddings: npm install @huggingface/transformers",
      );
    }
    throw err;
  }
}

async function loadImage(
  t: TransformersModule,
  src: string,
): Promise<RawImage> {
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    const b64 = comma >= 0 ? src.slice(comma + 1) : src;
    const buf = Buffer.from(b64, "base64");
    return t.RawImage.fromBlob(new Blob([buf]));
  }
  const data = await readFile(src);
  return t.RawImage.fromBlob(new Blob([data]));
}

function normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}
