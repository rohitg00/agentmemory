import { describe, expect, it, vi } from "vitest";
import { createConsolidationStatusReader } from "../src/triggers/api.js";
import { StateKV, type StateBackend } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";

type Call = { function_id: string; payload: { scope: string; key?: string } };
type Row = Record<string, unknown> | null;

function fixture(backend: StateBackend, options: { rejectSummaryKeys?: boolean; rejectSummaryValues?: boolean } = {}) {
  const data = new Map<string, Map<string, Row>>([
    [KV.summaries, new Map<string, Row>([["summary-a", { sessionId: "a", content: "a".repeat(32768) }], ["summary-b", { sessionId: "b", content: "b".repeat(32768) }], ["summary-null", null]])],
    [KV.semantic, new Map<string, Row>([["semantic-a", { id: "a" }], ["semantic-b", { id: "b" }], ["semantic-null", null]])],
    [KV.procedural, new Map<string, Row>([["procedure-a", { id: "a" }], ["procedure-null", null]])],
    [KV.relations, new Map<string, Row>([["relation-a", { id: "a" }], ["relation-b", { id: "b" }], ["relation-c", { id: "c" }], ["relation-null", null]])],
    [KV.memories, new Map<string, Row>([
      ["recurring-a", { id: "recurring-a", isLatest: true, type: "pattern", recurrence: 2 }],
      ["recurring-b", { id: "recurring-b", isLatest: true, type: "pattern", sessionIds: ["s1", "s2"] }],
      ["repeated-session", { id: "repeated-session", isLatest: true, type: "pattern", sessionIds: ["s1", "s1"] }],
      ["stale", { id: "stale", isLatest: false, type: "pattern", recurrence: 5 }],
      ["not-pattern", { id: "not-pattern", isLatest: true, type: "fact", recurrence: 5 }],
      ["not-latest", { id: "not-latest", type: "pattern", recurrence: 5 }],
      ["null", null],
    ])],
  ]);
  const calls: Call[] = [];
  const sdk = {
    trigger: vi.fn(async (call: Call) => {
      calls.push(structuredClone(call));
      const rows = data.get(call.payload.scope) ?? new Map<string, Row>();
      if (call.function_id === "state::list_keys") {
        if (call.payload.scope === KV.summaries && options.rejectSummaryKeys) throw new Error("state::list_keys unavailable");
        const keys = [...rows.keys()];
        return backend === "redis" ? { keys } : keys;
      }
      if (call.function_id === "state::list") {
        if (call.payload.scope === KV.summaries && options.rejectSummaryValues) throw new Error("summary values unavailable");
        return structuredClone([...rows.values()]);
      }
      if (call.function_id === "state::get") return structuredClone(rows.get(call.payload.key ?? "") ?? null);
      throw new Error(`Unexpected fixture invocation: ${call.function_id}`);
    }),
  };
  return { kv: new StateKV(sdk as never, { backend }), data, calls };
}

function expectCounts(status: Awaited<ReturnType<ReturnType<typeof createConsolidationStatusReader>>>, summaries: number) {
  expect(status.summaries).toBe(summaries);
  expect(status.recurringPatterns).toBe(2);
  expect(status.tiers.find((tier) => tier.id === "semantic")?.count).toBe(2);
  expect(status.tiers.find((tier) => tier.id === "procedural")?.count).toBe(1);
  expect(status.tiers.find((tier) => tier.id === "relations")?.count).toBe(3);
}

describe("consolidation summary counts", () => {
  it.each(["file", "redis"] as const)("counts summaries without transferring their record values on %s", async (backend) => {
    const { kv, calls } = fixture(backend);
    const status = await createConsolidationStatusReader(kv)({ lastRun: null });
    expectCounts(status, 3);
    expect(calls.filter((call) => call.payload.scope === KV.summaries && ["state::list", "state::get"].includes(call.function_id))).toEqual([]);
  });

  it.each(["file", "redis"] as const)("preserves nullable rows, real pattern filtering and count reuse on %s", async (backend) => {
    const { kv, data, calls } = fixture(backend);
    const read = createConsolidationStatusReader(kv);
    expectCounts(await read({ lastRun: null }), 3);
    const before = calls.length;
    data.get(KV.summaries)!.set("later", { sessionId: "later" });
    expectCounts(await read({ lastRun: null }), 3);
    expect(calls).toHaveLength(before);
    expect(calls.some((call) => call.payload.scope === KV.memories && call.function_id === "state::get")).toBe(true);
  });

  it.each(["file", "redis"] as const)("keeps the working value-list fallback when summary key listing rejects on %s", async (backend) => {
    const { kv, calls } = fixture(backend, { rejectSummaryKeys: true });
    expectCounts(await createConsolidationStatusReader(kv)({ lastRun: null }), 3);
    expect(calls.filter((call) => call.payload.scope === KV.summaries && call.function_id === "state::list")).toHaveLength(1);
  });

  it("supports list-only adapters without a key-list method", async () => {
    const { data } = fixture("file");
    const kv = {
      list: async (scope: string) => [...(data.get(scope)?.values() ?? [])].filter((row) => row !== null),
    };
    expectCounts(await createConsolidationStatusReader(kv as never)({ lastRun: null }), 2);
  });

  it("retains the empty best-effort summary count when both read paths fail", async () => {
    const { kv } = fixture("file", { rejectSummaryKeys: true, rejectSummaryValues: true });
    expectCounts(await createConsolidationStatusReader(kv)({ lastRun: null }), 0);
  });
});
