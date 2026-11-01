import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerExportImportFunction } from "../src/functions/export-import.js";
import type {
  ExportData,
  Session,
  CompressedObservation,
} from "../src/types.js";

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

const hotSession: Session = {
  id: "ses_hot",
  project: "my-project",
  cwd: "/tmp",
  startedAt: "2026-02-01T00:00:00Z",
  status: "active",
  observationCount: 0,
};

function obsFor(sessionId: string, i: number): CompressedObservation {
  return {
    id: `${sessionId}_obs_${i}`,
    sessionId,
    timestamp: "2026-02-01T10:00:00Z",
    type: "file_edit",
    title: `Observation ${i}`,
    facts: [`fact ${i}`],
    narrative: `Narrative ${i}`,
    concepts: ["cap"],
    files: [],
    importance: 5,
  };
}

function exportWith(sessionId: string, obsCount: number): ExportData {
  return {
    version: "0.9.30",
    exportedAt: new Date().toISOString(),
    sessions: [{ ...hotSession, id: sessionId, observationCount: obsCount }],
    observations: {
      [sessionId]: Array.from({ length: obsCount }, (_, i) =>
        obsFor(sessionId, i),
      ),
    },
    memories: [],
    summaries: [],
  };
}

describe("import per-session observation ceiling", () => {
  it("names the offending session and its count when a session is over the ceiling", async () => {
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, mockKV() as never);

    const result = (await sdk.trigger("mem::import", {
      exportData: exportWith("ses_hot", 5001),
      strategy: "merge",
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("ses_hot");
    expect(result.error).toContain("5001");
  });

  it("accepts a session at exactly the ceiling", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);

    const result = (await sdk.trigger("mem::import", {
      exportData: exportWith("ses_at_cap", 5000),
      strategy: "merge",
    })) as { success: boolean; observations: number };

    expect(result.success).toBe(true);
    expect(result.observations).toBe(5000);
  });
});
