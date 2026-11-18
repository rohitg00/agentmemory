import { afterEach, describe, expect, it, vi } from "vitest";
import { addAuditListener, recordAudit, setAuditRecordedListener } from "../src/functions/audit.js";
import type { AuditEntry } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function memoryKV(failWrites = false) {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async (scope: string, key: string) => store.get(scope)?.get(key) ?? null,
    set: async (scope: string, key: string, value: unknown) => {
      if (failWrites) throw new Error("write failed");
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, structuredClone(value));
    },
    delete: async () => {},
    list: async (scope: string) => Array.from(store.get(scope)?.values() ?? []),
  };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  setAuditRecordedListener(null);
});

describe("audit listeners", () => {
  it("delivers each entry to the viewer slot and every added listener until it unsubscribes", async () => {
    const viewer: string[] = [];
    const sink: string[] = [];
    setAuditRecordedListener((entry) => viewer.push(entry.id));
    const unsubscribe = addAuditListener((entry) => sink.push(entry.id));
    const first = await recordAudit(memoryKV() as never, "remember", "mem::test", ["mem_a"]);
    unsubscribe();
    const second = await recordAudit(memoryKV() as never, "remember", "mem::test", ["mem_b"]);
    expect(viewer).toEqual([first.id, second.id]);
    expect(sink).toEqual([first.id]);
  });

  it("isolates failing listeners and hands out a frozen entry", async () => {
    const received: AuditEntry[] = [];
    cleanups.push(addAuditListener(() => { throw new Error("sync"); }));
    cleanups.push(addAuditListener(async () => { throw new Error("async"); }));
    cleanups.push(addAuditListener((entry) => { received.push(entry); }));
    const details = { reason: "test" };
    const entry = await recordAudit(memoryKV() as never, "forget", "mem::test", ["mem_a"], details);
    expect(received).toEqual([entry]);
    expect(Object.isFrozen(entry) && Object.isFrozen(entry.details) && Object.isFrozen(entry.targetIds)).toBe(true);
    expect(Object.isFrozen(details)).toBe(false);
  });

  it("notifies nobody when the entry write fails", async () => {
    const listener = vi.fn();
    cleanups.push(addAuditListener(listener));
    await expect(recordAudit(memoryKV(true) as never, "remember", "mem::test", ["mem_a"])).rejects.toThrow("write failed");
    expect(listener).not.toHaveBeenCalled();
  });
});
