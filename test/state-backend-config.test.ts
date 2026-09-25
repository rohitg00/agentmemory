import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRedisUrl, getStateBackend, __resetEnvFileCache } from "../src/config.js";

const KEYS = ["AGENTMEMORY_STATE_BACKEND", "AGENTMEMORY_REDIS_URL"] as const;

describe("getStateBackend / getRedisUrl", () => {
  const saved: Record<string, string | undefined> = {};
  let sandboxHome: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;

  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "am-statecfg-"));
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

  it("defaults to file when unset", () => {
    expect(getStateBackend()).toBe("file");
  });

  it("returns file for an unrecognized value", () => {
    process.env["AGENTMEMORY_STATE_BACKEND"] = "sqlite";
    expect(getStateBackend()).toBe("file");
  });

  it("returns redis when explicitly set, case-insensitively", () => {
    process.env["AGENTMEMORY_STATE_BACKEND"] = "Redis";
    expect(getStateBackend()).toBe("redis");
  });

  it("returns undefined for AGENTMEMORY_REDIS_URL when unset", () => {
    expect(getRedisUrl()).toBeUndefined();
  });

  it("returns the trimmed AGENTMEMORY_REDIS_URL when set", () => {
    process.env["AGENTMEMORY_REDIS_URL"] = "  redis://localhost:6379  ";
    expect(getRedisUrl()).toBe("redis://localhost:6379");
  });
});
