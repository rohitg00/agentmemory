import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { formatSseFrame, LiveEventsHub, type LiveEventWriter } from "../src/viewer/live-events.js";

class Writer extends EventEmitter {
  writableLength = 0;
  destroyed = false;
  frames: string[] = [];
  write(frame: string) { this.frames.push(frame); return true; }
  destroy() { this.destroyed = true; this.emit("close"); return this; }
}

describe("LiveEventsHub", () => {
  it("formats a one-line SSE JSON envelope and fans out to all listeners", () => {
    const hub = new LiveEventsHub();
    const a = new Writer();
    const b = new Writer();
    hub.subscribe(a as unknown as LiveEventWriter);
    hub.subscribe(b as unknown as LiveEventWriter);
    const event = { id: "e1", type: "memory.created", data: { memoryId: "m1" } };
    hub.emit(event);
    expect(a.frames).toEqual([formatSseFrame(event)]);
    expect(b.frames).toEqual([formatSseFrame(event)]);
    expect(hub.stats()).toMatchObject({ subscribers: 2, eventsSent: 2, dropped: 0, lastEventAt: expect.any(Number) });
    a.emit("close");
    expect(hub.stats().subscribers).toBe(1);
  });

  it("heartbeats on interval and drops slow subscribers over 1 MiB", () => {
    vi.useFakeTimers();
    const hub = new LiveEventsHub();
    const slow = new Writer();
    hub.subscribe(slow as unknown as LiveEventWriter);
    vi.advanceTimersByTime(15_000);
    expect(slow.frames).toContain(": ping\n\n");
    slow.writableLength = 1024 * 1024 + 1;
    hub.emit({ id: "e2", type: "session.updated", data: {} });
    expect(hub.stats()).toMatchObject({ subscribers: 0, dropped: 1 });
    vi.useRealTimers();
  });

  it("caps the subscriber set at 32", () => {
    const hub = new LiveEventsHub();
    const writers = Array.from({ length: 33 }, () => new Writer());
    writers.forEach((writer) => hub.subscribe(writer as unknown as LiveEventWriter));
    expect(hub.stats()).toMatchObject({ subscribers: 32, dropped: 1 });
    expect(writers[0]!.destroyed).toBe(true);
  });
});
