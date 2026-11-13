import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registerReflectFunctions } from "../src/functions/reflect.js";
import { StateKV } from "../src/state/kv.js";
import { KV } from "../src/state/schema.js";

type Backend = "file" | "redis";
type Row = Record<string, unknown>;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/insight-list.json", import.meta.url), "utf8")) as {
  records: Record<string, Row>;
  pages: string[][];
  cases: { name: string; request: Row; expected: Record<Backend, string[]> }[];
  invalid: { request: Row; expected: Row }[];
};
const rows = fixture.pages.flat().map((alias) => fixture.records[alias]!);

function register(kv: unknown) {
  const functions = new Map<string, (data: unknown) => Promise<unknown>>();
  const sdk = {
    registerFunction: (id: string | { id: string }, handler: (data: unknown) => Promise<unknown>) => {
      functions.set(typeof id === "string" ? id : id.id, handler);
    },
  };
  registerReflectFunctions(sdk as never, kv as never, {} as never);
  return (data: unknown) => functions.get("mem::insight-list")!(data);
}

function paged(backend: Backend) {
  let pagesRead = 0;
  const kv = {
    backend,
    async *iterate(scope: string) {
      expect(scope).toBe(KV.insights);
      for (const page of fixture.pages) {
        pagesRead++;
        yield page.map((alias) => structuredClone(fixture.records[alias]!));
      }
    },
  };
  return { call: register(kv), pagesRead: () => pagesRead };
}

describe.each(["file", "redis"] as const)("complete historical insight list (%s)", (backend) => {
  it.each(fixture.cases)("preserves exact records and order: $name", async ({ request, expected }) => {
    const f = paged(backend);
    expect(await f.call(request)).toEqual({
      success: true,
      insights: expected[backend].map((alias) => fixture.records[alias]),
    });
    expect(f.pagesRead()).toBe(fixture.pages.length);
  });

  it.each(fixture.invalid)("validates before reading: $request", async ({ request, expected }) => {
    const f = paged(backend);
    expect(await f.call(request)).toEqual(expected);
    expect(f.pagesRead()).toBe(0);
  });

  it("preserves complete order through real StateKV page reads", async () => {
    const sdk = {
      trigger: async ({ function_id, payload }: { function_id: string; payload: { scope: string; key?: string } }) => {
        expect(payload.scope).toBe(KV.insights);
        if (function_id === "state::list_keys") return rows.map((_, index) => String(index));
        expect(function_id).toBe("state::get");
        return structuredClone(rows[Number(payload.key)]);
      },
    };
    const kv = new StateKV(sdk as never, { backend });
    const iterate = kv.iterate.bind(kv);
    kv.iterate = (scope) => iterate(scope, { pageSize: 4 });
    const expected = fixture.cases.find((item) => item.name === "small5_projectA_confidence_ties")!;
    expect(await register(kv)(expected.request)).toEqual({
      success: true,
      insights: expected.expected[backend].map((alias) => fixture.records[alias]),
    });
  });

  it("retains the list-only fallback's original tie order", async () => {
    const kv = { backend, list: async () => structuredClone(rows) };
    const expected = fixture.cases.find((item) => item.name === "small3_projectA_filters_before_selection")!;
    expect(await register(kv)(expected.request)).toEqual({
      success: true,
      insights: expected.expected.file.map((alias) => fixture.records[alias]),
    });
  });

  it("propagates a later page error instead of returning a partial top result", async () => {
    const error = new Error("later insight page unavailable");
    const kv = { backend, async *iterate() { yield rows.slice(0, 3); throw error; } };
    await expect(register(kv)({ limit: 1 })).rejects.toBe(error);
  });

  it("keeps a small query below a retained-heap budget for large historical records", () => {
    const result = spawnSync(process.execPath, [
      "--max-old-space-size=384", "--expose-gc", "--import", "tsx",
      fileURLToPath(new URL("./fixtures/insight-list-memory.ts", import.meta.url)), backend,
    ], { encoding: "utf8", timeout: 60_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const metrics = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
    expect(metrics).toMatchObject({ backend, records: 4096, reads: 4096, modelRequests: 0 });
    expect(metrics.heapGrowthBytes).toBeLessThan(24 * 1024 * 1024);
  }, 65_000);
});
