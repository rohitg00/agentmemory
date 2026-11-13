import { describe, it, expect, vi, beforeAll } from "vitest";
import { engine } from "./helpers/fake-engine.js";
import { bootMain } from "./helpers/boot-main.js";
import { rebuildKeywordIndex } from "../src/functions/search.js";
import { getDuplicateWorkers } from "../src/runtime/duplicates.js";

// Boots the real src/index.ts main() with a vector checkpoint written by a
// 4-dimension provider that cannot be read at boot, then drives the 30 s
// runtime tick and the SIGTERM handler that main() installs.

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  const { engine: fake } = await import("./helpers/fake-engine.js");
  return { ...actual, registerWorker: () => fake.client };
});

vi.mock("../src/providers/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/providers/index.js")>();
  return {
    ...actual,
    createEmbeddingProvider: () => ({
      name: "fake-8d",
      dimensions: 8,
      embed: async () => new Float32Array(8),
      embedBatch: async (texts: string[]) => texts.map(() => new Float32Array(8)),
    }),
  };
});

vi.mock("../src/functions/search.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/functions/search.js")>();
  return { ...actual, rebuildKeywordIndex: vi.fn(actual.rebuildKeywordIndex) };
});

let main: Awaited<ReturnType<typeof bootMain>>;
const rebuilds = () => vi.mocked(rebuildKeywordIndex).mock.calls.length;
const mismatchErrors = () => main.errors.filter((line) => line.includes("wrong dimension")).length;

beforeAll(async () => {
  main = await bootMain({ checkpointDims: 4, checkpointUnreadableAtBoot: true });
}, 60_000);

describe("real main() runtime tick", () => {
  it("a checkpoint that stays unavailable backs off and does not rebuild BM25 on every tick", async () => {
    const loadsBefore = main.loadSpy.mock.calls.length;
    const rebuildsBefore = rebuilds();
    for (let i = 0; i < 10; i++) await main.tick(30_000);
    const loads = main.loadSpy.mock.calls.length - loadsBefore;
    const rebuilt = rebuilds() - rebuildsBefore;
    console.info(`[proof 1a] 10 ticks over 5 min with the checkpoint unreadable: ${loads} checkpoint reloads, ${rebuilt} full BM25 rebuilds`);
    expect(rebuilt).toBe(0);
    expect(loads).toBeLessThanOrEqual(4);
  });

  it("a checkpoint that returns with the wrong dimension is rejected once and not retried", async () => {
    engine.failGet = null;
    const errorsBefore = mismatchErrors();
    const rebuildsBefore = rebuilds();
    for (let i = 0; i < 5; i++) await main.tick(3_600_000);
    const logged = mismatchErrors() - errorsBefore;
    const rebuilt = rebuilds() - rebuildsBefore;
    console.info(`[proof 1b] 5 ticks after the checkpoint came back with 4-dim vectors: ${logged} "wrong dimension" errors, ${rebuilt} BM25 rebuilds`);
    expect(main.errors.some((line) => line.includes("wrong dimension") && line.includes("Refusing to start"))).toBe(false);
    expect(logged).toBe(1);
    expect(rebuilt).toBeLessThanOrEqual(1);
  });

  it("the 30 s tick does not poll engine::workers::list; worker connect/disconnect events drive the duplicate check", async () => {
    const before = engine.callsTo("engine::workers::list");
    for (let i = 0; i < 5; i++) await main.tick(30_000);
    const polled = engine.callsTo("engine::workers::list") - before;
    console.info(`[proof 3] engine::workers::list calls from 5 idle ticks: ${polled}`);
    expect(polled).toBe(0);

    const observer = engine.observers.find((entry) => entry.source.function_id === "engine::on-workers-changed");
    expect(observer).toBeDefined();
    const deliver = (event: string) => engine.functions.get(observer!.target)!({
      observer_id: String(observer!.options?.id), activation_id: `act-${event}`, input: { event },
    });
    engine.workers.push({ worker_id: "w-other", worker_name: "agentmemory" });
    await deliver("worker_connected");
    await main.settle();
    expect(getDuplicateWorkers()?.count).toBe(2);
    engine.workers.pop();
    await deliver("worker_disconnected");
    await main.settle();
    expect(getDuplicateWorkers()).toBeNull();
  });

  it("falls back to the duplicate check on the tick while the workers-changed observer is not active", async () => {
    const observer = engine.observers.find((entry) => entry.source.function_id === "engine::on-workers-changed")!;
    observer.handle.become("rejected");
    engine.workers.push({ worker_id: "w-late", worker_name: "agentmemory" });
    const before = engine.callsTo("engine::workers::list");
    await main.tick(30_000);
    const polled = engine.callsTo("engine::workers::list") - before;
    console.info(`[proof review-1] observer rejected, second worker joined, 1 tick: ${polled} workers::list calls, duplicate count ${getDuplicateWorkers()?.count ?? 0}`);
    expect(polled).toBe(1);
    expect(getDuplicateWorkers()?.count).toBe(2);

    // Once the observer is active again, one catch-up check covers events it
    // missed, then the tick stops polling.
    engine.workers.pop();
    observer.handle.become("active");
    const activeBefore = engine.callsTo("engine::workers::list");
    await main.tick(30_000);
    expect(getDuplicateWorkers()).toBeNull();
    await main.tick(30_000);
    await main.tick(30_000);
    expect(engine.callsTo("engine::workers::list") - activeBefore).toBe(1);
  });

  it("shutdown clears the runtime tick and the compression sweep, and a late tick does no work", async () => {
    const runtime = main.runtimeTick();
    const sweep = main.intervals.find((interval) => String(interval.fn).includes("runCompressionSweep"));
    expect(sweep, "AGENTMEMORY_AUTO_COMPRESS=true installs the sweep").toBeDefined();
    void main.shutdown();
    await vi.waitFor(() => expect(main.exitSpy).toHaveBeenCalled(), { timeout: 20_000, interval: 25 });
    console.info(`[proof 4] after shutdown: runtime tick cleared=${main.cleared.has(runtime.handle)}, sweep cleared=${main.cleared.has(sweep!.handle)}`);
    const callsBefore = engine.calls.length;
    runtime.fn();
    await main.settle();
    const late = engine.calls.slice(callsBefore).map((call) => call.function_id);
    console.info(`[proof 4] engine calls made by a tick after shutdown: ${late.length} ${JSON.stringify([...new Set(late)])}`);
    expect(main.cleared.has(runtime.handle)).toBe(true);
    expect(main.cleared.has(sweep!.handle)).toBe(true);
    expect(late).toEqual([]);
  });
});
