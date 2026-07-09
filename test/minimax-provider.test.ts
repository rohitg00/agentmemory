import { describe, expect, it, afterEach } from "vitest";
import { MinimaxProvider } from "../src/providers/minimax.js";

describe("MinimaxProvider — base URL resolution (#285)", () => {
  const originalEnv = process.env["MINIMAX_BASE_URL"];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["MINIMAX_BASE_URL"];
    } else {
      process.env["MINIMAX_BASE_URL"] = originalEnv;
    }
  });

  it("defaults to MiniMax's Anthropic-compatible /anthropic/v1 endpoint", () => {
    delete process.env["MINIMAX_BASE_URL"];
    const provider = new MinimaxProvider("test-key", "MiniMax-M3", 800);
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://api.minimax.io/anthropic/v1",
    );
  });

  it("posts messages directly under MINIMAX_BASE_URL without adding another /v1 segment", () => {
    process.env["MINIMAX_BASE_URL"] = "https://custom.example.com/anthropic/v1/";
    const provider = new MinimaxProvider("test-key", "MiniMax-M3", 800);
    expect((provider as unknown as { messagesUrl: () => string }).messagesUrl()).toBe(
      "https://custom.example.com/anthropic/v1/messages",
    );
  });

  it("honors MINIMAX_BASE_URL via getEnvVar (merged ~/.agentmemory/.env + process.env)", () => {
    process.env["MINIMAX_BASE_URL"] = "https://custom.example.com/anthropic/v1";
    const provider = new MinimaxProvider("test-key", "MiniMax-M3", 800);
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://custom.example.com/anthropic/v1",
    );
  });
});
