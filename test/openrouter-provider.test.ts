import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "../src/providers/openrouter.js";
import { OpenRouterEmbeddingProvider } from "../src/providers/embedding/openrouter.js";

const originalBaseUrl = process.env["OPENROUTER_BASE_URL"];

function chatResponse(): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: "result" } }] }),
    { status: 200 },
  );
}

function embeddingResponse(): Response {
  return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
    status: 200,
  });
}

describe("OpenRouterProvider base URL", () => {
  beforeEach(() => {
    delete process.env["OPENROUTER_BASE_URL"];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(chatResponse());
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env["OPENROUTER_BASE_URL"];
    } else {
      process.env["OPENROUTER_BASE_URL"] = originalBaseUrl;
    }
    vi.restoreAllMocks();
  });

  it("uses the default base URL for chat and embeddings", async () => {
    await new OpenRouterProvider("key", "model", 100).compress("system", "user");
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "HTTP-Referer": "https://github.com/rohitg00/agentmemory",
        }),
      }),
    );

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(embeddingResponse());
    await new OpenRouterEmbeddingProvider("key").embed("text");
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://openrouter.ai/api/v1/embeddings",
      expect.any(Object),
    );
  });

  it("uses OPENROUTER_BASE_URL for chat and embeddings", async () => {
    process.env["OPENROUTER_BASE_URL"] = "https://openrouter-proxy.example/v1/";

    await new OpenRouterProvider("key", "model", 100).compress("system", "user");
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://openrouter-proxy.example/v1/chat/completions",
      expect.any(Object),
    );

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(embeddingResponse());
    await new OpenRouterEmbeddingProvider("key").embed("text");
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://openrouter-proxy.example/v1/embeddings",
      expect.any(Object),
    );
  });
});
