import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { createProvider } from "../src/providers/index.js";
import { createEmbeddingProvider } from "../src/providers/embedding/index.js";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe("independent LLM and embedding configuration", () => {
  it("loads the compression override and defaults it to the primary model", () => {
    process.env.OPENAI_API_KEY = "primary-key";
    process.env.OPENAI_MODEL = "gpt-5.6-terra";
    process.env.AGENTMEMORY_COMPRESSION_MODEL = "gpt-5.6-luna";
    expect(loadConfig().compressionModel).toBe("gpt-5.6-luna");

    delete process.env.AGENTMEMORY_COMPRESSION_MODEL;
    expect(loadConfig().compressionModel).toBe("gpt-5.6-terra");
  });

  it("sends Terra and Luna through the custom OpenAI endpoint with medium reasoning", async () => {
    process.env.OPENAI_API_KEY = "custom-openai-key";
    process.env.OPENAI_REASONING_EFFORT = "medium";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      ),
    );

    const primary = createProvider({
      provider: "openai",
      model: "gpt-5.6-terra",
      maxTokens: 256,
      baseURL: "https://llm.example/v1",
    });
    const compression = createProvider({
      provider: "openai",
      model: "gpt-5.6-luna",
      maxTokens: 256,
      baseURL: "https://llm.example/v1",
    });
    await primary.compress("system", "analysis");
    await compression.compress("system", "observation");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map((call) => ({
      url: call[0],
      init: call[1] as RequestInit,
    }));
    expect(requests[0].url).toBe("https://llm.example/v1/chat/completions");
    expect(requests[1].url).toBe("https://llm.example/v1/chat/completions");
    for (const request of requests) {
      expect((request.init.headers as Record<string, string>).Authorization).toBe(
        "Bearer custom-openai-key",
      );
      const body = JSON.parse(request.init.body as string);
      expect(body.reasoning_effort).toBe("medium");
    }
    expect(JSON.parse(requests[0].init.body as string).model).toBe("gpt-5.6-terra");
    expect(JSON.parse(requests[1].init.body as string).model).toBe("gpt-5.6-luna");
  });

  it("forces OpenRouter embeddings with its separate key and endpoint", async () => {
    process.env.OPENAI_API_KEY = "primary-key";
    process.env.OPENROUTER_API_KEY = "embedding-key";
    process.env.EMBEDDING_PROVIDER = "openrouter";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: Array(1536).fill(0.1) }] }), {
        status: 200,
      }),
    );

    const provider = createEmbeddingProvider();
    expect(provider?.name).toBe("openrouter");
    await provider!.embed("hello");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/embeddings",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer embedding-key" }),
        body: expect.stringContaining('"model":"openai/text-embedding-3-small"'),
      }),
    );
  });
});
