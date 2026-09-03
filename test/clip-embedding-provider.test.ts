import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.doUnmock("@huggingface/transformers");
  vi.resetModules();
});

describe("ClipEmbeddingProvider (package unavailable)", () => {
  it("throws clean install hint when @huggingface/transformers is missing", async () => {
    vi.doMock("@huggingface/transformers");
    vi.resetModules();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    await expect(new Fresh().embed("hello")).rejects.toThrow(
      "Install @huggingface/transformers for CLIP embeddings",
    );
  });
});

describe("ClipEmbeddingProvider (with loaded pipeline)", () => {
  function mockSuccessModule() {
    const textModel = vi.fn(async () => ({
      text_embeds: { tolist: () => [[0.1, 0.2]] },
    }));
    textModel.from_pretrained = vi.fn(async () => textModel);
    const tokenizer = vi.fn(async () => ({ input_ids: [] }));
    tokenizer.from_pretrained = vi.fn(async () => tokenizer);
    const imageExtractor = vi.fn(async () => ({
      tolist: () => [[0.3, 0.4]],
      data: new Float32Array([0.3, 0.4]),
    }));
    const fromBlob = vi.fn(async () => ({}));
    const pipeline = vi.fn((task: string) => {
      if (task === "image-feature-extraction") return Promise.resolve(imageExtractor);
      return Promise.reject(new Error(`unmocked task: ${task}`));
    });
    vi.doMock("@huggingface/transformers", () => ({
      CLIPTextModelWithProjection: textModel,
      AutoTokenizer: tokenizer,
      pipeline,
      RawImage: { fromBlob },
    }));
    vi.resetModules();
    return { textModel, tokenizer, pipeline, imageExtractor, fromBlob };
  }

  it("encodes text via CLIPTextModelWithProjection with dtype: q8 and returns normalized Float32Array", async () => {
    const { textModel, tokenizer } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    const vec = await new Fresh().embed("hello");

    expect(textModel.from_pretrained).toHaveBeenCalledWith(
      "Xenova/clip-vit-base-patch32",
      { dtype: "q8" },
    );
    expect(tokenizer).toHaveBeenCalledWith(["hello"]);
    expect(vec).toBeInstanceOf(Float32Array);
    // [0.1, 0.2] normalized => length 1
    expect(vec.length).toBe(2);
    expect(Math.sqrt(vec[0]! ** 2 + vec[1]! ** 2)).toBeCloseTo(1, 5);
  });

  it("embedBatch returns one normalized Float32Array per input", async () => {
    const { tokenizer } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    const vecs = await new Fresh().embedBatch(["a", "b"]);

    expect(tokenizer).toHaveBeenCalledWith(["a", "b"]);
    expect(vecs).toHaveLength(1); // mock returns a single text_embeds row
    for (const v of vecs) expect(v).toBeInstanceOf(Float32Array);
  });

  it("embedImage loads image pipeline with dtype: q8 and decodes data: URL", async () => {
    const { pipeline, fromBlob } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    const vec = await new Fresh().embedImage("data:image/png;base64,AAAA");

    expect(pipeline).toHaveBeenCalledWith(
      "image-feature-extraction",
      "Xenova/clip-vit-base-patch32",
      { dtype: "q8" },
    );
    expect(fromBlob).toHaveBeenCalled();
    expect(vec).toBeInstanceOf(Float32Array);
  });

  it("accepts custom model ID via constructor", async () => {
    const { textModel } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    await new Fresh("Xenova/clip-vit-large-patch14").embed("hello");

    expect(textModel.from_pretrained).toHaveBeenCalledWith(
      "Xenova/clip-vit-large-patch14",
      { dtype: "q8" },
    );
  });
});
