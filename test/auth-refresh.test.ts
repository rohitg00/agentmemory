import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Controllable execFile mock: records call count and lets each test decide how
// the spawned command resolves (success / error / timeout), so single-flight and
// cooldown can be asserted on the REAL underlying call count rather than a spy on
// the public method — and without depending on a host `true`/`sleep` binary.
const execFileCalls: Array<{ cmd: string; args: string[] }> = [];
let execFileBehavior: (cmd: string) => Error | null = () => null;

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    _opts: unknown,
    cb: (err: Error | null) => void,
  ) => {
    execFileCalls.push({ cmd, args });
    // Resolve on a microtask so concurrent run() calls share one in-flight promise.
    queueMicrotask(() => cb(execFileBehavior(cmd)));
  },
}));

import {
  AuthRefresh,
  isAuthExpiry,
  tokenizeCommand,
} from "../src/providers/auth-refresh.js";
import { ResilientProvider } from "../src/providers/resilient.js";
import type { MemoryProvider } from "../src/types.js";

describe("isAuthExpiry", () => {
  it("matches AWS / SSO expiry signals", () => {
    expect(isAuthExpiry(new Error("ExpiredTokenException: token expired"))).toBe(true);
    expect(isAuthExpiry(new Error("The SSO session has expired"))).toBe(true);
    expect(isAuthExpiry(new Error("Token is expired"))).toBe(true);
    expect(isAuthExpiry({ name: "ExpiredToken", message: "" })).toBe(true);
    expect(isAuthExpiry(new Error("The security token included in the request is expired"))).toBe(true);
    // Real message from @aws-sdk after `aws sso logout` — note it says
    // "not found or is invalid", never "expired", and includes the remediation
    // hint. Both the SSO-session matcher and the `aws sso login` matcher catch it.
    expect(
      isAuthExpiry(
        new Error(
          "The SSO session token associated with profile=default was not found or is invalid. " +
            "To refresh this SSO session run 'aws sso login' with the corresponding profile.",
        ),
      ),
    ).toBe(true);
    expect(
      isAuthExpiry(
        new Error(
          "The SSO session associated with this profile has expired or is otherwise invalid.",
        ),
      ),
    ).toBe(true);
  });

  it("does NOT match unrelated errors", () => {
    expect(isAuthExpiry(new Error("ValidationException: model not found"))).toBe(false);
    expect(isAuthExpiry(new Error("ThrottlingException"))).toBe(false);
    expect(isAuthExpiry(new Error("AccessDeniedException: no model access"))).toBe(false);
    expect(isAuthExpiry(new Error("connection reset"))).toBe(false);
    expect(isAuthExpiry(undefined)).toBe(false);
  });
});

describe("tokenizeCommand", () => {
  it("splits on whitespace", () => {
    expect(tokenizeCommand("aws sso login --profile foo")).toEqual([
      "aws", "sso", "login", "--profile", "foo",
    ]);
  });

  it("honors double and single quotes", () => {
    expect(tokenizeCommand('aws sso login --profile "my profile"')).toEqual([
      "aws", "sso", "login", "--profile", "my profile",
    ]);
    expect(tokenizeCommand("cmd --x 'a b c'")).toEqual(["cmd", "--x", "a b c"]);
  });

  it("returns empty array for an empty command", () => {
    expect(tokenizeCommand("   ")).toEqual([]);
  });
});

// A controllable fake provider + fake AuthRefresh so no real `aws` is spawned.
function fakeProvider(fn: () => Promise<string>): MemoryProvider {
  return {
    name: "fake",
    compress: fn,
    summarize: fn,
  };
}

function fakeRefresh(run: () => Promise<void>): AuthRefresh {
  return { run } as unknown as AuthRefresh;
}

describe("ResilientProvider — auth-refresh retry", () => {
  it("refreshes once and retries on an expired-token error, then succeeds", async () => {
    let calls = 0;
    const inner = fakeProvider(async () => {
      calls += 1;
      if (calls === 1) throw new Error("ExpiredTokenException");
      return "ok";
    });
    const run = vi.fn(async () => {});
    const provider = new ResilientProvider(inner, fakeRefresh(run));

    const result = await provider.compress("s", "u");
    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does NOT refresh on a non-expiry error", async () => {
    const inner = fakeProvider(async () => {
      throw new Error("ValidationException");
    });
    const run = vi.fn(async () => {});
    const provider = new ResilientProvider(inner, fakeRefresh(run));

    await expect(provider.compress("s", "u")).rejects.toThrow("ValidationException");
    expect(run).not.toHaveBeenCalled();
  });

  it("retries at most once — propagates if the post-refresh call also expires", async () => {
    let calls = 0;
    const inner = fakeProvider(async () => {
      calls += 1;
      throw new Error("ExpiredTokenException");
    });
    const run = vi.fn(async () => {});
    const provider = new ResilientProvider(inner, fakeRefresh(run));

    await expect(provider.compress("s", "u")).rejects.toThrow("ExpiredTokenException");
    expect(calls).toBe(2); // original + one retry, no more
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("propagates the original error if the refresh command itself fails", async () => {
    const inner = fakeProvider(async () => {
      throw new Error("ExpiredTokenException");
    });
    const run = vi.fn(async () => {
      throw new Error("aws sso login failed");
    });
    const provider = new ResilientProvider(inner, fakeRefresh(run));

    await expect(provider.compress("s", "u")).rejects.toThrow("ExpiredTokenException");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("behaves exactly as before when no AuthRefresh is configured (regression guard)", async () => {
    const inner = fakeProvider(async () => {
      throw new Error("ExpiredTokenException");
    });
    const provider = new ResilientProvider(inner); // no refresh
    await expect(provider.compress("s", "u")).rejects.toThrow("ExpiredTokenException");
  });
});

describe("AuthRefresh — single-flight + cooldown", () => {
  beforeEach(() => {
    execFileCalls.length = 0;
    execFileBehavior = () => null; // default: command succeeds
  });
  afterEach(() => {
    execFileBehavior = () => null;
  });

  it("coalesces concurrent calls into a single command run (single-flight)", async () => {
    const refresh = new AuthRefresh({ command: "aws sso login --profile p" });
    // Fire three concurrently; they share one in-flight promise, so execFile —
    // the REAL underlying spawn — must run exactly once.
    await Promise.all([refresh.run(), refresh.run(), refresh.run()]);
    expect(execFileCalls).toHaveLength(1);
    expect(execFileCalls[0]).toEqual({ cmd: "aws", args: ["sso", "login", "--profile", "p"] });
  });

  it("rejects an empty command", async () => {
    const refresh = new AuthRefresh({ command: "   " });
    await expect(refresh.run()).rejects.toThrow(/empty/);
    expect(execFileCalls).toHaveLength(0);
  });

  it("enforces a cooldown between sequential attempts (no second spawn)", async () => {
    const refresh = new AuthRefresh({ command: "aws sso login", cooldownMs: 60_000 });
    await refresh.run(); // first succeeds → 1 spawn
    await expect(refresh.run()).rejects.toThrow(/cooldown/);
    expect(execFileCalls).toHaveLength(1); // cooldown blocked the second spawn
  });

  it("does NOT relaunch after a timeout (post-timeout suppression window)", async () => {
    // Make the mocked command resolve with a timeout-shaped error (execFile sets
    // killed:true + SIGTERM on timeout). cooldownMs:0 isolates the suppression
    // path: any rejection on the next run() must come from post-timeout backoff.
    execFileBehavior = () =>
      Object.assign(new Error("timed out"), { killed: true, signal: "SIGTERM" });
    const refresh = new AuthRefresh({
      command: "aws sso login",
      timeoutMs: 50,
      cooldownMs: 0,
      postTimeoutCooldownMs: 60_000,
    });
    await expect(refresh.run()).rejects.toThrow(); // times out → 1 spawn
    // Second attempt must be suppressed, not relaunched (no new stale login).
    await expect(refresh.run()).rejects.toThrow(/suppress|timed out/i);
    expect(execFileCalls).toHaveLength(1); // suppression blocked the relaunch
  });
});
