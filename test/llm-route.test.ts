import { describe, it, expect } from "vitest";
import { describeLlmRoute } from "../src/config.js";

describe("describeLlmRoute", () => {
  it("names provider, model and the base URL host", () => {
    expect(
      describeLlmRoute({
        provider: "openai",
        model: "deepseek/deepseek-v4.1-flash:floor",
        maxTokens: 4096,
        baseURL: "https://openrouter.ai/api/v1",
      }),
    ).toBe("openai · deepseek/deepseek-v4.1-flash:floor · openrouter.ai");
  });

  it("omits the host when no base URL is configured", () => {
    expect(describeLlmRoute({ provider: "anthropic", model: "claude-sonnet-5", maxTokens: 4096 })).toBe(
      "anthropic · claude-sonnet-5",
    );
  });

  it("never echoes an unparsable base URL", () => {
    expect(describeLlmRoute({ provider: "openai", model: "m", maxTokens: 1, baseURL: "not a url sk-secret" })).toBe(
      "openai · m · custom base URL",
    );
  });

  it("returns null without an LLM", () => {
    expect(describeLlmRoute({ provider: "noop", model: "noop", maxTokens: 1 })).toBeNull();
  });
});
