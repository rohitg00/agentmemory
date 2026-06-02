import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// #778: fallback providers used to inherit the primary provider's
// model name and 404 on every call. Each fallback must resolve its
// own env-driven default model.

const captured: Array<{ provider: string; model: string }> = [];

vi.mock("../src/providers/openai.js", () => ({
  OpenAIProvider: class {
    name = "openai";
    constructor(_key: string, model: string) {
      captured.push({ provider: "openai", model });
    }
    async compress() {
      return "";
    }
    async summarize() {
      return "";
    }
  },
}));

vi.mock("../src/providers/openrouter.js", () => ({
  OpenRouterProvider: class {
    name = "openrouter";
    constructor(_key: string, model: string, _max: number, url?: string) {
      captured.push({
        provider: url?.includes("googleapis") ? "gemini" : "openrouter",
        model,
      });
    }
    async compress() {
      return "";
    }
    async summarize() {
      return "";
    }
  },
}));

vi.mock("../src/providers/anthropic.js", () => ({
  AnthropicProvider: class {
    name = "anthropic";
    constructor(_key: string, model: string) {
      captured.push({ provider: "anthropic", model });
    }
    async compress() {
      return "";
    }
    async summarize() {
      return "";
    }
  },
}));

vi.mock("../src/providers/minimax.js", () => ({
  MinimaxProvider: class {
    name = "minimax";
    constructor(_key: string, model: string) {
      captured.push({ provider: "minimax", model });
    }
    async compress() {
      return "";
    }
    async summarize() {
      return "";
    }
  },
}));

import { createFallbackProvider } from "../src/providers/index.js";
import type { ProviderConfig, FallbackConfig } from "../src/types.js";

describe("Fallback provider model resolution (#778)", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GOOGLE_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
    "MINIMAX_API_KEY",
    "MINIMAX_MODEL",
  ];

  beforeEach(() => {
    captured.length = 0;
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("primary OpenAI + fallback Gemini: Gemini is built with GEMINI_MODEL, NOT the primary's model", () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    process.env.GEMINI_API_KEY = "gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";

    const primary: ProviderConfig = {
      provider: "openai",
      model: "gpt-4o-mini",
      maxTokens: 4096,
    };
    const fallback: FallbackConfig = { providers: ["gemini"] };

    createFallbackProvider(primary, fallback);

    const openaiCall = captured.find((c) => c.provider === "openai");
    const geminiCall = captured.find((c) => c.provider === "gemini");
    expect(openaiCall?.model).toBe("gpt-4o-mini");
    expect(geminiCall?.model).toBe("gemini-2.5-flash");
    expect(geminiCall?.model).not.toBe("gpt-4o-mini");
  });

  it("Gemini fallback uses the documented default when GEMINI_MODEL is unset", () => {
    process.env.OPENAI_API_KEY = "sk-openai";
    process.env.GEMINI_API_KEY = "gemini-key";

    createFallbackProvider(
      { provider: "openai", model: "gpt-4o-mini", maxTokens: 4096 },
      { providers: ["gemini"] },
    );

    const geminiCall = captured.find((c) => c.provider === "gemini");
    expect(geminiCall?.model).toBe("gemini-2.5-flash");
  });

  it("primary Anthropic + fallback OpenAI + Minimax: each fallback uses its own default", () => {
    process.env.ANTHROPIC_API_KEY = "anth-key";
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.OPENAI_MODEL = "gpt-5";
    process.env.MINIMAX_API_KEY = "mini-key";

    createFallbackProvider(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        maxTokens: 4096,
      },
      { providers: ["openai", "minimax"] },
    );

    const openai = captured.find((c) => c.provider === "openai");
    const minimax = captured.find((c) => c.provider === "minimax");
    expect(openai?.model).toBe("gpt-5");
    expect(minimax?.model).toBe("MiniMax-M2.7");
    // Neither inherits the Anthropic model name.
    expect(openai?.model).not.toBe("claude-sonnet-4-20250514");
    expect(minimax?.model).not.toBe("claude-sonnet-4-20250514");
  });

  it("env override on the fallback provider's MODEL var wins over the default", () => {
    process.env.OPENAI_API_KEY = "sk";
    process.env.GEMINI_API_KEY = "gk";
    process.env.GEMINI_MODEL = "gemini-2.5-pro";

    createFallbackProvider(
      { provider: "openai", model: "gpt-4o-mini", maxTokens: 4096 },
      { providers: ["gemini"] },
    );

    expect(captured.find((c) => c.provider === "gemini")?.model).toBe(
      "gemini-2.5-pro",
    );
  });

  it("fallback that matches the primary provider is skipped (no duplicate)", () => {
    process.env.OPENAI_API_KEY = "sk";

    createFallbackProvider(
      { provider: "openai", model: "gpt-4o-mini", maxTokens: 4096 },
      { providers: ["openai", "gemini"] },
    );

    const openaiCalls = captured.filter((c) => c.provider === "openai");
    expect(openaiCalls.length).toBe(1);
  });
});
