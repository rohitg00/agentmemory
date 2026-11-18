import { afterEach, describe, expect, it, vi } from "vitest";
import * as audit from "../src/functions/audit.js";
import { KV } from "../src/state/schema.js";
import { resetViewerCounts } from "../src/state/viewer-counts.js";
import { registerViewerStreamTriggers } from "../src/triggers/viewer-streams.js";
import { onLiveEvent, type LiveEvent } from "../src/viewer/live-events.js";
import type { AuditEntry } from "../src/types.js";

type Listener = (entry: AuditEntry) => void | Promise<void>;
const cleanups: Array<() => void> = [];

function memoryKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: vi.fn(async (scope: string, key: string) => store.get(scope)?.get(key) ?? null),
    set: vi.fn(async (scope: string, key: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, structuredClone(value));
    }),
    delete: vi.fn(async (scope: string, key: string) => { store.get(scope)?.delete(key); }),
    list: vi.fn(async (scope: string) => Array.from(store.get(scope)?.values() ?? [])),
  };
}

function subscribe(listener: Listener): void {
  if ("addAuditListener" in audit && typeof audit.addAuditListener === "function") {
    audit.addAuditListener(listener);
    cleanups.push(() => {
      if ("removeAuditListener" in audit && typeof audit.removeAuditListener === "function") {
        audit.removeAuditListener(listener);
      }
    });
  } else {
    audit.setAuditRecordedListener(listener);
    cleanups.push(() => audit.setAuditRecordedListener(null));
  }
}

function viewer(kv: ReturnType<typeof memoryKV>) {
  const events: LiveEvent[] = [];
  cleanups.push(onLiveEvent((event) => events.push(event)));
  const sdk = {
    registerFunction: vi.fn(),
    registerTrigger: vi.fn(),
    trigger: vi.fn(async () => ({})),
  };
  registerViewerStreamTriggers(sdk as never, kv as never);
  return events;
}

afterEach(() => {
  cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
  audit.setAuditRecordedListener(null);
  resetViewerCounts();
});

describe("audit listener coexistence through persisted records and real viewer wiring", () => {
  it("keeps the viewer when another consumer subscribes after it", async () => {
    const kv = memoryKV();
    const events = viewer(kv);
    const received: AuditEntry[] = [];
    subscribe((entry) => { received.push(entry); });
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["memory-one"], { reason: "requested" });
    expect(received).toEqual([entry]);
    expect(events.map((event) => ({ type: event.type, data: event.data }))).toEqual([
      { type: "audit.created", data: { id: entry.id, audit: entry } },
    ]);
    expect(kv.store.get(KV.auditMonth(audit.auditMonthOf(entry.timestamp)))?.get(entry.id)).toEqual(entry);
  });

  it("keeps an earlier independent consumer when the viewer registers", async () => {
    const kv = memoryKV();
    const received: AuditEntry[] = [];
    subscribe((entry) => { received.push(entry); });
    const events = viewer(kv);
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["memory-two"]);
    expect(events.map((event) => event.data.audit)).toEqual([entry]);
    expect(received).toEqual([entry]);
    expect(kv.store.get(KV.auditMonth(audit.auditMonthOf(entry.timestamp)))?.get(entry.id)).toEqual(entry);
  });

  it("preserves the existing viewer event and monthly persistence without a second consumer", async () => {
    const kv = memoryKV();
    const events = viewer(kv);
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["memory-three"], { source: "control" }, 0.7, "test-user");
    const month = audit.auditMonthOf(entry.timestamp);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("audit.created");
    expect(events[0].data).toEqual({ id: entry.id, audit: entry });
    expect(entry).toMatchObject({ operation: "forget", functionId: "mem::forget", targetIds: ["memory-three"], details: { source: "control" }, qualityScore: 0.7, userId: "test-user" });
    expect(kv.set.mock.calls).toEqual([
      [KV.auditMonth(month), entry.id, entry],
      [KV.auditMonths, "index", { months: [month] }],
    ]);
  });

  it("preserves legacy setter replacement and null cleanup", async () => {
    const kv = memoryKV();
    const first = vi.fn();
    const replacement = vi.fn();
    audit.setAuditRecordedListener(first);
    audit.setAuditRecordedListener(replacement);
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["memory-four"]);
    expect(first).not.toHaveBeenCalled();
    expect(replacement.mock.calls).toEqual([[entry]]);
    audit.setAuditRecordedListener(null);
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["memory-five"]);
    expect(first).not.toHaveBeenCalled();
    expect(replacement.mock.calls).toEqual([[entry]]);
    expect(kv.set).toHaveBeenCalledTimes(3);
  });
});

function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

describe("independent audit listener lifecycle", () => {
  it("deduplicates function identity and makes repeated removal harmless", async () => {
    const kv = memoryKV();
    const listener = vi.fn();
    subscribe(listener);
    audit.addAuditListener(listener);
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    expect(listener.mock.calls).toEqual([[entry]]);
    audit.removeAuditListener(listener);
    audit.removeAuditListener(listener);
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    expect(listener.mock.calls).toEqual([[entry]]);
  });

  it("removes only the selected subscriber and ignores an absent function", async () => {
    const kv = memoryKV();
    const removed = vi.fn();
    const retained = vi.fn();
    subscribe(removed);
    subscribe(retained);
    audit.removeAuditListener(removed);
    audit.removeAuditListener(() => {});
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    expect(removed).not.toHaveBeenCalled();
    expect(retained.mock.calls).toEqual([[entry]]);
  });

  it("replaces and clears only the legacy slot while preserving independent subscribers", async () => {
    const kv = memoryKV();
    const independent = vi.fn();
    const oldLegacy = vi.fn();
    const replacement = vi.fn();
    subscribe(independent);
    audit.setAuditRecordedListener(oldLegacy);
    audit.setAuditRecordedListener(replacement);
    const first = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    audit.setAuditRecordedListener(null);
    const second = await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    expect(oldLegacy).not.toHaveBeenCalled();
    expect(replacement.mock.calls).toEqual([[first]]);
    expect(independent.mock.calls).toEqual([[first], [second]]);
  });

  it("invokes a function shared by both slots once and removes each registration independently", async () => {
    const kv = memoryKV();
    const shared = vi.fn();
    subscribe(shared);
    audit.setAuditRecordedListener(shared);
    const first = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    audit.removeAuditListener(shared);
    const second = await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    audit.setAuditRecordedListener(null);
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["three"]);
    expect(shared.mock.calls).toEqual([[first], [second]]);
  });

  it("invokes the legacy callback first followed by independent insertion order", async () => {
    const kv = memoryKV();
    const calls: string[] = [];
    subscribe(() => { calls.push("first"); });
    subscribe(() => { calls.push("second"); });
    audit.setAuditRecordedListener(() => { calls.push("legacy"); });
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    expect(calls).toEqual(["legacy", "first", "second"]);
  });

  it("moves a removed and registered subscriber to the end on the next entry", async () => {
    const kv = memoryKV();
    const calls: string[] = [];
    const first = () => { calls.push("first"); };
    subscribe(first);
    subscribe(() => { calls.push("second"); });
    audit.removeAuditListener(first);
    audit.addAuditListener(first);
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    expect(calls).toEqual(["second", "first"]);
  });

  it("uses a dispatch snapshot when a callback removes a later subscriber and adds another", async () => {
    const kv = memoryKV();
    const calls: string[] = [];
    const later = () => { calls.push("later"); };
    const added = () => { calls.push("added"); };
    subscribe(() => {
      calls.push("first");
      audit.removeAuditListener(later);
      audit.addAuditListener(added);
    });
    subscribe(later);
    cleanups.push(() => audit.removeAuditListener(added));
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    expect(calls).toEqual(["first", "later"]);
    calls.length = 0;
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    expect(calls).toEqual(["first", "added"]);
  });

  it("applies a legacy replacement during dispatch only to the next entry", async () => {
    const kv = memoryKV();
    const calls: string[] = [];
    subscribe(() => { calls.push("independent"); });
    audit.setAuditRecordedListener(() => {
      calls.push("old-legacy");
      audit.setAuditRecordedListener(() => { calls.push("new-legacy"); });
    });
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    expect(calls).toEqual(["old-legacy", "independent", "new-legacy", "independent"]);
  });

  it("does not invoke a removed and re-added callback twice in the current dispatch", async () => {
    const kv = memoryKV();
    const calls: string[] = [];
    const moved = () => { calls.push("moved"); };
    let change = true;
    subscribe(() => {
      calls.push("first");
      if (change) {
        change = false;
        audit.removeAuditListener(moved);
        audit.addAuditListener(moved);
      }
    });
    subscribe(moved);
    subscribe(() => { calls.push("last"); });
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    expect(calls).toEqual(["first", "moved", "last"]);
    calls.length = 0;
    await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    expect(calls).toEqual(["first", "last", "moved"]);
  });

  it("isolates synchronous exceptions in both slots without losing another callback or the record", async () => {
    const kv = memoryKV();
    const retained = vi.fn();
    audit.setAuditRecordedListener(() => { throw new Error("legacy failed"); });
    subscribe(() => { throw new Error("subscriber failed"); });
    subscribe(retained);
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    expect(retained.mock.calls).toEqual([[entry]]);
    expect(kv.store.get(KV.auditMonth(audit.auditMonthOf(entry.timestamp)))?.get(entry.id)).toEqual(entry);
    expect(kv.set).toHaveBeenCalledTimes(2);
  });

  it("observes rejected async callbacks in both slots without unhandled rejection or lost delivery", async () => {
    const kv = memoryKV();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    cleanups.push(() => { process.off("unhandledRejection", unhandled); });
    audit.setAuditRecordedListener(async () => { throw new Error("legacy async failed"); });
    subscribe(async () => { throw new Error("subscriber async failed"); });
    const retained = vi.fn();
    subscribe(retained);
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(unhandled).not.toHaveBeenCalled();
    expect(retained.mock.calls).toEqual([[entry]]);
    expect(kv.set).toHaveBeenCalledTimes(2);
  });

  it("observes a callback promise that rejects after recordAudit has returned", async () => {
    const kv = memoryKV();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    cleanups.push(() => { process.off("unhandledRejection", unhandled); });
    const pending = deferred();
    subscribe(() => pending.promise);
    const retained = vi.fn();
    subscribe(retained);
    const entry = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    pending.reject(new Error("late subscriber failure"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(unhandled).not.toHaveBeenCalled();
    expect(retained.mock.calls).toEqual([[entry]]);
    expect(kv.store.get(KV.auditMonth(audit.auditMonthOf(entry.timestamp)))?.get(entry.id)).toEqual(entry);
  });

  it("does not await a pending callback or block the following subscriber", async () => {
    const kv = memoryKV();
    const pending = deferred();
    subscribe(() => pending.promise);
    const retained = vi.fn();
    subscribe(retained);
    const recording = audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    try {
      const outcome = await Promise.race([
        recording.then(() => "recorded"),
        new Promise<string>((resolve) => setImmediate(() => resolve("still-pending"))),
      ]);
      expect(outcome).toBe("recorded");
      expect(retained).toHaveBeenCalledTimes(1);
    } finally {
      pending.resolve();
      await recording;
    }
  });

  it("does not deliver after an entry write failure and preserves the safeAudit logging boundary", async () => {
    const kv = memoryKV();
    const failure = new Error("entry write denied");
    kv.set.mockRejectedValue(failure);
    const legacy = vi.fn();
    const independent = vi.fn();
    audit.setAuditRecordedListener(legacy);
    subscribe(independent);
    const { logger } = await import("../src/logger.js");
    const warning = vi.spyOn(logger, "warn").mockImplementation(() => {});
    cleanups.push(() => { warning.mockRestore(); });
    await expect(audit.recordAudit(kv as never, "forget", "mem::forget", ["one"])).rejects.toBe(failure);
    await expect(audit.safeAudit(kv as never, "forget", "mem::forget", ["two"])).resolves.toBeUndefined();
    expect(legacy).not.toHaveBeenCalled();
    expect(independent).not.toHaveBeenCalled();
    expect(kv.get).not.toHaveBeenCalled();
    expect(kv.store.size).toBe(0);
    expect(warning.mock.calls).toEqual([["audit write failed", { functionId: "mem::forget", operation: "forget", targetIds: ["two"], error: "entry write denied" }]]);
  });

  it("does not deliver after an index read fails even though the entry write succeeded", async () => {
    const kv = memoryKV();
    const failure = new Error("month index unreadable");
    kv.get.mockRejectedValueOnce(failure);
    const listener = vi.fn();
    subscribe(listener);
    await expect(audit.recordAudit(kv as never, "forget", "mem::forget", ["one"])).rejects.toBe(failure);
    expect(listener).not.toHaveBeenCalled();
    expect(kv.set).toHaveBeenCalledTimes(1);
    const [scope, id, entry] = kv.set.mock.calls[0];
    expect(scope).toMatch(/^mem:audit:\d{4}-\d{2}$/);
    expect(kv.store.get(scope)?.get(id)).toEqual(entry);
    expect(kv.store.has(KV.auditMonths)).toBe(false);
  });

  it("does not deliver after the month index write fails or hide the already written entry", async () => {
    const kv = memoryKV();
    const failure = new Error("month index write denied");
    const persist = kv.set.getMockImplementation()!;
    kv.set.mockImplementation(async (scope, key, value) => {
      if (scope === KV.auditMonths) throw failure;
      await persist(scope, key, value);
    });
    const legacy = vi.fn();
    const independent = vi.fn();
    audit.setAuditRecordedListener(legacy);
    subscribe(independent);
    await expect(audit.recordAudit(kv as never, "forget", "mem::forget", ["one"])).rejects.toBe(failure);
    expect(legacy).not.toHaveBeenCalled();
    expect(independent).not.toHaveBeenCalled();
    expect(kv.set).toHaveBeenCalledTimes(2);
    const [scope, id, entry] = kv.set.mock.calls[0];
    expect(kv.store.get(scope)?.get(id)).toEqual(entry);
    expect(kv.store.has(KV.auditMonths)).toBe(false);
  });

  it("delivers only after the month index write has completed", async () => {
    const kv = memoryKV();
    const atIndex = deferred();
    const releaseIndex = deferred();
    const persist = kv.set.getMockImplementation()!;
    kv.set.mockImplementation(async (scope, key, value) => {
      if (scope === KV.auditMonths) {
        atIndex.resolve();
        await releaseIndex.promise;
      }
      await persist(scope, key, value);
    });
    const observedIndexes: unknown[] = [];
    const listener = vi.fn(() => {
      observedIndexes.push(structuredClone(kv.store.get(KV.auditMonths)?.get("index")));
    });
    subscribe(listener);
    const recording = audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    try {
      await atIndex.promise;
      expect(listener).not.toHaveBeenCalled();
      expect(kv.set).toHaveBeenCalledTimes(2);
    } finally {
      releaseIndex.resolve();
    }
    const entry = await recording;
    expect(listener.mock.calls).toEqual([[entry]]);
    expect(observedIndexes).toEqual([{ months: [audit.auditMonthOf(entry.timestamp)] }]);
  });

  it("takes the listener snapshot after pending persistence completes", async () => {
    const kv = memoryKV();
    const atIndex = deferred();
    const releaseIndex = deferred();
    const persist = kv.set.getMockImplementation()!;
    kv.set.mockImplementation(async (scope, key, value) => {
      if (scope === KV.auditMonths) {
        atIndex.resolve();
        await releaseIndex.promise;
      }
      await persist(scope, key, value);
    });
    const oldLegacy = vi.fn();
    const newLegacy = vi.fn();
    const added = vi.fn();
    audit.setAuditRecordedListener(oldLegacy);
    const recording = audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    try {
      await atIndex.promise;
      audit.setAuditRecordedListener(newLegacy);
      subscribe(added);
    } finally {
      releaseIndex.resolve();
    }
    const entry = await recording;
    expect(oldLegacy).not.toHaveBeenCalled();
    expect(newLegacy.mock.calls).toEqual([[entry]]);
    expect(added.mock.calls).toEqual([[entry]]);
  });

  it("delivers each record once when its month is already indexed without an extra index write", async () => {
    const kv = memoryKV();
    const listener = vi.fn();
    subscribe(listener);
    const first = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    const second = await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    expect(listener.mock.calls).toEqual([[first], [second]]);
    expect(kv.set.mock.calls.map(([scope]) => scope)).toEqual([
      KV.auditMonth(audit.auditMonthOf(first.timestamp)), KV.auditMonths, KV.auditMonth(audit.auditMonthOf(second.timestamp)),
    ]);
  });

  it("keeps independent delivery through viewer re-registration and legacy viewer cleanup", async () => {
    const kv = memoryKV();
    const listener = vi.fn();
    subscribe(listener);
    const firstViewer = viewer(kv);
    const secondViewer = viewer(kv);
    const first = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    expect(firstViewer.map((event) => event.data.audit)).toEqual([first]);
    expect(secondViewer.map((event) => event.data.audit)).toEqual([first]);
    audit.setAuditRecordedListener(null);
    const second = await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    expect(firstViewer.map((event) => event.data.audit)).toEqual([first]);
    expect(secondViewer.map((event) => event.data.audit)).toEqual([first]);
    expect(listener.mock.calls).toEqual([[first], [second]]);
  });
});

describe("legacy audit callback source compatibility", () => {
  it("accepts value-returning legacy and independent callbacks including an async legacy callback", async () => {
    const kv = memoryKV();
    const legacyRows: AuditEntry[] = [];
    const independentRows: AuditEntry[] = [];
    const independent = (entry: AuditEntry) => independentRows.push(entry);
    audit.addAuditListener(independent);
    cleanups.push(() => audit.removeAuditListener(independent));
    audit.setAuditRecordedListener((entry) => legacyRows.push(entry));
    const first = await audit.recordAudit(kv as never, "forget", "mem::forget", ["one"]);
    audit.setAuditRecordedListener(async (entry) => legacyRows.push(entry));
    const second = await audit.recordAudit(kv as never, "forget", "mem::forget", ["two"]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(legacyRows).toEqual([first, second]);
    expect(independentRows).toEqual([first, second]);
  });
});
