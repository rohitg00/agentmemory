import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";
import { registerExportImportFunction } from "../src/functions/export-import.js";
import { KV } from "../src/state/schema.js";
import { SAFE_PAYLOAD_BYTES } from "../src/state/frame-guard.js";
import type { Memory } from "../src/types.js";

const SECRET = "export-test-secret";

function mockKV(store = new Map<string, Map<string, unknown>>()) {
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
    update: async () => {},
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
    _store: store,
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload?: unknown }) =>
      fns.get(input.function_id)?.(input.payload),
    _fns: fns,
  };
}

function hugeMemory(): Memory {
  return {
    id: "m-huge",
    type: "pattern",
    title: "big",
    content: "z".repeat(SAFE_PAYLOAD_BYTES + 4096),
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 5,
    version: 1,
    isLatest: true,
  };
}

async function apiExport(
  sdk: ReturnType<typeof mockSdk>,
): Promise<{ status_code: number; body: Record<string, unknown> }> {
  const handler = sdk._fns.get("api::export")!;
  return handler({
    headers: { authorization: `Bearer ${SECRET}` },
    query_params: {},
  });
}

describe("api::export refusal status", () => {
  it("returns 200 with the export payload for a normal-sized export", async () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never, SECRET);

    const res = await apiExport(sdk);

    expect(res.status_code).toBe(200);
    expect(res.body.version).toBeDefined();
    expect(res.body.oversized).toBeUndefined();
  });

  it("returns 413 with the refusal body instead of 200 when mem::export refuses an oversized export", async () => {
    const kv = mockKV();
    await kv.set(KV.memories, "m-huge", hugeMemory());
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never, SECRET);

    const res = await apiExport(sdk);

    expect(res.status_code).toBe(413);
    expect(res.body.oversized).toBe(true);
    expect(res.body.success).toBe(false);
    expect(res.body.version).toBeUndefined();
  });
});
