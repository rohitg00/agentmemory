import { describe, it, expect, vi } from "vitest";

const { warn, rebuilt } = vi.hoisted(() => ({ warn: vi.fn(), rebuilt: [] as unknown[] }));
vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn, error: vi.fn() },
}));

vi.mock("../src/functions/search.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/functions/search.js")>();
  return { ...actual, rebuildKeywordIndex: vi.fn(async (kv: unknown) => { rebuilt.push(kv); return {}; }) };
});

import { registerExportImportFunction } from "../src/functions/export-import.js";
import type { ExportData } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async (scope: string, key: string) => store.get(scope)?.get(key) ?? null,
    set: async (scope: string, key: string, data: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string) => { store.get(scope)?.delete(key); },
    list: async (scope: string) => Array.from(store.get(scope)?.values() ?? []),
  };
}

describe("replace import keyword rebuild", () => {
  it("rebuilds the keyword index from the imported store after a replace import", async () => {
    const functions = new Map<string, (payload: unknown) => Promise<unknown>>();
    const sdk = {
      registerFunction: (id: string | { id: string }, handler: (payload: unknown) => Promise<unknown>) => {
        functions.set(typeof id === "string" ? id : id.id, handler);
      },
      registerTrigger: () => {},
      trigger: async (input: { function_id: string; payload: unknown }) => functions.get(input.function_id)?.(input.payload),
    };
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [{ id: "ses_new", project: "p", cwd: "/tmp/p", startedAt: "2026-03-01T00:00:00Z", status: "active", observationCount: 0 }],
      observations: {},
      memories: [],
      summaries: [],
    };
    const result = (await functions.get("mem::import")!({ exportData, strategy: "replace" })) as { success: boolean };
    expect(result.success).toBe(true);
    await vi.waitFor(() => expect(rebuilt).toHaveLength(1));
    expect(rebuilt[0]).toBe(kv);
    expect(warn).not.toHaveBeenCalledWith("Post-replace index rebuild failed", expect.anything());
  });
});
