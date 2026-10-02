import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CompressedObservation } from "../src/types.js";
import { registerReplayFunctions } from "../src/functions/replay.js";
import { KV } from "../src/state/schema.js";
import * as sessionLocks from "../src/state/keyed-mutex.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/functions/search.js", () => ({ indexRecords: vi.fn() }));

describe("JSONL observation write batching", () => {
  it("limits writes to 20 and waits for the entire batch before starting the next", async () => {
    const folder = mkdtempSync(join(__dirname, "replay-write-batching-"));
    process.env.AGENTMEMORY_IMPORT_ROOT = folder;
    const path = join(folder, "session.jsonl");
    const sessionId = "write-batching-session";
    const scope = KV.observations(sessionId);
    const prompts = Array.from({ length: 45 }, (_, i) => `record ${i}`);
    writeFileSync(path, prompts.map((content, i) => JSON.stringify({
      type: "user", uuid: `entry-${i}`, sessionId, timestamp: "2026-09-30T00:00:00Z",
      message: { role: "user", content },
    })).join("\n"));

    const store = new Map<string, Map<string, unknown>>();
    const writes: Array<{ scope: string; key: string; value: CompressedObservation }> = [];
    const release: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    let draining = false;
    const kv = {
      get: async (bucket: string, key: string) => store.get(bucket)?.get(key) ?? null,
      list: async (bucket: string) => Array.from(store.get(bucket)?.values() ?? []),
      set: async (bucket: string, key: string, value: unknown) => {
        if (bucket === scope) {
          writes.push({ scope: bucket, key, value: value as CompressedObservation });
          active++;
          peak = Math.max(peak, active);
          if (!draining) await new Promise<void>((resolve) => release.push(resolve));
          active--;
        }
        if (!store.has(bucket)) store.set(bucket, new Map());
        store.get(bucket)!.set(key, value);
        return value;
      },
    };
    let importJsonl: (data: { path: string }) => Promise<unknown> = async () => undefined;
    const sdk = {
      registerFunction: (id: string, handler: typeof importJsonl) => {
        if (id === "mem::replay::import-jsonl") importJsonl = handler;
      },
    };
    registerReplayFunctions(sdk as never, kv as never);
    const importing = importJsonl({ path });
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    try {
      await vi.waitFor(() => expect(writes).toHaveLength(20));
      for (const finish of release.slice(0, 19)) finish();
      await flush();
      expect(active).toBe(1);
      expect(writes).toHaveLength(20);

      release[19]();
      await vi.waitFor(() => expect(writes).toHaveLength(40));
      for (const finish of release.slice(20, 39)) finish();
      await flush();
      expect(active).toBe(1);
      expect(writes).toHaveLength(40);

      release[39]();
      await vi.waitFor(() => expect(writes).toHaveLength(45));
      for (const finish of release.slice(40)) finish();
      expect(await importing).toMatchObject({ success: true, observations: 45 });
      expect(peak).toBe(20);
      expect(active).toBe(0);
      expect(writes.every((write) => write.scope === scope && write.key === write.value.id && write.value.sessionId === sessionId)).toBe(true);
      expect(new Set(writes.map((write) => write.key)).size).toBe(45);
      expect(writes.map((write) => write.value.source?.userPrompt)).toEqual(prompts);
      expect(store.get(scope)?.size).toBe(45);
    } finally {
      draining = true;
      for (const finish of release) finish();
      await importing.catch(() => {});
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("drains a failed batch before a competing import acquires the session lock", async () => {
    const folder = mkdtempSync(join(__dirname, "replay-write-batching-"));
    process.env.AGENTMEMORY_IMPORT_ROOT = folder;
    const sessionId = "failed-batch-session";
    const scope = KV.observations(sessionId);
    const fixture = (name: string, count: number) => {
      const path = join(folder, `${name}.jsonl`);
      writeFileSync(path, Array.from({ length: count }, (_, i) => JSON.stringify({
        type: "user", uuid: `${name}-${i}`, sessionId, timestamp: "2026-09-30T00:00:00Z",
        message: { role: "user", content: `${name}-${i}` },
      })).join("\n"));
      return path;
    };
    const firstPath = fixture("first", 45);
    const secondPath = fixture("second", 1);
    const store = new Map<string, Map<string, unknown>>();
    const gates: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    const observationsAtRead: number[] = [];
    const activeAtSecondWrite: number[] = [];
    let active = 0;
    let firstWrites = 0;
    let draining = false;
    const kv = {
      get: async (bucket: string, key: string) => store.get(bucket)?.get(key) ?? null,
      list: async (bucket: string) => {
        const rows = Array.from(store.get(bucket)?.values() ?? []);
        if (bucket === scope) observationsAtRead.push(rows.length);
        return rows;
      },
      set: async (bucket: string, key: string, value: unknown) => {
        if (bucket === scope) {
          const observation = value as CompressedObservation;
          if (observation.source?.userPrompt?.startsWith("first-")) {
            firstWrites++;
            active++;
            try {
              if (!draining) await new Promise<void>((resolve, reject) => gates.push({ resolve, reject }));
            } finally {
              active--;
            }
          } else {
            activeAtSecondWrite.push(active);
          }
        }
        if (!store.has(bucket)) store.set(bucket, new Map());
        store.get(bucket)!.set(key, value);
        return value;
      },
    };
    let importJsonl: (data: { path: string }) => Promise<unknown> = async () => undefined;
    const sdk = {
      registerFunction: (id: string, handler: typeof importJsonl) => {
        if (id === "mem::replay::import-jsonl") importJsonl = handler;
      },
    };
    registerReplayFunctions(sdk as never, kv as never);
    const lockCalls = vi.spyOn(sessionLocks, "withKeyedLock");
    let firstFinished = false;
    const first = importJsonl({ path: firstPath }).then(
      (value) => { firstFinished = true; return { value }; },
      (error) => { firstFinished = true; return { error }; },
    );
    let second = Promise.resolve<unknown>(undefined);
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    try {
      await vi.waitFor(() => expect(gates).toHaveLength(20));
      second = importJsonl({ path: secondPath });
      await vi.waitFor(() => expect(lockCalls.mock.calls.filter(([key]) => key === `obs:${sessionId}`)).toHaveLength(2));
      const failure = new Error("observation write failed");
      gates[0].reject(failure);
      await flush();
      expect(firstFinished).toBe(false);
      expect(active).toBe(19);
      expect(observationsAtRead).toEqual([0]);

      for (const gate of gates.slice(1, 19)) gate.resolve();
      await flush();
      expect(firstFinished).toBe(false);
      expect(active).toBe(1);
      expect(observationsAtRead).toEqual([0]);
      expect(firstWrites).toBe(20);

      gates[19].resolve();
      expect(await first).toEqual({ error: failure });
      expect(await second).toMatchObject({ success: true, observations: 1 });
      expect(firstWrites).toBe(20);
      expect(observationsAtRead).toEqual([0, 19]);
      expect(activeAtSecondWrite).toEqual([0]);
      expect(store.get(scope)?.size).toBe(20);
    } finally {
      draining = true;
      for (const gate of gates) gate.resolve();
      await Promise.allSettled([first, second]);
      lockCalls.mockRestore();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
