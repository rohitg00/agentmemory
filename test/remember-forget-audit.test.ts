import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

import { registerRememberFunction } from "../src/functions/remember.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload: unknown }) => {
      const fn = functions.get(input.function_id);
      if (!fn) throw new Error(`unknown fn ${input.function_id}`);
      return fn(input.payload);
    },
  };
}

describe("mem::remember audit attribution", () => {
  it("emits an audit row with session and tag attribution when a memory is saved", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const result = await sdk.trigger({
      function_id: "mem::remember",
      payload: {
        content: "Persist the deployment runbook",
        type: "workflow",
        concepts: ["deploy", "runbook"],
        files: ["docs/deploy.md"],
        sessionId: "ses_123",
        tags: ["ops", "prod"],
        sourceObservationIds: ["obs_1"],
      },
    });
    const memory = (result as { memory: { id: string; sessionIds: string[] } }).memory;
    expect(memory.sessionIds).toEqual(["ses_123"]);

    const auditRows = await kv.list<{
      operation: string;
      functionId: string;
      targetIds: string[];
      details: Record<string, unknown>;
    }>("mem:audit");
    expect(auditRows).toHaveLength(1);
    const [row] = auditRows;
    expect(row.operation).toBe("remember");
    expect(row.functionId).toBe("mem::remember");
    expect(row.targetIds).toEqual([memory.id]);
    expect(row.details).toMatchObject({
      type: "workflow",
      sessionIds: ["ses_123"],
      tags: ["ops", "prod"],
      concepts: ["deploy", "runbook"],
      files: ["docs/deploy.md"],
      sourceObservationIds: ["obs_1"],
      version: 1,
    });
  });
});

describe("mem::forget audit coverage (issue #125)", () => {
  it("emits a single audit row when a memory is forgotten", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await kv.set("mem:memories", "mem_a", { id: "mem_a", content: "x" });

    const result = await sdk.trigger({
      function_id: "mem::forget",
      payload: { memoryId: "mem_a" },
    });
    expect((result as { deleted: number }).deleted).toBe(1);

    const auditRows = await kv.list<{
      operation: string;
      functionId: string;
      targetIds: string[];
      details: Record<string, unknown>;
    }>("mem:audit");
    expect(auditRows).toHaveLength(1);
    const [row] = auditRows;
    expect(row.operation).toBe("forget");
    expect(row.functionId).toBe("mem::forget");
    expect(row.targetIds).toEqual(["mem_a"]);
    expect(row.details.memoriesDeleted).toBe(1);
    expect(row.details.observationsDeleted).toBe(0);
    expect(row.details.sessionDeleted).toBe(false);
  });

  it("emits one batched audit row when an entire session is forgotten", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await kv.set("mem:sessions", "sess_1", { id: "sess_1" });
    await kv.set("mem:summaries", "sess_1", { id: "sess_1" });
    await kv.set("mem:obs:sess_1", "obs_a", { id: "obs_a" });
    await kv.set("mem:obs:sess_1", "obs_b", { id: "obs_b" });

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: "sess_1" },
    });

    const auditRows = await kv.list<{
      targetIds: string[];
      details: Record<string, unknown>;
    }>("mem:audit");
    expect(auditRows).toHaveLength(1);
    const [row] = auditRows;
    expect([...row.targetIds].sort()).toEqual(["obs_a", "obs_b"]);
    expect(row.details.memoriesDeleted).toBe(0);
    expect(row.details.observationsDeleted).toBe(2);
    expect(row.details.sessionDeleted).toBe(true);
    expect(row.details.deleted).toBe(4);
  });

  it("does not emit an audit row when nothing is deleted", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: undefined, memoryId: undefined },
    });

    const auditRows = await kv.list("mem:audit");
    expect(auditRows).toHaveLength(0);
  });
});
