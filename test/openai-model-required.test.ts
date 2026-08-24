import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Regression for the Novita PR review: OPENAI_BASE_URL pointed at a
// non-default, non-Azure endpoint (Novita, DeepSeek, SiliconFlow, local
// servers) with OPENAI_MODEL unset used to silently fall back to
// gpt-5.6-luna, a model those providers don't serve, producing failing
// requests instead of a clear misconfiguration error.

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_FOR_LLM",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "MINIMAX_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
];

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];
const ORIGINAL: Record<string, string | undefined> = {};

let sandboxHome: string;

async function freshConfig() {
  vi.resetModules();
  return await import("../src/config.js");
}

function writeEnv(contents: string) {
  const dir = join(sandboxHome, ".agentmemory");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".env"), contents);
}

describe("detectProvider — OPENAI_MODEL required for non-default OpenAI-compatible base URLs", () => {
  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-openai-model-"));
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    for (const k of ENV_KEYS) {
      ORIGINAL[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
    for (const k of ENV_KEYS) {
      if (ORIGINAL[k] === undefined) delete process.env[k];
      else process.env[k] = ORIGINAL[k];
    }
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("throws when OPENAI_BASE_URL=Novita and OPENAI_MODEL is unset", async () => {
    writeEnv(
      "OPENAI_API_KEY=sk-test\nOPENAI_BASE_URL=https://api.novita.ai/openai/v1",
    );
    const cfg = await freshConfig();
    expect(() => cfg.loadConfig()).toThrow(/OPENAI_MODEL is required/);
  });

  it("succeeds when OPENAI_BASE_URL=Novita and OPENAI_MODEL is set", async () => {
    writeEnv(
      "OPENAI_API_KEY=sk-test\nOPENAI_BASE_URL=https://api.novita.ai/openai/v1\nOPENAI_MODEL=deepseek/deepseek-v4-pro",
    );
    const cfg = await freshConfig();
    const loaded = cfg.loadConfig();
    expect(loaded.provider.model).toBe("deepseek/deepseek-v4-pro");
  });

  it("does not require OPENAI_MODEL for the default OpenAI endpoint", async () => {
    writeEnv("OPENAI_API_KEY=sk-test");
    const cfg = await freshConfig();
    const loaded = cfg.loadConfig();
    expect(loaded.provider.model).toBe("gpt-5.6-luna");
  });

  it("does not require OPENAI_MODEL for Azure OpenAI", async () => {
    writeEnv(
      "OPENAI_API_KEY=sk-test\nOPENAI_BASE_URL=https://myresource.openai.azure.com/openai/deployments/mydeploy",
    );
    const cfg = await freshConfig();
    expect(() => cfg.loadConfig()).not.toThrow();
  });

  it("does not require OPENAI_MODEL when OPENAI_API_KEY_FOR_LLM=false scopes the key to embeddings only", async () => {
    writeEnv(
      "OPENAI_API_KEY=sk-test\nOPENAI_API_KEY_FOR_LLM=false\nOPENAI_BASE_URL=https://api.novita.ai/openai/v1",
    );
    const cfg = await freshConfig();
    expect(() => cfg.loadConfig()).not.toThrow();
  });
});
