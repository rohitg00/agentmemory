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
