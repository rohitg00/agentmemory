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
// Bounded-retry total-deadline tests
//
// The retry wrapper must bound TOTAL elapsed time across every
// attempt + sleep — not per-attempt — so worst case never blows
// past the caller's budget or the iii 180s invocation timeout.
// ─────────────────────────────────────────────────────────────
describe("fetchWithTimeout bounded retry (total deadline)", () => {
  // Builds a fetch mock that replays a queue of {status, headers} in order,
  // repeating the last entry once the queue is exhausted. Records how many
  // times it was invoked so we can assert attempt counts.
  function queuedFetch(
    responses: Array<{ status: number; headers?: Record<string, string> }>,
  ): { fetch: typeof fetch; calls: () => number } {
    let i = 0;
    const impl = (async () => {
      const spec = responses[Math.min(i, responses.length - 1)];
      i++;
      return new Response(null, {
        status: spec.status,
        headers: spec.headers,
      });
    }) as typeof fetch;
    return { fetch: impl, calls: () => i };
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });

  // 0. The FIRST attempt must honor the hard budget cap, not the raw caller
  //    timeout. Regression: fetchOnce was called with `ms` instead of the
  //    capped `budgetMs`, so a large caller timeout (e.g. 300s) could hang the
  //    initial request past HARD_BUDGET_CAP_MS (170s) and the iii 180s
  //    invocation timeout before any retry logic ran.
  it("caps the first attempt at the hard budget, not the raw caller timeout", async () => {
    const signals: AbortSignal[] = [];
    const capturing = ((_url: string, init?: RequestInit) => {
      const signal = init!.signal as AbortSignal;
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("AbortError", "AbortError")),
        );
      });
    }) as typeof fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(capturing);
    vi.useFakeTimers();

    // 300s caller timeout — far above the 170s HARD_BUDGET_CAP_MS.
    const p = fetchWithTimeout("https://example.com", {}, 300000);
    p.catch(() => {}); // observe rejection so it isn't flagged unhandled

    expect(signals).toHaveLength(1);
    // Just before the cap the first attempt is still alive.
    await vi.advanceTimersByTimeAsync(169999);
    expect(signals[0].aborted).toBe(false);
    // At the cap it must abort. Pre-fix (raw 300s) it would still be alive.
    await vi.advanceTimersByTimeAsync(2);
    expect(signals[0].aborted).toBe(true);

    await expect(p).rejects.toThrow();
  });

  // 1. 429 then 200 → retried exactly once, resolves 200.
  it("retries once on 429 then resolves the follow-up 200", async () => {
    const q = queuedFetch([{ status: 429 }, { status: 200 }]);
    vi.spyOn(globalThis, "fetch").mockImplementation(q.fetch);
    vi.useFakeTimers();

    const p = fetchWithTimeout("https://example.com", {}, 60000);
    // Drain the backoff sleep (500ms default) so the retry fires.
    await vi.advanceTimersByTimeAsync(500);
    const res = await p;

    expect(res.status).toBe(200);
    expect(q.calls()).toBe(2);
  });

  // 2. 429 with a hostile Retry-After (100000s) must NOT wait that long. The
  //    delay collapses to the low per-delay cap (5000ms) so the retry fires
  //    quickly and total elapsed stays nowhere near 100000s.
  it("does not honour a hostile Retry-After literally — caps it and stays within budget", async () => {
    const q = queuedFetch([
      { status: 429, headers: { "Retry-After": "100000" } }, // 100000s
      { status: 200 },
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(q.fetch);
    vi.useFakeTimers();
    const start = Date.now();

    const p = fetchWithTimeout("https://example.com", {}, 60000);
    // runAllTimers drains every scheduled sleep; if the code honored 100000s
    // literally this would advance 100_000_000ms of simulated time.
    await vi.runAllTimersAsync();
    const res = await p;
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(q.calls()).toBe(2);
    // The only sleep was the capped 5000ms delay — total elapsed is bounded to
    // the cap, nowhere near the 100_000_000ms the header requested.
    expect(elapsed).toBeLessThanOrEqual(5000);
    expect(elapsed).toBeLessThan(60000);
  });

  // 2c. When the capped delay still cannot fit inside a small budget, we do NOT
  //     retry and return the last 429 within bound.
  it("returns the last 429 without retrying when even the capped delay overruns a small budget", async () => {
    const q = queuedFetch([
      { status: 429, headers: { "Retry-After": "100000" } },
      { status: 200 },
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(q.fetch);
    vi.useFakeTimers();
    const start = Date.now();

    // Budget 1000ms: capped delay 5000ms + floor 100ms > remaining, no retry.
    const p = fetchWithTimeout("https://example.com", {}, 1000);
    await vi.runAllTimersAsync();
    const res = await p;
    const elapsed = Date.now() - start;

    expect(res.status).toBe(429);
    expect(q.calls()).toBe(1);
    expect(elapsed).toBeLessThan(1000);
  });

  // 2b. Retry-After present but LARGER than the low per-delay cap collapses to
  //     MAX_RETRY_DELAY_MS (5000), still bounded, still retries when budget
  //     allows.
  it("caps an oversized Retry-After to the max delay and still retries within budget", async () => {
    const q = queuedFetch([
      { status: 503, headers: { "Retry-After": "60" } }, // 60s requested
      { status: 200 },
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(q.fetch);
    vi.useFakeTimers();

    const p = fetchWithTimeout("https://example.com", {}, 60000);
    // Requested 60s, but the honored delay is capped at 5000ms.
    await vi.advanceTimersByTimeAsync(5000);
    const res = await p;

    expect(res.status).toBe(200);
    expect(q.calls()).toBe(2);
  });

  // 3. Persistent 503 → stops after the bounded attempts AND within the total
  //    deadline. Attempt count is bounded at MAX_ATTEMPTS (3) and total
  //    simulated elapsed stays under the budget.
  it("stops persistent 503 at the attempt cap and within the deadline", async () => {
    const q = queuedFetch([{ status: 503 }]);
    vi.spyOn(globalThis, "fetch").mockImplementation(q.fetch);
    vi.useFakeTimers();
    const start = Date.now();

    const p = fetchWithTimeout("https://example.com", {}, 60000);
    // Two retries with 500ms + 1000ms exponential backoff.
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    const res = await p;
    const elapsed = Date.now() - start;

    expect(res.status).toBe(503);
    // Initial attempt + 2 retries = MAX_ATTEMPTS.
    expect(q.calls()).toBe(3);
    expect(elapsed).toBeLessThan(60000);
    // Total simulated sleep was only the two backoffs.
    expect(elapsed).toBeLessThanOrEqual(1500);
  });

  // 3b. A tiny budget forces us to bail before even the first retry sleep —
  //     the sleep + minimal attempt floor already overruns the remaining
  //     budget, so we return the first 503 without retrying.
  it("does not retry when the budget is too small to fit a retry", async () => {
    const q = queuedFetch([{ status: 503 }, { status: 200 }]);
    vi.spyOn(globalThis, "fetch").mockImplementation(q.fetch);
    vi.useFakeTimers();

    // Budget of 200ms: backoff 500ms + floor 100ms > remaining, so no retry.
    const p = fetchWithTimeout("https://example.com", {}, 200);
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.status).toBe(503);
    expect(q.calls()).toBe(1);
  });

  // 5. Retry-After as an HTTP-date is parsed, capped to the max delay, and the
  //    retry fires within budget.
  it("parses an HTTP-date Retry-After and caps the honored delay", async () => {
    // 2s in the future — under the max delay cap, so honored as-is.
    const future = new Date(Date.now() + 2000).toUTCString();
    const q = queuedFetch([
      { status: 429, headers: { "Retry-After": future } },
      { status: 200 },
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(q.fetch);
    vi.useFakeTimers();

    const p = fetchWithTimeout("https://example.com", {}, 60000);
    await vi.advanceTimersByTimeAsync(2000);
    const res = await p;

    expect(res.status).toBe(200);
    expect(q.calls()).toBe(2);
  });

  // 5b. A far-future HTTP-date collapses to the capped delay (5000ms), which
  //     still exceeds a small budget → no retry, last 503 returned in bound.
  it("does not retry on a far-future HTTP-date Retry-After that overruns a small budget", async () => {
    const farFuture = new Date(Date.now() + 3600_000).toUTCString(); // 1h out
    const q = queuedFetch([
      { status: 503, headers: { "Retry-After": farFuture } },
      { status: 200 },
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(q.fetch);
    vi.useFakeTimers();
    const start = Date.now();

    // Budget 1000ms: capped delay 5000ms + floor > remaining, so no retry.
    const p = fetchWithTimeout("https://example.com", {}, 1000);
    await vi.runAllTimersAsync();
    const res = await p;
    const elapsed = Date.now() - start;

    expect(res.status).toBe(503);
    expect(q.calls()).toBe(1);
    expect(elapsed).toBeLessThan(1000);
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

// ─────────────────────────────────────────────────────────────
// #627 — OpenAI provider must read message.reasoning_content
// DeepSeek V4 / Qwen3 / GLM / Kimi return reasoning_content (with
// underscore); only checking `reasoning` left thinking-model output
// dropped on the floor and tripped the compress circuit breaker.
// ─────────────────────────────────────────────────────────────
describe("OpenAIProvider thinking-model fallback (#627)", () => {
  beforeEach(() => {
    delete process.env["OPENAI_TIMEOUT_MS"];
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockOpenAIResponse(body: object): void {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
    );
  }

  it("returns reasoning_content when content is empty (DeepSeek V4 / Qwen3 shape)", async () => {
    mockOpenAIResponse({
      choices: [
        {
          message: {
            content: "",
            reasoning_content: "thinking-mode output",
          },
        },
      ],
    });
    const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 1024);
    const out = await provider.compress("system", "user");
    expect(out).toBe("thinking-mode output");
  });

  it("still returns reasoning (no underscore) for older o-series shape", async () => {
    mockOpenAIResponse({
      choices: [{ message: { content: "", reasoning: "older shape" } }],
    });
    const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 1024);
    const out = await provider.compress("system", "user");
    expect(out).toBe("older shape");
  });

  it("content wins over both reasoning fields when present", async () => {
    mockOpenAIResponse({
      choices: [
        {
          message: {
            content: "real content",
            reasoning: "ignore",
            reasoning_content: "also ignore",
          },
        },
      ],
    });
    const provider = new OpenAIProvider("test-key", "gpt-4o-mini", 1024);
    const out = await provider.compress("system", "user");
    expect(out).toBe("real content");
  });
});

