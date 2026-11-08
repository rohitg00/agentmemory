import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onStateWorkerReturn, stateWorkerStatus } from "../src/runtime/state-worker.js";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { rearmIndexRecovery, shouldRearmIndex } from "../src/runtime/recovery.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function fakeHandle(initial: "active" | "pending") {
  const listeners: Array<(next: string) => void> = [];
  return {
    id: "h1",
    state: initial,
    onStateChange: (l: (next: string) => void) => { listeners.push(l); return () => {}; },
    emit: (next: "active" | "pending" | "suspended") => { for (const l of listeners) l(next); },
    ready: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
  };
}

function fakeBindings(handle: ReturnType<typeof fakeHandle>, stateMode = "observe") {
  return { stateHandles: [handle], handles: [handle], modes: { http: stateMode, state: stateMode } };
}

function fakeSdk() {
  return {
    trigger: vi.fn(async () => ({ ok: true })),
    observe: vi.fn(() => fakeHandle("active")),
    registerFunction: vi.fn(),
  };
}

describe("onStateWorkerReturn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stateWorkerStatus.ready = true;
    stateWorkerStatus.waitedMs = 0;
    stateWorkerStatus.lastReturnAt = undefined;
  });
  afterEach(() => {
    vi.useRealTimers();
    stateWorkerStatus.ready = true;
  });

  it("probeReady seeds from stateWorkerStatus.ready; first successful probeTick fires the callback", async () => {
    stateWorkerStatus.ready = false;
    const cb = vi.fn();
    const sdk = fakeSdk();
    const rearm = onStateWorkerReturn(sdk as never, fakeBindings(fakeHandle("active"), "trigger") as never, cb);
    expect(rearm.state.probeReady).toBe(false);
    await rearm.probeTick();
    expect(rearm.state.probeReady).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("two returns within the throttle window fire the callback twice, second after retry delay", async () => {
    const cb = vi.fn();
    const handle = fakeHandle("pending");
    const rearm = onStateWorkerReturn(fakeSdk() as never, fakeBindings(handle) as never, cb);
    handle.emit("active");
    await vi.advanceTimersByTimeAsync(0);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    handle.emit("pending");
    handle.emit("active");
    await vi.advanceTimersByTimeAsync(0);
    expect(cb).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledTimes(2);
    rearm.stop();
  });

  it("stop() cancels a pending throttle retry", async () => {
    const cb = vi.fn();
    const handle = fakeHandle("pending");
    const rearm = onStateWorkerReturn(fakeSdk() as never, fakeBindings(handle) as never, cb);
    handle.emit("active");
    await vi.advanceTimersByTimeAsync(0);
    handle.emit("pending");
    handle.emit("active");
    rearm.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

function memoryKv() {
  const store = new Map<string, unknown>();
  return {
    get: async (scope: string, key: string) => store.get(`${scope}/${key}`) ?? null,
    set: async (scope: string, key: string, value: unknown) => { store.set(`${scope}/${key}`, value); },
    delete: async (scope: string, key: string) => { store.delete(`${scope}/${key}`); },
    list: async () => [],
    count: async () => 0,
    listKeys: async function* () {},
    backend: "file",
  };
}

describe("IndexPersistence.resumeAfterUnavailable", () => {
  it("resumes only the unavailable-checkpoint pause", async () => {
    const kv = memoryKv();
    const p = new IndexPersistence(kv as never, new VectorIndex(), { requireRecoveryPlan: true });
    await p.prepareBackfill(null);
    expect(p.isRecoveryPaused()).toBe(true);
    expect(p.resumeAfterUnavailable()).toBe(true);
    expect(p.isRecoveryPaused()).toBe(false);
    expect(p.resumeAfterUnavailable()).toBe(false);
  });

  it("does not resume pauses from other causes", async () => {
    const failingKv = {
      ...memoryKv(),
      set: async () => { throw new Error("write_denied"); },
    };
    const vector = new VectorIndex();
    const loaded = { state: "none" as const, vector, savedAt: new Date().toISOString() };
    const p = new IndexPersistence(failingKv as never, vector, { requireRecoveryPlan: true });
    await p.prepareBackfill(loaded);
    expect(p.isRecoveryPaused()).toBe(true);
    expect(p.resumeAfterUnavailable()).toBe(false);
    expect(p.isRecoveryPaused()).toBe(true);
  });

  it("re-arm after unavailable boot restores the checkpoint and resumes backfill planning", async () => {
    const kv = memoryKv();
    const p = new IndexPersistence(kv as never, new VectorIndex(), { requireRecoveryPlan: true });
    await p.prepareBackfill(null);
    expect(p.isRecoveryPaused()).toBe(true);
    expect(p.resumeAfterUnavailable()).toBe(true);
    const checkpoint = new VectorIndex();
    checkpoint.add("obs1", "session", new Float32Array([1, 0, 0]));
    checkpoint.add("obs2", "session", new Float32Array([0, 1, 0]));
    const since = await p.prepareBackfill({
      state: "buckets",
      vector: checkpoint,
      savedAt: new Date(Date.now() - 60_000).toISOString(),
      expectedCount: 2,
    });
    expect(since).not.toBeUndefined();
    expect(p.isRecoveryPaused()).toBe(false);
  });
});

describe("state-worker re-arm order", () => {
  it("rebuilds the index after a checkpoint retry even when the index looked complete", async () => {
    const order: string[] = [];
    await rearmIndexRecovery({
      retryCheckpoint: async () => { order.push("checkpoint"); return true; },
      indexNeedsRearm: () => false,
      runIndexRecovery: async () => { order.push("index"); },
    });
    expect(order).toEqual(["checkpoint", "index"]);
  });

  it("skips index recovery when no checkpoint was retried and the index is complete", async () => {
    const run = vi.fn(async () => {});
    await rearmIndexRecovery({ retryCheckpoint: async () => false, indexNeedsRearm: () => false, runIndexRecovery: run });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("VectorIndex.mergeMissingFrom", () => {
  it("keeps vectors embedded after boot and adds only missing checkpoint entries", () => {
    const live = new VectorIndex();
    live.add("fresh", "s", new Float32Array([9, 9, 9]));
    live.add("both", "s", new Float32Array([7, 7, 7]));
    const checkpoint = new VectorIndex();
    checkpoint.add("both", "s", new Float32Array([1, 1, 1]));
    checkpoint.add("old", "s", new Float32Array([2, 2, 2]));
    expect(live.mergeMissingFrom(checkpoint)).toBe(1);
    expect(Array.from(live.get("fresh")!.embedding)).toEqual([9, 9, 9]);
    expect(Array.from(live.get("both")!.embedding)).toEqual([7, 7, 7]);
    expect(Array.from(live.get("old")!.embedding)).toEqual([2, 2, 2]);
  });

  it("does not restore a checkpoint vector deleted while it was absent from the live index", () => {
    const live = new VectorIndex();
    live.remove("deleted-early");
    const checkpoint = new VectorIndex();
    checkpoint.add("deleted-early", "s", new Float32Array([3]));
    expect(live.mergeMissingFrom(checkpoint)).toBe(0);
    expect(live.has("deleted-early")).toBe(false);
    expect(live.pendingChanges).toBe(0);
  });

  it("does not bring back a vector removed after boot", () => {
    const live = new VectorIndex();
    live.add("gone", "s", new Float32Array([1]));
    live.remove("gone");
    const checkpoint = new VectorIndex();
    checkpoint.add("gone", "s", new Float32Array([1]));
    expect(live.mergeMissingFrom(checkpoint)).toBe(0);
    expect(live.has("gone")).toBe(false);
  });
});

describe("reported state-worker readiness", () => {
  afterEach(() => { stateWorkerStatus.ready = true; });

  it("follows trigger-mode probe outcomes", async () => {
    stateWorkerStatus.ready = true;
    const sdk = fakeSdk();
    const rearm = onStateWorkerReturn(sdk as never, fakeBindings(fakeHandle("active"), "trigger") as never, vi.fn());
    sdk.trigger.mockRejectedValueOnce(new Error("function_not_found"));
    await rearm.probeTick();
    expect(stateWorkerStatus.ready).toBe(false);
    await rearm.probeTick();
    expect(stateWorkerStatus.ready).toBe(true);
    rearm.stop();
  });

  it("follows observer state changes in observe mode", () => {
    stateWorkerStatus.ready = true;
    const handle = fakeHandle("active");
    const rearm = onStateWorkerReturn(fakeSdk() as never, fakeBindings(handle) as never, vi.fn());
    handle.emit("pending");
    expect(stateWorkerStatus.ready).toBe(false);
    handle.emit("active");
    expect(stateWorkerStatus.ready).toBe(true);
    rearm.stop();
  });
});

describe("shouldRearmIndex", () => {
  it("does not re-run recovery for a backfill paused at its per-start cap", () => {
    expect(shouldRearmIndex({ bm25Incomplete: false, persistencePaused: false, lastRecoveryFailed: false, checkpointSaveFailed: false })).toBe(false);
  });

  it("re-runs recovery after an incomplete keyword rebuild, a paused checkpoint or a failed run", () => {
    const none = { bm25Incomplete: false, persistencePaused: false, lastRecoveryFailed: false, checkpointSaveFailed: false };
    expect(shouldRearmIndex({ ...none, bm25Incomplete: true })).toBe(true);
    expect(shouldRearmIndex({ ...none, persistencePaused: true })).toBe(true);
    expect(shouldRearmIndex({ ...none, lastRecoveryFailed: true })).toBe(true);
    expect(shouldRearmIndex({ ...none, checkpointSaveFailed: true })).toBe(true);
  });
});
