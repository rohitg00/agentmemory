import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HttpRequest } from "@iii-dev/helpers/http";

type Handler = (req: HttpRequest) => Promise<{ status_code: number; body: unknown }>;

let createEmbeddingProvider: typeof import("../src/providers/embedding/index.js").createEmbeddingProvider;
let setEmbeddingProvider: typeof import("../src/functions/search.js").setEmbeddingProvider;
let handlers: Map<string, Handler>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("AGENTMEMORY_ENV_FILE", join(tmpdir(), `am-embedding-status-${randomUUID()}.env`));
  for (const key of [
    "EMBEDDING_PROVIDER", "GEMINI_API_KEY", "OPENAI_API_KEY",
    "OPENAI_EMBEDDING_API_KEY", "VOYAGE_API_KEY", "COHERE_API_KEY", "OPENROUTER_API_KEY",
  ]) vi.stubEnv(key, undefined);
  ({ createEmbeddingProvider } = await import("../src/providers/embedding/index.js"));
  ({ setEmbeddingProvider } = await import("../src/functions/search.js"));
  const { registerApiTriggers } = await import("../src/triggers/api.js");
  handlers = new Map();
  const sdk = {
    registerFunction: (id: string, handler: Handler) => handlers.set(id, handler),
    registerTrigger: () => {},
    trigger: async () => null,
  };
  const kv = { backend: "file", get: async () => null, list: async () => [] };
  registerApiTriggers(sdk as never, kv as never);
});

afterEach(() => {
  setEmbeddingProvider(null);
  vi.unstubAllEnvs();
});

async function expectEmbeddingStatus(expected: string) {
  const request = { method: "GET", headers: {}, query_params: {} } as HttpRequest;
  const flags = await handlers.get("api::config-flags")!(request);
  expect(flags.status_code).toBe(200);
  expect.soft(flags.body).toMatchObject({ embeddingProvider: expected });
  const status = await handlers.get("api::status")!(request);
  expect(status.status_code).toBe(200);
  expect.soft(status.body).toMatchObject({ provider: { embeddings: expected } });
}

describe("embedding provider API status", () => {
  it("reports none when an unsupported setting creates no runtime provider", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "unsupported");
    const provider = createEmbeddingProvider();
    expect(provider).toBeNull();
    setEmbeddingProvider(provider);
    await expectEmbeddingStatus("none");
  });

  it("reports none when no embedding provider is configured", async () => {
    const provider = createEmbeddingProvider();
    expect(provider).toBeNull();
    setEmbeddingProvider(provider);
    await expectEmbeddingStatus("none");
  });

  it("reports the active provider and dimensions even if configuration changes", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "local");
    setEmbeddingProvider(createEmbeddingProvider());
    await expectEmbeddingStatus("local (384 dims)");
    vi.stubEnv("EMBEDDING_PROVIDER", "unsupported");
    await expectEmbeddingStatus("local (384 dims)");
  });

  it("stops reporting a configured provider after it is cleared", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "local");
    setEmbeddingProvider(createEmbeddingProvider());
    setEmbeddingProvider(null);
    await expectEmbeddingStatus("none");
  });

  it("does not report a provider whose construction failed", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "openai");
    expect(() => createEmbeddingProvider()).toThrow("API key is required");
    await expectEmbeddingStatus("none");
  });
});
