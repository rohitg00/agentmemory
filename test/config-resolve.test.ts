import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveTeamId, resolveUserId } from "../src/config.js";

describe("resolveTeamId", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.TEAM_ID;
    delete process.env.AGENTMEMORY_USER_ID;
  });

  afterEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (!(k in originalEnv)) delete process.env[k];
    });
    Object.assign(process.env, originalEnv);
  });

  it("returns TEAM_ID from env", () => {
    process.env.TEAM_ID = "my-team";
    expect(resolveTeamId()).toBe("my-team");
  });

  it("returns undefined when TEAM_ID not set", () => {
    expect(resolveTeamId()).toBeUndefined();
  });
});

describe("resolveUserId", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AGENTMEMORY_USER_ID;
    delete process.env.USER_ID;
  });

  afterEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (!(k in originalEnv)) delete process.env[k];
    });
    Object.assign(process.env, originalEnv);
  });

  it("returns override when provided", () => {
    process.env.AGENTMEMORY_USER_ID = "env-user";
    expect(resolveUserId("override-user")).toBe("override-user");
  });

  it("falls back to AGENTMEMORY_USER_ID when no override", () => {
    process.env.AGENTMEMORY_USER_ID = "env-user";
    expect(resolveUserId()).toBe("env-user");
  });

  it("returns undefined when no override and no env", () => {
    expect(resolveUserId()).toBeUndefined();
  });

  it("trims whitespace from override", () => {
    expect(resolveUserId("  mama  ")).toBe("mama");
  });

  it("truncates override to 128 chars", () => {
    const long = "b".repeat(200);
    const result = resolveUserId(long);
    expect(result).toBeDefined();
    expect(result!.length).toBe(128);
  });

  it("empty string override falls back to env", () => {
    process.env.AGENTMEMORY_USER_ID = "env-user";
    expect(resolveUserId("")).toBe("env-user");
    expect(resolveUserId("  ")).toBe("env-user");
  });
});
