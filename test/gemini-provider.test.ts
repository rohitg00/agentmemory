import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../src/providers/gemini.js";
import { GeminiEmbeddingProvider } from "../src/providers/embedding/gemini.js";

const originalBaseUrl = process.env["GEMINI_BASE_URL"];

function chatResponse(): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: "result" } }] }),
    { status: 200 },
  );
}

function embeddingResponse(): Response {
  return new Response(
    JSON.stringify({ embeddings: [{ values: [0.1, 0.2] }] }),
    { status: 200 },
  );
}

describe("GeminiProvider base URL", () => {
  beforeEach(() => {
    delete process.env["GEMINI_BASE_URL"];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(chatResponse());
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env["GEMINI_BASE_URL"];
    } else {
      process.env["GEMINI_BASE_URL"] = originalBaseUrl;
    }
    vi.restoreAllMocks();
  });

  it("uses the default base URL for chat and embeddings", async () => {
    await new GeminiProvider("key", "model", 100).compress("system", "user");
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      expect.objectContaining({
        headers: expect.not.objectContaining({ "HTTP-Referer": expect.anything() }),
      }),
    );

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(embeddingResponse());
    await new GeminiEmbeddingProvider("key").embed("text");
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=key",
      expect.any(Object),
    );
  });

  it("uses GEMINI_BASE_URL for chat and embeddings", async () => {
    process.env["GEMINI_BASE_URL"] = "https://gemini-proxy.example/v1beta/";

    await new GeminiProvider("key", "model", 100).compress("system", "user");
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://gemini-proxy.example/v1beta/openai/chat/completions",
      expect.any(Object),
    );

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(embeddingResponse());
    await new GeminiEmbeddingProvider("key").embed("text");
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      "https://gemini-proxy.example/v1beta/models/gemini-embedding-001:batchEmbedContents?key=key",
      expect.any(Object),
    );
  });
});
