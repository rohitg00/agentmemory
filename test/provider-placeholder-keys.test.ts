import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fakeHome = mkdtempSync(join(tmpdir(), "agentmemory-placeholder-"));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => fakeHome };
});

const PROVIDER_ENV = /(API_KEY|_KEY$|_TOKEN$|PROVIDER|_BASE_URL$|^AGENTMEMORY_ALLOW_AGENT_SDK$|^OLLAMA)/;

describe("placeholder provider keys", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    for (const key of Object.keys(process.env)) {
      if (PROVIDER_ENV.test(key)) {
        saved[key] = process.env[key];
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (PROVIDER_ENV.test(key)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ["anthropic", "ANTHROPIC_API_KEY", "sk-ant-..."],
    ["openai", "OPENAI_API_KEY", "sk-..."],
    ["openrouter", "OPENROUTER_API_KEY", "changeme"],
    ["minimax", "MINIMAX_API_KEY", "your-key-here"],
    ["gemini", "GEMINI_API_KEY", "xxxx-xxxx"],
    ["gemini", "GOOGLE_API_KEY", "your-key-here"],
    ["openrouter", "OPENROUTER_API_KEY", "CHANGEME"],
    ["anthropic", "ANTHROPIC_API_KEY", "todo"],
    ["gemini", "GEMINI_API_KEY", "XXXX-XXXX"],
    ["openrouter", "OPENROUTER_API_KEY", "sk-or-v1-..."],
    ["anthropic", "ANTHROPIC_API_KEY", "   "],
    ["anthropic", "ANTHROPIC_API_KEY", "sk-ant-... "],
  ])("runs zero-LLM when %s is chosen but %s=%s", async (provider, key, value) => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = provider;
    process.env[key] = value;
    const { loadConfig, detectLlmProviderKind, llmOptInHint } = await import("../src/config.js");

    expect(loadConfig().provider.provider).toBe("noop");
    expect(detectLlmProviderKind()).toBe("noop");
    expect(llmOptInHint()).toContain(`AGENTMEMORY_LLM_PROVIDER=${provider} is set, but`);
  });

  it("does not offer a provider whose only key is a placeholder", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-...";
    process.env["GEMINI_API_KEY"] = "your-key-here";
    process.env["GOOGLE_API_KEY"] = "AIzaRealKey123";
    const { llmOptInHint } = await import("../src/config.js");

    const hint = llmOptInHint();
    expect(hint).toContain("Found GOOGLE_API_KEY,");
    expect(hint).toContain("AGENTMEMORY_LLM_PROVIDER=gemini");
    expect(hint).not.toContain("ANTHROPIC_API_KEY");
    expect(hint).not.toContain("GEMINI_API_KEY");

    delete process.env["GOOGLE_API_KEY"];
    expect(llmOptInHint()).toBeNull();
  });

  it("rejects every sample value in .env.example", async () => {
    const { isRealProviderKey } = await import("../src/config.js");
    const example = readFileSync(join(import.meta.dirname, "..", ".env.example"), "utf-8");
    const samples = [...example.matchAll(/^#\s*([A-Z_]+_API_KEY)=(\S+)/gm)];

    expect(samples.length).toBeGreaterThan(0);
    for (const [, key, value] of samples) {
      expect(isRealProviderKey({ [key]: value }, key), `${key}=${value}`).toBe(false);
    }
  });

  it("keeps a dummy OpenAI key for a plain-http OPENAI_BASE_URL", async () => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "xxx";
    process.env["OPENAI_BASE_URL"] = "http://localhost:11434/v1";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { loadConfig, detectLlmProviderKind } = await import("../src/config.js");
    const { createProvider } = await import("../src/providers/index.js");
    const { realProviderKeys, placeholderProviderKeys } = await import(
      "../src/cli/doctor-diagnostics.js"
    );

    const config = loadConfig();
    expect(config.provider.provider).toBe("openai");
    expect(detectLlmProviderKind()).toBe("llm");
    await createProvider(config.provider).compress("system", "user");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("localhost:11434");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer xxx");

    const env = { OPENAI_API_KEY: "xxx", OPENAI_BASE_URL: "http://localhost:11434/v1" };
    expect(realProviderKeys(env)).toEqual(["OPENAI_API_KEY"]);
    expect(placeholderProviderKeys(env)).toEqual([]);
  });

  it.each([undefined, "", "   "])("does not count OPENAI_API_KEY=%j behind a plain-http OPENAI_BASE_URL", async (key) => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "openai";
    process.env["OPENAI_BASE_URL"] = "http://localhost:11434/v1";
    if (key !== undefined) process.env["OPENAI_API_KEY"] = key;
    const { loadConfig, detectLlmProviderKind, llmOptInHint } = await import("../src/config.js");
    const { realProviderKeys } = await import("../src/cli/doctor-diagnostics.js");

    expect(loadConfig().provider.provider).toBe("noop");
    expect(detectLlmProviderKind()).toBe("noop");
    expect(llmOptInHint()).toContain("OPENAI_API_KEY is not");
    expect(realProviderKeys({ OPENAI_API_KEY: key ?? "", OPENAI_BASE_URL: "http://localhost:11434/v1" })).toEqual([]);
  });

  it("keeps a dummy OpenAI key for a plain-http server on another host", async () => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "xxx";
    process.env["OPENAI_BASE_URL"] = "http://vllm.lan:8000/v1";
    const { loadConfig, detectLlmProviderKind } = await import("../src/config.js");
    const { realProviderKeys } = await import("../src/cli/doctor-diagnostics.js");

    expect(loadConfig().provider.provider).toBe("openai");
    expect(detectLlmProviderKind()).toBe("llm");
    expect(
      realProviderKeys({ OPENAI_API_KEY: "xxx", OPENAI_BASE_URL: "http://vllm.lan:8000/v1" }),
    ).toEqual(["OPENAI_API_KEY"]);
  });

  it("keeps a sample OpenAI key for a plain-http OPENAI_BASE_URL", async () => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "sk-...";
    process.env["OPENAI_BASE_URL"] = "http://localhost:11434/v1";
    const { loadConfig, detectLlmProviderKind } = await import("../src/config.js");
    const { realProviderKeys } = await import("../src/cli/doctor-diagnostics.js");

    expect(loadConfig().provider.provider).toBe("openai");
    expect(detectLlmProviderKind()).toBe("llm");
    expect(
      realProviderKeys({ OPENAI_API_KEY: "sk-...", OPENAI_BASE_URL: "http://localhost:11434/v1" }),
    ).toEqual(["OPENAI_API_KEY"]);
  });

  it("does not keep a placeholder OpenAI key for an https OPENAI_BASE_URL", async () => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "sk-...";
    process.env["OPENAI_BASE_URL"] = "https://api.openai.com";
    const { loadConfig, detectLlmProviderKind } = await import("../src/config.js");
    const { placeholderProviderKeys } = await import("../src/cli/doctor-diagnostics.js");

    expect(loadConfig().provider.provider).toBe("noop");
    expect(detectLlmProviderKind()).toBe("noop");
    expect(
      placeholderProviderKeys({ OPENAI_API_KEY: "sk-...", OPENAI_BASE_URL: "https://api.openai.com" }),
    ).toEqual(["OPENAI_API_KEY"]);
  });

  it("keeps OPENAI_BASE_URL from excusing other placeholder keys", async () => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-...";
    process.env["OPENAI_BASE_URL"] = "http://localhost:11434/v1";
    const { loadConfig, detectLlmProviderKind } = await import("../src/config.js");
    const { placeholderProviderKeys } = await import("../src/cli/doctor-diagnostics.js");

    expect(loadConfig().provider.provider).toBe("noop");
    expect(detectLlmProviderKind()).toBe("noop");
    expect(
      placeholderProviderKeys({ ANTHROPIC_API_KEY: "sk-ant-...", OPENAI_BASE_URL: "http://localhost:11434/v1" }),
    ).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it.each([
    ["anthropic", "ANTHROPIC_API_KEY", "sk-ant-..."],
    ["minimax", "MINIMAX_API_KEY", "changeme"],
    ["openrouter", "OPENROUTER_API_KEY", "sk-or-..."],
    ["openai", "OPENAI_API_KEY", "sk-..."],
  ] as const)("does not build the %s provider from a placeholder %s", async (provider, key, value) => {
    process.env[key] = value;
    const { createProvider } = await import("../src/providers/index.js");

    expect(() => createProvider({ provider, model: "m", maxTokens: 1 })).toThrow(key);
  });

  it.each([
    ["anthropic", "ANTHROPIC_API_KEY", "sk-ant-api03-abc123"],
    ["openai", "OPENAI_API_KEY", "xai-abc123def"],
  ] as const)("still uses the chosen %s provider with a real %s", async (provider, key, value) => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = provider;
    process.env[key] = value;
    const { loadConfig } = await import("../src/config.js");

    expect(loadConfig().provider.provider).toBe(provider);
  });

  it("sends GEMINI_API_KEY without a warning when both Gemini keys are real", async () => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "gemini";
    process.env["GEMINI_API_KEY"] = "AIzaGeminiKey456";
    process.env["GOOGLE_API_KEY"] = "AIzaRealKey123";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { loadConfig } = await import("../src/config.js");
    const { createProvider } = await import("../src/providers/index.js");

    const config = loadConfig();
    expect(config.provider.provider).toBe("gemini");
    await createProvider(config.provider).compress("system", "user");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer AIzaGeminiKey456");
    expect(process.stderr.write).not.toHaveBeenCalledWith(
      expect.stringContaining("GOOGLE_API_KEY detected"),
    );
  });

  it("sends GOOGLE_API_KEY when GEMINI_API_KEY is a placeholder", async () => {
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "gemini";
    process.env["GEMINI_API_KEY"] = "your-key-here";
    process.env["GOOGLE_API_KEY"] = "AIzaRealKey123";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { loadConfig } = await import("../src/config.js");
    const { createProvider } = await import("../src/providers/index.js");

    const config = loadConfig();
    expect(config.provider.provider).toBe("gemini");
    await createProvider(config.provider).compress("system", "user");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer AIzaRealKey123");
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("GOOGLE_API_KEY detected"),
    );
  });
});
