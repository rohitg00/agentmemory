import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  trackViewerStreamItem,
  pruneViewerStreamIfDue,
  resetViewerStreamTracker,
  seedViewerStreamTracker,
} from "../src/state/viewer-stream.js";
import { STREAM } from "../src/state/schema.js";
import { logger } from "../src/logger.js";
import { getViewerStreamMax } from "../src/config.js";

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
  it("seeds the tracker from the stored backlog at boot and trims it oldest first", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "2";
    const deleted: string[] = [];
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string; payload: { item_id?: string } }) => {
        if (req.function_id === "stream::list") {
          return [
            { observation: { id: "obs_new", timestamp: "2026-09-25T10:00:00Z" } },
            { observation: { id: "obs_old", timestamp: "2026-09-20T10:00:00Z" } },
            { observation: { id: "obs_mid", timestamp: "2026-09-22T10:00:00Z" } },
            { observation: { id: "obs_newest", timestamp: "2026-09-25T11:00:00Z" } },
            { other: true },
          ];
        }
        if (req.payload.item_id) deleted.push(req.payload.item_id);
        return {};
      }),
    };
    await expect(seedViewerStreamTracker(sdk as never)).resolves.toBe(4);
    expect(deleted).toEqual(["obs_old", "obs_mid"]);
  });

  it("deletes a large backlog in bounded batches", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "0";
    let inFlight = 0;
    let peak = 0;
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string }) => {
        if (req.function_id === "stream::list") {
          return Array.from({ length: 450 }, (_, i) => ({ observation: { id: "obs_" + i, timestamp: new Date(i * 1000).toISOString() } }));
        }
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return {};
      }),
    };
    await seedViewerStreamTracker(sdk as never);
    expect(sdk.trigger).toHaveBeenCalledTimes(451);
    expect(peak).toBeLessThanOrEqual(100);
  });

  it("keeps working when the backlog cannot be read", async () => {
    const sdk = { trigger: vi.fn(async () => { throw new Error("no stream"); }) };
    await expect(seedViewerStreamTracker(sdk as never)).resolves.toBe(0);
  });

  it("retries a failed delete on the next prune instead of losing the id", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "0";
    const sdk = {
      trigger: vi.fn(async (req: DeleteCall) => {
        if (req.payload.item_id === "obs_1") throw new Error("boom");
        return {};
      }),
    };
    for (let i = 0; i < 50; i++) trackViewerStreamItem(`obs_${i}`);
    await pruneViewerStreamIfDue(sdk as never);

    const firstRoundIds = sdk.trigger.mock.calls.map((c) => (c[0] as DeleteCall).payload.item_id);
    expect(firstRoundIds).toContain("obs_1");

    sdk.trigger.mockClear();
    for (let i = 50; i < 100; i++) trackViewerStreamItem(`obs_${i}`);
    await pruneViewerStreamIfDue(sdk as never);

    const secondRoundIds = sdk.trigger.mock.calls.map((c) => (c[0] as DeleteCall).payload.item_id);
    expect(secondRoundIds).toContain("obs_1");
  });

  it("runs another overflow check once an in-progress prune completes", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "0";
    let releaseFirstDelete: () => void = () => {};
    const firstDeleteGate = new Promise<void>((resolve) => {
      releaseFirstDelete = resolve;
    });
    let deleteCallCount = 0;
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string }) => {
        if (req.function_id !== "stream::delete") return {};
        deleteCallCount += 1;
        if (deleteCallCount === 1) await firstDeleteGate;
        return {};
      }),
    };

    for (let i = 0; i < 50; i++) trackViewerStreamItem(`obs_${i}`);
    const firstPrune = pruneViewerStreamIfDue(sdk as never);

    await Promise.resolve();
    for (let i = 50; i < 100; i++) trackViewerStreamItem(`obs_${i}`);
    await pruneViewerStreamIfDue(sdk as never);

    releaseFirstDelete();
    await firstPrune;

    const deleteCalls = sdk.trigger.mock.calls.filter(
      (c) => (c[0] as { function_id: string }).function_id === "stream::delete",
    );
    expect(deleteCalls).toHaveLength(100);
  });

  it("seeds a very large backlog without hitting the argument spread limit", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "1000000";
    const total = 200000;
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string }) => {
        if (req.function_id === "stream::list") {
          return Array.from({ length: total }, (_, i) => ({
            observation: { id: `obs_${i}`, timestamp: new Date(i * 1000).toISOString() },
          }));
        }
        return {};
      }),
    };
    await expect(seedViewerStreamTracker(sdk as never)).resolves.toBe(total);
    expect(sdk.trigger).toHaveBeenCalledTimes(1);
  });
});

describe("getViewerStreamMax validation", () => {
  afterEach(() => {
    delete process.env.AGENTMEMORY_VIEWER_STREAM_MAX;
  });

  it("falls back to the default when the value has trailing non-digit characters", () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "500000junk";
    expect(getViewerStreamMax()).toBe(500);
  });

  it("still parses a clean integer value", () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "250";
    expect(getViewerStreamMax()).toBe(250);
  });

  it("falls back to the default for an empty value", () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "";
    expect(getViewerStreamMax()).toBe(500);
  });
});
