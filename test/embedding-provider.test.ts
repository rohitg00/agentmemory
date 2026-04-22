import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEmbeddingProvider } from "../src/providers/embedding/index.js";
import { GeminiEmbeddingProvider } from "../src/providers/embedding/gemini.js";
import { OpenAIEmbeddingProvider } from "../src/providers/embedding/openai.js";
import * as config from "../src/config.js";

vi.mock("../src/config.js", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    detectEmbeddingProvider: vi.fn(),
    getEnvVar: vi.fn(),
  };
});

describe("createEmbeddingProvider", () => {
  const mockDetect = config.detectEmbeddingProvider as any;
  const mockGetEnvVar = config.getEnvVar as any;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null when no provider is detected", () => {
    mockDetect.mockReturnValue(null);
    const provider = createEmbeddingProvider();
    expect(provider).toBeNull();
  });

  it("returns GeminiEmbeddingProvider when gemini is detected", () => {
    mockDetect.mockReturnValue("gemini");
    mockGetEnvVar.mockReturnValue("test-key");
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(GeminiEmbeddingProvider);
    expect(provider!.name).toBe("gemini");
  });

  it("returns OpenAIEmbeddingProvider when openai is detected", () => {
    mockDetect.mockReturnValue("openai");
    mockGetEnvVar.mockReturnValue("test-key");
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
    expect(provider!.name).toBe("openai");
  });

  it("uses the detected provider", () => {
    mockDetect.mockReturnValue("openai");
    mockGetEnvVar.mockReturnValue("test-key");
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
  });
});
