import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEmbeddingProvider } from "../src/providers/embedding/index.js";
import { GeminiEmbeddingProvider } from "../src/providers/embedding/gemini.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";
import { OpenRouterEmbeddingProvider } from "../src/providers/embedding/openrouter.js";
import * as config from "../src/config.js";

describe("createEmbeddingProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Set to empty string to override any local .env values for testing "not set" state
    process.env["GEMINI_API_KEY"] = "";
    process.env["OPENAI_API_KEY"] = "";
    process.env["VOYAGE_API_KEY"] = "";
    process.env["COHERE_API_KEY"] = "";
    process.env["OPENROUTER_API_KEY"] = "";
    process.env["EMBEDDING_PROVIDER"] = "";
    process.env["OLLAMA_EMBEDDING_BASE_URL"] = "";
    process.env["OLLAMA_EMBEDDING_MODEL"] = "";
    process.env["LMSTUDIO_EMBEDDING_BASE_URL"] = "";
    process.env["LMSTUDIO_EMBEDDING_MODEL"] = "";
    process.env["VLLM_EMBEDDING_BASE_URL"] = "";
    process.env["VLLM_EMBEDDING_MODEL"] = "";
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

  it("returns OpenRouterEmbeddingProvider when OPENROUTER_API_KEY is set", () => {
    process.env["OPENROUTER_API_KEY"] = "test-key-789";
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OpenRouterEmbeddingProvider);
    expect(provider!.name).toBe("openrouter");
  });

  it("detects lmstudio embedding provider when LMSTUDIO_EMBEDDING_BASE_URL is set", () => {
    process.env["LMSTUDIO_EMBEDDING_BASE_URL"] = "http://localhost:1234/v1/embeddings";
    const provider = config.detectEmbeddingProvider(process.env);
    expect(provider).toBe("lmstudio");
  });

  it("detects ollama embedding provider when OLLAMA_EMBEDDING_MODEL is set", () => {
    process.env["OLLAMA_EMBEDDING_MODEL"] = "nomic-embed-text";
    const provider = config.detectEmbeddingProvider(process.env);
    expect(provider).toBe("ollama");
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
    delete process.env["OPENAI_EMBEDDING_DIMENSIONS"];
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

  it("derives dimensions from model in the known-models table", () => {
    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-large";
    const large = new OpenAIEmbeddingProvider("test-key");
    expect(large.dimensions).toBe(3072);

    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-ada-002";
    const ada = new OpenAIEmbeddingProvider("test-key");
    expect(ada.dimensions).toBe(1536);

    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-small";
    const small = new OpenAIEmbeddingProvider("test-key");
    expect(small.dimensions).toBe(1536);
  });

  it("OPENAI_EMBEDDING_DIMENSIONS overrides the model-derived dimensions", () => {
    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-large";
    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "768";
    const provider = new OpenAIEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(768);
  });

  it("falls back to 1536 for unknown custom models", () => {
    process.env["OPENAI_EMBEDDING_MODEL"] = "mystery-self-hosted-model";
    const provider = new OpenAIEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(1536);
  });

  it("rejects invalid OPENAI_EMBEDDING_DIMENSIONS values", () => {
    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "not-a-number";
    expect(() => new OpenAIEmbeddingProvider("test-key")).toThrow(
      /OPENAI_EMBEDDING_DIMENSIONS must be a positive integer/,
    );

    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "-5";
    expect(() => new OpenAIEmbeddingProvider("test-key")).toThrow(
      /OPENAI_EMBEDDING_DIMENSIONS must be a positive integer/,
    );

    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "0";
    expect(() => new OpenAIEmbeddingProvider("test-key")).toThrow(
      /OPENAI_EMBEDDING_DIMENSIONS must be a positive integer/,
    );
  });
});
