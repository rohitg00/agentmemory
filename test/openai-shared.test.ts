import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildAuthHeaders,
  buildChatUrl,
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

describe("_openai-shared — buildChatUrl", () => {
  it("appends /v1/chat/completions for standard OpenAI", () => {
    expect(buildChatUrl("https://api.openai.com", false, "2024-08-01-preview")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("appends /chat/completions + api-version for Azure", () => {
    const url = buildChatUrl(
      "https://myresource.openai.azure.com/openai/deployments/mydeploy",
      true,
      "2024-08-01-preview",
    );
    expect(url).toBe(
      "https://myresource.openai.azure.com/openai/deployments/mydeploy/chat/completions?api-version=2024-08-01-preview",
    );
  });

  it("URL-encodes the api-version", () => {
    const url = buildChatUrl(
      "https://r.openai.azure.com/openai/deployments/d",
      true,
      "preview/with/slashes",
    );
    expect(url).toContain("api-version=preview%2Fwith%2Fslashes");
  });

  it("preserves pre-existing query params on the base URL (CodeRabbit catch)", () => {
    // A corporate proxy or diagnostics endpoint might already carry
    // query parameters on the base URL. String-concat would have
    // interpolated the route path into the query string; URL-API
    // composition keeps the query intact and adds api-version
    // alongside.
    const url = buildChatUrl(
      "https://proxy.example.com/openai/deployments/d?tenant=acme",
      true,
      "2024-08-01-preview",
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/openai/deployments/d/chat/completions");
    expect(parsed.searchParams.get("tenant")).toBe("acme");
    expect(parsed.searchParams.get("api-version")).toBe("2024-08-01-preview");
  });

  it("strips trailing slashes from base path before joining route", () => {
    const url = buildChatUrl(
      "https://r.openai.azure.com/openai/deployments/d/",
      true,
      "2024-08-01-preview",
    );
    expect(new URL(url).pathname).toBe("/openai/deployments/d/chat/completions");
  });

  it("routes through /openai/v1 when the base URL has no /deployments/ segment (Azure v1 GA)", () => {
    // Azure shipped a v1 URL pattern that mirrors the OpenAI shape:
    // /openai/v1/chat/completions, deployment passed in the body as
    // `model`. No api-version query param.
    const url = buildChatUrl(
      "https://r.openai.azure.com",
      true,
      "2024-08-01-preview", // ignored on v1
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/openai/v1/chat/completions");
    expect(parsed.searchParams.get("api-version")).toBeNull();
  });

  it("strips a trailing /openai or /openai/v1 prefix when composing v1 URLs", () => {
    // Users may pre-configure OPENAI_BASE_URL with the /openai/v1
    // suffix already present. We should not double it.
    const fromOpenai = buildChatUrl(
      "https://r.openai.azure.com/openai",
      true,
      "ignored",
    );
    expect(new URL(fromOpenai).pathname).toBe("/openai/v1/chat/completions");

    const fromV1 = buildChatUrl(
      "https://r.openai.azure.com/openai/v1",
      true,
      "ignored",
    );
    expect(new URL(fromV1).pathname).toBe("/openai/v1/chat/completions");
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

// ─────────────────────────────────────────────────────────────
// OpenAIEmbeddingProvider — Azure transport (#371)
// Verifies the embedding path now uses the shared Azure helpers:
// hits /embeddings (not /v1/embeddings), includes api-version, uses
// api-key header instead of Authorization: Bearer.
// ─────────────────────────────────────────────────────────────
describe("OpenAIEmbeddingProvider — Azure auto-detection (#371)", () => {
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
