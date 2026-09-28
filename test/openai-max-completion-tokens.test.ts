import { describe, expect, it, afterEach, vi } from "vitest";
import { OpenAIProvider } from "../src/providers/openai.js";

/**
 * gpt-5 family and o-series deployments reject `max_tokens`:
 *
 *   400 {"error":{"message":"Unsupported parameter: 'max_tokens' is not
 *   supported with this model. Use 'max_completion_tokens' instead.", ...}}
 *
 * The spelling an endpoint accepts cannot be derived from the model string —
 * Azure deployment names are user-chosen — so the provider learns it from the
 * first rejection and keeps it for the rest of the process.
 */

const UNSUPPORTED_MAX_TOKENS = JSON.stringify({
  error: {
    message:
      "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
    type: "invalid_request_error",
    param: "max_tokens",
    code: "unsupported_parameter",
  },
});

function ok(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("OpenAIProvider — max_tokens vs max_completion_tokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["OPENAI_TIMEOUT_MS"];
  });

  it("shares one timeout budget across the retry", async () => {
    // A slow rejection must eat into the budget the retry gets, otherwise a
    // single call() could run for close to 2x the configured timeout.
    process.env["OPENAI_TIMEOUT_MS"] = "300";
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          await new Promise<Response>((resolve) =>
            setTimeout(() => resolve(new Response(UNSUPPORTED_MAX_TOKENS, { status: 400 })), 200),
          ),
      )
      // the retry hangs; only the remaining ~100ms should be granted to it
      .mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider("k", "gpt-5.4-mini", 800, "https://api.example.com");
    const started = Date.now();
    await expect(provider.compress("sys", "user")).rejects.toThrow(/timed out after 300ms/);
    const elapsed = Date.now() - started;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // ~300ms total. A per-request budget would let this reach ~500ms.
    expect(elapsed).toBeLessThan(450);
  });

  it("sends max_tokens by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok("<observation/>"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider("k", "gpt-4o-mini", 800, "https://api.example.com");
    await provider.compress("sys", "user");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = bodyOf(fetchMock.mock.calls[0]!);
    expect(body["max_tokens"]).toBe(800);
    expect(body["max_completion_tokens"]).toBeUndefined();
  });

  it("retries with max_completion_tokens when the API rejects max_tokens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(UNSUPPORTED_MAX_TOKENS, { status: 400 }))
      .mockResolvedValueOnce(ok("<observation/>"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider("k", "gpt-5.4-mini", 800, "https://api.example.com");
    const result = await provider.compress("sys", "user");

    expect(result).toBe("<observation/>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[0]!)["max_tokens"]).toBe(800);
    const retry = bodyOf(fetchMock.mock.calls[1]!);
    expect(retry["max_completion_tokens"]).toBe(800);
    expect(retry["max_tokens"]).toBeUndefined();
  });

  it("keeps the learned spelling so later calls cost no extra round trip", async () => {
    const fetchMock = vi
      .fn()
      // a Response body can only be read once, so hand out a fresh one per call
      .mockImplementationOnce(async () => new Response(UNSUPPORTED_MAX_TOKENS, { status: 400 }))
      .mockImplementation(async () => ok("<observation/>"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider("k", "gpt-5.4-mini", 800, "https://api.example.com");
    await provider.compress("sys", "first");
    await provider.compress("sys", "second");

    // 2 for the first call (reject + retry), 1 for the second
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock.mock.calls[2]!)["max_completion_tokens"]).toBe(800);
  });

  it("retries both calls when two are in flight before the spelling is learned", async () => {
    // Both requests go out with max_tokens before either rejection is handled.
    // If the second call tests the shared field instead of what it actually
    // sent, it sees the spelling the first call just latched and gives up.
    let pending: ((r: Response) => void)[] = [];
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      if (body["max_completion_tokens"] !== undefined) return ok("<observation/>");
      // hold every max_tokens request until both are in flight
      return await new Promise<Response>((resolve) => {
        pending.push(resolve);
        if (pending.length === 2) {
          const waiting = pending;
          pending = [];
          for (const r of waiting) r(new Response(UNSUPPORTED_MAX_TOKENS, { status: 400 }));
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider("k", "gpt-5.4-mini", 800, "https://api.example.com");
    const results = await Promise.all([
      provider.compress("sys", "first"),
      provider.compress("sys", "second"),
    ]);

    expect(results).toEqual(["<observation/>", "<observation/>"]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry on unrelated 400s", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "context_length_exceeded" } }), {
          status: 400,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIProvider("k", "gpt-4o-mini", 800, "https://api.example.com");
    await expect(provider.compress("sys", "user")).rejects.toThrow(/context_length_exceeded/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
