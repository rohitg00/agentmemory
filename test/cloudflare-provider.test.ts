import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { CloudflareProvider } from "../src/providers/cloudflare.js";
import { CloudflareEmbeddingProvider } from "../src/providers/embedding/cloudflare.js";
import { loadConfig, loadFallbackConfig } from "../src/config.js";

const CLOUDFLARE_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_MODEL",
  "CLOUDFLARE_AI_BASE_URL",
  "CLOUDFLARE_AI_GATEWAY_ID",
  "CLOUDFLARE_TIMEOUT_MS",
  "CLOUDFLARE_EMBEDDING_MODEL",
  "CLOUDFLARE_EMBEDDING_BASE_URL",
  "CLOUDFLARE_EMBEDDING_DIMENSIONS",
];

// Keys that would win the detectProvider / detectEmbeddingProvider race and
// mask the Cloudflare branch under test.
const COMPETING_KEYS = [
  "OPENAI_API_KEY",
  "MINIMAX_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "AGENTMEMORY_LLM_TIMEOUT_MS",
  "FALLBACK_PROVIDERS",
];

// Blank rather than delete: getMergedEnv layers process.env over the
// developer's real ~/.agentmemory/.env, so deleting a key here would let that
// file's value through. Every read path treats "" as absent (hasRealValue
// trims, the rest test truthiness), so blanking neutralises both layers.
function clearEnv(keys: string[]): void {
  for (const key of keys) process.env[key] = "";
}

const baseUrlOf = (p: CloudflareProvider) =>
  (p as unknown as { baseUrl: string }).baseUrl;
const timeoutOf = (p: CloudflareProvider) =>
  (p as unknown as { timeoutMs: number }).timeoutMs;

describe("CloudflareProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearEnv([...CLOUDFLARE_KEYS, ...COMPETING_KEYS]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("builds the account-scoped OpenAI-compatible chat endpoint", () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct-123";
    const provider = new CloudflareProvider("test-token", "@cf/meta/llama-3.1-8b-instruct-fp8", 800);
    expect(baseUrlOf(provider)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/v1/chat/completions",
    );
  });

  it("prefers an explicit base URL over the account-derived one", () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct-123";
    process.env["CLOUDFLARE_AI_BASE_URL"] = "https://gateway.example.com/v1/chat/completions";
    const provider = new CloudflareProvider("test-token", "@cf/meta/llama-3.1-8b-instruct-fp8", 800);
    expect(baseUrlOf(provider)).toBe("https://gateway.example.com/v1/chat/completions");
  });

  it("throws when neither account id nor base URL is available", () => {
    expect(
      () => new CloudflareProvider("test-token", "@cf/meta/llama-3.1-8b-instruct-fp8", 800),
    ).toThrow(/CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_AI_BASE_URL/);
  });

  it("honors CLOUDFLARE_TIMEOUT_MS ahead of AGENTMEMORY_LLM_TIMEOUT_MS", () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct-123";
    process.env["AGENTMEMORY_LLM_TIMEOUT_MS"] = "5000";
    process.env["CLOUDFLARE_TIMEOUT_MS"] = "12000";
    const provider = new CloudflareProvider("test-token", "@cf/meta/llama-3.1-8b-instruct-fp8", 800);
    expect(timeoutOf(provider)).toBe(12000);
  });

  it("falls back to the 60s default when both timeout vars are unparseable", () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct-123";
    process.env["CLOUDFLARE_TIMEOUT_MS"] = "not-a-number";
    const provider = new CloudflareProvider("test-token", "@cf/meta/llama-3.1-8b-instruct-fp8", 800);
    expect(timeoutOf(provider)).toBe(60_000);
  });

  it("is selected by detectProvider when CLOUDFLARE_API_TOKEN is the only key", () => {
    process.env["CLOUDFLARE_API_TOKEN"] = "test-token";
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct-123";
    const config = loadConfig();
    expect(config.provider.provider).toBe("cloudflare");
    expect(config.provider.model).toBe("@cf/meta/llama-3.1-8b-instruct-fp8");
  });

  it("is accepted as a FALLBACK_PROVIDERS entry", () => {
    process.env["FALLBACK_PROVIDERS"] = "cloudflare";
    expect(loadFallbackConfig().providers).toContain("cloudflare");
  });
});

describe("CloudflareEmbeddingProvider — dimensions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearEnv([...CLOUDFLARE_KEYS, ...COMPETING_KEYS]);
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct-123";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to 768 for bge-base-en-v1.5", () => {
    expect(new CloudflareEmbeddingProvider("test-token").dimensions).toBe(768);
  });

  it("resolves 1024 for bge-large-en-v1.5 from the known-models table", () => {
    process.env["CLOUDFLARE_EMBEDDING_MODEL"] = "@cf/baai/bge-large-en-v1.5";
    expect(new CloudflareEmbeddingProvider("test-token").dimensions).toBe(1024);
  });

  it("resolves 384 for bge-small-en-v1.5 from the known-models table", () => {
    process.env["CLOUDFLARE_EMBEDDING_MODEL"] = "@cf/baai/bge-small-en-v1.5";
    expect(new CloudflareEmbeddingProvider("test-token").dimensions).toBe(384);
  });

  it("lets CLOUDFLARE_EMBEDDING_DIMENSIONS override a known model", () => {
    process.env["CLOUDFLARE_EMBEDDING_MODEL"] = "@cf/baai/bge-large-en-v1.5";
    process.env["CLOUDFLARE_EMBEDDING_DIMENSIONS"] = "256";
    expect(new CloudflareEmbeddingProvider("test-token").dimensions).toBe(256);
  });

  it("rejects a non-positive dimensions override", () => {
    process.env["CLOUDFLARE_EMBEDDING_DIMENSIONS"] = "0";
    expect(() => new CloudflareEmbeddingProvider("test-token")).toThrow(
      /must be a positive integer/,
    );
  });

  // parseInt would take "1024abc" as 1024 and "10.5" as 10, producing vectors
  // withDimensionGuard rejects on every embed. Typos fail at parse time.
  it.each(["1024abc", "10.5", "-768", "abc", "1e3"])(
    "rejects the malformed dimensions override %j",
    (value) => {
      process.env["CLOUDFLARE_EMBEDDING_DIMENSIONS"] = value;
      expect(() => new CloudflareEmbeddingProvider("test-token")).toThrow(
        /must be a positive integer/,
      );
    },
  );

  it("throws without an API token", () => {
    expect(() => new CloudflareEmbeddingProvider()).toThrow(/CLOUDFLARE_API_TOKEN is required/);
  });

  it("builds the account-scoped embeddings endpoint", () => {
    const provider = new CloudflareEmbeddingProvider("test-token");
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/v1/embeddings",
    );
  });
});

describe("CloudflareProvider — response parsing", () => {
  const originalEnv = process.env;

  const reply = (choice: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [choice] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

  const provider = () =>
    new CloudflareProvider("test-token", "@cf/zai-org/glm-4.7-flash", 64);

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearEnv([...CLOUDFLARE_KEYS, ...COMPETING_KEYS]);
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct-123";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("returns message content when present", async () => {
    reply({ finish_reason: "stop", message: { content: "a summary" } });
    await expect(provider().summarize("sys", "user")).resolves.toBe("a summary");
  });

  // Reasoning models return content:null plus a populated `reasoning` field when
  // the budget is spent thinking. That scratchpad must never reach memory.
  it("never returns chain-of-thought when a reasoning model truncates", async () => {
    reply({
      finish_reason: "length",
      message: { content: null, reasoning: "1. **Analyze the input:** the user wants..." },
    });
    await expect(provider().summarize("sys", "user")).rejects.toThrow(
      /hit the token limit before emitting content/,
    );
  });

  it("names MAX_TOKENS in the truncation error so the fix is obvious", async () => {
    reply({ finish_reason: "length", message: { content: "" } });
    await expect(provider().compress("sys", "user")).rejects.toThrow(/MAX_TOKENS/);
  });

  it("falls back to the completion-style text field", async () => {
    reply({ finish_reason: "stop", text: "legacy shape" });
    await expect(provider().summarize("sys", "user")).resolves.toBe("legacy shape");
  });

  const headersOfLastCall = () => {
    const mock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    return (mock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
  };

  // AI Gateway selects a named gateway by header, not by a different base URL.
  it("omits cf-aig-gateway-id when no gateway is pinned", async () => {
    reply({ finish_reason: "stop", message: { content: "x" } });
    await provider().summarize("sys", "user");
    expect(headersOfLastCall()).not.toHaveProperty("cf-aig-gateway-id");
  });

  it("sends cf-aig-gateway-id when CLOUDFLARE_AI_GATEWAY_ID is set", async () => {
    process.env["CLOUDFLARE_AI_GATEWAY_ID"] = "my-gateway";
    reply({ finish_reason: "stop", message: { content: "x" } });
    await provider().summarize("sys", "user");
    expect(headersOfLastCall()["cf-aig-gateway-id"]).toBe("my-gateway");
  });
});
