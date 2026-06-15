import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicModels = vi.hoisted((): string[] => []);

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = {
      create: async (body: { model: string }) => {
        anthropicModels.push(body.model);
        return {
          content: [{ type: "text", text: "ok" }],
        };
      },
    };
  },
}));

import { loadConfig } from "../src/config.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import { MinimaxProvider } from "../src/providers/minimax.js";
import { OpenAIProvider } from "../src/providers/openai.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

function mockChatResponse(): {
  sentBody(callIndex?: number): Record<string, unknown>;
  sentModel(callIndex?: number): string;
} {
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        content: [{ type: "text", text: "ok" }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  return {
    sentBody(callIndex = 0): Record<string, unknown> {
      const init = spy.mock.calls[callIndex]?.[1] as RequestInit;
      return JSON.parse(init.body as string) as Record<string, unknown>;
    },
    sentModel(callIndex = 0): string {
      return this.sentBody(callIndex).model as string;
    },
  };
}

describe("AGENTMEMORY_COMPRESS_MODEL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    anthropicModels.length = 0;
  });

  it("routes OpenAI compress() to the compression model and summarize() to the main model", async () => {
    const fetched = mockChatResponse();
    const provider = new OpenAIProvider(
      "test-key",
      "main-model",
      4096,
      "https://api.example.test",
      "cheap-model",
    );

    await provider.compress("system", "user");
    await provider.summarize("system", "user");

    expect(fetched.sentModel(0)).toBe("cheap-model");
    expect(fetched.sentModel(1)).toBe("main-model");
  });

  it("does not send main-model reasoning effort to an OpenAI compression model override", async () => {
    const saved = process.env["OPENAI_REASONING_EFFORT"];
    process.env["OPENAI_REASONING_EFFORT"] = "low";
    try {
      const fetched = mockChatResponse();
      const provider = new OpenAIProvider(
        "test-key",
        "main-reasoning-model",
        4096,
        "https://api.example.test",
        "cheap-standard-model",
      );

      await provider.compress("system", "user");
      await provider.summarize("system", "user");

      expect(fetched.sentBody(0)).not.toHaveProperty("reasoning_effort");
      expect(fetched.sentBody(1).reasoning_effort).toBe("low");
    } finally {
      if (saved === undefined) delete process.env["OPENAI_REASONING_EFFORT"];
      else process.env["OPENAI_REASONING_EFFORT"] = saved;
    }
  });

  it("routes OpenRouter and Gemini-style compress() calls to the compression model", async () => {
    const fetched = mockChatResponse();
    const provider = new OpenRouterProvider(
      "test-key",
      "main-model",
      4096,
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      "cheap-model",
    );

    await provider.compress("system", "user");
    await provider.summarize("system", "user");

    expect(fetched.sentModel(0)).toBe("cheap-model");
    expect(fetched.sentModel(1)).toBe("main-model");
  });

  it("routes MiniMax compress() to the compression model", async () => {
    const fetched = mockChatResponse();
    const provider = new MinimaxProvider(
      "test-key",
      "main-model",
      4096,
      "cheap-model",
    );

    await provider.compress("system", "user");
    await provider.summarize("system", "user");

    expect(fetched.sentModel(0)).toBe("cheap-model");
    expect(fetched.sentModel(1)).toBe("main-model");
  });

  it("routes Anthropic compress() to the compression model", async () => {
    const provider = new AnthropicProvider(
      "test-key",
      "main-model",
      4096,
      undefined,
      "cheap-model",
    );

    await provider.compress("system", "user");
    await provider.summarize("system", "user");

    expect(anthropicModels[0]).toBe("cheap-model");
    expect(anthropicModels[1]).toBe("main-model");
  });
});

describe("loadConfig AGENTMEMORY_COMPRESS_MODEL", () => {
  const keys = [
    "AGENTMEMORY_COMPRESS_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_API_KEY_FOR_LLM",
    "OPENAI_MODEL",
    "MINIMAX_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "OPENROUTER_API_KEY",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) saved[key] = process.env[key];
    process.env["OPENAI_API_KEY"] = "test-key";
    process.env["OPENAI_API_KEY_FOR_LLM"] = "true";
    process.env["OPENAI_MODEL"] = "main-model";
    process.env["MINIMAX_API_KEY"] = "";
    process.env["ANTHROPIC_API_KEY"] = "";
    process.env["GEMINI_API_KEY"] = "";
    process.env["GOOGLE_API_KEY"] = "";
    process.env["OPENROUTER_API_KEY"] = "";
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("stores the compression model separately from the main model", () => {
    process.env["AGENTMEMORY_COMPRESS_MODEL"] = "cheap-model";

    const config = loadConfig();

    expect(config.provider.model).toBe("main-model");
    expect(config.provider.compressModel).toBe("cheap-model");
    expect(config.compressionModel).toBe("cheap-model");
  });

  it("keeps the main model as the compression model when no override is set", () => {
    process.env["AGENTMEMORY_COMPRESS_MODEL"] = "";

    const config = loadConfig();

    expect(config.provider.compressModel).toBeUndefined();
    expect(config.compressionModel).toBe("main-model");
  });
});
