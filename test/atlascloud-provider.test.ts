import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, loadFallbackConfig } from "../src/config.js";
import { createProvider } from "../src/providers/index.js";

const providerEnvKeys = [
  "ANTHROPIC_API_KEY",
  "ATLASCLOUD_API_KEY",
  "ATLASCLOUD_BASE_URL",
  "ATLASCLOUD_MODEL",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "MINIMAX_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "FALLBACK_PROVIDERS",
];

describe("Atlas Cloud provider", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of providerEnvKeys) {
      savedEnv[key] = process.env[key];
      process.env[key] = "";
    }
  });

  afterEach(() => {
    for (const key of providerEnvKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("selects Atlas Cloud defaults from ATLASCLOUD_API_KEY", () => {
    process.env.ATLASCLOUD_API_KEY = "atlas-test-key";

    const config = loadConfig();

    expect(config.provider).toEqual({
      provider: "atlascloud",
      model: "deepseek-ai/deepseek-v4-pro",
      maxTokens: 4096,
      baseURL: "https://api.atlascloud.ai/v1",
    });
    expect(() => createProvider(config.provider)).not.toThrow();
  });

  it("supports Atlas Cloud as a fallback provider", () => {
    process.env.FALLBACK_PROVIDERS = "atlascloud";

    expect(loadFallbackConfig().providers).toEqual(["atlascloud"]);
  });
});
