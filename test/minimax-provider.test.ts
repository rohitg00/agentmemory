import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const envKeys = [
  "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "OPENAI_REASONING_EFFORT",
  "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENROUTER_API_KEY",
  "MINIMAX_API_KEY", "MINIMAX_MODEL", "MINIMAX_BASE_URL", "MAX_TOKENS",
];

describe("MiniMax request configuration", () => {
  let home: string;

  beforeEach(() => {
    vi.resetModules();
    home = mkdtempSync(join(tmpdir(), "agentmemory-minimax-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    for (const key of envKeys) vi.stubEnv(key, undefined);
    vi.stubEnv("MINIMAX_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function mockResponse() {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ content: [
        { type: "thinking", thinking: "internal reasoning" },
        { type: "text", text: "summary" },
      ] }), { status: 200 }),
    );
  }

  it.each(["compress", "summarize"] as const)(
    "sends the Flash default through loadConfig and createProvider for %s",
    async (method) => {
      const fetchSpy = mockResponse();
      const { loadConfig } = await import("../src/config.js");
      const { createProvider } = await import("../src/providers/index.js");
      const provider = createProvider(loadConfig().provider);

      expect(await provider[method]("system", "user")).toBe("summary");
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, request] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.minimax.io/anthropic/v1/messages");
      expect(request?.headers).toEqual({
        "Content-Type": "application/json",
        "x-api-key": "test-key",
        "anthropic-version": "2023-06-01",
      });
      expect(JSON.parse(String(request?.body))).toEqual({
        model: "MiniMax-M3.1-Flash",
        max_tokens: 4096,
        system: "system",
        messages: [{ role: "user", content: "user" }],
      });
    },
  );

  it.each(["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed", "custom-model"])(
    "preserves saved %s requests and regional endpoints",
    async (model) => {
      mkdirSync(join(home, ".agentmemory"));
      writeFileSync(join(home, ".agentmemory", ".env"),
        `MINIMAX_MODEL=${model}\nMINIMAX_BASE_URL=https://api.minimaxi.com/anthropic\nMAX_TOKENS=2048\n`);
      const fetchSpy = mockResponse();
      const { loadConfig } = await import("../src/config.js");
      const { createProvider } = await import("../src/providers/index.js");

      await createProvider(loadConfig().provider).compress("system", "user");

      const [url, request] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.minimaxi.com/anthropic/v1/messages");
      expect(JSON.parse(String(request?.body))).toEqual({
        model, max_tokens: 2048, system: "system",
        messages: [{ role: "user", content: "user" }],
      });
    },
  );

  it("keeps environment overrides and custom endpoints", async () => {
    mkdirSync(join(home, ".agentmemory"));
    writeFileSync(join(home, ".agentmemory", ".env"), "MINIMAX_MODEL=MiniMax-M2.7\n");
    vi.stubEnv("MINIMAX_MODEL", "MiniMax-M3");
    vi.stubEnv("MINIMAX_BASE_URL", "https://custom.example.com/anthropic");
    const fetchSpy = mockResponse();
    const { loadConfig } = await import("../src/config.js");
    const { createProvider } = await import("../src/providers/index.js");

    await createProvider(loadConfig().provider).summarize("system", "user");

    expect(fetchSpy.mock.calls[0][0]).toBe("https://custom.example.com/anthropic/v1/messages");
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).model).toBe("MiniMax-M3");
  });

  it.each([
    ["https://api.minimax.io/v1", "MiniMax-M3.1-Flash"],
    ["https://api.minimaxi.com/v1", "MiniMax-M3.1-Flash"],
    ["https://api.minimax.io/v1", "MiniMax-M3"],
    ["https://api.minimaxi.com/v1", "MiniMax-M3"],
  ])("preserves explicit compatible requests to %s with %s", async (baseURL, model) => {
    vi.stubEnv("OPENAI_API_KEY", "test-compatible-key");
    vi.stubEnv("OPENAI_BASE_URL", baseURL);
    vi.stubEnv("OPENAI_MODEL", model);
    vi.stubEnv("OPENAI_REASONING_EFFORT", "max");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: "summary" } }] }),
      { status: 200 },
    ));
    const { loadConfig } = await import("../src/config.js");
    const { createProvider } = await import("../src/providers/index.js");

    expect(await createProvider(loadConfig().provider).compress("system", "user")).toBe("summary");

    const [url, request] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${baseURL}/chat/completions`);
    expect(JSON.parse(String(request?.body))).toEqual({
      model, max_tokens: 4096, stream: false, reasoning_effort: "max",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
    });
  });

  it.each([undefined, "MiniMax-M3", "MiniMax-M2.7", "custom-model"])(
    "serializes the resolved fallback model (%s)", async (model) => {
      vi.stubEnv("MINIMAX_MODEL", model);
      vi.stubEnv("OPENAI_API_KEY", "test-primary-key");
      const fetchSpy = mockResponse().mockResolvedValueOnce(new Response("unsupported model", { status: 400 }));
      const { createFallbackProvider } = await import("../src/providers/index.js");
      const provider = createFallbackProvider(
        { provider: "openai", model: "primary-model", maxTokens: 1024 },
        { providers: ["minimax"] },
      );

      expect(await provider.compress("system", "user")).toBe("summary");

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [url, request] = fetchSpy.mock.calls[1];
      expect(url).toBe("https://api.minimax.io/anthropic/v1/messages");
      expect(JSON.parse(String(request?.body))).toEqual({
        model: model || "MiniMax-M3.1-Flash", max_tokens: 1024, system: "system",
        messages: [{ role: "user", content: "user" }],
      });
    },
  );
});
