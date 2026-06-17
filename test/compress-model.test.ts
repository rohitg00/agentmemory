import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import { MinimaxProvider } from "../src/providers/minimax.js";
import { OpenAIProvider } from "../src/providers/openai.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

function mockChatResponse(): {
  sentUrl(callIndex?: number): string;
  sentMethod(callIndex?: number): string;
  sentBody(callIndex?: number): Record<string, unknown>;
  sentModel(callIndex?: number): string;
  sentHeaders(callIndex?: number): Headers;
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
    sentUrl(callIndex = 0): string {
      return String(spy.mock.calls[callIndex]?.[0]);
    },
    sentMethod(callIndex = 0): string {
      const init = spy.mock.calls[callIndex]?.[1] as RequestInit;
      return init.method ?? "GET";
    },
    sentBody(callIndex = 0): Record<string, unknown> {
      const init = spy.mock.calls[callIndex]?.[1] as RequestInit;
      return JSON.parse(init.body as string) as Record<string, unknown>;
    },
    sentModel(callIndex = 0): string {
      return this.sentBody(callIndex).model as string;
    },
    sentHeaders(callIndex = 0): Headers {
      const init = spy.mock.calls[callIndex]?.[1] as RequestInit;
      return new Headers(init.headers);
    },
  };
}

describe("AGENTMEMORY_COMPRESS_MODEL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    const fetched = mockChatResponse();
    const provider = new AnthropicProvider(
      "test-key",
      "main-model",
      4096,
      "https://anthropic.example.test",
      "cheap-model",
    );

    await provider.compress("system", "user");
    await provider.summarize("system", "user");

    expect(fetched.sentModel(0)).toBe("cheap-model");
    expect(fetched.sentModel(1)).toBe("main-model");
    expect(fetched.sentHeaders(0).get("x-api-key")).toBe("test-key");
    expect(fetched.sentHeaders(0).get("anthropic-version")).toBe("2023-06-01");
    expect(fetched.sentHeaders(0).get("content-type")).toBe("application/json");
    expect(fetched.sentUrl(0)).toBe("https://anthropic.example.test/v1/messages");
    expect(fetched.sentUrl(1)).toBe("https://anthropic.example.test/v1/messages");
    expect(fetched.sentMethod(0)).toBe("POST");
    expect(fetched.sentMethod(1)).toBe("POST");
    expect(fetched.sentBody(0)).toMatchObject({
      model: "cheap-model",
      max_tokens: 4096,
      system: "system",
      messages: [{ role: "user", content: "user" }],
    });
    expect(fetched.sentBody(1)).toMatchObject({
      model: "main-model",
      max_tokens: 4096,
      system: "system",
      messages: [{ role: "user", content: "user" }],
    });
  });

  it("sends Anthropic image descriptions through the messages API", async () => {
    const fetched = mockChatResponse();
    const provider = new AnthropicProvider(
      "test-key",
      "main-model",
      4096,
      "https://anthropic.example.test",
    );

    const result = await provider.describeImage("aW1hZ2U=", "image/png", "describe this");

    expect(result).toBe("ok");
    expect(fetched.sentModel()).toBe("main-model");
    expect(fetched.sentBody().messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "aW1hZ2U=",
            },
          },
          { type: "text", text: "describe this" },
        ],
      },
    ]);
  });

  it("reports Anthropic API errors without echoing the upstream body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("prompt: user secret", { status: 400 }),
    );
    const provider = new AnthropicProvider("test-key", "main-model", 4096);

    await expect(provider.compress("system", "user")).rejects.toThrow(
      "Anthropic API error (400)",
    );
    await expect(provider.compress("system", "user")).rejects.not.toThrow(
      "user secret",
    );
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
