import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.doUnmock("@huggingface/transformers");
  vi.resetModules();
});

// The factory-less doMock is deliberate: the optional runtime is not in
// this repo's devDependencies, so vitest's mocker fails to resolve the
// module and the import rejects with ERR_MODULE_NOT_FOUND - the exact
// path under test. It cannot be simulated more explicitly: a factory
// that throws (or rejects with) a coded error gets wrapped in vitest's
// own "error when mocking a module" error, losing the `code` the
// provider's mapping keys on. If @huggingface/transformers is ever added
// to devDependencies, these two tests will need a different seam.
describe("LocalEmbeddingProvider (package unavailable)", () => {
  it("throws clean install hint when @huggingface/transformers is missing", async () => {
    vi.doMock("@huggingface/transformers");
    vi.resetModules();
    const { LocalEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/local.js"
    );
    // #931: message rewritten to also name the legacy @xenova/transformers
    // 2.x package as incompatible, since that is exactly what silently sat
    // installed on the live box while the code imported the renamed
    // successor - see the "legacy package" test below.
    await expect(new Fresh().embed("hello")).rejects.toThrow(
      "Local embeddings need @huggingface/transformers (>=4)",
    );
  });

  it("names both the current and legacy package when the runtime is missing", async () => {
    vi.doMock("@huggingface/transformers");
    vi.resetModules();
    const { LocalEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/local.js"
    );
    const provider = new Fresh();
    await expect(provider.embed("hello")).rejects.toThrow(
      /@huggingface\/transformers/,
    );
    await expect(provider.embed("hello")).rejects.toThrow(
      /@xenova\/transformers/,
    );
  });
});

describe("LocalEmbeddingProvider extractor initialization", () => {
  function mockTransformers(pipeline: unknown) {
    vi.doMock("@huggingface/transformers", () => ({ pipeline }));
    vi.resetModules();
  }

  // Also guards the wrong shape of the concurrency fix in getExtractor:
  // a bare `??=` of the load promise would cache a rejection forever,
  // turning one interrupted model download into a dead provider until
  // restart. (The concurrency dedup itself is not black-box testable
  // here: vitest's module runner serializes mocked dynamic imports, so
  // even the pre-fix code shows a single pipeline() call under
  // Promise.all - verified against plain Node semantics instead.)
  it("retries after a failed initialization instead of caching the rejection", async () => {
    const pipeline = vi
      .fn()
      .mockRejectedValueOnce(new Error("download interrupted"))
      .mockImplementation(
        async () => async (texts: string[]) => ({
          tolist: () => texts.map(() => [0.1]),
        }),
      );
    mockTransformers(pipeline);
    const { LocalEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/local.js"
    );
    const provider = new Fresh();

    await expect(provider.embed("a")).rejects.toThrow("download interrupted");
    await expect(provider.embed("a")).resolves.toBeInstanceOf(Float32Array);
    expect(pipeline).toHaveBeenCalledTimes(2);
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
