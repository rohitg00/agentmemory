import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../src/providers/openai.js";

describe("OpenAIProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["AZURE_OPENAI_API_VERSION"];
    delete process.env["OPENAI_BASE_URL"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("uses OpenAI-compatible chat completions with bearer auth by default", async () => {
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-4o-mini",
      123,
      "https://api.example.com",
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      ),
    );

    await expect(provider.summarize("sys", "user")).resolves.toBe("ok");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
        },
      }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-4o-mini",
      max_tokens: 123,
    });
  });

  it("uses Azure deployment URLs with api-version and api-key auth", async () => {
    process.env["AZURE_OPENAI_API_VERSION"] = "2024-10-21";
    const provider = new OpenAIProvider(
      "azure-key",
      "ignored-deployment-model",
      456,
      "https://resource.openai.azure.com/openai/deployments/my-deployment",
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "azure ok" } }] }),
        { status: 200 },
      ),
    );

    await expect(provider.compress("sys", "user")).resolves.toBe("azure ok");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://resource.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2024-10-21",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": "azure-key",
        },
      }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("model");
    expect(body.max_tokens).toBe(456);
  });

  it("does not duplicate /v1 for non-Azure base URLs", async () => {
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-4o-mini",
      123,
      "https://api.example.com/v1",
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      ),
    );

    await provider.summarize("sys", "user");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("does not duplicate /chat/completions for full non-Azure endpoints", async () => {
    const provider = new OpenAIProvider(
      "test-key",
      "gpt-4o-mini",
      123,
      "https://api.example.com/v1/chat/completions",
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      ),
    );

    await provider.summarize("sys", "user");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("defaults Azure api-version to the latest GA data-plane version", async () => {
    const provider = new OpenAIProvider(
      "azure-key",
      "deployment",
      456,
      "https://gateway.example.com/openai/deployments/deployment",
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "azure ok" } }] }),
        { status: 200 },
      ),
    );

    await provider.summarize("sys", "user");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://gateway.example.com/openai/deployments/deployment/chat/completions?api-version=2024-10-21",
    );
  });
});
