import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.doUnmock("@huggingface/transformers");
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadFresh() {
  vi.resetModules();
  const mod = await import("../src/providers/embedding/local.js");
  return mod.LocalEmbeddingProvider;
}

describe("LocalEmbeddingProvider (package unavailable)", () => {
  it("throws clean install hint when @huggingface/transformers is missing", async () => {
    vi.doMock("@huggingface/transformers");
    const Fresh = await loadFresh();
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
    return { pipeline, extractor };
  }

  it("calls pipeline with dtype: q8, passes extractor opts, returns mapped Float32Array", async () => {
    const { pipeline, extractor } = mockSuccessModule();
    const Fresh = await loadFresh();
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
    const Fresh = await loadFresh();
    const vecs = await new Fresh().embedBatch(["a", "b", "c"]);

    expect(vecs).toHaveLength(3);
    for (const v of vecs) expect(v).toBeInstanceOf(Float32Array);
  });
});

describe("LocalEmbeddingProvider (model configuration)", () => {
  it("defaults to the English MiniLM model at 384 dims", async () => {
    const Fresh = await loadFresh();
    const provider = new Fresh();
    expect(provider.model).toBe("Xenova/all-MiniLM-L6-v2");
    expect(provider.dimensions).toBe(384);
  });

  it("reads model and infers dimensions from AGENTMEMORY_LOCAL_EMBEDDING_MODEL", async () => {
    vi.stubEnv("AGENTMEMORY_LOCAL_EMBEDDING_MODEL", "Xenova/bge-small-zh-v1.5");
    const Fresh = await loadFresh();
    const provider = new Fresh();
    expect(provider.model).toBe("Xenova/bge-small-zh-v1.5");
    expect(provider.dimensions).toBe(512);
  });

  it("honours an explicit AGENTMEMORY_LOCAL_EMBEDDING_DIMENSIONS override", async () => {
    vi.stubEnv("AGENTMEMORY_LOCAL_EMBEDDING_MODEL", "Xenova/some-unknown-model");
    vi.stubEnv("AGENTMEMORY_LOCAL_EMBEDDING_DIMENSIONS", "768");
    const Fresh = await loadFresh();
    const provider = new Fresh();
    expect(provider.dimensions).toBe(768);
  });

  it("rejects a non-positive dimensions override", async () => {
    vi.stubEnv("AGENTMEMORY_LOCAL_EMBEDDING_DIMENSIONS", "0");
    const Fresh = await loadFresh();
    expect(() => new Fresh()).toThrow(
      "AGENTMEMORY_LOCAL_EMBEDDING_DIMENSIONS must be a positive integer",
    );
  });

  it("passes the configured model id to the pipeline", async () => {
    vi.stubEnv("AGENTMEMORY_LOCAL_EMBEDDING_MODEL", "Xenova/bge-small-zh-v1.5");
    const { pipeline } = (() => {
      const extractor = vi.fn(async (texts: string[]) => ({
        tolist: () => texts.map(() => new Array(512).fill(0.01)),
      }));
      const pipeline = vi.fn(() => Promise.resolve(extractor));
      vi.doMock("@huggingface/transformers", () => ({ pipeline }));
      return { pipeline };
    })();
    const Fresh = await loadFresh();
    await new Fresh().embed("记忆系统");

    expect(pipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/bge-small-zh-v1.5",
      { dtype: "q8" },
    );
  });

  it("allows constructor options to override the environment", async () => {
    vi.stubEnv("AGENTMEMORY_LOCAL_EMBEDDING_MODEL", "Xenova/bge-small-zh-v1.5");
    const Fresh = await loadFresh();
    const provider = new Fresh({ model: "Xenova/multilingual-e5-base", dimensions: 768 });
    expect(provider.model).toBe("Xenova/multilingual-e5-base");
    expect(provider.dimensions).toBe(768);
  });
});
