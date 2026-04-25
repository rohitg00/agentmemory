import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, detectEmbeddingProvider } from "../src/config.js";
import { createProvider } from "../src/providers/index.js";
import { createEmbeddingProvider } from "../src/providers/embedding/index.js";
import { OpenAIProvider } from "../src/providers/openai.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";
import { ResilientProvider } from "../src/providers/resilient.js";

describe("OpenAI Family Providers", () => {
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
    process.env["OPENAI_API_KEY"] = "";
    process.env["OPENAI_BASE_URL"] = "";
    process.env["OPENAI_MODEL"] = "";
    process.env["ANTHROPIC_API_KEY"] = "";
    process.env["GEMINI_API_KEY"] = "";
    process.env["GOOGLE_API_KEY"] = "";
    process.env["OPENROUTER_API_KEY"] = "";
    process.env["MINIMAX_API_KEY"] = "";
    process.env["EMBEDDING_PROVIDER"] = "";
    process.env["LMSTUDIO_EMBEDDING_BASE_URL"] = "";
    process.env["LMSTUDIO_EMBEDDING_MODEL"] = "";
    process.env["VLLM_EMBEDDING_BASE_URL"] = "";
    process.env["VLLM_EMBEDDING_MODEL"] = "";
    process.env["OLLAMA_EMBEDDING_BASE_URL"] = "";
    process.env["OLLAMA_EMBEDDING_MODEL"] = "";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Detection", () => {
    it("detects openai provider", () => {
      process.env["OPENAI_API_KEY"] = "sk-test";
      const config = loadConfig();
      expect(config.provider.provider).toBe("openai");
    });

    it("does not detect openai provider with bare base URL", () => {
      process.env["OPENAI_BASE_URL"] = "https://my-proxy.com";
      const config = loadConfig();
      // Should fall back to noop or next available
      expect(config.provider.provider).not.toBe("openai");
    });

    it("detects lmstudio provider", () => {
      process.env["LMSTUDIO_BASE_URL"] = "http://localhost:1234";
      const config = loadConfig();
      expect(config.provider.provider).toBe("lmstudio");
    });

    it("detects ollama provider", () => {
      process.env["OLLAMA_MODEL"] = "llama3";
      const config = loadConfig();
      expect(config.provider.provider).toBe("ollama");
    });

    it("detects vllm provider", () => {
      process.env["VLLM_BASE_URL"] = "http://vllm-server:8000";
      const config = loadConfig();
      expect(config.provider.provider).toBe("vllm");
    });

    it("detects vllm embedding provider", () => {
      process.env["VLLM_EMBEDDING_BASE_URL"] = "http://vllm-server:8000";
      const provider = detectEmbeddingProvider(process.env);
      expect(provider).toBe("vllm");
    });
  });

  describe("Instantiation (LLM)", () => {
    const providers: Array<"openai" | "lmstudio" | "ollama" | "vllm"> = [
      "openai",
      "lmstudio",
      "ollama",
      "vllm",
    ];

    providers.forEach((p) => {
      it(`creates OpenAIProvider for ${p}`, () => {
        const provider = createProvider({
          provider: p,
          model: "test-model",
          maxTokens: 1000,
          baseURL: "http://localhost:1234",
        });
        expect(provider).toBeInstanceOf(ResilientProvider);
      });
    });
  });

  describe("Instantiation (Embedding)", () => {
    const providers: Array<"openai" | "lmstudio" | "ollama" | "vllm"> = [
      "openai",
      "lmstudio",
      "ollama",
      "vllm",
    ];

    providers.forEach((p) => {
      it(`creates OpenAIEmbeddingProvider for ${p}`, () => {
        // Set necessary env vars for detection/creation
        if (p === "openai") {
          process.env["OPENAI_API_KEY"] = "sk-test";
        } else if (p === "lmstudio") {
          process.env["LMSTUDIO_EMBEDDING_BASE_URL"] = "http://localhost:1234";
          process.env["LMSTUDIO_EMBEDDING_MODEL"] = "test-model";
        } else if (p === "ollama") {
          process.env["OLLAMA_EMBEDDING_BASE_URL"] = "http://localhost:11434";
        } else if (p === "vllm") {
          process.env["VLLM_EMBEDDING_BASE_URL"] = "http://localhost:8000";
          process.env["VLLM_EMBEDDING_MODEL"] = "test-model";
        }

        const provider = createEmbeddingProvider();
        expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
        expect(provider!.name).toBe("openai");
      });
    });
  });
});

describe("OpenAIProvider implementation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls fetch with correct parameters and appends /v1/chat/completions", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "mock response" } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

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
        signal: expect.any(AbortSignal),
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer test-key",
        },
        body: JSON.stringify({
          model: "test-model",
          messages: [
            { role: "system", content: "system" },
            { role: "user", content: "user" },
          ],
          max_tokens: 100,
        }),
      })
    );
  });

  it("uses max_completion_tokens for reasoning models", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "mock reasoning response" } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new OpenAIProvider(
      "openai",
      "test-key",
      "o1-mini",
      500,
      "https://api.openai.com"
    );
    await provider.compress("system", "user");

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_completion_tokens).toBe(500);
    expect(body.max_tokens).toBeUndefined();
  });
});

describe("OpenAIEmbeddingProvider implementation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls fetch with correct parameters and appends /v1/embeddings", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new OpenAIEmbeddingProvider(
      null,
      "http://local-runner:11434",
      "nomic-embed-text"
    );
    const result = await provider.embed("test text");

    expect(result).toBeInstanceOf(Float32Array);
    const resultArr = Array.from(result);
    expect(resultArr[0]).toBeCloseTo(0.1);
    expect(resultArr[1]).toBeCloseTo(0.2);
    expect(resultArr[2]).toBeCloseTo(0.3);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://local-runner:11434/v1/embeddings",
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
