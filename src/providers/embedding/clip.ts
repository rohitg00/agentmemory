import { readFile } from "node:fs/promises";
import type { EmbeddingProvider } from "../../types.js";
import { loadTransformers, type TransformersModule } from "../transformers.js";

type ClipTransformersModule = TransformersModule & {
  pipeline: (
    task: string,
    model: string,
  ) => Promise<ClipPipeline>;
  RawImage: {
    fromBlob: (blob: Blob) => Promise<RawImageInstance>;
  };
};

type RawImageInstance = unknown;

type ClipPipeline = (
  input: string[] | RawImageInstance | RawImageInstance[],
  options?: { pooling?: string; normalize?: boolean },
) => Promise<{ tolist: () => number[][]; data: Float32Array }>;

const DEFAULT_MODEL = "Xenova/clip-vit-base-patch32";
const DIMENSIONS = 512;

export class ClipEmbeddingProvider implements EmbeddingProvider {
  readonly name = "clip";
  readonly dimensions = DIMENSIONS;
  private textExtractor: ClipPipeline | null = null;
  private imageExtractor: ClipPipeline | null = null;
  private transformers: ClipTransformersModule | null = null;
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
    const t = await this.getTransformers();
    const image = await loadImage(t, src);
    const extractor = await this.getImageExtractor();
    const output = await extractor(image);
    const vec = output.data ?? new Float32Array(output.tolist()[0] || []);
    return normalize(vec);
  }

  private async getTransformers(): Promise<ClipTransformersModule> {
    if (this.transformers) return this.transformers;
    try {
      this.transformers = await loadTransformers<ClipTransformersModule>();
    } catch {
      throw new Error(
        "Install @xenova/transformers for CLIP image embeddings: npm install @xenova/transformers",
      );
    }
    return this.transformers;
  }

  private async getTextExtractor(): Promise<ClipPipeline> {
    if (this.textExtractor) return this.textExtractor;
    const t = await this.getTransformers();
    this.textExtractor = await t.pipeline("feature-extraction", this.modelId);
    return this.textExtractor;
  }

  private async getImageExtractor(): Promise<ClipPipeline> {
    if (this.imageExtractor) return this.imageExtractor;
    const t = await this.getTransformers();
    this.imageExtractor = await t.pipeline("image-feature-extraction", this.modelId);
    return this.imageExtractor;
  }
}

async function loadImage(
  t: ClipTransformersModule,
  src: string,
): Promise<RawImageInstance> {
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    const b64 = comma >= 0 ? src.slice(comma + 1) : src;
    const buf = Buffer.from(b64, "base64");
    const blob = new Blob([buf]);
    return t.RawImage.fromBlob(blob);
  }
  const data = await readFile(src);
  const blob = new Blob([data]);
  return t.RawImage.fromBlob(blob);
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
