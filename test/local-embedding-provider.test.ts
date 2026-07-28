import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.doUnmock("@huggingface/transformers");
  vi.resetModules();
});

describe("LocalEmbeddingProvider (package unavailable)", () => {
  it("throws clean install hint when @huggingface/transformers is missing", async () => {
    vi.doMock("@huggingface/transformers");
    vi.resetModules();
    const { LocalEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/local.js"
    );
    await expect(new Fresh().embed("hello")).rejects.toThrow(
      "Install @huggingface/transformers for local embeddings",
    );
  });
});

describe("LocalEmbeddingProvider (with loaded pipeline)", () => {
  function mockSuccessModule() {
    const extractor = vi.fn(async (texts: string[]) => ({
      tolist: () => texts.map(() => [0.1, 0.2, 0.3]),
    }));
    const pipeline = vi.fn(() => Promise.resolve(extractor));
    vi.doMock("@huggingface/transformers", () => ({ pipeline }));
    vi.resetModules();
    return { pipeline, extractor };
  }

  it("calls pipeline with dtype: q8, passes extractor opts, returns mapped Float32Array", async () => {
    const { pipeline, extractor } = mockSuccessModule();
    const { LocalEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/local.js"
    );
    const vec = await new Fresh().embed("hello");

    expect(pipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8" },
    );
    expect(extractor).toHaveBeenCalledWith(["hello"], {
      pooling: "mean",
      normalize: true,
    });
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec).toEqual(new Float32Array([0.1, 0.2, 0.3]));
  });

  it("embedBatch returns one Float32Array per input text", async () => {
    mockSuccessModule();
    const { LocalEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/local.js"
    );
    const vecs = await new Fresh().embedBatch(["a", "b", "c"]);

    expect(vecs).toHaveLength(3);
    for (const v of vecs) expect(v).toBeInstanceOf(Float32Array);
  });
});
