import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { createProvider } from "../src/providers/index.js";
import { OpenAIProvider } from "../src/providers/openai.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";
import { ResilientProvider } from "../src/providers/resilient.js";

describe("Local Providers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env["LMSTUDIO_BASE_URL"];
    delete process.env["LMSTUDIO_MODEL"];
    delete process.env["OLLAMA_BASE_URL"];
    delete process.env["OLLAMA_MODEL"];
    delete process.env["VLLM_BASE_URL"];
    delete process.env["VLLM_MODEL"];
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_MODEL"];
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["GOOGLE_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["MINIMAX_API_KEY"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("detects lmstudio provider when LMSTUDIO_BASE_URL is set", () => {
    process.env["LMSTUDIO_BASE_URL"] = "http://localhost:1234/v1/chat/completions";
    const config = loadConfig();
    expect(config.provider.provider).toBe("lmstudio");
    expect(config.provider.baseURL).toBe("http://localhost:1234/v1/chat/completions");
  });

  it("detects ollama provider when OLLAMA_MODEL is set", () => {
    process.env["OLLAMA_MODEL"] = "llama3";
    const config = loadConfig();
    expect(config.provider.provider).toBe("ollama");
    expect(config.provider.model).toBe("llama3");
    expect(config.provider.baseURL).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("detects vllm provider when VLLM_BASE_URL is set", () => {
    process.env["VLLM_BASE_URL"] = "http://vllm-server:8000/v1/chat/completions";
    const config = loadConfig();
    expect(config.provider.provider).toBe("vllm");
    expect(config.provider.baseURL).toBe("http://vllm-server:8000/v1/chat/completions");
  });

  it("creates OpenAIProvider from config for lmstudio", () => {
    const provider = createProvider({
      provider: "lmstudio",
      model: "local-model",
      maxTokens: 1000,
      baseURL: "http://localhost:1234/v1/chat/completions",
    });
    expect(provider).toBeInstanceOf(ResilientProvider);
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
      "http://test-url/v1/chat/completions"
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
      "http://local-ollama:11434/v1/embeddings",
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
