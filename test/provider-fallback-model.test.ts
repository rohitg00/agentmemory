import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFallbackProvider } from "../src/providers/index.js";

describe("createFallbackProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    process.env.GEMINI_API_KEY = "gemini-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("uses each fallback provider's own model instead of the primary model", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      if (bodies.length === 1) {
        return new Response("primary quota exhausted", { status: 429 });
      }
      return Response.json({
        choices: [{ message: { content: "fallback ok" } }],
      });
    });

    const provider = createFallbackProvider(
      { provider: "openai", model: "gpt-4o-mini", maxTokens: 256 },
      { providers: ["gemini"] },
    );

    await expect(provider.compress("system", "user")).resolves.toBe("fallback ok");

    expect(bodies).toHaveLength(2);
    expect(bodies[0].model).toBe("gpt-4o-mini");
    expect(bodies[1].model).toBe("gemini-2.5-flash");
  });
});
