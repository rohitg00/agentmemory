import { afterEach, describe, expect, it, vi } from "vitest";
import { shutdownSdkWithTimeout } from "../src/shutdown.js";

describe("shutdownSdkWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns after the timeout when sdk.shutdown never resolves", async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const shutdown = vi.fn(() => new Promise<void>(() => {}));

    const result = shutdownSdkWithTimeout(
      { shutdown },
      { timeoutMs: 10, warn },
    );

    await vi.advanceTimersByTimeAsync(10);

    await expect(result).resolves.toBe("timeout");
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[agentmemory] sdk.shutdown() exceeded 10ms timeout, proceeding to exit",
    );
  });
});
