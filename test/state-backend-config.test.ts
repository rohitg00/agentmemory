import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEYS = ["AGENTMEMORY_STATE_BACKEND", "AGENTMEMORY_REDIS_URL"] as const;

describe("getStateBackend / getRedisUrl", () => {
  const saved: Record<string, string | undefined> = {};
  let sandboxHome: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let config: typeof import("../src/config.js");

  beforeEach(async () => {
    sandboxHome = mkdtempSync(join(tmpdir(), "am-statecfg-"));
    savedHome = process.env["HOME"];
    savedUserProfile = process.env["USERPROFILE"];
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // src/config.ts computes its DATA_DIR/env-file path from HOME at module
    // import time, so HOME must be sandboxed before the first import, not
    // just before each getStateBackend()/getRedisUrl() call.
    vi.resetModules();
    config = await import("../src/config.js");
    config.__resetEnvFileCache();
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
    config.__resetEnvFileCache();
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("defaults to file when unset", () => {
    expect(config.getStateBackend()).toBe("file");
  });

  it("throws a clear error for an unrecognized value instead of silently using file", () => {
    process.env["AGENTMEMORY_STATE_BACKEND"] = "sqlite";
    expect(() => config.getStateBackend()).toThrow(/AGENTMEMORY_STATE_BACKEND="sqlite"/);
  });

  it("treats an empty string the same as unset", () => {
    process.env["AGENTMEMORY_STATE_BACKEND"] = "";
    expect(config.getStateBackend()).toBe("file");
  });

  it("returns redis when explicitly set, case-insensitively", () => {
    process.env["AGENTMEMORY_STATE_BACKEND"] = "Redis";
    expect(config.getStateBackend()).toBe("redis");
  });

  it("returns undefined for AGENTMEMORY_REDIS_URL when unset", () => {
    expect(config.getRedisUrl()).toBeUndefined();
  });

  it("returns the trimmed AGENTMEMORY_REDIS_URL when set", () => {
    process.env["AGENTMEMORY_REDIS_URL"] = "  redis://localhost:6379  ";
    expect(config.getRedisUrl()).toBe("redis://localhost:6379");
  });
});
