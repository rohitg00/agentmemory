import { describe, expect, it } from "vitest";
import { DeepSeekProvider } from "../src/providers/deepseek.js";
import { OpenAIProvider } from "../src/providers/openai.js";

describe("DeepSeekProvider", () => {
  it("extends OpenAIProvider (OpenAI-compatible transport reuse)", () => {
    const provider = new DeepSeekProvider("test-key", "deepseek-chat", 800);
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it("sets name to 'deepseek'", () => {
    const provider = new DeepSeekProvider("test-key", "deepseek-chat", 800);
    expect(provider.name).toBe("deepseek");
  });

  it("defaults to https://api.deepseek.com base URL when none provided", () => {
    const provider = new DeepSeekProvider("test-key", "deepseek-chat", 800);
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://api.deepseek.com",
    );
  });

  it("honors explicit baseURL argument (overrides default)", () => {
    const provider = new DeepSeekProvider(
      "test-key",
      "deepseek-chat",
      800,
      "https://custom.deepseek.example.com",
    );
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://custom.deepseek.example.com",
    );
  });

  it("falls back to 'deepseek-chat' when an empty model is passed", () => {
    const provider = new DeepSeekProvider("test-key", "", 800);
    expect((provider as unknown as { model: string }).model).toBe(
      "deepseek-chat",
    );
  });

  it("preserves an explicit model (e.g. deepseek-reasoner)", () => {
    const provider = new DeepSeekProvider(
      "test-key",
      "deepseek-reasoner",
      800,
    );
    expect((provider as unknown as { model: string }).model).toBe(
      "deepseek-reasoner",
    );
  });
});
