import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEmbeddingProvider } from "../src/providers/embedding/index.js";
import { GeminiEmbeddingProvider } from "../src/providers/embedding/gemini.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";

describe("createEmbeddingProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["GEMINI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    delete process.env["VOYAGE_API_KEY"];
    delete process.env["COHERE_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["EMBEDDING_PROVIDER"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns null when no API keys are set", () => {
    const provider = createEmbeddingProvider();
    expect(provider).toBeNull();
  });

  it("returns GeminiEmbeddingProvider when GEMINI_API_KEY is set", () => {
    process.env["GEMINI_API_KEY"] = "test-key-123";
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(GeminiEmbeddingProvider);
    expect(provider!.name).toBe("gemini");
  });

  it("returns OpenAIEmbeddingProvider when OPENAI_API_KEY is set", () => {
    process.env["OPENAI_API_KEY"] = "test-key-456";
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
    expect(provider!.name).toBe("openai");
  });

  it("EMBEDDING_PROVIDER override takes precedence", () => {
    process.env["GEMINI_API_KEY"] = "test-key-123";
    process.env["OPENAI_API_KEY"] = "test-key-456";
    process.env["EMBEDDING_PROVIDER"] = "openai";
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
  });
});

describe("OpenAIEmbeddingProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_EMBEDDING_MODEL"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses default base URL and model when env vars are not set", () => {
    const provider = new OpenAIEmbeddingProvider("test-key");
    expect(provider.name).toBe("openai");
    expect(provider.dimensions).toBe(1536);
  });

  it("throws when no API key is provided", () => {
    delete process.env["OPENAI_API_KEY"];
    expect(() => new OpenAIEmbeddingProvider()).toThrow("OPENAI_API_KEY is required");
  });

  it("respects OPENAI_BASE_URL env var", async () => {
    process.env["OPENAI_BASE_URL"] = "https://my-proxy.example.com";
    const provider = new OpenAIEmbeddingProvider("test-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 }),
    );

    await provider.embed("hello");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://my-proxy.example.com/v1/embeddings",
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });

  it("respects OPENAI_EMBEDDING_MODEL env var", async () => {
    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-large";
    const provider = new OpenAIEmbeddingProvider("test-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 }),
    );

    await provider.embed("hello");
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("text-embedding-3-large");

    fetchSpy.mockRestore();
  });
});
