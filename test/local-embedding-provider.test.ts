import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previousTransformersCache = process.env.TRANSFORMERS_CACHE;
const previousHfHome = process.env.HF_HOME;

function restoreEnvironmentVariable(
  name: string,
  previousValue: string | undefined,
): void {
  if (previousValue === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previousValue;
  }
}

beforeEach(() => {
  delete process.env.TRANSFORMERS_CACHE;
  delete process.env.HF_HOME;
});

afterEach(() => {
  restoreEnvironmentVariable("TRANSFORMERS_CACHE", previousTransformersCache);
  restoreEnvironmentVariable("HF_HOME", previousHfHome);
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

  it("preserves missing transitive dependency errors", async () => {
    const transitiveError = Object.assign(
      new Error(
        "Cannot find package 'sharp' imported from @huggingface/transformers",
      ),
      { code: "ERR_MODULE_NOT_FOUND" },
    );
    vi.doMock("@huggingface/transformers");
    vi.resetModules();
    const { setTransformersImportError } = await import(
      "./fixtures/transformers-import-error.js"
    );
    setTransformersImportError(transitiveError);
    const { LocalEmbeddingProvider: Fresh } = await import(
      "../src/providers/embedding/local.js"
    );

    await expect(new Fresh().embed("hello")).rejects.toBe(transitiveError);
  });
});

describe("Transformers cache initialization", () => {
  async function loadTransformersWithMock(
    module: Record<string, unknown>,
  ) {
    vi.doMock("@huggingface/transformers", () => module);
    vi.resetModules();
    const { loadTransformers } = await import(
      "../src/providers/embedding/_transformers.js"
    );
    return loadTransformers();
  }

  it("prefers TRANSFORMERS_CACHE over HF_HOME", async () => {
    process.env.TRANSFORMERS_CACHE = "/tmp/transformers-cache";
    process.env.HF_HOME = "/tmp/hf-home";
    const env = { cacheDir: "" };

    await loadTransformersWithMock({ env });

    expect(env.cacheDir).toBe("/tmp/transformers-cache");
  });

  it("uses HF_HOME when TRANSFORMERS_CACHE is absent", async () => {
    process.env.HF_HOME = "/tmp/hf-home";
    const env = { cacheDir: "" };

    await loadTransformersWithMock({ env });

    expect(env.cacheDir).toBe("/tmp/hf-home");
  });

  it("falls back to the user cache when both variables are absent", async () => {
    const env = { cacheDir: "" };

    await loadTransformersWithMock({ env });

    expect(env.cacheDir).toBe(
      join(homedir(), ".cache", "huggingface", "transformers"),
    );
  });

  it("keeps the module usable when cacheDir is not writable", async () => {
    const pipeline = vi.fn();
    const setCacheDir = vi.fn(() => {
      throw new TypeError("cacheDir is read-only");
    });
    const env = {};
    Object.defineProperty(env, "cacheDir", { set: setCacheDir });

    const transformers = await loadTransformersWithMock({ env, pipeline });

    expect(setCacheDir).toHaveBeenCalledOnce();
    expect(transformers.pipeline).toBe(pipeline);
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
