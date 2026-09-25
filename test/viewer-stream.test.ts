import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  trackViewerStreamItem,
  pruneViewerStreamIfDue,
  resetViewerStreamTracker,
} from "../src/state/viewer-stream.js";
import { STREAM } from "../src/state/schema.js";
import { logger } from "../src/logger.js";

function mockSdk() {
  return { trigger: vi.fn(async () => ({ old_value: { id: "x" } })) };
}

type DeleteCall = {
  function_id: string;
  payload: { stream_name: string; group_id: string; item_id: string };
};

describe("viewer stream bounding", () => {
  beforeEach(() => {
    resetViewerStreamTracker();
    delete process.env.AGENTMEMORY_VIEWER_STREAM_MAX;
    vi.mocked(logger.warn).mockClear();
  });

  afterEach(() => {
    delete process.env.AGENTMEMORY_VIEWER_STREAM_MAX;
  });

  it("does not prune before 50 writes have been recorded", async () => {
    const sdk = mockSdk();
    for (let i = 0; i < 49; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("does not prune when tracked items stay under the cap", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "500";
    const sdk = mockSdk();
    for (let i = 0; i < 50; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("deletes only the oldest items beyond the cap in one batch, in order", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "10";
    const sdk = mockSdk();
    for (let i = 0; i < 50; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }

    expect(sdk.trigger).toHaveBeenCalledTimes(40);
    const calls = sdk.trigger.mock.calls.map((c) => c[0] as DeleteCall);
    expect(calls.map((c) => c.payload.item_id)).toEqual(
      Array.from({ length: 40 }, (_, i) => `obs_${i}`),
    );
    for (const call of calls) {
      expect(call.function_id).toBe("stream::delete");
      expect(call.payload.stream_name).toBe(STREAM.name);
      expect(call.payload.group_id).toBe(STREAM.viewerGroup);
    }
  });

  it("only re-checks the cap every 50 writes, not on every write", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "5";
    const sdk = mockSdk();
    for (let i = 0; i < 10; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).not.toHaveBeenCalled();

    for (let i = 10; i < 50; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).toHaveBeenCalledTimes(45);

    for (let i = 50; i < 60; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).toHaveBeenCalledTimes(45);
  });

  it("defaults the cap to 500 when AGENTMEMORY_VIEWER_STREAM_MAX is unset", async () => {
    const sdk = mockSdk();
    for (let i = 0; i < 550; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).toHaveBeenCalledTimes(50);
  });

  it("logs a warning but resolves cleanly when a delete call rejects", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "0";
    const sdk = { trigger: vi.fn(async () => { throw new Error("boom"); }) };
    for (let i = 0; i < 50; i++) {
      trackViewerStreamItem(`obs_${i}`);
    }
    await expect(pruneViewerStreamIfDue(sdk as never)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
