import { describe, expect, it, vi } from "vitest";
import { afterKeyedLock, isKeyedLockHeld, withKeyedLock, withKeyedLocks } from "../src/state/keyed-mutex.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("keyed mutex context", () => {
  it("retains ancestor locks while isolating sibling asynchronous contexts", async () => {
    const entered = deferred();
    const release = deferred();
    await withKeyedLock("outer", async () => {
      const first = withKeyedLock("first", async () => {
        entered.resolve();
        await release.promise;
        expect(isKeyedLockHeld("outer")).toBe(true);
        expect(isKeyedLockHeld("first")).toBe(true);
        expect(isKeyedLockHeld("second")).toBe(false);
      });
      await entered.promise;
      expect(isKeyedLockHeld("first")).toBe(false);
      await withKeyedLock("second", async () => {
        expect(isKeyedLockHeld("outer")).toBe(true);
        expect(isKeyedLockHeld("second")).toBe(true);
        expect(isKeyedLockHeld("first")).toBe(false);
      });
      release.resolve();
      await first;
      expect(isKeyedLockHeld("outer")).toBe(true);
      expect(isKeyedLockHeld("first")).toBe(false);
    });
    expect(isKeyedLockHeld("outer")).toBe(false);
  });

  it("coalesces named callbacks and releases their lock before running them", async () => {
    const events: string[] = [];
    await withKeyedLock("outer", async () => {
      await withKeyedLock("inner", async () => {
        expect(afterKeyedLock("inner", async () => { events.push("obsolete"); }, "snapshot")).toBe(true);
        expect(afterKeyedLock("inner", async () => {
          expect(isKeyedLockHeld("outer")).toBe(true);
          expect(isKeyedLockHeld("inner")).toBe(false);
          await withKeyedLock("inner", async () => { events.push("latest"); });
        }, "snapshot")).toBe(true);
        afterKeyedLock("inner", async () => { events.push("anonymous-first"); });
        afterKeyedLock("inner", async () => { events.push("anonymous-second"); });
        expect(afterKeyedLock("missing", async () => { events.push("missing"); })).toBe(false);
        events.push("body");
      });
      events.push("inner-complete");
    });
    expect(events).toEqual(["body", "latest", "anonymous-first", "anonymous-second", "inner-complete"]);
  });

  it("releases failed work, flushes callbacks and admits the next queued task", async () => {
    const entered = deferred();
    const release = deferred();
    const callback = vi.fn(async () => { expect(isKeyedLockHeld("failure")).toBe(false); });
    const events: string[] = [];
    const first = withKeyedLock("failure", async () => {
      afterKeyedLock("failure", callback);
      events.push("first");
      entered.resolve();
      await release.promise;
      throw new Error("expected failure");
    });
    const rejected = expect(first).rejects.toThrow("expected failure");
    await entered.promise;
    const second = withKeyedLock("failure", async () => {
      expect(isKeyedLockHeld("failure")).toBe(true);
      events.push("second");
      return 42;
    });
    expect(events).toEqual(["first"]);
    release.resolve();
    await rejected;
    expect(await second).toBe(42);
    expect(callback).toHaveBeenCalledOnce();
    expect(events).toEqual(["first", "second"]);
  });

  it("does not treat a released frame retained by background work as held", async () => {
    const release = deferred();
    const callback = vi.fn(async () => {});
    let background!: Promise<{ held: boolean; queued: boolean }>;
    await withKeyedLock("released", async () => {
      background = release.promise.then(() => ({
        held: isKeyedLockHeld("released"),
        queued: afterKeyedLock("released", callback),
      }));
    });
    release.resolve();
    expect(await background).toEqual({ held: false, queued: false });
    expect(callback).not.toHaveBeenCalled();
  });

  it("acquires 10,000 import keys while preserving outer and inner lock semantics", async () => {
    const keys = Array.from({ length: 10_000 }, (_, i) => `obs:${String(i).padStart(5, "0")}`);
    const callback = vi.fn(async () => {
      expect(isKeyedLockHeld(keys[0])).toBe(false);
      expect(isKeyedLockHeld(keys.at(-1)!)).toBe(false);
    });
    await withKeyedLocks([...keys].reverse().concat(keys[0]), async () => {
      for (const key of [keys[0], keys[5000], keys.at(-1)!]) expect(isKeyedLockHeld(key)).toBe(true);
      expect(afterKeyedLock(keys[0], callback)).toBe(true);
    });
    expect(callback).toHaveBeenCalledOnce();
    expect(isKeyedLockHeld(keys[0])).toBe(false);
  });
});
