import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { createProvider } from "../src/providers/index.js";
import { createEmbeddingProvider } from "../src/providers/embedding/index.js";
import { OpenAIProvider } from "../src/providers/openai.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";
import { ResilientProvider } from "../src/providers/resilient.js";

describe("Local Providers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env["LMSTUDIO_BASE_URL"] = "";
    process.env["LMSTUDIO_MODEL"] = "";
    process.env["OLLAMA_BASE_URL"] = "";
    process.env["OLLAMA_MODEL"] = "";
    process.env["VLLM_BASE_URL"] = "";
    process.env["VLLM_MODEL"] = "";
    process.env["OPENAI_BASE_URL"] = "";
    process.env["OPENAI_MODEL"] = "";
    process.env["ANTHROPIC_API_KEY"] = "";
    process.env["GEMINI_API_KEY"] = "";
    process.env["GOOGLE_API_KEY"] = "";
    process.env["OPENROUTER_API_KEY"] = "";
    process.env["MINIMAX_API_KEY"] = "";
    process.env["EMBEDDING_PROVIDER"] = "";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("detects lmstudio provider when LMSTUDIO_BASE_URL is set", () => {
    process.env["LMSTUDIO_BASE_URL"] = "http://localhost:1234";
    const config = loadConfig();
    expect(config.provider.provider).toBe("lmstudio");
    expect(config.provider.baseURL).toBe("http://localhost:1234");
  });

  it("detects ollama provider when OLLAMA_MODEL is set", () => {
    process.env["OLLAMA_MODEL"] = "llama3";
    const config = loadConfig();
    expect(config.provider.provider).toBe("ollama");
    expect(config.provider.model).toBe("llama3");
    expect(config.provider.baseURL).toBe("http://localhost:11434");
  });

  it("detects vllm provider when VLLM_BASE_URL is set", () => {
    process.env["VLLM_BASE_URL"] = "http://vllm-server:8000";
    const config = loadConfig();
    expect(config.provider.provider).toBe("vllm");
    expect(config.provider.baseURL).toBe("http://vllm-server:8000");
  });

  it("creates OpenAIProvider from config for lmstudio", () => {
    const provider = createProvider({
      provider: "lmstudio",
      model: "local-model",
      maxTokens: 1000,
      baseURL: "http://localhost:1234",
    });
    expect(provider).toBeInstanceOf(ResilientProvider);
  });

  it("creates OpenAIEmbeddingProvider for lmstudio", () => {
    process.env["LMSTUDIO_EMBEDDING_BASE_URL"] = "http://localhost:1234";
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
    expect(provider!.name).toBe("openai");
  });

  it("creates OpenAIEmbeddingProvider for ollama", () => {
    process.env["OLLAMA_EMBEDDING_BASE_URL"] = "http://localhost:11434";
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
    expect(provider!.name).toBe("openai");
  });
});

describe("OpenAIProvider implementation", () => {
  it("calls fetch with correct parameters", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "mock response" } }],
      }),
    });
    global.fetch = mockFetch;

    const provider = new OpenAIProvider(
      "test-provider",
      "test-key",
      "test-model",
      100,
      "http://test-url"
    );
    const result = await provider.compress("system", "user");

    expect(result).toBe("mock response");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://test-url/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer test-key",
        },
        body: JSON.stringify({
          model: "test-model",
          max_tokens: 100,
          messages: [
            { role: "system", content: "system" },
            { role: "user", content: "user" },
          ],
        }),
      })
    );
  });
});

describe("OpenAIEmbeddingProvider implementation (Local compatibility)", () => {
  it("calls fetch with correct parameters for local models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    });
    global.fetch = mockFetch;

    const provider = new OpenAIEmbeddingProvider(
      "no-key-required",
      "http://local-ollama:11434",
      "nomic-embed-text"
    );
    const result = await provider.embed("test text");

    expect(result).toBeInstanceOf(Float32Array);
    const resultArr = Array.from(result);
    expect(resultArr[0]).toBeCloseTo(0.1);
    expect(resultArr[1]).toBeCloseTo(0.2);
    expect(resultArr[2]).toBeCloseTo(0.3);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://local-ollama:11434/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nomic-embed-text",
          input: ["test text"],
        }),
      })
    );
  });
});
