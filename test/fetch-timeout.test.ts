import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetchWithTimeout } from "../src/providers/_fetch.js";
import { MinimaxProvider } from "../src/providers/minimax.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";
import { GeminiEmbeddingProvider } from "../src/providers/embedding/gemini.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";
import { CohereEmbeddingProvider } from "../src/providers/embedding/cohere.js";
import { VoyageEmbeddingProvider } from "../src/providers/embedding/voyage.js";
import { OpenRouterEmbeddingProvider } from "../src/providers/embedding/openrouter.js";

// A fetch mock that never resolves — simulates a hung upstream.
function hangingFetch(_url: string, _init?: RequestInit): Promise<Response> {
  // honour AbortSignal so the timeout actually cancels us
  const init = _init ?? {};
  return new Promise<Response>((_resolve, reject) => {
    if (init.signal) {
      if (init.signal.aborted) {
        reject(new DOMException("AbortError", "AbortError"));
        return;
      }
      init.signal.addEventListener("abort", () => {
        reject(new DOMException("AbortError", "AbortError"));
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────
// fetchWithTimeout unit tests
// ─────────────────────────────────────────────────────────────
describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("resolves normally when fetch completes within the timeout", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const res = await fetchWithTimeout("https://example.com", {}, 1000);
    expect(res.status).toBe(200);
  });

  it("aborts with an AbortError when fetch hangs beyond the configured timeout", async () => {
    await expect(
      fetchWithTimeout("https://example.com", {}, 50),
    ).rejects.toThrow();
  });

  it("reads AGENTMEMORY_LLM_TIMEOUT_MS as the default timeout when no explicit ms is given", async () => {
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
    // no explicit third arg — must pick up the env var
    await expect(
      fetchWithTimeout("https://example.com", {}),
    ).rejects.toThrow();
  });

  it("falls back to 60 000 ms when AGENTMEMORY_LLM_TIMEOUT_MS is not set (type check only)", () => {
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const p = fetchWithTimeout("https://example.com", {});
    expect(p).toBeInstanceOf(Promise);
    return p;
  });
});

// ─────────────────────────────────────────────────────────────
// Provider hang regression tests
// Each provider must call fetchWithTimeout, which honours the
// AbortSignal when the explicit timeoutMs is tiny (50 ms).
// ─────────────────────────────────────────────────────────────

describe("Provider hang regression — MinimaxProvider", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("compress() aborts after timeout when upstream hangs", async () => {
    const provider = new MinimaxProvider("test-key", "MiniMax-M2.7", 800);
    await expect(provider.compress("system", "user")).rejects.toThrow();
  });
});

describe("Provider hang regression — OpenRouterProvider (covers Gemini LLM path)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("compress() aborts after timeout when upstream hangs", async () => {
    const provider = new OpenRouterProvider(
      "test-key",
      "gemini-2.5-flash",
      1024,
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
    await expect(provider.compress("system", "user")).rejects.toThrow();
  });
});

describe("Provider hang regression — GeminiEmbeddingProvider", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("embedBatch() aborts after timeout when upstream hangs", async () => {
    const provider = new GeminiEmbeddingProvider("test-key");
    await expect(provider.embedBatch(["hello"])).rejects.toThrow();
  });
});

describe("Provider hang regression — OpenAIEmbeddingProvider", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("embedBatch() aborts after timeout when upstream hangs", async () => {
    const provider = new OpenAIEmbeddingProvider("test-key");
    await expect(provider.embedBatch(["hello"])).rejects.toThrow();
  });
});

describe("Provider hang regression — CohereEmbeddingProvider", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("embedBatch() aborts after timeout when upstream hangs", async () => {
    const provider = new CohereEmbeddingProvider("test-key");
    await expect(provider.embedBatch(["hello"])).rejects.toThrow();
  });
});

describe("Provider hang regression — VoyageEmbeddingProvider", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("embedBatch() aborts after timeout when upstream hangs", async () => {
    const provider = new VoyageEmbeddingProvider("test-key");
    await expect(provider.embedBatch(["hello"])).rejects.toThrow();
  });
});

describe("Provider hang regression — OpenRouterEmbeddingProvider", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("embedBatch() aborts after timeout when upstream hangs", async () => {
    const provider = new OpenRouterEmbeddingProvider("test-key");
    await expect(provider.embedBatch(["hello"])).rejects.toThrow();
  });
});
