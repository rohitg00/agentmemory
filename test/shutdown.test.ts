import { describe, it, expect, vi } from "vitest";
import {
  SHUTDOWN_FLUSH_TIMEOUT_MS,
  SHUTDOWN_HARD_EXIT_MS,
  settleWithin,
} from "../src/shutdown.js";

describe("settleWithin", () => {
  it("resolves true when the work settles in time", async () => {
    expect(await settleWithin(Promise.resolve("ok"), 1000)).toBe(true);
  });

  it("treats a rejection as settled", async () => {
    expect(await settleWithin(Promise.reject(new Error("boom")), 1000)).toBe(true);
  });

  it("resolves false when the work never settles", async () => {
    vi.useFakeTimers();
    try {
      const pending = settleWithin(new Promise(() => {}), 50);
      await vi.advanceTimersByTimeAsync(50);
      expect(await pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the flush budget under the CLI's 5s worker grace, with the hard exit after it", () => {
    expect(SHUTDOWN_FLUSH_TIMEOUT_MS).toBeLessThan(5000);
    expect(SHUTDOWN_HARD_EXIT_MS).toBeGreaterThan(SHUTDOWN_FLUSH_TIMEOUT_MS);
  });
});
