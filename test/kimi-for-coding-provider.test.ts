import { describe, expect, it, afterEach } from "vitest";
import { KimiForCodingProvider } from "../src/providers/kimi-for-coding.js";

describe("KimiForCodingProvider — base URL and header resolution", () => {
  const originalEnv = process.env["KIMI_BASE_URL"];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["KIMI_BASE_URL"];
    } else {
      process.env["KIMI_BASE_URL"] = originalEnv;
    }
  });

  it("defaults to https://api.kimi.com/coding", () => {
    delete process.env["KIMI_BASE_URL"];
    const provider = new KimiForCodingProvider("test-key", "kimi-k2", 4096);
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://api.kimi.com/coding",
    );
  });

  it("honors KIMI_BASE_URL via getEnvVar", () => {
    process.env["KIMI_BASE_URL"] = "https://custom.kimi.example.com/coding";
    const provider = new KimiForCodingProvider("test-key", "kimi-k2", 4096);
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://custom.kimi.example.com/coding",
    );
  });
});
