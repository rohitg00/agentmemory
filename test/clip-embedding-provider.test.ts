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
    const tokenized: unknown[] = [];
    const textModel = vi.fn(async (inputs: { input_ids: number[][] }) => ({
      text_embeds: {
        tolist: () => inputs.input_ids.map(() => Array.from({ length: 512 }, (_, i) => (i % 7) + 1)),
      },
    }));
    const tokenizer = vi.fn((texts: string[]) => {
      const out = { input_ids: texts.map(() => [1, 2, 3]) };
      tokenized.push(out);
      return out;
    });
    const fromPretrainedText = vi.fn(async () => textModel);
    const fromPretrainedTokenizer = vi.fn(async () => tokenizer);
    const imageVec = Array.from({ length: 512 }, (_, i) => (i % 5) + 1);
    const imageExtractor = vi.fn(async () => ({
      tolist: () => [imageVec],
      data: new Float32Array(imageVec),
    }));
    const fromBlob = vi.fn(async () => ({}));
    const pipeline = vi.fn((task: string) => {
      if (task === "image-feature-extraction") return Promise.resolve(imageExtractor);
      return Promise.reject(new Error(`unmocked task: ${task}`));
    });
    vi.doMock("@huggingface/transformers", () => ({
      pipeline,
      AutoTokenizer: { from_pretrained: fromPretrainedTokenizer },
      CLIPTextModelWithProjection: { from_pretrained: fromPretrainedText },
      RawImage: { fromBlob },
    }));
    vi.resetModules();
    return {
      pipeline,
      textModel,
      tokenizer,
      tokenized,
      fromPretrainedText,
      fromPretrainedTokenizer,
      imageExtractor,
      fromBlob,
    };
  }

  it("loads the CLIP text tower with dtype: q8 and returns a normalized Float32Array", async () => {
    const { pipeline, fromPretrainedText, fromPretrainedTokenizer } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    const vec = await new Fresh().embed("hello");

    expect(fromPretrainedTokenizer).toHaveBeenCalledWith("Xenova/clip-vit-base-patch32");
    expect(fromPretrainedText).toHaveBeenCalledWith("Xenova/clip-vit-base-patch32", {
      dtype: "q8",
    });
    expect(pipeline).not.toHaveBeenCalledWith(
      "feature-extraction",
      expect.anything(),
      expect.anything(),
    );
    expect(vec).toBeInstanceOf(Float32Array);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("embedBatch returns one Float32Array per input", async () => {
    mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    const vecs = await new Fresh().embedBatch(["a", "b"]);

    expect(vecs).toHaveLength(2);
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
    const { fromPretrainedText, fromPretrainedTokenizer } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    await new Fresh("Xenova/clip-vit-large-patch14").embed("hello");

    expect(fromPretrainedTokenizer).toHaveBeenCalledWith("Xenova/clip-vit-large-patch14");
    expect(fromPretrainedText).toHaveBeenCalledWith("Xenova/clip-vit-large-patch14", {
      dtype: "q8",
    });
  });

  it("caches the text tower across calls instead of reloading it", async () => {
    const { fromPretrainedText, fromPretrainedTokenizer } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    const provider = new Fresh();
    await provider.embed("hello");
    await provider.embed("world");
    await provider.embedBatch(["a", "b"]);

    expect(fromPretrainedTokenizer).toHaveBeenCalledTimes(1);
    expect(fromPretrainedText).toHaveBeenCalledTimes(1);
  });

  it("tokenizes with padding so a batch of uneven texts stays one tensor", async () => {
    const { tokenizer, tokenized, textModel } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    await new Fresh().embedBatch(["hi", "a much longer caption"]);

    expect(tokenizer).toHaveBeenCalledWith(
      ["hi", "a much longer caption"],
      expect.objectContaining({ padding: true, truncation: true }),
    );
    expect(tokenized).toHaveLength(1);
    expect(textModel).toHaveBeenCalledWith(tokenized[0]);
  });

  it("keeps text and image vectors in the same space via the projection head", async () => {
    const { fromPretrainedText, pipeline } = mockSuccessModule();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );
    const provider = new Fresh();
    const text = await provider.embed("a red square");
    const image = await provider.embedImage("data:image/png;base64,AAAA");

    expect(fromPretrainedText).toHaveBeenCalled();
    expect(pipeline).toHaveBeenCalledWith(
      "image-feature-extraction",
      expect.anything(),
      expect.anything(),
    );
    expect(text).toHaveLength(512);
    expect(image).toHaveLength(512);
    const norm = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm(text)).toBeCloseTo(1, 6);
    expect(norm(image)).toBeCloseTo(1, 6);
  });

  it("propagates a non-missing-module load failure untouched", async () => {
    const boom = Object.assign(new Error("wasm backend unavailable"), {
      code: "ERR_DLOPEN_FAILED",
    });
    vi.doMock("@huggingface/transformers", () => ({
      get pipeline() {
        throw boom;
      },
      get AutoTokenizer() {
        throw boom;
      },
      get CLIPTextModelWithProjection() {
        throw boom;
      },
      RawImage: { fromBlob: vi.fn() },
    }));
    vi.resetModules();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );

    await expect(new Fresh().embed("hello")).rejects.toThrow(
      "wasm backend unavailable",
    );
  });

  it("rethrows a failed module import instead of the install hint", async () => {
    const boom = Object.assign(new Error("wasm backend unavailable"), {
      code: "ERR_DLOPEN_FAILED",
    });
    vi.doMock("@huggingface/transformers", () => {
      throw boom;
    });
    vi.resetModules();
    const { ClipEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/clip.js"
    );

    const err = await new Fresh().embed("hello").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("Install @huggingface/transformers");
    expect(err === boom || (err as Error).cause === boom).toBe(true);
  });
});
