import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EVICTION_INTERVAL_MS,
  getEvictSweepIntervalMs,
  startEvictSweep,
} from "../src/functions/evict-scheduler.js";

describe("scheduled mem::evict sweep", () => {
  it("schedules mem::evict by default every 24 hours", async () => {
    const trigger = vi.fn().mockResolvedValue({ success: true });
    const log = { warn: vi.fn() };
    const unref = vi.fn();
    let callback: (() => Promise<void>) | undefined;
    const setIntervalFn = vi.fn(
      (cb: () => Promise<void>, intervalMs: number) => {
        callback = cb;
        expect(intervalMs).toBe(DEFAULT_EVICTION_INTERVAL_MS);
        return { unref };
      },
    );

    const timer = startEvictSweep(
      { trigger } as never,
      log,
      {},
      setIntervalFn as never,
    );

    expect(timer).toEqual({ unref });
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);

    await callback?.();

    expect(trigger).toHaveBeenCalledWith({
      function_id: "mem::evict",
      payload: { dryRun: false },
    });
  });

  it("can be disabled explicitly", () => {
    const trigger = vi.fn();
    const log = { warn: vi.fn() };
    const setIntervalFn = vi.fn();

    const timer = startEvictSweep(
      { trigger } as never,
      log,
      { EVICTION_ENABLED: "false" },
      setIntervalFn as never,
    );

    expect(timer).toBeNull();
    expect(setIntervalFn).not.toHaveBeenCalled();
    expect(trigger).not.toHaveBeenCalled();
  });

  it("honors EVICTION_INTERVAL_MS", () => {
    const trigger = vi.fn();
    const log = { warn: vi.fn() };
    const setIntervalFn = vi.fn(() => ({ unref: vi.fn() }));

    startEvictSweep(
      { trigger } as never,
      log,
      { EVICTION_INTERVAL_MS: "1234" },
      setIntervalFn as never,
    );

    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 1234);
  });

  it("falls back to 24 hours for invalid intervals", () => {
    expect(getEvictSweepIntervalMs({ EVICTION_INTERVAL_MS: "nope" })).toBe(
      DEFAULT_EVICTION_INTERVAL_MS,
    );
    expect(getEvictSweepIntervalMs({ EVICTION_INTERVAL_MS: "0" })).toBe(
      DEFAULT_EVICTION_INTERVAL_MS,
    );
    expect(getEvictSweepIntervalMs({ EVICTION_INTERVAL_MS: "-1" })).toBe(
      DEFAULT_EVICTION_INTERVAL_MS,
    );
  });

  it("contains and logs sweep failures", async () => {
    const error = new Error("boom");
    const trigger = vi.fn().mockRejectedValue(error);
    const log = { warn: vi.fn() };
    let callback: (() => Promise<void>) | undefined;
    const setIntervalFn = vi.fn((cb: () => Promise<void>) => {
      callback = cb;
      return { unref: vi.fn() };
    });

    startEvictSweep(
      { trigger } as never,
      log,
      {},
      setIntervalFn as never,
    );

    await expect(callback?.()).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith("Eviction sweep failed", {
      error: "boom",
    });
  });

  it("worker keeps the eviction timer handle for shutdown cleanup", () => {
    const source = readFileSync("src/index.ts", "utf-8");

    expect(source).toContain("startEvictSweep(");
    expect(source).toContain("const evictSweepTimer = startEvictSweep(");
    expect(source).toContain(
      "if (evictSweepTimer) clearInterval(evictSweepTimer);",
    );
  });
});
