import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createEmbeddingProvider } from "../src/providers/embedding/index.js";
import { GeminiEmbeddingProvider } from "../src/providers/embedding/gemini.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";
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
