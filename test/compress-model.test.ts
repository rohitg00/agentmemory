import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { OpenAIProvider } from "../src/providers/openai.js";
import { OpenRouterProvider } from "../src/providers/openrouter.js";
import { MinimaxProvider } from "../src/providers/minimax.js";

const openAiStyleResponse = {
  ok: true,
  json: async () => ({ choices: [{ message: { content: "ok" } }] }),
} as Response;

const anthropicStyleResponse = {
  ok: true,
  json: async () => ({ content: [{ type: "text", text: "ok" }] }),
} as Response;

function mockFetch(response: Response) {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(response as Response);
  return {
    sentModel(callIndex = 0): string {
      const init = spy.mock.calls[callIndex]?.[1] as RequestInit;
      return (JSON.parse(init.body as string) as { model: string }).model;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AGENTMEMORY_COMPRESS_MODEL — compress() uses the override, summarize() keeps the main model", () => {
  it("OpenAIProvider routes compress to compressModel and summarize to model", async () => {
    const fetched = mockFetch(openAiStyleResponse);
    const provider = new OpenAIProvider(
      "test-key",
      "main-model",
      4096,
      "https://api.example.com",
      "cheap-model",
    );

    await provider.compress("sys", "user");
    await provider.summarize("sys", "user");

    expect(fetched.sentModel(0)).toBe("cheap-model");
    expect(fetched.sentModel(1)).toBe("main-model");
  });

  it("OpenAIProvider without compressModel uses the main model for both", async () => {
    const fetched = mockFetch(openAiStyleResponse);
    const provider = new OpenAIProvider(
      "test-key",
      "main-model",
      4096,
      "https://api.example.com",
    );

    await provider.compress("sys", "user");
    await provider.summarize("sys", "user");

    expect(fetched.sentModel(0)).toBe("main-model");
    expect(fetched.sentModel(1)).toBe("main-model");
  });

  it("OpenRouterProvider routes compress to compressModel and summarize to model", async () => {
    const fetched = mockFetch(openAiStyleResponse);
    const provider = new OpenRouterProvider(
      "test-key",
      "main-model",
      4096,
      "https://openrouter.ai/api/v1/chat/completions",
      "cheap-model",
    );

    await provider.compress("sys", "user");
    await provider.summarize("sys", "user");

    expect(fetched.sentModel(0)).toBe("cheap-model");
    expect(fetched.sentModel(1)).toBe("main-model");
  });

  it("MinimaxProvider routes compress to compressModel and summarize to model", async () => {
    const fetched = mockFetch(anthropicStyleResponse);
    const provider = new MinimaxProvider(
      "test-key",
      "main-model",
      4096,
      "cheap-model",
    );

    await provider.compress("sys", "user");
    await provider.summarize("sys", "user");

    expect(fetched.sentModel(0)).toBe("cheap-model");
    expect(fetched.sentModel(1)).toBe("main-model");
  });
});

describe("loadConfig picks up AGENTMEMORY_COMPRESS_MODEL", () => {
  const TOUCHED_ENVS = [
    "AGENTMEMORY_COMPRESS_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_API_KEY_FOR_LLM",
    "OPENAI_MODEL",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of TOUCHED_ENVS) {
      saved[k] = process.env[k];
    }
    process.env["OPENAI_API_KEY"] = "test-key";
    process.env["OPENAI_API_KEY_FOR_LLM"] = "true";
    process.env["OPENAI_MODEL"] = "main-model";
  });

  afterEach(() => {
    for (const k of TOUCHED_ENVS) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  it("sets provider.compressModel and reports it as config.compressionModel", () => {
    process.env["AGENTMEMORY_COMPRESS_MODEL"] = "cheap-model";

    const config = loadConfig();

    expect(config.provider.compressModel).toBe("cheap-model");
    expect(config.compressionModel).toBe("cheap-model");
  });

  it("leaves compressModel unset and compressionModel on the main model by default", () => {
    delete process.env["AGENTMEMORY_COMPRESS_MODEL"];

    const config = loadConfig();

    expect(config.provider.compressModel).toBeUndefined();
    expect(config.compressionModel).toBe("main-model");
  });
});
