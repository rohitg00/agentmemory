import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveDimensions } from "../src/providers/embedding/_dimensions.js";
import { OpenRouterEmbeddingProvider } from "../src/providers/embedding/openrouter.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";

describe("resolveDimensions", () => {
  const ENV = "OPENROUTER_EMBEDDING_DIMENSIONS";

  it("resolves namespaced OpenRouter model ids to their real dimensions", () => {
    expect(resolveDimensions("openai/text-embedding-3-large", undefined, ENV)).toBe(3072);
    expect(resolveDimensions("openai/text-embedding-3-small", undefined, ENV)).toBe(1536);
    expect(resolveDimensions("openai/text-embedding-ada-002", undefined, ENV)).toBe(1536);
  });

  it("resolves bare model ids to their real dimensions", () => {
    expect(resolveDimensions("text-embedding-3-large", undefined, ENV)).toBe(3072);
    expect(resolveDimensions("text-embedding-3-small", undefined, ENV)).toBe(1536);
    expect(resolveDimensions("text-embedding-ada-002", undefined, ENV)).toBe(1536);
  });

  it("lets a valid override win over the model-derived dimensions", () => {
    expect(resolveDimensions("openai/text-embedding-3-large", "1024", ENV)).toBe(1024);
    expect(resolveDimensions("text-embedding-3-small", "768", ENV)).toBe(768);
  });

  it("throws with the given env name on invalid override values", () => {
    for (const bad of ["abc", "0", "-5"]) {
      expect(() => resolveDimensions("text-embedding-3-large", bad, ENV)).toThrow(
        new RegExp(`${ENV} must be a positive integer, got: ${bad}`),
      );
    }
  });

  it("uses the supplied env name in the error message", () => {
    expect(() => resolveDimensions("text-embedding-3-large", "abc", "OPENAI_EMBEDDING_DIMENSIONS")).toThrow(
      /OPENAI_EMBEDDING_DIMENSIONS must be a positive integer, got: abc/,
    );
  });

  it("falls back to the default (1536) for unknown models", () => {
    expect(resolveDimensions("mystery-self-hosted-model", undefined, ENV)).toBe(1536);
    expect(resolveDimensions("someprovider/unknown-model", undefined, ENV)).toBe(1536);
  });
});

describe("OpenRouterEmbeddingProvider dimension regression", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["OPENROUTER_EMBEDDING_MODEL"];
    delete process.env["OPENROUTER_EMBEDDING_DIMENSIONS"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reports 3072 for openai/text-embedding-3-large with no override (guard would throw on the old hardcoded 1536)", () => {
    process.env["OPENROUTER_EMBEDDING_MODEL"] = "openai/text-embedding-3-large";
    const provider = new OpenRouterEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(3072);
  });

  it("defaults to 1536 for openai/text-embedding-3-small", () => {
    const provider = new OpenRouterEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(1536);
  });

  it("lets OPENROUTER_EMBEDDING_DIMENSIONS override the model-derived dimensions", () => {
    process.env["OPENROUTER_EMBEDDING_MODEL"] = "openai/text-embedding-3-large";
    process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = "1024";
    const provider = new OpenRouterEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(1024);
  });
});

describe("OpenAIEmbeddingProvider defaults unchanged", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["OPENAI_EMBEDDING_MODEL"];
    delete process.env["OPENAI_EMBEDDING_DIMENSIONS"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to 1536 for text-embedding-3-small", () => {
    const provider = new OpenAIEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(1536);
  });

  it("reports 3072 for text-embedding-3-large", () => {
    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-large";
    const provider = new OpenAIEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(3072);
  });
});
