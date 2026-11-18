import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalEmbeddingProvider } from "../src/providers/embedding/local.js";
import { withDimensionGuard } from "../src/providers/embedding/index.js";
import { resolve } from "node:path";
const mock = vi.hoisted(() => ({ extractor: vi.fn(), pipeline: vi.fn() }));
vi.mock("@huggingface/transformers", () => ({ pipeline: mock.pipeline }));
beforeEach(() => {
  for (const key of ["MODEL", "DIMENSIONS", "POOLING", "DTYPE", "BATCH_SIZE", "QUERY_PREFIX", "DOCUMENT_PREFIX", "CACHE_DIR"]) {
    vi.stubEnv(`LOCAL_EMBEDDING_${key}`, undefined);
  }
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function configure() {
  vi.stubEnv("LOCAL_EMBEDDING_MODEL", "test/chinese");
  vi.stubEnv("LOCAL_EMBEDDING_DIMENSIONS", "3");
  vi.stubEnv("LOCAL_EMBEDDING_POOLING", "cls");
  mock.extractor.mockImplementation(async (texts: string[]) => ({ tolist: () => texts.map(() => [1, 0, 0]) }));
  mock.pipeline.mockResolvedValue(mock.extractor);
}
describe("local model configuration", () => {
  it("keeps the official model, dimensions and pooling by default", () => {
    const p = new LocalEmbeddingProvider();
    expect([p.name, p.model, p.dimensions, p.pooling]).toEqual(["local", "Xenova/all-MiniLM-L6-v2", 384, "mean"]);
  });
  it("separates query and document prefixes, including through the guard", async () => {
    configure(); vi.stubEnv("LOCAL_EMBEDDING_QUERY_PREFIX", "query: "); vi.stubEnv("LOCAL_EMBEDDING_DOCUMENT_PREFIX", "passage: ");
    const p = withDimensionGuard(new LocalEmbeddingProvider());
    await p.embedQuery!("屏幕偏黄"); await p.embedBatch(["色彩配置"]);
    expect(mock.pipeline).toHaveBeenCalledWith("feature-extraction", "test/chinese", { dtype: "q8" });
    expect(mock.extractor.mock.calls.map((c) => c[0])).toEqual([["query: 屏幕偏黄"], ["passage: 色彩配置"]]);
    expect(p.dimensions).toBe(3);
  });
  it("bounds batches and shares initialization across concurrent calls", async () => {
    configure(); vi.stubEnv("LOCAL_EMBEDDING_BATCH_SIZE", "2");
    const p = new LocalEmbeddingProvider();
    await Promise.all([p.embedBatch(["a", "b", "c"]), p.embedQuery("q")]);
    expect(mock.pipeline).toHaveBeenCalledTimes(1);
    expect(mock.extractor.mock.calls.every((c) => c[0].length <= 2)).toBe(true);
  });
  it("rejects invalid dimensions and pooling before loading a model", () => {
    vi.stubEnv("LOCAL_EMBEDDING_DIMENSIONS", "3oops");
    expect(() => new LocalEmbeddingProvider()).toThrow("positive integer");
    vi.stubEnv("LOCAL_EMBEDDING_DIMENSIONS", "3"); vi.stubEnv("LOCAL_EMBEDDING_POOLING", "none");
    expect(() => new LocalEmbeddingProvider()).toThrow("POOLING");
  });
  it("refuses a wrong-sized or non-finite embedding", async () => {
    configure(); mock.extractor.mockResolvedValue({ tolist: () => [[1, 2]] });
    await expect(new LocalEmbeddingProvider().embed("test")).rejects.toThrow("dimensions");
    mock.extractor.mockResolvedValue({ tolist: () => [[1, NaN, 0]] });
    await expect(new LocalEmbeddingProvider().embedQuery("test")).rejects.toThrow("dimensions");
  });
  it("passes the configured cache directory to the pipeline", async () => {
    configure(); vi.stubEnv("LOCAL_EMBEDDING_CACHE_DIR", "model-cache");
    await new LocalEmbeddingProvider().embed("test");
    expect(mock.pipeline).toHaveBeenCalledWith("feature-extraction", "test/chinese", { dtype: "q8", cache_dir: resolve("model-cache") });
  });
  it("retries loading after a pipeline initialization failure", async () => {
    configure(); mock.pipeline.mockRejectedValueOnce(new Error("model unavailable"));
    const provider = new LocalEmbeddingProvider();
    await expect(provider.embed("test")).rejects.toThrow("model unavailable");
    expect(await provider.embed("test")).toHaveLength(3);
    expect(mock.pipeline).toHaveBeenCalledTimes(2);
  });
  it("passes the selected dtype with the cache directory", async () => {
    configure(); vi.stubEnv("LOCAL_EMBEDDING_DTYPE", "fp32"); vi.stubEnv("LOCAL_EMBEDDING_CACHE_DIR", "model-cache");
    await new LocalEmbeddingProvider().embed("test");
    expect(mock.pipeline).toHaveBeenCalledWith("feature-extraction", "test/chinese", { dtype: "fp32", cache_dir: resolve("model-cache") });
  });
  it("loads from the same cache location used to establish its identity", async () => {
    configure(); vi.stubEnv("LOCAL_EMBEDDING_CACHE_DIR", "first-cache");
    const provider = new LocalEmbeddingProvider();
    const identity = provider.indexIdentity;
    vi.stubEnv("LOCAL_EMBEDDING_CACHE_DIR", "second-cache");
    expect(provider.indexIdentity).toBe(identity);
    await provider.embed("test");
    expect(mock.pipeline).toHaveBeenCalledWith("feature-extraction", "test/chinese", { dtype: "q8", cache_dir: resolve("first-cache") });
  });
  it("rejects an unsupported dtype before loading", () => {
    vi.stubEnv("LOCAL_EMBEDDING_DTYPE", "bogus");
    expect(() => new LocalEmbeddingProvider()).toThrow("DTYPE");
  });
  it("checks query dimensions through the wrapper", async () => {
    const provider = withDimensionGuard({
      name: "test", dimensions: 3,
      embed: async () => new Float32Array(3),
      embedQuery: async () => new Float32Array(2),
      embedBatch: async () => [],
    });
    await expect(provider.embedQuery!("test")).rejects.toThrow("dimension mismatch");
  });
  it.each(["0", "-1", "1.5", "9007199254740992"])("rejects invalid batch size %s", (value) => {
    vi.stubEnv("LOCAL_EMBEDDING_BATCH_SIZE", value);
    expect(() => new LocalEmbeddingProvider()).toThrow("positive integer");
  });

});
