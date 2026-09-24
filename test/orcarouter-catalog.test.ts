import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];

let sandboxHome: string;

beforeEach(() => {
  sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-orca-cat-"));
  process.env["HOME"] = sandboxHome;
  process.env["USERPROFILE"] = sandboxHome;
  for (const k of [
    "ORCA_BASE_URL",
    "ORCA_AUTH_BASE_URL",
    "ORCA_API_BASE_URL",
    "ORCAROUTER_API_KEY",
  ]) {
    delete process.env[k];
  }
  vi.resetModules();
});

afterEach(() => {
  process.env["HOME"] = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
  else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
  rmSync(sandboxHome, { recursive: true, force: true });
});

/**
 * A fixture covering every shape the real catalog is known to contain:
 * text-only chat, image-input chat, embedding, image generation, video, and
 * rerank — plus a record with no capability metadata at all, which must fail
 * closed rather than be guessed at from its name.
 */
const FIXTURE = {
  data: [
    {
      id: "openai/gpt-5.5",
      name: "GPT-5.5",
      context_length: 400000,
      max_output_tokens: 128000,
      supported_endpoint_types: ["openai", "openai-response"],
      supported_parameters: [{ name: "reasoning_effort" }],
      reasoning_efforts: ["low", "medium", "high", "xhigh"],
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
      },
    },
    {
      id: "deepseek/deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      context_length: 160000,
      supported_endpoint_types: ["openai"],
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    },
    {
      id: "anthropic/claude-opus-4.8",
      name: "Claude Opus 4.8",
      context_length: 200000,
      supported_endpoint_types: ["anthropic", "openai"],
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
      },
    },
    {
      // Chat in name and endpoint type, but no declared input modalities:
      // must NOT appear in the multimodal list.
      id: "vendor/undeclared-vision",
      name: "Undeclared Vision",
      supported_endpoint_types: ["openai"],
      architecture: { output_modalities: ["text"] },
    },
    {
      id: "openai/text-embedding-3-small",
      supported_endpoint_types: ["embeddings"],
      architecture: { input_modalities: ["text"], output_modalities: ["embedding"] },
    },
    {
      id: "openai/dall-e-4",
      supported_endpoint_types: ["image-generation"],
      architecture: { input_modalities: ["text"], output_modalities: ["image"] },
    },
    {
      id: "openai/sora-3",
      supported_endpoint_types: ["openai-video"],
      architecture: { input_modalities: ["text"], output_modalities: ["video"] },
    },
    {
      id: "jina/jina-reranker-v3",
      supported_endpoint_types: ["jina-rerank"],
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    },
    {
      // No endpoint types and no architecture at all: fail closed everywhere.
      id: "mystery/model",
      name: "Mystery Model",
    },
    { id: "", name: "no id" },
    null,
  ],
};

describe("catalog parsing and capability filters", () => {
  it("parses records, keeps vendor/model ids verbatim, and skips malformed entries", async () => {
    const { parseCatalog } = await import("../src/orcarouter/catalog.js");
    const models = parseCatalog(FIXTURE);
    expect(models.map((m) => m.id)).toEqual([
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
      "anthropic/claude-opus-4.8",
      "vendor/undeclared-vision",
      "openai/text-embedding-3-small",
      "openai/dall-e-4",
      "openai/sora-3",
      "jina/jina-reranker-v3",
      "mystery/model",
    ]);
    // The namespace survives untouched.
    expect(models[0]!.id).toBe("openai/gpt-5.5");
    expect(models[0]!.contextWindow).toBe(400000);
    expect(models[0]!.maxOutputTokens).toBe(128000);
  });

  it("preserves the GPT-5.5 reasoning ladder instead of dropping metadata", async () => {
    const { parseCatalog } = await import("../src/orcarouter/catalog.js");
    const gpt = parseCatalog(FIXTURE).find((m) => m.id === "openai/gpt-5.5")!;
    expect(gpt.reasoningEfforts).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("accepts a bare array body as well as { data: [...] }", async () => {
    const { parseCatalog } = await import("../src/orcarouter/catalog.js");
    expect(parseCatalog(FIXTURE.data).length).toBe(9);
    expect(parseCatalog({}).length).toBe(0);
    expect(parseCatalog(null).length).toBe(0);
  });

  it("chat filter keeps text chat and multimodal chat, drops every other modality", async () => {
    const { parseCatalog, filterModels } = await import(
      "../src/orcarouter/catalog.js"
    );
    const ids = filterModels(parseCatalog(FIXTURE), "chat").map((m) => m.id);

    expect(ids).toContain("openai/gpt-5.5");
    expect(ids).toContain("deepseek/deepseek-v4-pro");
    expect(ids).toContain("anthropic/claude-opus-4.8");
    expect(ids).toContain("vendor/undeclared-vision");

    // Dedicated non-chat models are excluded even though they are chat-shaped
    // by name.
    expect(ids).not.toContain("openai/text-embedding-3-small");
    expect(ids).not.toContain("openai/dall-e-4");
    expect(ids).not.toContain("openai/sora-3");
    expect(ids).not.toContain("jina/jina-reranker-v3");
    // Nothing declared at all -> not offered.
    expect(ids).not.toContain("mystery/model");
  });

  it("multimodal filter is fail-closed on undeclared input modalities", async () => {
    const { parseCatalog, filterModels, supportsInput } = await import(
      "../src/orcarouter/catalog.js"
    );
    const models = parseCatalog(FIXTURE);
    const ids = filterModels(models, "multimodal", "image").map((m) => m.id);

    expect(ids).toEqual(["openai/gpt-5.5", "anthropic/claude-opus-4.8"]);
    // A model named "vision" with no declared image input is excluded.
    expect(ids).not.toContain("vendor/undeclared-vision");
    expect(ids).not.toContain("mystery/model");

    const undeclared = models.find((m) => m.id === "vendor/undeclared-vision")!;
    expect(supportsInput(undeclared, "image")).toBe(false);
  });

  it("narrows by the requested modality, not just by 'multimodal'", async () => {
    const { parseCatalog, filterModels } = await import(
      "../src/orcarouter/catalog.js"
    );
    const models = parseCatalog(FIXTURE);
    expect(filterModels(models, "multimodal", "image").length).toBe(2);
    // Nothing in the fixture declares audio input.
    expect(filterModels(models, "multimodal", "audio")).toEqual([]);
  });

  it("embedding, image, video and rerank filters match their endpoint types exactly", async () => {
    const { parseCatalog, filterModels } = await import(
      "../src/orcarouter/catalog.js"
    );
    const models = parseCatalog(FIXTURE);
    expect(filterModels(models, "embedding").map((m) => m.id)).toEqual([
      "openai/text-embedding-3-small",
    ]);
    expect(filterModels(models, "image").map((m) => m.id)).toEqual([
      "openai/dall-e-4",
    ]);
    expect(filterModels(models, "video").map((m) => m.id)).toEqual([
      "openai/sora-3",
    ]);
    expect(filterModels(models, "rerank").map((m) => m.id)).toEqual([
      "jina/jina-reranker-v3",
    ]);
  });

  it("never infers a capability from a model's name", async () => {
    const { parseCatalog, isChatModel } = await import(
      "../src/orcarouter/catalog.js"
    );
    const mystery = parseCatalog([
      { id: "openai/sora-9-chat", name: "Definitely A Chat Model" },
    ])[0]!;
    expect(isChatModel(mystery)).toBe(false);
  });
});

describe("live discovery", () => {
  function fakeResponse(body: unknown, init?: { status?: number }): Response {
    return new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("requests the API origin's /v1/models with the user's Bearer key", async () => {
    const { fetchModelCatalog } = await import("../src/orcarouter/catalog.js");
    let seenUrl = "";
    let seenAuth: string | null = null;

    const catalog = await fetchModelCatalog({
      origins: {
        authBaseUrl: "https://www.orcarouter.ai",
        apiBaseUrl: "https://api.orcarouter.ai",
      },
      apiKey: "sk-orca-testkey123456",
      fetchImpl: async (url, init) => {
        seenUrl = String(url);
        seenAuth = new Headers(init?.headers).get("Authorization");
        return fakeResponse(FIXTURE);
      },
    });

    expect(seenUrl).toBe("https://api.orcarouter.ai/v1/models");
    expect(seenUrl).not.toContain("www.orcarouter.ai");
    expect(seenAuth).toBe("Bearer sk-orca-testkey123456");
    expect(catalog.source).toBe("live");
    expect(catalog.degraded).toBe(false);
    expect(catalog.models.length).toBe(9);
  });

  it("treats a live result as authoritative and does not merge the seed into it", async () => {
    const { fetchModelCatalog, VERIFIED_SEED_MODELS } = await import(
      "../src/orcarouter/catalog.js"
    );
    const catalog = await fetchModelCatalog({
      origins: { authBaseUrl: "https://www.orcarouter.ai", apiBaseUrl: "https://api.orcarouter.ai" },
      apiKey: "sk-orca-testkey123456",
      fetchImpl: async () => fakeResponse(FIXTURE),
    });

    // Exactly the live list: no seed entry that is absent from the catalog
    // leaks in, and nothing is marked verified.
    expect(catalog.models.some((m) => m.id === "orcarouter/auto")).toBe(false);
    expect(catalog.models.every((m) => m.source === "live")).toBe(true);
    expect(VERIFIED_SEED_MODELS.length).toBeGreaterThan(0);
  });

  it("degrades to the labelled verified seed on a transport failure", async () => {
    const { fetchModelCatalog } = await import("../src/orcarouter/catalog.js");
    const catalog = await fetchModelCatalog({
      origins: { authBaseUrl: "https://www.orcarouter.ai", apiBaseUrl: "https://api.orcarouter.ai" },
      apiKey: "sk-orca-testkey123456",
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    expect(catalog.degraded).toBe(true);
    expect(catalog.source).toBe("seed");
    expect(catalog.degradedReason).toBeTruthy();
    expect(catalog.models.map((m) => m.id)).toEqual([
      "openai/gpt-5.5",
      "anthropic/claude-opus-4.8",
      "google/gemini-3.5-flash",
      "deepseek/deepseek-v4-pro",
      "orcarouter/auto",
    ]);
    // Seed entries are flagged so the UI cannot present them as live.
    expect(catalog.models.every((m) => m.verified === true)).toBe(true);
  });

  it("degrades on 401/403 with a reconnect hint, and on any other non-2xx", async () => {
    const { fetchModelCatalog } = await import("../src/orcarouter/catalog.js");
    const origins = {
      authBaseUrl: "https://www.orcarouter.ai",
      apiBaseUrl: "https://api.orcarouter.ai",
    };

    const unauthorized = await fetchModelCatalog({
      origins,
      apiKey: "sk-orca-testkey123456",
      fetchImpl: async () => fakeResponse({}, { status: 401 }),
    });
    expect(unauthorized.degraded).toBe(true);
    expect(unauthorized.degradedReason).toMatch(/reconnect/i);

    const serverError = await fetchModelCatalog({
      origins,
      apiKey: "sk-orca-testkey123456",
      fetchImpl: async () => fakeResponse({}, { status: 500 }),
    });
    expect(serverError.degraded).toBe(true);
    expect(serverError.degradedReason).toContain("500");
  });

  it("degrades rather than throwing when the body is unreadable or empty", async () => {
    const { fetchModelCatalog } = await import("../src/orcarouter/catalog.js");
    const origins = {
      authBaseUrl: "https://www.orcarouter.ai",
      apiBaseUrl: "https://api.orcarouter.ai",
    };

    const garbage = await fetchModelCatalog({
      origins,
      apiKey: "k",
      fetchImpl: async () =>
        new Response("<html>not json</html>", { status: 200 }),
    });
    expect(garbage.degraded).toBe(true);

    const empty = await fetchModelCatalog({
      origins,
      apiKey: "k",
      fetchImpl: async () => fakeResponse({ data: [] }),
    });
    expect(empty.degraded).toBe(true);
  });

  it("prefers last-known-good over the seed, and keeps its real ids", async () => {
    const { fetchModelCatalog, parseCatalog } = await import(
      "../src/orcarouter/catalog.js"
    );
    const lastKnownGood = {
      models: parseCatalog(FIXTURE),
      source: "live" as const,
      degraded: false,
      fetchedAt: 1700000000000,
    };

    const catalog = await fetchModelCatalog({
      origins: { authBaseUrl: "https://www.orcarouter.ai", apiBaseUrl: "https://api.orcarouter.ai" },
      apiKey: "k",
      fetchImpl: async () => {
        throw new Error("offline");
      },
      lastKnownGood,
    });

    expect(catalog.source).toBe("last-known-good");
    expect(catalog.degraded).toBe(true);
    expect(catalog.models.map((m) => m.id)).toContain("openai/gpt-5.5");
    expect(catalog.models.map((m) => m.id)).toContain("jina/jina-reranker-v3");
    expect(catalog.fetchedAt).toBe(1700000000000);
  });

  it("bounds the number of records it will consider", async () => {
    const { parseCatalog, CATALOG_MAX_ITEMS } = await import(
      "../src/orcarouter/catalog.js"
    );
    const huge = {
      data: Array.from({ length: CATALOG_MAX_ITEMS + 500 }, (_, i) => ({
        id: `vendor/model-${i}`,
        supported_endpoint_types: ["openai"],
        architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      })),
    };
    expect(parseCatalog(huge).length).toBe(CATALOG_MAX_ITEMS);
  });
});

describe("catalog cache", () => {
  it("serves a warm cached catalog without refetching", async () => {
    const { getCatalog, __resetCatalogCache } = await import(
      "../src/orcarouter/catalog-cache.js"
    );
    __resetCatalogCache();
    let calls = 0;
    const opts = {
      origins: { authBaseUrl: "https://www.orcarouter.ai", apiBaseUrl: "https://api.orcarouter.ai" },
      apiKey: "sk-orca-testkey123456",
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify(FIXTURE), { status: 200 });
      },
      now: 1_000_000,
    };

    const first = await getCatalog(false, opts);
    const second = await getCatalog(false, { ...opts, now: 1_000_000 + 1000 });
    expect(first.source).toBe("live");
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it("refetches once the TTL expires", async () => {
    const { getCatalog, __resetCatalogCache, CATALOG_TTL_MS } = await import(
      "../src/orcarouter/catalog-cache.js"
    );
    __resetCatalogCache();
    let calls = 0;
    const opts = {
      origins: { authBaseUrl: "https://www.orcarouter.ai", apiBaseUrl: "https://api.orcarouter.ai" },
      apiKey: "sk-orca-testkey123456",
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify(FIXTURE), { status: 200 });
      },
      now: 2_000_000,
    };
    await getCatalog(false, opts);
    await getCatalog(false, { ...opts, now: 2_000_000 + CATALOG_TTL_MS + 1 });
    expect(calls).toBe(2);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    const { getCatalog, __resetCatalogCache } = await import(
      "../src/orcarouter/catalog-cache.js"
    );
    __resetCatalogCache();
    let calls = 0;
    const opts = {
      origins: { authBaseUrl: "https://www.orcarouter.ai", apiBaseUrl: "https://api.orcarouter.ai" },
      apiKey: "sk-orca-testkey123456",
      fetchImpl: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return new Response(JSON.stringify(FIXTURE), { status: 200 });
      },
    };
    const [a, b, c] = await Promise.all([
      getCatalog(false, opts),
      getCatalog(false, opts),
      getCatalog(false, opts),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("resolves a capability string and rejects unsupported ones", async () => {
    const { asCapability, supportedCapabilities } = await import(
      "../src/orcarouter/catalog-cache.js"
    );
    expect(asCapability("chat")).toBe("chat");
    expect(asCapability("  MULTIMODAL ")).toBe("multimodal");
    expect(asCapability("embedding")).toBe("embedding");
    expect(asCapability("telepathy")).toBeNull();
    expect(asCapability("")).toBeNull();
    expect(supportedCapabilities()).toContain("rerank");
  });
});
