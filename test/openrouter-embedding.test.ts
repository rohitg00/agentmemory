import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterEmbeddingProvider } from "../src/providers/embedding/openrouter.js";

describe("OpenRouterEmbeddingProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["OPENROUTER_EMBEDDING_MODEL"];
    delete process.env["OPENROUTER_EMBEDDING_DIMENSIONS"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to 1536 dimensions for the default model", () => {
    const provider = new OpenRouterEmbeddingProvider("test-key");
    expect(provider.name).toBe("openrouter");
    expect(provider.dimensions).toBe(1536);
  });

  it("throws when no API key is provided", () => {
    expect(() => new OpenRouterEmbeddingProvider()).toThrow(
      /OPENROUTER_API_KEY is required/,
    );
  });

  it("derives dimensions from the known-models table", () => {
    process.env["OPENROUTER_EMBEDDING_MODEL"] = "qwen/qwen3-embedding-8b";
    const qwen = new OpenRouterEmbeddingProvider("test-key");
    expect(qwen.dimensions).toBe(4096);

    process.env["OPENROUTER_EMBEDDING_MODEL"] = "openai/text-embedding-3-large";
    const large = new OpenRouterEmbeddingProvider("test-key");
    expect(large.dimensions).toBe(3072);

    process.env["OPENROUTER_EMBEDDING_MODEL"] = "cohere/embed-multilingual-v3.0";
    const cohere = new OpenRouterEmbeddingProvider("test-key");
    expect(cohere.dimensions).toBe(1024);
  });

  it("OPENROUTER_EMBEDDING_DIMENSIONS overrides model-derived dimensions", () => {
    process.env["OPENROUTER_EMBEDDING_MODEL"] = "openai/text-embedding-3-large";
    process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = "768";
    const provider = new OpenRouterEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(768);
  });

  it("falls back to 1536 for unknown models", () => {
    process.env["OPENROUTER_EMBEDDING_MODEL"] = "unknown/custom-model";
    const provider = new OpenRouterEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(1536);
  });

  it("rejects invalid OPENROUTER_EMBEDDING_DIMENSIONS values", () => {
    process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = "not-a-number";
    expect(() => new OpenRouterEmbeddingProvider("test-key")).toThrow(
      /OPENROUTER_EMBEDDING_DIMENSIONS must be a positive integer/,
    );

    process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = "-5";
    expect(() => new OpenRouterEmbeddingProvider("test-key")).toThrow(
      /OPENROUTER_EMBEDDING_DIMENSIONS must be a positive integer/,
    );

    process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = "0";
    expect(() => new OpenRouterEmbeddingProvider("test-key")).toThrow(
      /OPENROUTER_EMBEDDING_DIMENSIONS must be a positive integer/,
    );
  });

  it("sends correct model in the request body", async () => {
    process.env["OPENROUTER_EMBEDDING_MODEL"] = "qwen/qwen3-embedding-8b";
    const provider = new OpenRouterEmbeddingProvider("test-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ embedding: Array(4096).fill(0.1) }] }),
        { status: 200 },
      ),
    );

    await provider.embed("hello");
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.model).toBe("qwen/qwen3-embedding-8b");

    fetchSpy.mockRestore();
  });
});
