import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import { StateKV } from "../src/state/kv.js";
import { SAFE_PAYLOAD_BYTES } from "../src/state/frame-guard.js";

const AUTH = ["unbounded", "list", "test"].join("-");

type StatePayload = { scope: string; key?: string; value?: unknown };
type Response = { status_code: number; body: Record<string, unknown> };
type Handler = (input: unknown) => unknown;

function rig() {
  const store = new Map<string, Map<string, unknown>>();
  const fns = new Map<string, Handler>();
  const sdk = {
    registerFunction: (id: string | { id: string }, h: Handler) => fns.set(typeof id === "string" ? id : id.id, h),
    registerTrigger: () => {},
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: StatePayload }): Promise<unknown> => {
      if (!id.startsWith("state::")) return fns.get(id)?.(payload);
      const rows = store.get(payload.scope) ?? new Map<string, unknown>();
      store.set(payload.scope, rows);
      if (id === "state::get") return rows.get(payload.key!) ?? null;
      if (id === "state::set") { rows.set(payload.key!, payload.value); return payload.value; }
      if (id === "state::list_keys") return { keys: [...rows.keys()] };
      if (id === "state::list") return [...rows.values()];
      throw new Error(`unexpected state call ${id}`);
    },
  };
  const kv = new StateKV(sdk as never);
  registerApiTriggers(sdk as never, kv, AUTH);
  const get = (fn: string, query: Record<string, string> = {}) =>
    fns.get(fn)!({ headers: { authorization: `Bearer ${AUTH}` }, query_params: query }) as Promise<Response>;
  return { kv, get };
}

const ROWS = 4;
const rowSize = () => Math.ceil(SAFE_PAYLOAD_BYTES / (ROWS - 1));

function memory(id: string, content: string, day: number) {
  const at = `2026-11-0${day}T00:00:00.000Z`;
  return {
    id, type: "fact", title: id, content, concepts: [], files: [], sessionIds: [],
    strength: 1, version: 1, isLatest: true, createdAt: at, updatedAt: at,
  };
}

async function seedMemories(r: ReturnType<typeof rig>) {
  for (let i = 0; i < ROWS; i++) {
    await r.kv.set(KV.memories, `mem_${i}`, memory(`mem_${i}`, "c".repeat(rowSize()), i + 1));
  }
}

describe("unbounded list endpoints over the transport budget", () => {
  it("GET /memories without limit returns 413 with a paging hint instead of an oversized frame", async () => {
    const r = rig();
    await seedMemories(r);
    const res = await r.get("api::memories");
    expect(res.status_code).toBe(413);
    expect(res.body.oversized).toBe(true);
    expect(String(res.body.error)).toMatch(/\?limit and \?cursor/);
  });

  it("GET /memories with limit still pages the same oversized scope", async () => {
    const r = rig();
    await seedMemories(r);
    const res = await r.get("api::memories", { limit: "1" });
    expect(res.status_code).toBe(200);
    expect((res.body.memories as unknown[]).length).toBe(1);
    expect(res.body.total).toBe(ROWS);
    expect(typeof res.body.nextCursor).toBe("string");
  });

  it("GET /memories without limit still returns every memory when the scope fits", async () => {
    const r = rig();
    await r.kv.set(KV.memories, "mem_small", memory("mem_small", "c", 1));
    const res = await r.get("api::memories");
    expect(res.status_code).toBe(200);
    expect((res.body.memories as unknown[]).length).toBe(1);
  });

  it("GET /relations returns 413 instead of an oversized frame", async () => {
    const r = rig();
    for (let i = 0; i < ROWS; i++) {
      await r.kv.set(KV.relations, `rel_${i}`, {
        sourceId: `a${i}`, targetId: `b${i}`, type: "related", createdAt: "", note: "n".repeat(rowSize()),
      });
    }
    const res = await r.get("api::relations-list");
    expect(res.status_code).toBe(413);
    expect(res.body.oversized).toBe(true);
  });
});
