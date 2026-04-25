import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("Provider Detection Priority and Overrides", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all relevant env vars
    const vars = [
      "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY",
      "MINIMAX_API_KEY", "LMSTUDIO_BASE_URL", "OLLAMA_MODEL", "VLLM_BASE_URL",
      "AGENTMEMORY_PROVIDER", "OPENAI_MODEL"
    ];
    vars.forEach(v => delete process.env[v]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("prioritizes legacy providers over new local providers", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    process.env["OLLAMA_MODEL"] = "llama3";
    
    const config = loadConfig();
    expect(config.provider.provider).toBe("anthropic");
    expect(config.provider.model).toBe("claude-sonnet-4-20250514");
  });

  it("prioritizes openai over anthropic", () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-test";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    
    const config = loadConfig();
    expect(config.provider.provider).toBe("openai");
    expect(config.provider.model).toBe("openai-default");
  });

  it("respects AGENTMEMORY_PROVIDER override and sets correct default model", () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-test";
    process.env["AGENTMEMORY_PROVIDER"] = "ollama";
    
    const config = loadConfig();
    expect(config.provider.provider).toBe("ollama");
    expect(config.provider.model).toBe("llama3");
  });

  it("allows AGENTMEMORY_PROVIDER without a corresponding API key", () => {
    process.env["AGENTMEMORY_PROVIDER"] = "openai";
    // No OPENAI_API_KEY set
    
    const config = loadConfig();
    expect(config.provider.provider).toBe("openai");
    expect(config.provider.model).toBe("openai-default");
  });

  it("uses openai-default when OPENAI_MODEL is unset", () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-test";
    const config = loadConfig();
    expect(config.provider.model).toBe("openai-default");
  });

  it("uses provided OPENAI_MODEL when set", () => {
    process.env["OPENAI_API_KEY"] = "sk-openai-test";
    process.env["OPENAI_MODEL"] = "gpt-4o-mini";
    const config = loadConfig();
    expect(config.provider.model).toBe("gpt-4o-mini");
  });
});
