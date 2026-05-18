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

  it("defaults to https://api.minimax.io/anthropic (not the legacy minimaxi.com host)", () => {
    delete process.env["MINIMAX_BASE_URL"];
    const provider = new MinimaxProvider("test-key", "MiniMax-M2.7", 800);
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://api.minimax.io/anthropic",
    );
  });

  it("honors MINIMAX_BASE_URL via getEnvVar (merged ~/.agentmemory/.env + process.env)", () => {
    process.env["MINIMAX_BASE_URL"] = "https://custom.example.com/anthropic";
    const provider = new MinimaxProvider("test-key", "MiniMax-M2.7", 800);
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://custom.example.com/anthropic",
    );
  });
});
