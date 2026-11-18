import { describe, expect, it } from "vitest";
import { registerReflectFunctions } from "../src/functions/reflect.js";
import { StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";

type Row = { id: string; confidence: number; createdAt: string; project?: string; deleted?: boolean };

const row = (id: string, confidence: number, minute: number, extra: Partial<Row> = {}): Row => ({
  id,
  confidence,
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, minute)).toISOString(),
  project: "a",
  ...extra,
});

function insightList(rows: Row[], backend: "file" | "redis") {
  const sdk = {
    registerFunction: () => {},
    trigger: async ({ function_id, payload }: { function_id: string; payload: { scope: string; key?: string } }) => {
      expect(payload.scope).toBe(KV.insights);
      if (function_id === "state::list_keys") return rows.map((_, index) => String(index));
      if (function_id === "state::list") return structuredClone(rows);
      return structuredClone(rows[Number(payload.key)]);
    },
  };
  const kv = new StateKV(sdk as never, { backend });
  const iterate = kv.iterate.bind(kv);
  kv.iterate = (scope) => iterate(scope, { pageSize: 2 });
  let handler: (data: unknown) => Promise<{ success: boolean; insights: Row[] }>;
  const register = { registerFunction: (id: string, fn: typeof handler) => { if (id === "mem::insight-list") handler = fn; } };
  registerReflectFunctions(register as never, kv, {} as never);
  return (data: unknown) => handler(data).then((result) => result.insights.map((insight) => insight.id));
}

const ties = [row("late", 0.5, 9), row("early", 0.5, 1), row("top", 0.9, 5), row("mid", 0.5, 3)];

describe("mem::insight-list paging", () => {
  it("breaks confidence ties across pages by insertion order on redis", async () => {
    expect(await insightList(ties, "redis")({ limit: 3 })).toEqual(["top", "early", "mid"]);
  });

  it("breaks confidence ties by read order on the file backend", async () => {
    expect(await insightList(ties, "file")({ limit: 3 })).toEqual(["top", "late", "early"]);
  });

  it("keeps the top results in scope across pages", async () => {
    const rows = [
      row("low", 0.1, 1),
      row("edge", 0.4, 2),
      row("gone", 0.99, 3, { deleted: true }),
      row("other", 0.95, 4, { project: "b" }),
      row("high", 0.8, 5),
      row("higher", 0.85, 6),
    ];
    const list = insightList(rows, "file");
    expect(await list({ limit: 2, project: "a", minConfidence: 0.4 })).toEqual(["higher", "high"]);
    expect(await list({ limit: 10, project: "a", minConfidence: 0.4 })).toEqual(["higher", "high", "edge"]);
  });

  it("returns an empty list when nothing matches", async () => {
    expect(await insightList([], "redis")({ limit: 5 })).toEqual([]);
    expect(await insightList(ties, "file")({ limit: 5, project: "missing" })).toEqual([]);
  });
});
