import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENAI_API_KEY_FOR_LLM",
  "AGENTMEMORY_SUPPRESS_COST_WARNING",
];

async function warningsFor(env: Record<string, string>, loads = 1): Promise<string[]> {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const writes: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  });
  vi.resetModules();
  const { loadConfig } = await import("../src/config.js");
  for (let i = 0; i < loads; i++) loadConfig();
  return writes.filter((w) => w.includes("premium tier"));
}

describe("premium-model cost warning", () => {
  beforeEach(() => {
    for (const k of KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
    vi.restoreAllMocks();
  });

  it("warns once for a premium OPENAI_MODEL, naming that variable", async () => {
    const warnings = await warningsFor(
      { OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://openrouter.ai/api/v1", OPENAI_MODEL: "anthropic/claude-sonnet-5" },
      2,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("OPENAI_MODEL=anthropic/claude-sonnet-5 is in the premium tier");
  });

  it("stays quiet for the default and for cheap OpenAI-compatible models", async () => {
    expect(await warningsFor({ OPENAI_API_KEY: "k" })).toHaveLength(0);
    expect(await warningsFor({ OPENAI_API_KEY: "k", OPENAI_MODEL: "deepseek/deepseek-v4.1-flash:floor" })).toHaveLength(0);
  });

  it("is silenced by AGENTMEMORY_SUPPRESS_COST_WARNING", async () => {
    const warnings = await warningsFor({
      OPENAI_API_KEY: "k",
      OPENAI_MODEL: "gpt-4o",
      AGENTMEMORY_SUPPRESS_COST_WARNING: "1",
    });
    expect(warnings).toHaveLength(0);
  });

  it("keeps the OpenRouter warning text", async () => {
    const warnings = await warningsFor({
      OPENROUTER_API_KEY: "k",
      OPENROUTER_MODEL: "anthropic/claude-opus-5",
      OPENAI_API_KEY_FOR_LLM: "false",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("OPENROUTER_MODEL=anthropic/claude-opus-5 is in the premium tier");
  });
});
