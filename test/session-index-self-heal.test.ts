import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config.js")>()),
  isConsolidationEnabled: () => false,
}));

import { registerEvictFunction } from "../src/functions/evict.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { registerReplayFunctions } from "../src/functions/replay.js";
import {
  getProjectSessionIndex,
  rebuildAllProjectSessionIndexes,
} from "../src/state/session-index.js";
import { KV } from "../src/state/schema.js";
import type { Session, ExportData } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    }),
    set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    }),
    delete: vi.fn(async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    }),
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    }),
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
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeStaleSession(id: string, project: string): Session {
  return {
    id,
    project,
    cwd: `/repo/${project}`,
    startedAt: daysAgo(31),
    status: "active",
    observationCount: 0,
  };
}

describe("mem::forget self-heals the project session index", () => {
  it("removes the forgotten session from its project's index", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerRememberFunction(sdk as never, kv as never);

    const session = makeStaleSession("ses_forget", "proj-forget");
    await kv.set(KV.sessions, session.id, session);
    await rebuildAllProjectSessionIndexes(kv as never);
    expect(
      (await getProjectSessionIndex(kv as never, "proj-forget"))?.map((e) => e.id),
    ).toEqual(["ses_forget"]);

    await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: "ses_forget" },
    });

    expect(await getProjectSessionIndex(kv as never, "proj-forget")).toEqual([]);
  });
});

describe("mem::evict bulk removal", () => {
  it("removes 100 stale sessions from one project with at most one sessions listing", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerEvictFunction(sdk as never, kv as never);

    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `ses_bulk_${i}`;
      ids.push(id);
      await kv.set(KV.sessions, id, makeStaleSession(id, "proj-bulk"));
    }
    await rebuildAllProjectSessionIndexes(kv as never);
    expect(
      (await getProjectSessionIndex(kv as never, "proj-bulk"))?.length,
    ).toBe(50);

    kv.list.mockClear();
    kv.get.mockClear();
    kv.set.mockClear();
    kv.delete.mockClear();

    const result = (await sdk.trigger({
      function_id: "mem::evict",
      payload: {},
    })) as { staleSessions: number };

    expect(result.staleSessions).toBe(100);
    expect(
      kv.list.mock.calls.filter((c) => c[0] === KV.sessions),
    ).toHaveLength(1);
    expect(await getProjectSessionIndex(kv as never, "proj-bulk")).toEqual([]);
    for (const id of ids) {
      expect(await kv.get(KV.sessions, id)).toBeNull();
    }
  });
});

describe("mem::import replace strategy bulk removal", () => {
  it("clears 100 sessions from one project with at most one sessions listing", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);

    for (let i = 0; i < 100; i++) {
      const id = `ses_old_${i}`;
      await kv.set(KV.sessions, id, makeStaleSession(id, "proj-old"));
    }
    await rebuildAllProjectSessionIndexes(kv as never);
    expect(
      (await getProjectSessionIndex(kv as never, "proj-old"))?.length,
    ).toBe(50);

    kv.list.mockClear();

    const exportData: ExportData = {
      version: "0.9.28",
      exportedAt: new Date().toISOString(),
      sessions: [
        {
          id: "ses_new",
          project: "proj-old",
          cwd: "/repo/proj-old",
          startedAt: new Date().toISOString(),
          status: "active",
          observationCount: 0,
        },
      ],
      observations: {},
      memories: [],
      summaries: [],
    };

    const result = (await sdk.trigger({
      function_id: "mem::import",
      payload: { exportData, strategy: "replace" },
    })) as { success: boolean; sessions: number };

    expect(result.success).toBe(true);
    expect(result.sessions).toBe(1);
    expect(
      kv.list.mock.calls.filter((c) => c[0] === KV.sessions),
    ).toHaveLength(1);

    const newIndex = await getProjectSessionIndex(kv as never, "proj-old");
    expect(newIndex?.map((e) => e.id)).toEqual(["ses_new"]);
  });
});

describe("mem::replay::import-jsonl self-heals the project session index", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "replay-session-index-"));
  });

  it("adds a newly imported session to its project's index", async () => {
    const dir = join(tmpRoot, "proj");
    mkdirSync(dir, { recursive: true });
    const sessionId = "sess-replay-heal";
    const ts = "2026-04-17T10:00:00.000Z";
    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        sessionId,
        timestamp: ts,
        cwd: tmpRoot,
        message: { role: "user", content: [{ type: "text", text: "hello" }] },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        sessionId,
        timestamp: ts,
        message: { role: "assistant", content: [{ type: "text", text: "world" }] },
      }),
    ];
    writeFileSync(join(dir, `${sessionId}.jsonl`), lines.join("\n") + "\n");

    const sdk = mockSdk();
    const kv = mockKV();
    registerReplayFunctions(sdk as never, kv as never);

    const result = (await sdk.trigger({
      function_id: "mem::replay::import-jsonl",
      payload: { path: tmpRoot },
    })) as { success: boolean; imported?: number; sessionIds?: string[] };

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    const importedSessionId = result.sessionIds?.[0];
    expect(importedSessionId).toBeDefined();

    const session = await kv.get<Session>(KV.sessions, importedSessionId!);
    const index = await getProjectSessionIndex(kv as never, session!.project);
    expect(index?.map((e) => e.id)).toContain(importedSessionId);
  });
});
