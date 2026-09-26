import { describe, expect, it, vi } from "vitest";
import { startEvictSweep } from "../src/functions/evict-scheduler.js";

describe("scheduled mem::evict sweep", () => {
  it("schedules mem::evict by default every 24 hours", async () => {
    const trigger = vi.fn().mockResolvedValue({ success: true });
    const unref = vi.fn();
    let callback: (() => Promise<void>) | undefined;
    const setIntervalFn = vi.fn((cb: () => Promise<void>, intervalMs: number) => {
      callback = cb;
      expect(intervalMs).toBe(86_400_000);
      return { unref };
    });

    const timer = startEvictSweep(
      { trigger } as never,
      {},
      setIntervalFn as never,
    );

    expect(timer).toEqual({ unref });
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);

    await callback?.();

    expect(trigger).toHaveBeenCalledWith({
      function_id: "mem::evict",
      payload: {},
    });
  });

  it("can be disabled explicitly", () => {
    const trigger = vi.fn();
    const setIntervalFn = vi.fn();

    const timer = startEvictSweep(
      { trigger } as never,
      { EVICTION_ENABLED: "false" },
      setIntervalFn as never,
    );

    expect(timer).toBeNull();
    expect(setIntervalFn).not.toHaveBeenCalled();
    expect(trigger).not.toHaveBeenCalled();
  });

  it("honors EVICTION_INTERVAL_MS", () => {
    const trigger = vi.fn();
    const setIntervalFn = vi.fn(() => ({ unref: vi.fn() }));

    startEvictSweep(
      { trigger } as never,
      { EVICTION_INTERVAL_MS: "1234" },
      setIntervalFn as never,
    );

    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 1234);
  });
});
