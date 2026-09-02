import { describe, it, expect, vi, beforeEach } from "vitest";

// #931-class fix: `bootLog` (src/logger.ts) only reaches stderr when
// --verbose / AGENTMEMORY_VERBOSE is set, so on a daemon deploy a
// bootLog-only line is silently discarded. The eviction-armed
// confirmation must also reach `logger`, which does land in the daemon's
// stderr log.
vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  bootLog: vi.fn(),
}));

import { logger, bootLog } from "../src/logger.js";
import { reportEvictionScheduled } from "../src/functions/evict.js";

describe("reportEvictionScheduled (the eviction-armed confirmation from src/index.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs the schedule via logger.info with the interval in minutes", () => {
    reportEvictionScheduled(21600000); // 6h - the production default

    expect(logger.info).toHaveBeenCalledWith("Eviction sweep scheduled", {
      intervalMinutes: 360,
    });
    expect(bootLog).toHaveBeenCalledWith("Eviction: enabled (every 360m)");
  });
});
