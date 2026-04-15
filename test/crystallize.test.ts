import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerCrystallizeFunction } from "../src/functions/crystallize.js";
import type { Action, Crystal, MemoryProvider } from "../src/types.js";

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

function mockProvider(): MemoryProvider {
  return {
    name: "test",
    compress: vi.fn(),
    summarize: vi.fn().mockResolvedValue(
      '{"narrative":"test","keyOutcomes":["done"],"filesAffected":["a.ts"],"lessons":["learned"]}',
    ),
  };
}

function makeAction(overrides: Partial<Action> & { id: string }): Action {
  return {
    title: "Test action",
    description: "A test action",
    status: "done",
    priority: 5,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "agent-1",
    tags: [],
    sourceObservationIds: [],
    sourceMemoryIds: [],
    ...overrides,
  };
}

describe("Crystallize Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let provider: MemoryProvider;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    provider = mockProvider();
    registerCrystallizeFunction(sdk as never, kv as never, provider);
  });

  describe("mem::crystallize", () => {
    it("crystallizes completed actions with valid JSON response", async () => {
      const action = makeAction({ id: "act_1", title: "Fix bug", status: "done" });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: ["act_1"],
        project: "webapp",
        sessionId: "sess_1",
      })) as { success: boolean; crystal: Crystal };

      expect(result.success).toBe(true);
      expect(result.crystal.id).toMatch(/^crys_/);
      expect(result.crystal.narrative).toBe("test");
      expect(result.crystal.keyOutcomes).toEqual(["done"]);
      expect(result.crystal.filesAffected).toEqual(["a.ts"]);
      expect(result.crystal.lessons).toEqual(["learned"]);
      expect(result.crystal.sourceActionIds).toEqual(["act_1"]);
      expect(result.crystal.project).toBe("webapp");
      expect(result.crystal.sessionId).toBe("sess_1");
      expect(result.crystal.createdAt).toBeDefined();
    });

    it("marks source actions with crystallizedInto", async () => {
      const action = makeAction({ id: "act_mark", status: "done" });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: ["act_mark"],
      })) as { success: boolean; crystal: Crystal };

      expect(result.success).toBe(true);

      const updated = await kv.get<Action>("mem:actions", "act_mark");
      expect(updated!.crystallizedInto).toBe(result.crystal.id);
    });

    it("falls back to raw text when provider returns non-JSON", async () => {
      (provider.summarize as ReturnType<typeof vi.fn>).mockResolvedValue(
        "Just a plain text summary with no JSON.",
      );

      const action = makeAction({ id: "act_nojson", status: "done" });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: ["act_nojson"],
      })) as { success: boolean; crystal: Crystal };

      expect(result.success).toBe(true);
      expect(result.crystal.narrative).toBe(
        "Just a plain text summary with no JSON.",
      );
      expect(result.crystal.keyOutcomes).toEqual([]);
      expect(result.crystal.filesAffected).toEqual([]);
      expect(result.crystal.lessons).toEqual([]);
    });

    it("returns error for non-existent action", async () => {
      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: ["act_ghost"],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("action not found: act_ghost");
    });

    it("returns error for non-done action", async () => {
      const action = makeAction({ id: "act_pending", status: "pending" });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: ["act_pending"],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('status "pending"');
    });

    it("returns error for empty actionIds", async () => {
      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: [],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("actionIds is required");
    });

    it("returns error when actionIds is missing", async () => {
      const result = (await sdk.trigger("mem::crystallize", {})) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("actionIds is required");
    });

    it("accepts cancelled actions", async () => {
      const action = makeAction({ id: "act_cancel", status: "cancelled" });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: ["act_cancel"],
      })) as { success: boolean; crystal: Crystal };

      expect(result.success).toBe(true);
      expect(result.crystal.sourceActionIds).toEqual(["act_cancel"]);
    });

    it("crystallizes multiple actions in one call", async () => {
      const a1 = makeAction({ id: "act_m1", status: "done", title: "First" });
      const a2 = makeAction({ id: "act_m2", status: "done", title: "Second" });
      await kv.set("mem:actions", a1.id, a1);
      await kv.set("mem:actions", a2.id, a2);

      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: ["act_m1", "act_m2"],
      })) as { success: boolean; crystal: Crystal };

      expect(result.success).toBe(true);
      expect(result.crystal.sourceActionIds).toEqual(["act_m1", "act_m2"]);
    });

    it("returns failure when provider throws", async () => {
      (provider.summarize as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("API down"),
      );

      const action = makeAction({ id: "act_fail", status: "done" });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::crystallize", {
        actionIds: ["act_fail"],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("crystallization failed");
      expect(result.error).toContain("API down");
    });
  });

  describe("mem::crystal-list", () => {
    beforeEach(async () => {
      const c1: Crystal = {
        id: "crys_1",
        narrative: "First crystal",
        keyOutcomes: [],
        filesAffected: [],
        lessons: [],
        sourceActionIds: ["act_1"],
        project: "alpha",
        sessionId: "sess_a",
        createdAt: new Date("2025-01-01").toISOString(),
      };
      const c2: Crystal = {
        id: "crys_2",
        narrative: "Second crystal",
        keyOutcomes: [],
        filesAffected: [],
        lessons: [],
        sourceActionIds: ["act_2"],
        project: "beta",
        sessionId: "sess_b",
        createdAt: new Date("2025-02-01").toISOString(),
      };
      const c3: Crystal = {
        id: "crys_3",
        narrative: "Third crystal",
        keyOutcomes: [],
        filesAffected: [],
        lessons: [],
        sourceActionIds: ["act_3"],
        project: "alpha",
        sessionId: "sess_a",
        createdAt: new Date("2025-03-01").toISOString(),
      };
      await kv.set("mem:crystals", c1.id, c1);
      await kv.set("mem:crystals", c2.id, c2);
      await kv.set("mem:crystals", c3.id, c3);
    });

    it("returns all crystals sorted by createdAt desc", async () => {
      const result = (await sdk.trigger("mem::crystal-list", {})) as {
        success: boolean;
        crystals: Crystal[];
      };

      expect(result.success).toBe(true);
      expect(result.crystals.length).toBe(3);
      expect(result.crystals[0].id).toBe("crys_3");
      expect(result.crystals[1].id).toBe("crys_2");
      expect(result.crystals[2].id).toBe("crys_1");
    });

    it("filters by project", async () => {
      const result = (await sdk.trigger("mem::crystal-list", {
        project: "alpha",
      })) as { success: boolean; crystals: Crystal[] };

      expect(result.success).toBe(true);
      expect(result.crystals.length).toBe(2);
      expect(result.crystals.every((c) => c.project === "alpha")).toBe(true);
    });

    it("filters by sessionId", async () => {
      const result = (await sdk.trigger("mem::crystal-list", {
        sessionId: "sess_b",
      })) as { success: boolean; crystals: Crystal[] };

      expect(result.success).toBe(true);
      expect(result.crystals.length).toBe(1);
      expect(result.crystals[0].id).toBe("crys_2");
    });

    it("respects limit", async () => {
      const result = (await sdk.trigger("mem::crystal-list", {
        limit: 1,
      })) as { success: boolean; crystals: Crystal[] };

      expect(result.success).toBe(true);
      expect(result.crystals.length).toBe(1);
      expect(result.crystals[0].id).toBe("crys_3");
    });
  });

  describe("mem::crystal-get", () => {
    it("returns crystal by id", async () => {
      const crystal: Crystal = {
        id: "crys_get_1",
        narrative: "Found it",
        keyOutcomes: ["yes"],
        filesAffected: ["b.ts"],
        lessons: ["test"],
        sourceActionIds: ["act_x"],
        createdAt: new Date().toISOString(),
      };
      await kv.set("mem:crystals", crystal.id, crystal);

      const result = (await sdk.trigger("mem::crystal-get", {
        crystalId: "crys_get_1",
      })) as { success: boolean; crystal: Crystal };

      expect(result.success).toBe(true);
      expect(result.crystal.id).toBe("crys_get_1");
      expect(result.crystal.narrative).toBe("Found it");
    });

    it("returns error for non-existent crystal", async () => {
      const result = (await sdk.trigger("mem::crystal-get", {
        crystalId: "crys_missing",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("crystal not found");
    });

    it("returns error when crystalId is missing", async () => {
      const result = (await sdk.trigger("mem::crystal-get", {})) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("crystalId is required");
    });
  });

  describe("mem::auto-crystallize", () => {
    it("returns group summaries in dryRun mode", async () => {
      const action = makeAction({
        id: "act_dry",
        status: "done",
        project: "proj",
      });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::auto-crystallize", {
        dryRun: true,
      })) as {
        success: boolean;
        dryRun: boolean;
        groupCount: number;
        groups: { groupKey: string; actionCount: number; actionIds: string[] }[];
        crystalIds: string[];
      };

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.groupCount).toBe(1);
      expect(result.groups[0].actionIds).toContain("act_dry");
      expect(result.crystalIds).toEqual([]);
    });

    it("groups by parentId when present", async () => {
      const parent = makeAction({
        id: "act_parent",
        status: "done",
        parentId: undefined,
      });
      const child1 = makeAction({
        id: "act_child1",
        status: "done",
        parentId: "act_parent",
      });
      const child2 = makeAction({
        id: "act_child2",
        status: "done",
        parentId: "act_parent",
      });
      await kv.set("mem:actions", parent.id, parent);
      await kv.set("mem:actions", child1.id, child1);
      await kv.set("mem:actions", child2.id, child2);

      const result = (await sdk.trigger("mem::auto-crystallize", {
        dryRun: true,
      })) as {
        success: boolean;
        groups: { groupKey: string; actionCount: number; actionIds: string[] }[];
      };

      expect(result.success).toBe(true);
      const parentGroup = result.groups.find((g) => g.groupKey === "act_parent");
      expect(parentGroup).toBeDefined();
      expect(parentGroup!.actionCount).toBe(2);
    });

    it("groups by project when no parentId", async () => {
      const a1 = makeAction({ id: "act_proj1", status: "done", project: "webapp" });
      const a2 = makeAction({ id: "act_proj2", status: "done", project: "webapp" });
      const a3 = makeAction({ id: "act_proj3", status: "done", project: "api" });
      await kv.set("mem:actions", a1.id, a1);
      await kv.set("mem:actions", a2.id, a2);
      await kv.set("mem:actions", a3.id, a3);

      const result = (await sdk.trigger("mem::auto-crystallize", {
        dryRun: true,
      })) as {
        success: boolean;
        groups: { groupKey: string; actionCount: number }[];
      };

      expect(result.success).toBe(true);
      const webGroup = result.groups.find((g) => g.groupKey === "webapp");
      const apiGroup = result.groups.find((g) => g.groupKey === "api");
      expect(webGroup).toBeDefined();
      expect(webGroup!.actionCount).toBe(2);
      expect(apiGroup).toBeDefined();
      expect(apiGroup!.actionCount).toBe(1);
    });

    it("skips already-crystallized actions", async () => {
      const action = makeAction({
        id: "act_already",
        status: "done",
        crystallizedInto: "crys_existing",
      });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::auto-crystallize", {
        dryRun: true,
      })) as { success: boolean; groupCount: number };

      expect(result.success).toBe(true);
      expect(result.groupCount).toBe(0);
    });

    it("skips actions newer than threshold", async () => {
      const recentAction = makeAction({
        id: "act_recent",
        status: "done",
        createdAt: new Date().toISOString(),
      });
      await kv.set("mem:actions", recentAction.id, recentAction);

      const result = (await sdk.trigger("mem::auto-crystallize", {
        olderThanDays: 7,
        dryRun: true,
      })) as { success: boolean; groupCount: number };

      expect(result.success).toBe(true);
      expect(result.groupCount).toBe(0);
    });

    it("creates crystals for each group in non-dryRun mode", async () => {
      const a1 = makeAction({ id: "act_auto1", status: "done", project: "proj1" });
      const a2 = makeAction({ id: "act_auto2", status: "done", project: "proj2" });
      await kv.set("mem:actions", a1.id, a1);
      await kv.set("mem:actions", a2.id, a2);

      const result = (await sdk.trigger("mem::auto-crystallize", {})) as {
        success: boolean;
        groupCount: number;
        crystalIds: string[];
      };

      expect(result.success).toBe(true);
      expect(result.groupCount).toBe(2);
      expect(result.crystalIds.length).toBe(2);
      expect(result.crystalIds[0]).toMatch(/^crys_/);
      expect(result.crystalIds[1]).toMatch(/^crys_/);
    });

    it("filters by project when specified", async () => {
      const a1 = makeAction({ id: "act_fp1", status: "done", project: "keep" });
      const a2 = makeAction({ id: "act_fp2", status: "done", project: "skip" });
      await kv.set("mem:actions", a1.id, a1);
      await kv.set("mem:actions", a2.id, a2);

      const result = (await sdk.trigger("mem::auto-crystallize", {
        project: "keep",
        dryRun: true,
      })) as {
        success: boolean;
        groupCount: number;
        groups: { groupKey: string; actionCount: number }[];
      };

      expect(result.success).toBe(true);
      expect(result.groupCount).toBe(1);
      expect(result.groups[0].groupKey).toBe("keep");
    });

    it("returns empty when no qualifying actions exist", async () => {
      const result = (await sdk.trigger("mem::auto-crystallize", {})) as {
        success: boolean;
        groupCount: number;
        crystalIds: string[];
      };

      expect(result.success).toBe(true);
      expect(result.groupCount).toBe(0);
      expect(result.crystalIds).toEqual([]);
    });
  });
});
