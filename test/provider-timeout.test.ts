import { afterEach, describe, expect, it, vi } from "vitest";
import { getLlmTimeoutMs } from "../src/providers/fetch-timeout.js";
import { MinimaxProvider } from "../src/providers/minimax.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

describe("provider HTTP timeouts", () => {
  const originalTimeout = process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalTimeout === undefined) {
      delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
    } else {
      process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = originalTimeout;
    }
  });

  it("defaults to a 120s LLM timeout", () => {
    delete process.env["AGENTMEMORY_LLM_TIMEOUT_MS"];
    expect(getLlmTimeoutMs()).toBe(120_000);
  });

  it("uses AGENTMEMORY_LLM_TIMEOUT_MS when it is a positive integer", () => {
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50";
    expect(getLlmTimeoutMs()).toBe(50);
  });

  it("falls back to the default for invalid timeout values", () => {
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "nope";
    expect(getLlmTimeoutMs()).toBe(120_000);

    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "50ms";
    expect(getLlmTimeoutMs()).toBe(120_000);

    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "0";
    expect(getLlmTimeoutMs()).toBe(120_000);
  });

  it("passes an abort signal to MiniMax provider fetches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return new Response(
          JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
          { status: 200 },
        );
      }),
    );

    const provider = new MinimaxProvider("test-key", "MiniMax-M2.7", 800);
    await expect(provider.summarize("system", "user")).resolves.toBe("ok");
  });

  it("passes an abort signal to OpenRouter provider fetches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
          { status: 200 },
        );
      }),
    );

    const provider = new OpenRouterProvider(
      "test-key",
      "anthropic/claude-sonnet-4-20250514",
      4096,
      "https://openrouter.ai/api/v1/chat/completions",
    );
    await expect(provider.compress("system", "user")).resolves.toBe("ok");
  });
});
