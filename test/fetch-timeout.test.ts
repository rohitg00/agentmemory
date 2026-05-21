import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetchWithTimeout } from "../src/providers/_fetch.js";
import { MinimaxProvider } from "../src/providers/minimax.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";
import { OpenAIProvider } from "../src/providers/openai.js";
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

// ─────────────────────────────────────────────────────────────
// #446 — OpenAI LLM provider env-var precedence
//
// v0.9.17 shipped OPENAI_TIMEOUT_MS (OpenAI-scoped). PR #379 then
// shipped AGENTMEMORY_LLM_TIMEOUT_MS (shared). The provider now
// honours both: OPENAI_TIMEOUT_MS wins for back-compat, with
// AGENTMEMORY_LLM_TIMEOUT_MS as the global fall-back.
// ─────────────────────────────────────────────────────────────
describe("OpenAIProvider timeout env precedence (#446)", () => {
  beforeEach(() => {
    delete process.env["OPENAI_TIMEOUT_MS"];
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch as typeof fetch);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["OPENAI_TIMEOUT_MS"];
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  it("OPENAI_TIMEOUT_MS alone aborts the OpenAI LLM call", async () => {
    process.env["OPENAI_TIMEOUT_MS"] = "30";
    const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 1024);
    await expect(provider.compress("system", "user")).rejects.toThrow(
      /timed out after 30ms/,
    );
  });

  it("AGENTMEMORY_LLM_TIMEOUT_MS alone aborts the OpenAI LLM call", async () => {
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "30";
    const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 1024);
    await expect(provider.compress("system", "user")).rejects.toThrow(
      /timed out after 30ms/,
    );
  });

  it("OPENAI_TIMEOUT_MS wins when both are set (back-compat)", async () => {
    process.env["OPENAI_TIMEOUT_MS"] = "30";
    // Set the global to a much larger value — if precedence is wrong,
    // we'd time out at 5000ms and the test would hang past the 5s
    // vitest default. We assert the message ms to lock the precedence.
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "5000";
    const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 1024);
    await expect(provider.compress("system", "user")).rejects.toThrow(
      /timed out after 30ms/,
    );
  });

  it("falls back to the 60 000 ms default when neither is set", () => {
    // We don't actually wait 60s — the provider stores timeoutMs at
    // construction. Construct, then assert the bound via the error
    // message after the hang aborts at a tiny pre-set value.
    const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 1024);
    // Access the resolved timeout via the constructed field name. The
    // class keeps `timeoutMs` private; reaching in via the index
    // access keeps the test on the public observed behaviour: the ms
    // value reported in the timeout error message must be 60000.
    const ms = (provider as unknown as { timeoutMs: number }).timeoutMs;
    expect(ms).toBe(60_000);
  });

  it("rejects malformed env values like '30ms' or '1_000' (CodeRabbit catch)", () => {
    // parseInt would have silently returned 30 / 1 for these typos —
    // strict parse now rejects them and the provider falls back to
    // the 60 000 ms default so a malformed env doesn't masquerade as
    // an aggressive bound.
    // Whitespace-only padding (" 30 ") is legitimate env-var handling — we
    // trim before validating. The cases below are real typos parseInt would
    // silently swallow.
    for (const bad of ["30ms", "1_000", "60s", "30abc", "-30", "0"]) {
      process.env["OPENAI_TIMEOUT_MS"] = bad;
      const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 1024);
      const ms = (provider as unknown as { timeoutMs: number }).timeoutMs;
      expect(ms).toBe(60_000);
      delete process.env["OPENAI_TIMEOUT_MS"];
    }
  });
});

