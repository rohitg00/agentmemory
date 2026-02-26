import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerAutoForgetFunction } from "../src/functions/auto-forget.js";
import type { Memory, CompressedObservation, Session } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
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
    registerFunction: (opts: { id: string }, handler: Function) => {
      functions.set(opts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, data: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(data);
    },
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "pattern",
    title: "Test memory",
    content: "This is a test memory with enough words for comparison",
    concepts: ["test"],
    files: [],
    sessionIds: ["ses_1"],
    strength: 5,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

describe("Auto-Forget Function", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerAutoForgetFunction(sdk as never, kv as never);
  });

  it("detects and deletes TTL-expired memories", async () => {
    const expired = makeMemory({
      id: "mem_expired",
      forgetAfter: "2020-01-01T00:00:00Z",
    });
    await kv.set("mem:memories", "mem_expired", expired);

    const result = (await sdk.trigger("mem::auto-forget", {})) as {
      ttlExpired: string[];
    };

    expect(result.ttlExpired).toContain("mem_expired");
    const deleted = await kv.get("mem:memories", "mem_expired");
    expect(deleted).toBeNull();
  });

  it("detects contradiction between very similar memories", async () => {
    const mem1 = makeMemory({
      id: "mem_1",
      content: "Use React hooks for state management in all components",
      createdAt: "2026-01-01T00:00:00Z",
    });
    const mem2 = makeMemory({
      id: "mem_2",
      content: "Use React hooks for state management in all components",
      createdAt: "2026-02-01T00:00:00Z",
    });
    await kv.set("mem:memories", "mem_1", mem1);
    await kv.set("mem:memories", "mem_2", mem2);

    const result = (await sdk.trigger("mem::auto-forget", {})) as {
      contradictions: Array<{
        memoryA: string;
        memoryB: string;
        similarity: number;
      }>;
    };

    expect(result.contradictions.length).toBe(1);
    const older = await kv.get<Memory>("mem:memories", "mem_1");
    expect(older!.isLatest).toBe(false);
  });

  it("evicts low-value old observations", async () => {
    const session: Session = {
      id: "ses_1",
      project: "my-project",
      cwd: "/tmp",
      startedAt: "2025-01-01T00:00:00Z",
      status: "completed",
      observationCount: 1,
    };
    await kv.set("mem:sessions", "ses_1", session);

    const oldLowObs: CompressedObservation = {
      id: "obs_old",
      sessionId: "ses_1",
      timestamp: "2025-01-01T00:00:00Z",
      type: "other",
      title: "trivial event",
      facts: [],
      narrative: "nothing important",
      concepts: [],
      files: [],
      importance: 1,
    };
    await kv.set("mem:obs:ses_1", "obs_old", oldLowObs);

    const result = (await sdk.trigger("mem::auto-forget", {})) as {
      lowValueObs: string[];
    };

    expect(result.lowValueObs).toContain("obs_old");
  });

  it("dryRun mode identifies but does not delete anything", async () => {
    const expired = makeMemory({
      id: "mem_expired",
      forgetAfter: "2020-01-01T00:00:00Z",
    });
    await kv.set("mem:memories", "mem_expired", expired);

    const result = (await sdk.trigger("mem::auto-forget", { dryRun: true })) as {
      ttlExpired: string[];
      dryRun: boolean;
    };

    expect(result.dryRun).toBe(true);
    expect(result.ttlExpired).toContain("mem_expired");

    const stillExists = await kv.get("mem:memories", "mem_expired");
    expect(stillExists).not.toBeNull();
  });

  it("does not flag non-similar memories as contradictions", async () => {
    const mem1 = makeMemory({
      id: "mem_1",
      content: "We use TypeScript with strict mode enabled for all backend services",
    });
    const mem2 = makeMemory({
      id: "mem_2",
      content: "The deployment pipeline runs integration tests before merging to main",
    });
    await kv.set("mem:memories", "mem_1", mem1);
    await kv.set("mem:memories", "mem_2", mem2);

    const result = (await sdk.trigger("mem::auto-forget", {})) as {
      contradictions: unknown[];
    };

    expect(result.contradictions.length).toBe(0);
  });
});
