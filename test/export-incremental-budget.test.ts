import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  registerExportImportFunction,
  ExportBudget,
} from "../src/functions/export-import.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import { SAFE_PAYLOAD_BYTES, payloadByteLength } from "../src/state/frame-guard.js";

const BEARER = "export-budget-bearer";
const MIB = 1024 * 1024;

function countingKV() {
  const store = new Map<string, Map<string, unknown>>();
  const listCalls: string[] = [];
  return {
    listCalls,
    seed(scope: string, key: string, value: unknown) {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
    },
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => data,
    delete: async (): Promise<void> => {},
    update: async () => {},
    list: async <T>(scope: string): Promise<T[]> => {
      listCalls.push(scope);
      return Array.from(store.get(scope)?.values() ?? []) as T[];
    },
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
    fns,
  };
}

function seedSessions(kv: ReturnType<typeof countingKV>, count: number, obsBytes: number) {
  for (let i = 0; i < count; i++) {
    const id = `ses_${i}`;
    kv.seed(KV.sessions, id, { id, project: "p", startedAt: "2026-09-01T00:00:00Z" });
    kv.seed(KV.observations(id), `obs_${i}`, {
      id: `obs_${i}`,
      sessionId: id,
      narrative: "n".repeat(obsBytes),
    });
  }
}

describe("mem::export stops assembling once the frame budget is exceeded", () => {
  it("never lists observations or the graph when memories alone exceed the limit", async () => {
    const kv = countingKV();
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, kv as never);
    seedSessions(kv, 3, 10);
    kv.seed(KV.memories, "m_big", { id: "m_big", content: "z".repeat(SAFE_PAYLOAD_BYTES + 1024) });
    kv.seed(KV.graphNodes, "n_1", { id: "n_1" });

    const result = (await sdk.trigger({ function_id: "mem::export", payload: {} })) as {
      success: boolean;
      oversized: boolean;
      stoppedAt: string;
    };

    expect(result.success).toBe(false);
    expect(result.oversized).toBe(true);
    expect(result.stoppedAt).toBe("memories");
    expect(kv.listCalls).toEqual([KV.sessions, KV.memories]);
  });

  it("stops listing session observations at the session that crosses the limit", async () => {
    const kv = countingKV();
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, kv as never);
    seedSessions(kv, 10, 6 * MIB);
    kv.seed(KV.graphNodes, "n_1", { id: "n_1" });

    const result = (await sdk.trigger({ function_id: "mem::export", payload: {} })) as {
      oversized: boolean;
      stoppedAt: string;
      bytes: number;
    };

    expect(result.oversized).toBe(true);
    expect(result.stoppedAt).toBe("observations");
    const obsLists = kv.listCalls.filter((s) => s.startsWith("mem:obs:"));
    expect(obsLists).toHaveLength(3);
    expect(kv.listCalls).not.toContain(KV.graphNodes);
    expect(result.bytes).toBeGreaterThan(SAFE_PAYLOAD_BYTES);
    expect(result.bytes).toBeLessThan(19 * MIB);
  });

  it("never lists later collections once the graph exceeds the limit", async () => {
    const kv = countingKV();
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, kv as never);
    for (let i = 0; i < 20; i++) {
      kv.seed(KV.graphNodes, `n_${i}`, { id: `n_${i}`, name: "g".repeat(MIB) });
    }

    const result = (await sdk.trigger({ function_id: "mem::export", payload: {} })) as {
      stoppedAt: string;
    };

    expect(result.stoppedAt).toBe("graphNodes");
    expect(kv.listCalls).not.toContain(KV.graphEdges);
    expect(kv.listCalls).not.toContain(KV.lessons);
  });

  it("still pages sessions with maxSessions so a narrowed export fits", async () => {
    const kv = countingKV();
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, kv as never);
    seedSessions(kv, 10, 6 * MIB);

    const result = (await sdk.trigger({
      function_id: "mem::export",
      payload: { maxSessions: 2, offset: 4 },
    })) as {
      sessions: Array<{ id: string }>;
      observations: Record<string, unknown[]>;
      pagination: { offset: number; limit: number; total: number; hasMore: boolean };
    };

    expect(result.sessions.map((s) => s.id)).toEqual(["ses_4", "ses_5"]);
    expect(Object.keys(result.observations)).toEqual(["ses_4", "ses_5"]);
    expect(result.pagination).toEqual({ offset: 4, limit: 2, total: 10, hasMore: true });
  });

  it("returns 413 through the REST endpoint without assembling the rest", async () => {
    const kv = countingKV();
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never, BEARER);
    seedSessions(kv, 10, 6 * MIB);

    const resp = (await sdk.fns.get("api::export")!({
      headers: { authorization: `Bearer ${BEARER}` },
      query_params: {},
    })) as { status_code: number; body: { oversized?: boolean } };

    expect(resp.status_code).toBe(413);
    expect(resp.body.oversized).toBe(true);
    expect(kv.listCalls.filter((s) => s.startsWith("mem:obs:"))).toHaveLength(3);
  });
});

describe("ExportBudget", () => {
  it("tracks a collection's serialized size to within its framing", () => {
    const items = [{ a: 1 }, { b: "two" }, { c: [3, 4] }];
    const budget = new ExportBudget();
    expect(budget.fits(items, "things")).toBe(true);
    const exact = payloadByteLength({ things: items });
    expect(budget.bytes).toBeGreaterThanOrEqual(exact - 2);
  });

  it("reports false as soon as the limit is crossed", () => {
    const budget = new ExportBudget(100);
    expect(budget.fits(["x".repeat(40)])).toBe(true);
    expect(budget.fits(["x".repeat(80)])).toBe(false);
  });
});
