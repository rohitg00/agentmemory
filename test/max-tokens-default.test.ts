import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, __resetEnvFileCache } from "../src/config.js";

// detectProvider defaults MAX_TOKENS to 16384. The old 4096 cap truncated
// compression/summarise completions for long sessions: the model stops at
// the cap mid-JSON and the downstream parse drops the whole request. 16384
// is the value the README already recommends for empty graph extractions.

const KEYS = [
  "MAX_TOKENS",
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_FOR_LLM",
  "OPENAI_MODEL",
] as const;
const DEFAULT_MAX_TOKENS = 16384;

describe("loadConfig MAX_TOKENS default", () => {
  const saved: Record<string, string | undefined> = {};
  let sandboxHome: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;

  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "am-maxtokens-"));
    savedHome = process.env["HOME"];
    savedUserProfile = process.env["USERPROFILE"];
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    __resetEnvFileCache();
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    if (savedHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = savedHome;
    if (savedUserProfile === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = savedUserProfile;
    __resetEnvFileCache();
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("defaults to 16384 when MAX_TOKENS is unset", () => {
    process.env["OPENAI_API_KEY"] = "sk-test-123";
    expect(loadConfig().provider.maxTokens).toBe(DEFAULT_MAX_TOKENS);
  });

  it("honours an explicit MAX_TOKENS override", () => {
    process.env["OPENAI_API_KEY"] = "sk-test-123";
    process.env["MAX_TOKENS"] = "8192";
    expect(loadConfig().provider.maxTokens).toBe(8192);
  });
});
