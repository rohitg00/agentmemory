import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerGovernanceFunction } from "../src/functions/governance.js";
import type { Memory, AuditEntry } from "../src/types.js";

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
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function makeMemory(id: string, type: Memory["type"] = "pattern"): Memory {
  return {
    id,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    type,
    title: `Memory ${id}`,
    content: `Content for ${id}`,
    concepts: ["test"],
    files: [],
    sessionIds: ["ses_1"],
    strength: 5,
    version: 1,
    isLatest: true,
  };
}

describe("Governance Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerGovernanceFunction(sdk as never, kv as never);

    await kv.set("mem:memories", "mem_1", makeMemory("mem_1", "pattern"));
    await kv.set("mem:memories", "mem_2", makeMemory("mem_2", "bug"));
    await kv.set("mem:memories", "mem_3", makeMemory("mem_3", "pattern"));
  });

  it("governance-delete soft-deletes specified memories", async () => {
    const result = (await sdk.trigger("mem::governance-delete", {
      memoryIds: ["mem_1"],
      reason: "outdated",
    })) as { success: boolean; deleted: number; total: number };

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);
    expect(result.total).toBe(1);

    const remaining = await kv.list("mem:memories");
    expect(remaining.length).toBe(3);
    const deleted = remaining.find((m: any) => m.id === "mem_1");
    expect(deleted).toBeDefined();
    expect((deleted as any).deleted).toBe(true);
    const surviving = remaining.filter((m: any) => m.id !== "mem_1");
    expect(surviving.length).toBe(2);
  });

  it("governance-delete handles non-existent IDs gracefully", async () => {
    const result = (await sdk.trigger("mem::governance-delete", {
      memoryIds: ["nonexistent_1", "nonexistent_2"],
    })) as { success: boolean; deleted: number; total: number };

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(0);
    expect(result.total).toBe(2);

    const remaining = await kv.list("mem:memories");
    expect(remaining.length).toBe(3);
  });

it("governance-bulk soft-deletes by type filter", async () => {
    const result = (await sdk.trigger("mem::governance-bulk", {
      type: ["pattern"],
    })) as { success: boolean; deleted: number; failed: number };

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(2);
    expect(result.failed).toBe(0);

    const remaining = await kv.list<Memory>("mem:memories");
    expect(remaining.length).toBe(3);
    const activeMemories = remaining.filter((m: Memory) => !m.deleted);
    expect(activeMemories.length).toBe(1);
    expect(activeMemories[0].type).toBe("bug");
    const deletedMemories = remaining.filter((m: Memory) => m.deleted);
    expect(deletedMemories.length).toBe(2);
    for (const m of deletedMemories) {
      expect(m.type).toBe("pattern");
    }
  });

  it("governance-bulk respects dryRun", async () => {
    const result = (await sdk.trigger("mem::governance-bulk", {
      type: ["pattern"],
      dryRun: true,
    })) as { success: boolean; dryRun: boolean; wouldDelete: number; ids: string[] };

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.wouldDelete).toBe(2);
    expect(result.ids).toContain("mem_1");
    expect(result.ids).toContain("mem_3");

    const remaining = await kv.list("mem:memories");
    expect(remaining.length).toBe(3);
  });

  it("audit-query returns audit entries", async () => {
    await sdk.trigger("mem::governance-delete", {
      memoryIds: ["mem_1"],
      reason: "cleanup",
    });

    const entries = (await sdk.trigger("mem::audit-query", {})) as AuditEntry[];

    expect(entries.length).toBe(1);
    expect(entries[0].operation).toBe("delete");
    expect(entries[0].functionId).toBe("mem::governance-delete");
  });

  it("governance-delete is idempotent", async () => {
    const r1 = (await sdk.trigger("mem::governance-delete", {
      memoryIds: ["mem_1"],
      reason: "first",
    })) as { success: boolean; deleted: number; total: number };

    expect(r1.success).toBe(true);
    expect(r1.deleted).toBe(1);

    const r2 = (await sdk.trigger("mem::governance-delete", {
      memoryIds: ["mem_1"],
      reason: "second",
    })) as { success: boolean; deleted: number; total: number };

    expect(r2.success).toBe(true);
    expect(r2.deleted).toBe(0);
    expect(r2.total).toBe(1);

    const remaining = await kv.list<Memory>("mem:memories");
    expect(remaining.length).toBe(3);
    const mem1 = remaining.find((m: Memory) => m.id === "mem_1");
    expect(mem1?.deleted).toBe(true);
  });

  it("governance-bulk creates audit entry", async () => {
    const entriesBefore = (await sdk.trigger("mem::audit-query", {})) as AuditEntry[];

    await sdk.trigger("mem::governance-bulk", { type: ["bug"] });

    const entriesAfter = (await sdk.trigger("mem::audit-query", {})) as AuditEntry[];
    const bulkEntries = entriesAfter.filter((e: AuditEntry) => e.functionId === "mem::governance-bulk");
    expect(bulkEntries.length).toBe(1);
    expect(bulkEntries[0].operation).toBe("delete");
    expect(bulkEntries[0].targetIds).toContain("mem_2");
  });

  it("soft-delete excludes from active memory listing", async () => {
    await sdk.trigger("mem::governance-delete", { memoryIds: ["mem_1", "mem_3"] });

    const active = (await kv.list<Memory>("mem:memories")).filter((m: Memory) => !m.deleted);
    expect(active.length).toBe(1);
    expect(active[0].type).toBe("bug");
  });
});
