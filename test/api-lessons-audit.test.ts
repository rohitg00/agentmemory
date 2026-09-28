import { describe, it, expect, vi } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";

type Handler = (req: unknown) => Promise<{ status_code: number; body: Record<string, unknown> }>;

function setup() {
  const kv = {
    get: vi.fn(async () => null),
    set: vi.fn(async (_scope: string, _key: string, value: unknown) => value),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => []),
  };
  const handlers = new Map<string, Handler>();
  const trigger = vi.fn(async (input: { function_id: string; payload: unknown }) => {
    if (input.function_id === "mem::lesson-save") return { success: true, action: "created", lesson: input.payload };
    return [];
  });
  const sdk = {
    registerFunction: (id: string, fn: Handler) => handlers.set(id, fn),
    registerTrigger: () => {},
    trigger,
    on: () => {},
  };
  registerApiTriggers(sdk as never, kv as never);
  const call = (id: string, req: { body?: unknown; query_params?: Record<string, string> }) =>
    handlers.get(id)!({ headers: {}, query_params: {}, body: {}, ...req });
  return { call, trigger };
}

describe("POST /agentmemory/lessons sourceIds", () => {
  it("stores validated sourceIds so a lesson can link to sessions and memories", async () => {
    const { call, trigger } = setup();
    const res = await call("api::lesson-save", {
      body: { content: "Snapshot RDS before upgrades", sourceIds: [" ses_infra_1 ", "mem_abc", "ses_infra_1"] },
    });
    expect(res.status_code).toBe(201);
    const payload = trigger.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.sourceIds).toEqual(["ses_infra_1", "mem_abc"]);
    expect(payload.source).toBe("manual");
  });

  it("defaults to no sources and rejects malformed sourceIds", async () => {
    const { call, trigger } = setup();
    expect((await call("api::lesson-save", { body: { content: "No sources" } })).status_code).toBe(201);
    expect((trigger.mock.calls[0][0].payload as Record<string, unknown>).sourceIds).toEqual([]);

    for (const sourceIds of ["ses_1", [42], ["has space"], Array.from({ length: 51 }, (_, i) => `ses_${i}`)]) {
      const res = await call("api::lesson-save", { body: { content: "Bad", sourceIds } });
      expect(res.status_code).toBe(400);
    }
    expect(trigger).toHaveBeenCalledTimes(1);
  });
});

describe("GET /agentmemory/audit filters", () => {
  it("passes operation, date range and target text to the audit query", async () => {
    const { call, trigger } = setup();
    const res = await call("api::audit", {
      query_params: { operation: "forget", dateFrom: "2026-09-01", dateTo: "2026-09-30T23:59:59Z", q: "mem_", limit: "200" },
    });
    expect(res.status_code).toBe(200);
    expect(trigger.mock.calls[0][0]).toEqual({
      function_id: "mem::audit-query",
      payload: { operation: "forget", dateFrom: "2026-09-01", dateTo: "2026-09-30T23:59:59Z", query: "mem_", limit: 200 },
    });
  });

  it("rejects an invalid date", async () => {
    const { call, trigger } = setup();
    expect((await call("api::audit", { query_params: { dateFrom: "not-a-date" } })).status_code).toBe(400);
    expect(trigger).not.toHaveBeenCalled();
  });
});
