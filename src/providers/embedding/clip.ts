import { readFile } from "node:fs/promises";
import type { RawImage } from "@huggingface/transformers";
import type { EmbeddingProvider } from "../../types.js";

type TransformersModule = typeof import("@huggingface/transformers");
type ClipImagePipeline = (
  input: RawImage | RawImage[],
  options?: { pooling?: string; normalize?: boolean },
) => Promise<{ tolist: () => number[][]; data: Float32Array }>;
type ClipTextModel = {
  (inputs: { input_ids: unknown; attention_mask?: unknown; token_type_ids?: unknown }): Promise<{
    text_embeds: { tolist: () => number[][] };
  }>;
  from_pretrained: (modelId: string, options?: { dtype?: string }) => Promise<ClipTextModel>;
};
type ClipTokenizer = {
  (texts: string[]): Promise<{ input_ids: unknown; attention_mask?: unknown; token_type_ids?: unknown }>;
  from_pretrained: (modelId: string) => Promise<ClipTokenizer>;
};

const DEFAULT_MODEL = "Xenova/clip-vit-base-patch32";

export class ClipEmbeddingProvider implements EmbeddingProvider {
  readonly name = "clip";
  readonly dimensions = 512;
  private textModel: ClipTextModel | null = null;
  private tokenizer: ClipTokenizer | null = null;
  private imageExtractor: ClipImagePipeline | null = null;
  private readonly modelId: string;

  constructor(modelId: string = DEFAULT_MODEL) {
    this.modelId = modelId;
  }

  async embed(text: string): Promise<Float32Array> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Text and image embeddings must live in the same projection space so
    // vision-search can compare a text query against stored image vectors.
    // `pipeline("feature-extraction", clipModel)` routes to the *image*
    // encoder in transformers.js and fails with "Missing the following
    // inputs: pixel_values" for text input, so encode text with the CLIP
    // text tower directly and L2-normalize to match embedImage().
    const t = await loadTransformers();
    const model = await this.getTextModel(t);
    const tokenizer = await this.getTokenizer(t);
    const inputs = await tokenizer(texts);
    const out = await model(inputs);
    return out.text_embeds.tolist().map((v) => normalize(new Float32Array(v)));
  }

  async embedImage(src: string): Promise<Float32Array> {
    const t = await loadTransformers();
    const image = await loadImage(t, src);
    const extractor = await this.getImageExtractor(t);
    const output = await extractor(image);
    const vec = output.data ?? new Float32Array(output.tolist()[0] || []);
    return normalize(vec);
  }

  private async getTextModel(t: TransformersModule): Promise<ClipTextModel> {
    if (this.textModel) return this.textModel;
    this.textModel = (await t.CLIPTextModelWithProjection.from_pretrained(this.modelId, {
      dtype: "q8",
    })) as unknown as ClipTextModel;
    return this.textModel;
  }

  private async getTokenizer(t: TransformersModule): Promise<ClipTokenizer> {
    if (this.tokenizer) return this.tokenizer;
    this.tokenizer = (await t.AutoTokenizer.from_pretrained(this.modelId)) as unknown as ClipTokenizer;
    return this.tokenizer;
  }

  private async getImageExtractor(t: TransformersModule): Promise<ClipImagePipeline> {
    if (this.imageExtractor) return this.imageExtractor;
    this.imageExtractor = (await t.pipeline("image-feature-extraction", this.modelId, {
      dtype: "q8",
    })) as ClipImagePipeline;
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
