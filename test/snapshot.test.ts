import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, { stdout: "abc1234\n", stderr: "" });
    },
  ),
}));

vi.mock("node:util", async () => {
  const actual = (await vi.importActual("node:util")) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    promisify: () => async () => ({ stdout: "abc1234\n", stderr: "" }),
  };
});

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi
    .fn()
    .mockReturnValue('{"version":"0.4.0","sessions":[],"memories":[]}'),
}));

import { registerSnapshotFunction } from "../src/functions/snapshot.js";
import type { Session, Memory, SnapshotMeta } from "../src/types.js";

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
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

describe("Snapshot Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const snapshotDir = "/tmp/agentmemory-snapshots";

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    vi.clearAllMocks();
    registerSnapshotFunction(sdk as never, kv as never, snapshotDir);

    const session: Session = {
      id: "ses_1",
      project: "test",
      cwd: "/tmp",
      startedAt: "2026-02-01T00:00:00Z",
      status: "completed",
      observationCount: 1,
    };
    await kv.set("mem:sessions", "ses_1", session);

    const mem: Memory = {
      id: "mem_1",
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
      type: "pattern",
      title: "Test pattern",
      content: "Always test",
      concepts: [],
      files: [],
      sessionIds: ["ses_1"],
      strength: 5,
      version: 1,
      isLatest: true,
    };
    await kv.set("mem:memories", "mem_1", mem);
  });

  it("snapshot-create serializes state and returns meta", async () => {
    const result = (await sdk.trigger("mem::snapshot-create", {
      message: "Test snapshot",
    })) as { success: boolean; snapshot: SnapshotMeta };

    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot.commitHash).toBe("abc1234");
    expect(result.snapshot.message).toBe("Test snapshot");
    expect(result.snapshot.stats.sessions).toBe(1);
    expect(result.snapshot.stats.memories).toBe(1);
  });

  it("snapshot-list returns snapshots from git log", async () => {
    const result = (await sdk.trigger("mem::snapshot-list", {})) as {
      snapshots: Array<{
        commitHash: string;
        createdAt: string;
        message: string;
      }>;
    };

    expect(result.snapshots).toBeDefined();
    expect(Array.isArray(result.snapshots)).toBe(true);
  });

  it("snapshot-restore requires commitHash", async () => {
    const result = (await sdk.trigger("mem::snapshot-restore", {})) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("commitHash");
  });

  it("snapshot-restore loads state from commit", async () => {
    const result = (await sdk.trigger("mem::snapshot-restore", {
      commitHash: "abc1234",
    })) as { success: boolean; commitHash: string };

    expect(result.success).toBe(true);
    expect(result.commitHash).toBe("abc1234");
  });

  it("snapshot-create records an audit entry", async () => {
    await sdk.trigger("mem::snapshot-create", { message: "Audit test" });

    const audits = await kv.list("mem:audit");
    expect(audits.length).toBe(1);
  });
});

describe("snapshot-create reentrancy guard", () => {
  // Regression (P2): mem::snapshot-create is triggered by the periodic timer,
  // REST (api::snapshot-create), and MCP. Two runs writing state.json and
  // committing in the same git repo at once race on the index lock. An
  // overlapping call must be a no-op success while the first run finishes.
  it("skips an overlapping call and releases the guard on completion", async () => {
    let releaseFirst!: () => void;
    const firstListGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let listCalls = 0;
    const store = new Map<string, Map<string, unknown>>();
    const gatedKv = {
      get: async () => null,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (!store.has(scope)) store.set(scope, new Map());
        store.get(scope)!.set(key, data);
        return data;
      },
      delete: async () => {},
      list: async <T>(scope: string): Promise<T[]> => {
        listCalls++;
        // Park the first snapshot inside its initial list() so a second
        // snapshot-create observes the in-flight guard.
        if (listCalls === 1) await firstListGate;
        return (Array.from(store.get(scope)?.values() ?? []) as T[]) ?? [];
      },
    };
    const localSdk = mockSdk();
    registerSnapshotFunction(localSdk as never, gatedKv as never, "/tmp/reentrant");

    // Start the first snapshot; it parks inside kv.list with the guard held.
    const p1 = localSdk.trigger("mem::snapshot-create", { message: "first" });
    await Promise.resolve();
    await Promise.resolve();

    // Overlapping call: must be rejected as already-in-progress, NOT run git.
    const r2 = (await localSdk.trigger("mem::snapshot-create", {
      message: "second",
    })) as { success: boolean; message?: string; snapshot?: unknown };
    expect(r2).toEqual({
      success: true,
      message: "Snapshot already in progress",
    });
    expect(r2.snapshot).toBeUndefined();

    // Release the first run; it completes normally.
    releaseFirst();
    const r1 = (await p1) as { success: boolean; snapshot?: unknown };
    expect(r1.success).toBe(true);
    expect(r1.snapshot).toBeDefined();

    // Guard is released: a fresh call runs the full body again.
    const r3 = (await localSdk.trigger("mem::snapshot-create", {
      message: "third",
    })) as { success: boolean; snapshot?: unknown };
    expect(r3.success).toBe(true);
    expect(r3.snapshot).toBeDefined();
  });
});
