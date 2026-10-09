import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildAuthHeaders,
  buildEmbeddingUrl,
  detectAzure,
  normalizeBaseUrl,
} from "../src/providers/_openai-shared.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";

describe("_openai-shared — detectAzure", () => {
  it("detects standard Azure resource hostname", () => {
    expect(
      detectAzure(
        "https://myresource.openai.azure.com/openai/deployments/mydeploy",
      ),
    ).toBe(true);
  });

  it("does not flag api.openai.com", () => {
    expect(detectAzure("https://api.openai.com")).toBe(false);
  });

  it("does not flag DeepSeek / SiliconFlow / Ollama / vLLM", () => {
    expect(detectAzure("https://api.deepseek.com/v1")).toBe(false);
    expect(detectAzure("https://api.siliconflow.cn")).toBe(false);
    expect(detectAzure("http://localhost:11434/v1")).toBe(false);
    expect(detectAzure("http://localhost:8000/v1")).toBe(false);
  });

  it("returns false for malformed URLs", () => {
    expect(detectAzure("not-a-url")).toBe(false);
    expect(detectAzure("")).toBe(false);
  });
});

describe("_openai-shared — buildEmbeddingUrl", () => {
  it("appends /v1/embeddings for standard OpenAI", () => {
    expect(
      buildEmbeddingUrl("https://api.openai.com", false, "2024-08-01-preview"),
    ).toBe("https://api.openai.com/v1/embeddings");
  });

  it("appends /embeddings + api-version for Azure legacy (no /v1/ prefix)", () => {
    const url = buildEmbeddingUrl(
      "https://r.openai.azure.com/openai/deployments/embed-deploy",
      true,
      "2024-08-01-preview",
    );
    expect(url).toBe(
      "https://r.openai.azure.com/openai/deployments/embed-deploy/embeddings?api-version=2024-08-01-preview",
    );
  });

  it("routes through /openai/v1/embeddings on Azure v1 (no api-version)", () => {
    const url = buildEmbeddingUrl(
      "https://r.openai.azure.com",
      true,
      "2024-08-01-preview", // ignored on v1
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/openai/v1/embeddings");
    expect(parsed.searchParams.get("api-version")).toBeNull();
  });
});

describe("_openai-shared — non-OpenAI base URLs", () => {
  it("does not double /v1 when base URL already ends with /v1 (DeepSeek shape)", () => {
    expect(
      buildEmbeddingUrl("https://api.deepseek.com/v1", false, "2024-08-01-preview"),
    ).toBe("https://api.deepseek.com/v1/embeddings");
  });

  it("does not inject /v1 when provider uses non-OpenAI version segment (Zhipu /api/paas/v4)", () => {
    expect(
      buildEmbeddingUrl(
        "https://open.bigmodel.cn/api/paas/v4",
        false,
        "2024-08-01-preview",
      ),
    ).toBe("https://open.bigmodel.cn/api/paas/v4/embeddings");
  });

});

describe("_openai-shared — buildAuthHeaders", () => {
  it("emits Authorization: Bearer for standard OpenAI", () => {
    expect(buildAuthHeaders("sk-test", false)).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-test",
    });
  });

  it("emits api-key header for Azure", () => {
    expect(buildAuthHeaders("azure-key", true)).toEqual({
      "Content-Type": "application/json",
      "api-key": "azure-key",
    });
  });
});

describe("_openai-shared — normalizeBaseUrl", () => {
  it("returns default when no value passed", () => {
    expect(normalizeBaseUrl(undefined)).toBe("https://api.openai.com");
    expect(normalizeBaseUrl("")).toBe("https://api.openai.com");
  });

  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://api.deepseek.com/v1///")).toBe(
      "https://api.deepseek.com/v1",
    );
  });

  it("returns explicit values unchanged otherwise", () => {
    expect(normalizeBaseUrl("https://api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1",
    );
  });
});

describe("OpenAIEmbeddingProvider — Azure auto-detection", () => {
  const ORIGINAL_BASE = process.env["OPENAI_BASE_URL"];
  const ORIGINAL_VERSION = process.env["OPENAI_API_VERSION"];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL_BASE === undefined) delete process.env["OPENAI_BASE_URL"];
    else process.env["OPENAI_BASE_URL"] = ORIGINAL_BASE;
    if (ORIGINAL_VERSION === undefined) delete process.env["OPENAI_API_VERSION"];
    else process.env["OPENAI_API_VERSION"] = ORIGINAL_VERSION;
    vi.restoreAllMocks();
  });

  it("uses Azure shape when OPENAI_BASE_URL points at *.openai.azure.com", async () => {
    process.env["OPENAI_BASE_URL"] =
      "https://myres.openai.azure.com/openai/deployments/embed-d";
    process.env["OPENAI_API_VERSION"] = "2024-08-01-preview";

    let capturedUrl = "";
    let capturedHeaders = new Headers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
          { status: 200 },
        );
      },
    );

    const provider = new OpenAIEmbeddingProvider("azure-key");
    await provider.embedBatch(["hello"]);

    expect(capturedUrl).toBe(
      "https://myres.openai.azure.com/openai/deployments/embed-d/embeddings?api-version=2024-08-01-preview",
    );
    expect(capturedHeaders.get("api-key")).toBe("azure-key");
    expect(capturedHeaders.get("Authorization")).toBeNull();
  });

  it("uses standard shape when OPENAI_BASE_URL points at api.openai.com", async () => {
    process.env["OPENAI_BASE_URL"] = "https://api.openai.com";

    let capturedUrl = "";
    let capturedHeaders = new Headers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({ data: [{ embedding: [0.4, 0.5, 0.6] }] }),
          { status: 200 },
        );
      },
    );

    const provider = new OpenAIEmbeddingProvider("sk-test");
    await provider.embedBatch(["hello"]);

    expect(capturedUrl).toBe("https://api.openai.com/v1/embeddings");
    expect(capturedHeaders.get("Authorization")).toBe("Bearer sk-test");
    expect(capturedHeaders.get("api-key")).toBeNull();
  });
});
