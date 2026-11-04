import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../src/providers/openai.js";
import { getLlmUsage, resetLlmUsageForTests } from "../src/providers/usage.js";

function mockReply(body: object): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
  );
}

describe("LLM usage totals", () => {
  beforeEach(() => resetLlmUsageForTests());
  afterEach(() => vi.restoreAllMocks());

  it("adds tokens and cost from each reply that reports usage", async () => {
    const provider = new OpenAIProvider("k", "m", 100);
    mockReply({
      choices: [{ message: { content: "a" } }],
      usage: { prompt_tokens: 4000, completion_tokens: 120, cost: 0.00032 },
    });
    await provider.compress("s", "u");
    vi.restoreAllMocks();
    mockReply({
      choices: [{ message: { content: "b" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 30, cost: 0.0001 },
    });
    await provider.summarize("s", "u");

    const totals = getLlmUsage();
    expect(totals).toMatchObject({ calls: 2, promptTokens: 5000, completionTokens: 150 });
    expect(totals.costUsd).toBeCloseTo(0.00042, 8);
  });

  it("keeps cost null when the provider reports tokens but no cost", async () => {
    mockReply({ choices: [{ message: { content: "a" } }], usage: { prompt_tokens: 10, completion_tokens: 2 } });
    await new OpenAIProvider("k", "m", 100).compress("s", "u");
    expect(getLlmUsage()).toEqual({ calls: 1, promptTokens: 10, completionTokens: 2, costUsd: null });
  });

  it("leaves the totals untouched when a reply has no usage", async () => {
    mockReply({ choices: [{ message: { content: "a" } }] });
    await new OpenAIProvider("k", "m", 100).compress("s", "u");
    expect(getLlmUsage()).toEqual({ calls: 0, promptTokens: 0, completionTokens: 0, costUsd: null });
  });
});
