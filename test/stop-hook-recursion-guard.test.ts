import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSdkChildContext } from "../src/hooks/sdk-guard.js";
import { NoopProvider } from "../src/providers/noop.js";

describe("isSdkChildContext — Stop hook recursion guard", () => {
  const originalEnv = process.env.AGENTMEMORY_SDK_CHILD;

  beforeEach(() => {
    delete process.env.AGENTMEMORY_SDK_CHILD;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_SDK_CHILD;
    } else {
      process.env.AGENTMEMORY_SDK_CHILD = originalEnv;
    }
  });

  it("returns true when AGENTMEMORY_SDK_CHILD=1 is in env", () => {
    process.env.AGENTMEMORY_SDK_CHILD = "1";
    expect(isSdkChildContext({})).toBe(true);
  });

  it("returns true when payload.entrypoint === 'sdk-ts'", () => {
    expect(isSdkChildContext({ entrypoint: "sdk-ts" })).toBe(true);
  });

  it("returns false for a normal CC payload", () => {
    expect(isSdkChildContext({ entrypoint: "cli", session_id: "s1" })).toBe(false);
  });

  it("returns false when payload is null / undefined / non-object", () => {
    expect(isSdkChildContext(null)).toBe(false);
    expect(isSdkChildContext(undefined)).toBe(false);
    expect(isSdkChildContext("not-an-object")).toBe(false);
    expect(isSdkChildContext(42)).toBe(false);
  });

  it("env marker wins over payload shape", () => {
    process.env.AGENTMEMORY_SDK_CHILD = "1";
    expect(isSdkChildContext({ entrypoint: "cli" })).toBe(true);
  });
});

describe("NoopProvider — no-op fallback when no LLM key present", () => {
  it("reports name 'noop' so callers can detect it and short-circuit", () => {
    const p = new NoopProvider();
    expect(p.name).toBe("noop");
  });

  it("returns empty string for compress and summarize", async () => {
    const p = new NoopProvider();
    await expect(p.compress()).resolves.toBe("");
    await expect(p.summarize()).resolves.toBe("");
  });
});
