import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbeddingProvider } from "../src/types.js";

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "VOYAGE_API_KEY",
  "COHERE_API_KEY",
  "OPENROUTER_API_KEY",
  "EMBEDDING_PROVIDER",
  "OPENAI_BASE_URL",
  "OPENAI_EMBEDDING_BASE_URL",
  "OPENAI_EMBEDDING_API_KEY",
  "OPENAI_EMBEDDING_MODEL",
  "OPENAI_EMBEDDING_DIMENSIONS",
  "OPENROUTER_EMBEDDING_MODEL",
  "OPENROUTER_EMBEDDING_DIMENSIONS",
];

const originalEnv = { ...process.env };
let sandboxHome: string;

async function freshEmbeddingModule() {
  vi.resetModules();
  return await import("../src/providers/embedding/index.js");
}

beforeEach(() => {
  sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-embeddings-"));
  process.env = { ...originalEnv };
  process.env["HOME"] = sandboxHome;
  process.env["USERPROFILE"] = sandboxHome;
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  process.env = { ...originalEnv };
  rmSync(sandboxHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("createEmbeddingProvider", () => {
  it("returns null when no API keys are set", async () => {
    const { createEmbeddingProvider } = await freshEmbeddingModule();
    const provider = createEmbeddingProvider();
    expect(provider).toBeNull();
  });

  it("does not auto-enable remote embeddings from general provider keys", async () => {
    const { createEmbeddingProvider } = await freshEmbeddingModule();
    for (const key of [
      "GEMINI_API_KEY",
      "OPENAI_API_KEY",
      "VOYAGE_API_KEY",
      "COHERE_API_KEY",
      "OPENROUTER_API_KEY",
    ]) {
      process.env[key] = "test-key";
      expect(createEmbeddingProvider()).toBeNull();
      delete process.env[key];
    }
  });

  it("returns LocalEmbeddingProvider when EMBEDDING_PROVIDER=local", async () => {
    const {
      createEmbeddingProvider,
      LocalEmbeddingProvider,
    } = await freshEmbeddingModule();
    process.env["OPENAI_API_KEY"] = "test-key-456";
    process.env["EMBEDDING_PROVIDER"] = "local";
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
    expect(provider!.name).toBe("local");
  });

  it("requires EMBEDDING_PROVIDER to select remote embeddings", async () => {
    const {
      createEmbeddingProvider,
      GeminiEmbeddingProvider,
      OpenAIEmbeddingProvider,
      VoyageEmbeddingProvider,
      CohereEmbeddingProvider,
      OpenRouterEmbeddingProvider,
    } = await freshEmbeddingModule();
    const cases: Array<{
      provider: string;
      key: string;
      expected: new (apiKey?: string) => EmbeddingProvider;
      name: string;
    }> = [
      {
        provider: "gemini",
        key: "GEMINI_API_KEY",
        expected: GeminiEmbeddingProvider,
        name: "gemini",
      },
      {
        provider: "openai",
        key: "OPENAI_API_KEY",
        expected: OpenAIEmbeddingProvider,
        name: "openai",
      },
      {
        provider: "voyage",
        key: "VOYAGE_API_KEY",
        expected: VoyageEmbeddingProvider,
        name: "voyage",
      },
      {
        provider: "cohere",
        key: "COHERE_API_KEY",
        expected: CohereEmbeddingProvider,
        name: "cohere",
      },
      {
        provider: "openrouter",
        key: "OPENROUTER_API_KEY",
        expected: OpenRouterEmbeddingProvider,
        name: "openrouter",
      },
    ];

    for (const entry of cases) {
      process.env["EMBEDDING_PROVIDER"] = entry.provider;
      process.env[entry.key] = "test-key";

      const provider = createEmbeddingProvider();

      expect(provider).toBeInstanceOf(entry.expected);
      expect(provider!.name).toBe(entry.name);
      delete process.env["EMBEDDING_PROVIDER"];
      delete process.env[entry.key];
    }
  });

  it("normalizes explicit provider values", async () => {
    const {
      createEmbeddingProvider,
      OpenAIEmbeddingProvider,
    } = await freshEmbeddingModule();
    process.env["EMBEDDING_PROVIDER"] = " OpenAI ";
    process.env["OPENAI_API_KEY"] = "test-key";

    const provider = createEmbeddingProvider();

    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
    expect(provider!.name).toBe("openai");
  });

  it("returns null for blank or unknown EMBEDDING_PROVIDER values", async () => {
    const { createEmbeddingProvider } = await freshEmbeddingModule();

    for (const value of [" ", "bogus"]) {
      process.env["EMBEDDING_PROVIDER"] = value;
      process.env["OPENAI_API_KEY"] = "test-key";
      expect(createEmbeddingProvider()).toBeNull();
    }
  });
});

describe("detectEmbeddingProvider", () => {
  it("normalizes supported values and rejects unknown values for status paths", async () => {
    vi.resetModules();
    const { detectEmbeddingProvider } = await import("../src/config.js");

    expect(detectEmbeddingProvider({ EMBEDDING_PROVIDER: " OpenAI " })).toBe(
      "openai",
    );
    expect(detectEmbeddingProvider({ EMBEDDING_PROVIDER: "bogus" })).toBeNull();
    expect(detectEmbeddingProvider({ EMBEDDING_PROVIDER: " " })).toBeNull();
  });
});

describe("OpenAIEmbeddingProvider", () => {
  it("uses default base URL and model when env vars are not set", async () => {
    const { OpenAIEmbeddingProvider } = await freshEmbeddingModule();
    const provider = new OpenAIEmbeddingProvider("test-key");
    expect(provider.name).toBe("openai");
    expect(provider.dimensions).toBe(1536);
  });

  it("throws when no API key is provided", async () => {
    const { OpenAIEmbeddingProvider } = await freshEmbeddingModule();
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_EMBEDDING_API_KEY"];
    expect(() => new OpenAIEmbeddingProvider()).toThrow(/API key is required.*OPENAI_EMBEDDING_API_KEY.*OPENAI_API_KEY/);
  });

  it("respects OPENAI_BASE_URL env var", async () => {
    const { OpenAIEmbeddingProvider } = await freshEmbeddingModule();
    process.env["OPENAI_BASE_URL"] = "https://my-proxy.example.com";
    const provider = new OpenAIEmbeddingProvider("test-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 }),
    );

    await provider.embed("hello");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://my-proxy.example.com/v1/embeddings",
      expect.any(Object),
    );
  });

  it("respects OPENAI_EMBEDDING_MODEL env var", async () => {
    const { OpenAIEmbeddingProvider } = await freshEmbeddingModule();
    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-large";
    const provider = new OpenAIEmbeddingProvider("test-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 }),
    );

    await provider.embed("hello");
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.model).toBe("text-embedding-3-large");
  });

  it("derives dimensions from model in the known-models table", async () => {
    const { OpenAIEmbeddingProvider } = await freshEmbeddingModule();
    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-large";
    const large = new OpenAIEmbeddingProvider("test-key");
    expect(large.dimensions).toBe(3072);

    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-ada-002";
    const ada = new OpenAIEmbeddingProvider("test-key");
    expect(ada.dimensions).toBe(1536);

    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-small";
    const small = new OpenAIEmbeddingProvider("test-key");
    expect(small.dimensions).toBe(1536);
  });

  it("OPENAI_EMBEDDING_DIMENSIONS overrides the model-derived dimensions", async () => {
    const { OpenAIEmbeddingProvider } = await freshEmbeddingModule();
    process.env["OPENAI_EMBEDDING_MODEL"] = "text-embedding-3-large";
    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "768";
    const provider = new OpenAIEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(768);
  });

  it("falls back to 1536 for unknown custom models", async () => {
    const { OpenAIEmbeddingProvider } = await freshEmbeddingModule();
    process.env["OPENAI_EMBEDDING_MODEL"] = "mystery-self-hosted-model";
    const provider = new OpenAIEmbeddingProvider("test-key");
    expect(provider.dimensions).toBe(1536);
  });

  it("rejects invalid OPENAI_EMBEDDING_DIMENSIONS values", async () => {
    const { OpenAIEmbeddingProvider } = await freshEmbeddingModule();
    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "not-a-number";
    expect(() => new OpenAIEmbeddingProvider("test-key")).toThrow(
      /OPENAI_EMBEDDING_DIMENSIONS must be a positive integer/,
    );

    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "-5";
    expect(() => new OpenAIEmbeddingProvider("test-key")).toThrow(
      /OPENAI_EMBEDDING_DIMENSIONS must be a positive integer/,
    );

    process.env["OPENAI_EMBEDDING_DIMENSIONS"] = "0";
    expect(() => new OpenAIEmbeddingProvider("test-key")).toThrow(
      /OPENAI_EMBEDDING_DIMENSIONS must be a positive integer/,
    );
  });
});

describe("OpenRouterEmbeddingProvider", () => {
  it("uses default dimensions when OPENROUTER_EMBEDDING_DIMENSIONS is unset", async () => {
    const { OpenRouterEmbeddingProvider } = await freshEmbeddingModule();
    const provider = new OpenRouterEmbeddingProvider("test-key");
    expect(provider.name).toBe("openrouter");
    expect(provider.dimensions).toBe(1536);
  });

  it("uses OPENROUTER_EMBEDDING_DIMENSIONS when configured", async () => {
    const { OpenRouterEmbeddingProvider } = await freshEmbeddingModule();
    process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = "1024";

    const provider = new OpenRouterEmbeddingProvider("test-key");

    expect(provider.dimensions).toBe(1024);
  });

  it("sends dimensions in the OpenRouter embeddings request body when configured", async () => {
    const { OpenRouterEmbeddingProvider } = await freshEmbeddingModule();
    process.env["OPENROUTER_EMBEDDING_MODEL"] = "perplexity/pplx-embed-v1-0.6b";
    process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = "1024";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200,
      }),
    );

    const provider = new OpenRouterEmbeddingProvider("test-key");
    await provider.embed("hello");

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({
      model: "perplexity/pplx-embed-v1-0.6b",
      input: ["hello"],
      dimensions: 1024,
    });
  });

  it("does not send dimensions when OPENROUTER_EMBEDDING_DIMENSIONS is unset or blank", async () => {
    const { OpenRouterEmbeddingProvider } = await freshEmbeddingModule();

    for (const value of [undefined, "   "]) {
      if (value === undefined) {
        delete process.env["OPENROUTER_EMBEDDING_DIMENSIONS"];
      } else {
        process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = value;
      }
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
          status: 200,
        }),
      );

      const provider = new OpenRouterEmbeddingProvider("test-key");
      await provider.embed("hello");

      const body = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(body).toEqual({
        model: "openai/text-embedding-3-small",
        input: ["hello"],
      });
      fetchSpy.mockRestore();
    }
  });

  it("rejects invalid OPENROUTER_EMBEDDING_DIMENSIONS values", async () => {
    const { OpenRouterEmbeddingProvider } = await freshEmbeddingModule();

    for (const value of ["not-a-number", "-5", "0", "1.5", "1e3"]) {
      process.env["OPENROUTER_EMBEDDING_DIMENSIONS"] = value;
      expect(() => new OpenRouterEmbeddingProvider("test-key")).toThrow(
        /OPENROUTER_EMBEDDING_DIMENSIONS must be a positive integer/,
      );
    }
  });
});

describe("withDimensionGuard", () => {
  function fakeProvider(opts: {
    dimensions: number;
    embed: () => Float32Array;
    batch?: () => Float32Array[];
    image?: () => Float32Array;
  }): EmbeddingProvider {
    const provider: EmbeddingProvider = {
      name: "fake",
      dimensions: opts.dimensions,
      embed: async () => opts.embed(),
      embedBatch: async () => opts.batch?.() ?? [opts.embed()],
    };
    if (opts.image) provider.embedImage = async () => opts.image!();
    return provider;
  }

  it("preserves the wrapped provider's prototype so instanceof keeps working", async () => {
    const { withDimensionGuard } = await freshEmbeddingModule();
    class FakeProvider implements EmbeddingProvider {
      readonly name = "fake-class";
      readonly dimensions = 4;
      async embed(): Promise<Float32Array> {
        return new Float32Array([1, 2, 3, 4]);
      }
      async embedBatch(): Promise<Float32Array[]> {
        return [new Float32Array([1, 2, 3, 4])];
      }
    }
    const guarded = withDimensionGuard(new FakeProvider());
    expect(guarded).toBeInstanceOf(FakeProvider);
    expect(guarded.name).toBe("fake-class");
    expect(guarded.dimensions).toBe(4);
  });

  it("passes through vectors that match the declared dimensions", async () => {
    const { withDimensionGuard } = await freshEmbeddingModule();
    const guarded = withDimensionGuard(
      fakeProvider({
        dimensions: 4,
        embed: () => new Float32Array([1, 2, 3, 4]),
        batch: () => [new Float32Array([1, 2, 3, 4]), new Float32Array([5, 6, 7, 8])],
      }),
    );
    await expect(guarded.embed("x")).resolves.toEqual(new Float32Array([1, 2, 3, 4]));
    await expect(guarded.embedBatch(["a", "b"])).resolves.toHaveLength(2);
  });

  it("throws when embed() returns the wrong dimension", async () => {
    const { withDimensionGuard } = await freshEmbeddingModule();
    const guarded = withDimensionGuard(
      fakeProvider({
        dimensions: 4,
        embed: () => new Float32Array([1, 2, 3]),
      }),
    );
    await expect(guarded.embed("x")).rejects.toThrow(
      /dimension mismatch in fake\.embed: expected 4, got 3/,
    );
  });

  it("throws when any vector in embedBatch() returns the wrong dimension", async () => {
    const { withDimensionGuard } = await freshEmbeddingModule();
    const guarded = withDimensionGuard(
      fakeProvider({
        dimensions: 4,
        embed: () => new Float32Array([1, 2, 3, 4]),
        batch: () => [new Float32Array([1, 2, 3, 4]), new Float32Array([1, 2])],
      }),
    );
    await expect(guarded.embedBatch(["a", "b"])).rejects.toThrow(
      /dimension mismatch in fake\.embedBatch\[1\]: expected 4, got 2/,
    );
  });

  it("guards embedImage when present and omits it when absent", async () => {
    const { withDimensionGuard } = await freshEmbeddingModule();
    const withImage = withDimensionGuard(
      fakeProvider({
        dimensions: 4,
        embed: () => new Float32Array([1, 2, 3, 4]),
        image: () => new Float32Array([1, 2]),
      }),
    );
    expect(withImage.embedImage).toBeDefined();
    await expect(withImage.embedImage!("/tmp/x")).rejects.toThrow(
      /dimension mismatch in fake\.embedImage: expected 4, got 2/,
    );

    const withoutImage = withDimensionGuard(
      fakeProvider({
        dimensions: 4,
        embed: () => new Float32Array([1, 2, 3, 4]),
      }),
    );
    expect(withoutImage.embedImage).toBeUndefined();
  });
});
