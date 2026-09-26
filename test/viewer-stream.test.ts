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

  it("deletes only the oldest items beyond the cap, newest-of-the-overflow first", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
    const sdk = mockSdk();
    for (let i = 0; i < 250; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }

    expect(sdk.trigger).toHaveBeenCalledTimes(50);
    const calls = sdk.trigger.mock.calls.map((c) => c[0] as DeleteCall);
    expect(calls.map((c) => c.payload.item_id)).toEqual(
      Array.from({ length: 50 }, (_, i) => `obs_${49 - i}`),
    );
    for (const call of calls) {
      expect(call.function_id).toBe("stream::delete");
      expect(call.payload.stream_name).toBe(STREAM.name);
      expect(call.payload.group_id).toBe(STREAM.viewerGroup);
    }
  });

  it("only re-checks the cap every 50 writes, not on every write", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
    const sdk = mockSdk();
    for (let i = 0; i < 240; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).not.toHaveBeenCalled();

    for (let i = 240; i < 250; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).toHaveBeenCalledTimes(50);

    for (let i = 250; i < 260; i++) {
      trackViewerStreamItem(`obs_${i}`);
      await pruneViewerStreamIfDue(sdk as never);
    }
    expect(sdk.trigger).toHaveBeenCalledTimes(50);
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
    for (let i = 0; i < 250; i++) {
      trackViewerStreamItem(`obs_${i}`);
    }
    await expect(pruneViewerStreamIfDue(sdk as never)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("does not double-track the same id, avoiding an extra delete", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
    const sdk = mockSdk();
    trackViewerStreamItem("obs_dup");
    trackViewerStreamItem("obs_dup");
    for (let i = 0; i < 199; i++) trackViewerStreamItem(`obs_${i}`);
    await pruneViewerStreamIfDue(sdk as never);
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("seeds the tracker in the engine's listing order and prunes the overflow newest-first", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
    const deleted: string[] = [];
    const items = Array.from({ length: 205 }, (_, i) => ({
      observation: { id: `obs_${i}`, timestamp: new Date(2026, 0, i + 1).toISOString() },
    }));
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string; payload: { item_id?: string } }) => {
        if (req.function_id === "stream::list") return items;
        if (req.payload.item_id) deleted.push(req.payload.item_id);
        return {};
      }),
    };
    await expect(seedViewerStreamTracker(sdk as never)).resolves.toBe(205);
    expect(deleted).toEqual(["obs_4", "obs_3", "obs_2", "obs_1", "obs_0"]);
  });

  it("seeds using the engine's listing order, ignoring an unparseable client timestamp", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
    const deleted: string[] = [];
    const items: { observation: { id: string; timestamp: string } }[] = Array.from(
      { length: 200 },
      (_, i) => ({
        observation: { id: `obs_${i}`, timestamp: new Date(2026, 0, i + 1).toISOString() },
      }),
    );
    items.push({ observation: { id: "obs_bad_timestamp", timestamp: "not-a-date" } });
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string; payload: { item_id?: string } }) => {
        if (req.function_id === "stream::list") return items;
        if (req.payload.item_id) deleted.push(req.payload.item_id);
        return {};
      }),
    };
    await expect(seedViewerStreamTracker(sdk as never)).resolves.toBe(201);
    expect(deleted).toEqual(["obs_0"]);
  });

  it("does not re-track a seeded id the live path observes too", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
    const deleted: string[] = [];
    const sdk = {
      trigger: vi.fn(async (req: { function_id: string; payload: { item_id?: string } }) => {
        if (req.function_id === "stream::list") {
          return [{ observation: { id: "obs_seeded", timestamp: "2026-01-01T00:00:00Z" } }];
        }
        if (req.payload.item_id) deleted.push(req.payload.item_id);
        return {};
      }),
    };
    await seedViewerStreamTracker(sdk as never);
    trackViewerStreamItem("obs_seeded");
    for (let i = 0; i < 249; i++) trackViewerStreamItem(`obs_${i}`);
    await pruneViewerStreamIfDue(sdk as never);

    expect(deleted).toHaveLength(50);
    expect(deleted.filter((id) => id === "obs_seeded")).toHaveLength(1);
  });

  it("passes a short timeout on the boot stream::list call", async () => {
    const sdk = { trigger: vi.fn(async () => []) };
    await seedViewerStreamTracker(sdk as never);
    expect(sdk.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        function_id: "stream::list",
        timeoutMs: expect.any(Number),
      }),
    );
    const call = sdk.trigger.mock.calls[0][0] as { timeoutMs: number };
    expect(call.timeoutMs).toBeGreaterThan(0);
    expect(call.timeoutMs).toBeLessThan(30000);
  });

  it("deletes a large backlog in bounded batches", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
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
    expect(sdk.trigger).toHaveBeenCalledTimes(251);
    expect(peak).toBeLessThanOrEqual(100);
  });

  it("keeps working when the backlog cannot be read", async () => {
    const sdk = { trigger: vi.fn(async () => { throw new Error("no stream"); }) };
    await expect(seedViewerStreamTracker(sdk as never)).resolves.toBe(0);
  });

  it("retries a failed delete on the next prune instead of losing the id", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
    const sdk = {
      trigger: vi.fn(async (req: DeleteCall) => {
        if (req.payload.item_id === "obs_1") throw new Error("boom");
        return {};
      }),
    };
    for (let i = 0; i < 250; i++) trackViewerStreamItem(`obs_${i}`);
    await pruneViewerStreamIfDue(sdk as never);

    const firstRoundIds = sdk.trigger.mock.calls.map((c) => (c[0] as DeleteCall).payload.item_id);
    expect(firstRoundIds).toContain("obs_1");

    sdk.trigger.mockClear();
    for (let i = 250; i < 300; i++) trackViewerStreamItem(`obs_${i}`);
    await pruneViewerStreamIfDue(sdk as never);

    const secondRoundIds = sdk.trigger.mock.calls.map((c) => (c[0] as DeleteCall).payload.item_id);
    expect(secondRoundIds).toContain("obs_1");
  });

  it("runs another overflow check once an in-progress prune completes", async () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "200";
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

    for (let i = 0; i < 250; i++) trackViewerStreamItem(`obs_${i}`);
    const firstPrune = pruneViewerStreamIfDue(sdk as never);

    await Promise.resolve();
    for (let i = 250; i < 500; i++) trackViewerStreamItem(`obs_${i}`);
    await pruneViewerStreamIfDue(sdk as never);

    releaseFirstDelete();
    await firstPrune;

    const deleteCalls = sdk.trigger.mock.calls.filter(
      (c) => (c[0] as { function_id: string }).function_id === "stream::delete",
    );
    expect(deleteCalls).toHaveLength(300);
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

  it("rejects a negative value and falls back to the default", () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "-5";
    expect(getViewerStreamMax()).toBe(500);
  });

  it("clamps a positive value under the viewer's reload floor up to 200", () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "50";
    expect(getViewerStreamMax()).toBe(200);
  });

  it("clamps zero up to the floor instead of pruning everything", () => {
    process.env.AGENTMEMORY_VIEWER_STREAM_MAX = "0";
    expect(getViewerStreamMax()).toBe(200);
  });
});
