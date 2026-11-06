import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerDiagnosticsFunction } from "../src/functions/diagnostics.js";
import { recordAudit } from "../src/functions/audit.js";
import { KV } from "../src/state/schema.js";
import type { StateKV } from "../src/state/kv.js";
import type { IIIClient } from "iii-sdk";
import type { DiagnosticCheck, Facet } from "../src/types.js";

vi.mock("../src/functions/audit.js", () => ({ recordAudit: vi.fn() }));

function fixture() {
  const store = new Map<string, Map<string, unknown>>();
  const kv = {
    get: vi.fn(async (scope: string, key: string): Promise<unknown> => structuredClone(store.get(scope)?.get(key) ?? null)),
    list: vi.fn(async (scope: string): Promise<unknown[]> => structuredClone([...store.get(scope)?.values() ?? []])),
    delete: vi.fn(async (scope: string, key: string) => { store.get(scope)?.delete(key); }),
  };
  const put = (scope: string, key: string, value: unknown) => {
    if (!store.has(scope)) store.set(scope, new Map());
    store.get(scope)!.set(key, structuredClone(value));
  };
  const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
  registerDiagnosticsFunction({
    registerFunction: (id: string, handler: (data: unknown) => Promise<unknown>) => handlers.set(id, handler),
  } as unknown as IIIClient, kv as unknown as StateKV);
  const diagnose = (categories = ["facets"]) => handlers.get("mem::diagnose")!({ categories }) as Promise<{ checks: DiagnosticCheck[] }>;
  const heal = (dryRun = false, categories?: string[]) => handlers.get("mem::heal")!({ dryRun, categories: categories ?? ["facets"] }) as Promise<{ success: boolean; fixed: number; skipped: number; details: string[] }>;
  const tag = (id: string, targetId: string, targetType: Facet["targetType"] = "memory") => {
    const facet: Facet = { id, targetId, targetType, dimension: "tool", value: id, createdAt: "2026-11-01T00:00:00Z" };
    put(KV.facets, id, facet);
    return facet;
  };
  return { store, kv, put, tag, diagnose, heal };
}

describe("historical memory facet diagnostics and healing", () => {
  beforeEach(() => vi.mocked(recordAudit).mockReset());

  it("finds each orphan, including semantic targets, and checks a shared target only once", async () => {
    const f = fixture();
    f.tag("fct_a", "mem_missing"); f.tag("fct_b", "mem_missing"); f.tag("fct_c", "sem_missing");
    f.tag("fct_live", "mem_live"); f.put(KV.memories, "mem_live", { id: "mem_live" });
    const result = await f.diagnose();
    expect(result.checks.filter(c => c.fixable)).toHaveLength(3);
    expect(result.checks.filter(c => c.fixable).every(c => c.category === "facets" && c.status === "warn")).toBe(true);
    expect(f.kv.list.mock.calls).toEqual([[KV.facets]]);
    expect(f.kv.get.mock.calls.filter(([scope, id]) => scope === KV.memories && id === "mem_missing")).toHaveLength(1);
    expect(f.kv.get.mock.calls.filter(([scope, id]) => scope === KV.semantic && id === "mem_missing")).toHaveLength(1);
    expect(f.kv.delete).not.toHaveBeenCalled();
  });

  it("dry-run reports facet counts without deletion or audit writes", async () => {
    const f = fixture(); f.tag("fct_a", "mem_missing"); f.tag("fct_b", "mem_missing");
    expect(await f.heal(true)).toMatchObject({ success: true, fixed: 2, skipped: 0 });
    expect(f.kv.delete).not.toHaveBeenCalled(); expect(recordAudit).not.toHaveBeenCalled();
    expect(f.store.get(KV.facets)?.size).toBe(2);
  });

  it("heals multiple facets, audits each deletion, and is idempotent", async () => {
    const f = fixture(); f.tag("fct_a", "mem_missing"); f.tag("fct_b", "sem_missing");
    expect(await f.heal()).toMatchObject({ success: true, fixed: 2, skipped: 0 });
    expect(f.store.get(KV.facets)?.size).toBe(0);
    expect(recordAudit).toHaveBeenCalledTimes(2);
    expect(recordAudit).toHaveBeenCalledWith(expect.anything(), "heal", "mem::heal", ["fct_a"], expect.objectContaining({ entityType: "facet", targetId: "mem_missing", reason: "orphaned-memory-facet" }));
    expect(await f.heal()).toMatchObject({ success: true, fixed: 0, skipped: 0 });
    expect(recordAudit).toHaveBeenCalledTimes(2);
  });

  it("preserves a target present in either memory scope, regardless of its prefix", async () => {
    const f = fixture();
    for (const [id, scope] of [["mem_live", KV.memories], ["sem_live", KV.semantic], ["mem_semantic", KV.semantic], ["sem_memory", KV.memories]]) {
      f.tag(`fct_${id}`, id); f.put(scope, id, { id });
    }
    expect(await f.heal()).toMatchObject({ success: true, fixed: 0, skipped: 0 });
    expect(f.kv.delete).not.toHaveBeenCalled();
    expect((await f.diagnose()).checks).toEqual([expect.objectContaining({ category: "facets", status: "pass", fixable: false })]);
  });

  it("reports and preserves unsupported target types and IDs", async () => {
    const f = fixture();
    for (const id of ["lsn_old", "lesson_old", "obs_old", "act_old", "core_old", "custom-id"]) f.tag(`fct_${id}`, id);
    f.tag("fct_action", "mem_missing", "action"); f.tag("fct_observation", "sem_missing", "observation");
    const diagnosis = await f.diagnose();
    expect(diagnosis.checks).toHaveLength(8);
    expect(diagnosis.checks.every(c => c.status === "warn" && !c.fixable)).toBe(true);
    expect(await f.heal()).toMatchObject({ success: true, fixed: 0, skipped: 8 });
    expect(f.kv.get).not.toHaveBeenCalled(); expect(f.kv.delete).not.toHaveBeenCalled();
  });

  it.each([KV.memories, KV.semantic])("does not turn a failed %s lookup into an orphan", async scope => {
    const f = fixture(); f.tag("fct_a", "mem_missing");
    const get = f.kv.get.getMockImplementation()!;
    f.kv.get.mockImplementation(async (s, id) => { if (s === scope) throw new Error("state unavailable"); return get(s, id); });
    expect((await f.diagnose()).checks).toEqual([expect.objectContaining({ fixable: false, status: "warn", message: expect.stringContaining("state unavailable") })]);
    expect(await f.heal()).toMatchObject({ success: false, fixed: 0, skipped: 1 });
    expect(f.kv.delete).not.toHaveBeenCalled(); expect(recordAudit).not.toHaveBeenCalled();
  });

  it("keeps a target restored after the scan", async () => {
    const f = fixture(); f.tag("fct_a", "mem_restored");
    const get = f.kv.get.getMockImplementation()!; let reads = 0;
    f.kv.get.mockImplementation(async (scope, id) => {
      if (scope === KV.memories && ++reads === 2) f.put(KV.semantic, id, { id });
      return get(scope, id);
    });
    expect(await f.heal()).toMatchObject({ fixed: 0, skipped: 1 });
    expect(f.kv.delete).not.toHaveBeenCalled();
  });

  it.each(["targetId", "dimension", "value", "createdAt", "targetType"] as const)("keeps a facet whose %s changes after the scan", async field => {
    const f = fixture(); const facet = f.tag("fct_a", "mem_missing");
    const get = f.kv.get.getMockImplementation()!;
    f.kv.get.mockImplementation(async (scope, id) => {
      if (scope === KV.facets) f.put(scope, id, { ...facet, [field]: field === "targetType" ? "action" : "replacement" });
      return get(scope, id);
    });
    expect(await f.heal()).toMatchObject({ fixed: 0, skipped: 1 });
    expect(f.kv.delete).not.toHaveBeenCalled(); expect(recordAudit).not.toHaveBeenCalled();
  });

  it("does not count a facet already deleted after the scan", async () => {
    const f = fixture(); f.tag("fct_a", "mem_missing");
    const get = f.kv.get.getMockImplementation()!;
    f.kv.get.mockImplementation(async (scope, id) => scope === KV.facets ? null : get(scope, id));
    expect(await f.heal()).toMatchObject({ fixed: 0, skipped: 1 });
    expect(f.kv.delete).not.toHaveBeenCalled();
  });

  it("reports a failed delete without counting it as fixed and continues independent repairs", async () => {
    const f = fixture(); f.tag("fct_bad", "mem_bad"); f.tag("fct_good", "mem_good");
    const remove = f.kv.delete.getMockImplementation()!;
    f.kv.delete.mockImplementation(async (scope, id) => { if (id === "fct_bad") throw new Error("delete refused"); await remove(scope, id); });
    const result = await f.heal();
    expect(result).toMatchObject({ success: false, fixed: 1, skipped: 1 });
    expect(result.details.join(" ")).toContain("delete refused");
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(f.store.get(KV.facets)?.has("fct_bad")).toBe(true);
  });

  it.each([KV.memories, KV.semantic, KV.facets])("reports a failed %s recheck without deleting", async failedScope => {
    const f = fixture(); f.tag("fct_a", "mem_missing");
    const get = f.kv.get.getMockImplementation()!; let reads = 0;
    f.kv.get.mockImplementation(async (scope, id) => {
      if (scope === failedScope && ++reads === (scope === KV.facets ? 1 : 2)) throw new Error("recheck failed");
      return get(scope, id);
    });
    expect(await f.heal()).toMatchObject({ success: false, fixed: 0, skipped: 1 });
    expect(f.kv.delete).not.toHaveBeenCalled();
  });

  it("keeps scan and audit failures visible", async () => {
    const f = fixture(); f.kv.list.mockRejectedValueOnce(new Error("list failed"));
    await expect(f.heal()).rejects.toThrow("list failed");
    f.tag("fct_a", "mem_missing"); vi.mocked(recordAudit).mockRejectedValueOnce(new Error("audit failed"));
    await expect(f.heal()).rejects.toThrow("audit failed");
  });

  it("serializes concurrent heals so a facet is counted and audited only once", async () => {
    const f = fixture(); f.tag("fct_a", "mem_missing");
    const results = await Promise.all([f.heal(), f.heal()]);
    expect(results.reduce((n, r) => n + r.fixed, 0)).toBe(1);
    expect(f.kv.delete).toHaveBeenCalledTimes(1); expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("includes facets by default and respects an explicit different category", async () => {
    const f = fixture(); f.tag("fct_a", "mem_missing");
    expect((await f.diagnose([])).checks.some(c => c.category === "facets" && c.fixable)).toBe(true);
    expect(await f.heal(false, ["lessons"])).toMatchObject({ fixed: 0 });
    expect(f.kv.delete).not.toHaveBeenCalled();
    expect(await f.heal(false, [])).toMatchObject({ fixed: 1 });
  });
});
