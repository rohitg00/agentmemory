import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ISdk } from "iii-sdk";

function fakeSdk(trigger: ISdk["trigger"]): ISdk {
  return { trigger } as unknown as ISdk;
}

describe("StateKV", () => {
  const ORIG = process.env["AGENTMEMORY_KV_TIMEOUT_MS"];

  beforeEach(() => {
    vi.resetModules();
    delete process.env["AGENTMEMORY_KV_TIMEOUT_MS"];
  });

  afterEach(() => {
    if (ORIG === undefined) delete process.env["AGENTMEMORY_KV_TIMEOUT_MS"];
    else process.env["AGENTMEMORY_KV_TIMEOUT_MS"] = ORIG;
  });

  it("passes the default 10s timeoutMs on every call when the env override is unset", async () => {
    const { StateKV } = await import("../src/state/kv.js");
    const trigger = vi.fn().mockResolvedValue(null);
    const kv = new StateKV(fakeSdk(trigger));

    await kv.get("scope", "key");
    await kv.set("scope", "key", { a: 1 });
    await kv.update("scope", "key", [{ type: "set", path: "/a", value: 1 }]);
    await kv.delete("scope", "key");
    await kv.list("scope");

    expect(trigger).toHaveBeenCalledTimes(5);
    for (const call of trigger.mock.calls) {
      const request = call[0] as { timeoutMs?: number };
      // The whole point of #1127's fix: KV calls must not silently inherit
      // the 180s worker default sized for LLM-backed functions — a stuck
      // KV call should fail fast, well before that ceiling. Pinned to the
      // exact default (not just "some number under 180s") so a future
      // change to the default is a deliberate, visible diff here.
      expect(request.timeoutMs).toBe(10_000);
    }
  });

  it("honours AGENTMEMORY_KV_TIMEOUT_MS when set to a valid positive integer", async () => {
    process.env["AGENTMEMORY_KV_TIMEOUT_MS"] = "2500";
    const { StateKV } = await import("../src/state/kv.js");
    const trigger = vi.fn().mockResolvedValue(null);
    const kv = new StateKV(fakeSdk(trigger));

    await kv.get("scope", "key");

    expect(trigger).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 2500 }),
    );
  });

  it("honours the maximum valid setTimeout delay (2147483647)", async () => {
    process.env["AGENTMEMORY_KV_TIMEOUT_MS"] = "2147483647";
    const { StateKV } = await import("../src/state/kv.js");
    const trigger = vi.fn().mockResolvedValue(null);
    const kv = new StateKV(fakeSdk(trigger));

    await kv.get("scope", "key");

    expect(trigger).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 2_147_483_647 }),
    );
  });

  it("falls back to the 10s default for malformed, non-positive, or overflowing env values", async () => {
    // Mirrors the OPENAI_TIMEOUT_MS strict-parse fallback cases in
    // test/fetch-timeout.test.ts (#446-adjacent CodeRabbit catch): a typo'd
    // env value should not silently masquerade as a valid, possibly
    // dangerously small or negative, timeout. 2147483648+ is also rejected —
    // setTimeout's delay is a 32-bit signed int and iii-sdk forwards
    // timeoutMs to it uncapped, so an unbounded value would silently become
    // a ~1ms timeout instead of erroring.
    for (const bad of ["30ms", "1_000", "60s", "-30", "0", "", "2147483648", "9007199254740991"]) {
      vi.resetModules();
      process.env["AGENTMEMORY_KV_TIMEOUT_MS"] = bad;
      const { StateKV } = await import("../src/state/kv.js");
      const trigger = vi.fn().mockResolvedValue(null);
      const kv = new StateKV(fakeSdk(trigger));

      await kv.get("scope", "key");

      expect(trigger).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 10_000 }),
      );
    }
  });

  it("propagates a per-call timeout rejection to the caller (doesn't swallow it)", async () => {
    const { StateKV } = await import("../src/state/kv.js");
    const trigger = vi.fn().mockRejectedValue(new Error("timeout"));
    const kv = new StateKV(fakeSdk(trigger));

    await expect(kv.get("scope", "key")).rejects.toThrow("timeout");
  });

  it("forwards the correct function_id and payload alongside the timeout", async () => {
    const { StateKV } = await import("../src/state/kv.js");
    const trigger = vi.fn().mockResolvedValue(null);
    const kv = new StateKV(fakeSdk(trigger));

    await kv.get("mem:memories", "mem_123");

    expect(trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        function_id: "state::get",
        payload: { scope: "mem:memories", key: "mem_123" },
        timeoutMs: expect.any(Number),
      }),
    );
  });
});
