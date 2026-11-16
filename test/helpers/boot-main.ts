import { expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engine } from "./fake-engine.js";
import { StateKV } from "../../src/state/kv.js";
import { VectorIndex } from "../../src/state/vector-index.js";
import { IndexPersistence } from "../../src/state/index-persistence.js";

// Boots the real src/index.ts main() against the in-memory engine. The test
// file must mock "iii-sdk" (registerWorker -> engine.client), the embedding
// provider (8 dimensions) and wrap rebuildKeywordIndex in vi.fn.

export const VECTOR_META = { scope: "mem:index:bm25", key: "vectors:meta" };

type Interval = { fn: () => unknown; ms: number; handle: ReturnType<typeof setInterval> };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

export async function bootMain(opts: { checkpointDims: number; checkpointUnreadableAtBoot: boolean }) {
  const intervals: Interval[] = [];
  const cleared = new Set<unknown>();
  const errors: string[] = [];
  let clockOffset = 0;

  const home = mkdtempSync(join(tmpdir(), "am-main-"));
  for (const key of Object.keys(process.env)) {
    if (/_API_KEY$|^AGENTMEMORY_|^III_/.test(key)) delete process.env[key];
  }
  const viewerPort = await freePort();
  Object.assign(process.env, {
    HOME: home,
    AGENTMEMORY_DATA_DIR: join(home, "data"),
    AGENTMEMORY_RUNTIME_DIR: join(home, "run"),
    AGENTMEMORY_SECRET: "a".repeat(64),
    III_REST_PORT: String(viewerPort - 2),
    III_VIEWER_PORT: String(viewerPort),
    AGENTMEMORY_AUTO_COMPRESS: "true",
  });

  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => unknown, ms?: number, ...args: unknown[]) => {
    const handle = realSetInterval(fn, ms, ...args);
    intervals.push({ fn, ms: Number(ms), handle });
    return handle;
  }) as typeof setInterval);
  vi.spyOn(globalThis, "clearInterval").mockImplementation(((handle?: ReturnType<typeof setInterval>) => {
    cleared.add(handle);
    realClearInterval(handle);
  }) as typeof clearInterval);
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, "now").mockImplementation(() => realNow() + clockOffset);
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const realError = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    realError(...args);
  });
  const loadSpy = vi.spyOn(IndexPersistence.prototype, "load");

  // A checkpoint written before this start, by a provider with checkpointDims.
  const old = new VectorIndex();
  old.add("obs_old", "ses_old", new Float32Array(opts.checkpointDims).fill(0.5));
  await new IndexPersistence(new StateKV(engine.client as never), old).save();
  expect(engine.store.get(VECTOR_META.scope)?.has(VECTOR_META.key)).toBe(true);
  loadSpy.mockClear();
  if (opts.checkpointUnreadableAtBoot) {
    engine.failGet = (scope, key) => scope === VECTOR_META.scope && key === VECTOR_META.key;
  }

  const settle = async (): Promise<void> => {
    let last = -1;
    let quiet = 0;
    for (let i = 0; i < 300 && quiet < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      quiet = engine.calls.length === last ? quiet + 1 : 0;
      last = engine.calls.length;
    }
  };

  const before = new Set(process.listeners("SIGTERM"));
  let shutdown: (() => unknown) | undefined;
  void import("../../src/index.js");
  await vi.waitFor(() => {
    shutdown = process.listeners("SIGTERM").find((listener) => !before.has(listener)) as (() => unknown) | undefined;
    expect(shutdown, `main() did not finish booting; exit calls: ${JSON.stringify(exitSpy.mock.calls)}`).toBeDefined();
  }, { timeout: 30_000, interval: 25 });
  await settle();

  const runtimeTick = (): Interval => {
    const entry = intervals.find((interval) => interval.ms === 30_000 && String(interval.fn).includes("probeTick"));
    if (!entry) throw new Error("main() did not install the 30 s runtime tick");
    return entry;
  };

  return {
    intervals,
    cleared,
    errors,
    exitSpy,
    loadSpy,
    shutdown: shutdown!,
    settle,
    runtimeTick,
    /** Moves the clock forward and runs one 30 s runtime tick to completion. */
    async tick(advanceMs: number): Promise<void> {
      clockOffset += advanceMs;
      runtimeTick().fn();
      await settle();
    },
  };
}
