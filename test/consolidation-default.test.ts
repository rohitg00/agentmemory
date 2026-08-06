import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENV_KEYS = [
  "CONSOLIDATION_ENABLED",
  "AGENTMEMORY_PROVIDER",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_FOR_LLM",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "MINIMAX_API_KEY",
  "OPENAI_BASE_URL",
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

describe("isConsolidationEnabled default behavior", () => {
  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-consolidation-"));
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

  it("returns false when no LLM provider configured (default BM25-only mode)", async () => {
    writeEnv("");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(false);
  });

  it("returns true by default when ANTHROPIC_API_KEY is set", async () => {
    writeEnv("ANTHROPIC_API_KEY=sk-test-123");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(true);
  });

  it("returns true by default when OPENAI_API_KEY is set", async () => {
    writeEnv("OPENAI_API_KEY=sk-test-123");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(true);
  });

  it("returns true by default when OPENAI_BASE_URL is set (local OpenAI-compatible)", async () => {
    writeEnv("OPENAI_BASE_URL=http://localhost:1234/v1");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(true);
  });

  it("returns true by default when AGENTMEMORY_PROVIDER=agent-sdk", async () => {
    writeEnv("AGENTMEMORY_PROVIDER=agent-sdk");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(true);
  });

  it("explicit CONSOLIDATION_ENABLED=false overrides provider-based default", async () => {
    writeEnv("ANTHROPIC_API_KEY=sk-test-123\nCONSOLIDATION_ENABLED=false");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(false);
  });

  it("explicit CONSOLIDATION_ENABLED=true overrides absence of provider", async () => {
    writeEnv("CONSOLIDATION_ENABLED=true");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(true);
  });

  it("AGENTMEMORY_PROVIDER=noop returns false even with API key set", async () => {
    writeEnv("AGENTMEMORY_PROVIDER=noop\nANTHROPIC_API_KEY=sk-test-123");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(false);
  });

  it("OPENAI_API_KEY_FOR_LLM=false scopes the key to embeddings only", async () => {
    writeEnv("OPENAI_API_KEY=sk-test-123\nOPENAI_API_KEY_FOR_LLM=false");
    const cfg = await freshConfig();
    expect(cfg.isConsolidationEnabled()).toBe(false);
  });
});
