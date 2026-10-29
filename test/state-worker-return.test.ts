import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onStateWorkerReturn, stateWorkerStatus } from "../src/runtime/state-worker.js";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";

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
