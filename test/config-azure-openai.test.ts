import { afterEach, describe, expect, it, vi } from "vitest";

import { detectProviderForEnv } from "../src/config.js";
import { createProvider } from "../src/providers/index.js";

const ORIGINAL_OPENAI_KEY = process.env["OPENAI_API_KEY"];
const ORIGINAL_AZURE_KEY = process.env["AZURE_OPENAI_API_KEY"];
const ORIGINAL_OPENAI_BASE = process.env["OPENAI_BASE_URL"];

describe("Azure OpenAI config detection", () => {
  afterEach(() => {
    if (ORIGINAL_OPENAI_KEY === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = ORIGINAL_OPENAI_KEY;
    if (ORIGINAL_AZURE_KEY === undefined) delete process.env["AZURE_OPENAI_API_KEY"];
    else process.env["AZURE_OPENAI_API_KEY"] = ORIGINAL_AZURE_KEY;
    if (ORIGINAL_OPENAI_BASE === undefined) delete process.env["OPENAI_BASE_URL"];
    else process.env["OPENAI_BASE_URL"] = ORIGINAL_OPENAI_BASE;
    vi.restoreAllMocks();
  });

  it("uses Azure OpenAI endpoint and deployment as the OpenAI-compatible LLM provider", () => {
    const provider = detectProviderForEnv({
      AZURE_OPENAI_API_KEY: "azure-key",
      AZURE_OPENAI_ENDPOINT: "https://agentmemory.openai.azure.com/",
      AZURE_OPENAI_DEPLOYMENT: "gpt-5.4-mini",
    });

    expect(provider).toEqual({
      provider: "openai",
      model: "gpt-5.4-mini",
      maxTokens: 4096,
      baseURL: "https://agentmemory.openai.azure.com",
    });
  });

  it("supports a legacy Azure deployment base URL", () => {
    const provider = detectProviderForEnv({
      AZURE_OPENAI_API_KEY: "azure-key",
      AZURE_OPENAI_BASE_URL:
        "https://agentmemory.openai.azure.com/openai/deployments/gpt-5.4-nano",
    });

    expect(provider.provider).toBe("openai");
    expect(provider.model).toBe("gpt-5.4-nano");
    expect(provider.baseURL).toBe(
      "https://agentmemory.openai.azure.com/openai/deployments/gpt-5.4-nano",
    );
  });

  it("does not enable Azure OpenAI without a deployment", () => {
    const provider = detectProviderForEnv({
      AZURE_OPENAI_API_KEY: "azure-key",
      AZURE_OPENAI_ENDPOINT: "https://agentmemory.openai.azure.com",
    });

    expect(provider.provider).toBe("noop");
  });

  it("uses the Azure key for Azure requests even when OPENAI_API_KEY is also set", async () => {
    process.env["OPENAI_API_KEY"] = "public-openai-key";
    process.env["AZURE_OPENAI_API_KEY"] = "azure-openai-key";
    const config = detectProviderForEnv({
      OPENAI_API_KEY: "public-openai-key",
      AZURE_OPENAI_API_KEY: "azure-openai-key",
      AZURE_OPENAI_ENDPOINT: "https://agentmemory.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "gpt-5.4-mini",
    });
    let capturedHeaders = new Headers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "summary" } }] }),
          { status: 200 },
        );
      },
    );

    await createProvider(config).summarize("system", "user");

    expect(capturedHeaders.get("api-key")).toBe("azure-openai-key");
    expect(capturedHeaders.get("Authorization")).toBeNull();
  });

  it("uses the Azure key when OPENAI_BASE_URL points to Azure", async () => {
    process.env["OPENAI_API_KEY"] = "public-openai-key";
    process.env["AZURE_OPENAI_API_KEY"] = "azure-openai-key";
    process.env["OPENAI_BASE_URL"] = "https://agentmemory.openai.azure.com";
    let capturedHeaders = new Headers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "summary" } }] }),
          { status: 200 },
        );
      },
    );

    await createProvider({
      provider: "openai",
      model: "gpt-5.4-mini",
      maxTokens: 256,
    }).summarize("system", "user");

    expect(capturedHeaders.get("api-key")).toBe("azure-openai-key");
    expect(capturedHeaders.get("Authorization")).toBeNull();
  });
});
