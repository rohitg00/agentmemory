import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerFrontierFunction } from "../src/functions/frontier.js";
import { registerActionsFunction } from "../src/functions/actions.js";
import type { Action, ActionEdge, Checkpoint, Lease } from "../src/types.js";
import type { FrontierItem } from "../src/functions/frontier.js";

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

function makeAction(overrides: Partial<Action>): Action {
  const now = new Date().toISOString();
  return {
    id: overrides.id || `act_${Math.random().toString(36).slice(2, 10)}`,
    title: overrides.title || "Test action",
    description: overrides.description || "",
    status: overrides.status || "pending",
    priority: overrides.priority || 5,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    createdBy: overrides.createdBy || "agent-1",
    assignedTo: overrides.assignedTo,
    project: overrides.project,
    tags: overrides.tags || [],
    sourceObservationIds: overrides.sourceObservationIds || [],
    sourceMemoryIds: overrides.sourceMemoryIds || [],
    result: overrides.result,
    parentId: overrides.parentId,
    metadata: overrides.metadata,
  };
}

describe("Frontier Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerActionsFunction(sdk as never, kv as never);
    registerFrontierFunction(sdk as never, kv as never);
  });

  describe("mem::frontier", () => {
    it("returns empty frontier when no actions exist", async () => {
      const result = (await sdk.trigger("mem::frontier", {})) as {
        success: boolean;
        frontier: FrontierItem[];
        totalActions: number;
        totalUnblocked: number;
      };

      expect(result.success).toBe(true);
      expect(result.frontier).toEqual([]);
      expect(result.totalActions).toBe(0);
      expect(result.totalUnblocked).toBe(0);
    });

    it("returns pending actions sorted by score", async () => {
      const lowPriority = makeAction({
        id: "act_low",
        title: "Low priority",
        priority: 2,
      });
      const highPriority = makeAction({
        id: "act_high",
        title: "High priority",
        priority: 9,
      });

      await kv.set("mem:actions", lowPriority.id, lowPriority);
      await kv.set("mem:actions", highPriority.id, highPriority);

      const result = (await sdk.trigger("mem::frontier", {})) as {
        success: boolean;
        frontier: FrontierItem[];
      };

      expect(result.success).toBe(true);
      expect(result.frontier.length).toBe(2);
      expect(result.frontier[0].action.id).toBe("act_high");
      expect(result.frontier[1].action.id).toBe("act_low");
      expect(result.frontier[0].score).toBeGreaterThan(
        result.frontier[1].score,
      );
    });

    it("excludes done and cancelled actions", async () => {
      const pending = makeAction({
        id: "act_pending",
        title: "Pending",
        status: "pending",
      });
      const done = makeAction({
        id: "act_done",
        title: "Done",
        status: "done",
      });
      const cancelled = makeAction({
        id: "act_cancelled",
        title: "Cancelled",
        status: "cancelled",
      });

      await kv.set("mem:actions", pending.id, pending);
      await kv.set("mem:actions", done.id, done);
      await kv.set("mem:actions", cancelled.id, cancelled);

      const result = (await sdk.trigger("mem::frontier", {})) as {
        success: boolean;
        frontier: FrontierItem[];
        totalActions: number;
      };

      expect(result.success).toBe(true);
      expect(result.frontier.length).toBe(1);
      expect(result.frontier[0].action.id).toBe("act_pending");
      expect(result.totalActions).toBe(3);
    });

    it("excludes blocked actions with unsatisfied requires edge", async () => {
      const dependency = makeAction({
        id: "act_dep",
        title: "Dependency",
        status: "pending",
      });
      const blocked = makeAction({
        id: "act_blocked",
        title: "Blocked",
        status: "blocked",
      });

      await kv.set("mem:actions", dependency.id, dependency);
      await kv.set("mem:actions", blocked.id, blocked);

      const edge: ActionEdge = {
        id: "ae_1",
        type: "requires",
        sourceActionId: blocked.id,
        targetActionId: dependency.id,
        createdAt: new Date().toISOString(),
      };
      await kv.set("mem:action-edges", edge.id, edge);

      const result = (await sdk.trigger("mem::frontier", {})) as {
        success: boolean;
        frontier: FrontierItem[];
      };

      expect(result.success).toBe(true);
      const ids = result.frontier.map((f) => f.action.id);
      expect(ids).toContain("act_dep");
      expect(ids).not.toContain("act_blocked");
    });

    it("respects project filter", async () => {
      const alphaAction = makeAction({
        id: "act_alpha",
        title: "Alpha task",
        project: "alpha",
      });
      const betaAction = makeAction({
        id: "act_beta",
        title: "Beta task",
        project: "beta",
      });

      await kv.set("mem:actions", alphaAction.id, alphaAction);
      await kv.set("mem:actions", betaAction.id, betaAction);

      const result = (await sdk.trigger("mem::frontier", {
        project: "alpha",
      })) as { success: boolean; frontier: FrontierItem[] };

      expect(result.success).toBe(true);
      expect(result.frontier.length).toBe(1);
      expect(result.frontier[0].action.project).toBe("alpha");
    });

    it("higher priority scores higher", async () => {
      const low = makeAction({
        id: "act_low",
        title: "Low",
        priority: 1,
        createdAt: new Date().toISOString(),
      });
      const high = makeAction({
        id: "act_high",
        title: "High",
        priority: 10,
        createdAt: new Date().toISOString(),
      });

      await kv.set("mem:actions", low.id, low);
      await kv.set("mem:actions", high.id, high);

      const result = (await sdk.trigger("mem::frontier", {})) as {
        success: boolean;
        frontier: FrontierItem[];
      };

      expect(result.frontier[0].action.id).toBe("act_high");
      expect(result.frontier[0].score).toBeGreaterThan(
        result.frontier[1].score,
      );
    });

    it("excludes actions gated by pending checkpoint", async () => {
      const gatedAction = makeAction({
        id: "act_gated",
        title: "Gated action",
        status: "pending",
      });

      const checkpoint: Checkpoint = {
        id: "ckpt_1",
        name: "CI check",
        description: "Waiting for CI",
        status: "pending",
        type: "ci",
        createdAt: new Date().toISOString(),
        linkedActionIds: ["act_gated"],
      };

      await kv.set("mem:actions", gatedAction.id, gatedAction);
      await kv.set("mem:checkpoints", checkpoint.id, checkpoint);

      const gateEdge: ActionEdge = {
        id: "ae_gate",
        type: "gated_by",
        sourceActionId: gatedAction.id,
        targetActionId: checkpoint.id,
        createdAt: new Date().toISOString(),
      };
      await kv.set("mem:action-edges", gateEdge.id, gateEdge);

      const result = (await sdk.trigger("mem::frontier", {})) as {
        success: boolean;
        frontier: FrontierItem[];
      };

      expect(result.frontier.length).toBe(0);
    });

    it("excludes actions conflicting with active actions", async () => {
      const activeAction = makeAction({
        id: "act_active",
        title: "Active task",
        status: "active",
      });
      const conflictAction = makeAction({
        id: "act_conflict",
        title: "Conflicting task",
        status: "pending",
      });

      await kv.set("mem:actions", activeAction.id, activeAction);
      await kv.set("mem:actions", conflictAction.id, conflictAction);

      const conflictEdge: ActionEdge = {
        id: "ae_conflict",
        type: "conflicts_with",
        sourceActionId: conflictAction.id,
        targetActionId: activeAction.id,
        createdAt: new Date().toISOString(),
      };
      await kv.set("mem:action-edges", conflictEdge.id, conflictEdge);

      const result = (await sdk.trigger("mem::frontier", {})) as {
        success: boolean;
        frontier: FrontierItem[];
      };

      const ids = result.frontier.map((f) => f.action.id);
      expect(ids).toContain("act_active");
      expect(ids).not.toContain("act_conflict");
    });

    it("active actions get score bonus", async () => {
      const pendingAction = makeAction({
        id: "act_pending",
        title: "Pending",
        status: "pending",
        priority: 5,
        createdAt: new Date().toISOString(),
      });
      const activeAction = makeAction({
        id: "act_active",
        title: "Active",
        status: "active",
        priority: 5,
        createdAt: new Date().toISOString(),
      });

      await kv.set("mem:actions", pendingAction.id, pendingAction);
      await kv.set("mem:actions", activeAction.id, activeAction);

      const result = (await sdk.trigger("mem::frontier", {})) as {
        success: boolean;
        frontier: FrontierItem[];
      };

      const activeItem = result.frontier.find(
        (f) => f.action.id === "act_active",
      )!;
      const pendingItem = result.frontier.find(
        (f) => f.action.id === "act_pending",
      )!;

      expect(activeItem.score).toBeGreaterThan(pendingItem.score);
    });
  });

  describe("mem::next", () => {
    it("returns top suggestion when actions exist", async () => {
      const action = makeAction({
        id: "act_1",
        title: "Top task",
        priority: 8,
        tags: ["urgent"],
      });
      await kv.set("mem:actions", action.id, action);

      const result = (await sdk.trigger("mem::next", {})) as {
        success: boolean;
        suggestion: {
          actionId: string;
          title: string;
          description: string;
          priority: number;
          score: number;
          tags: string[];
        } | null;
        message: string;
        totalActions: number;
      };

      expect(result.success).toBe(true);
      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.actionId).toBe("act_1");
      expect(result.suggestion!.title).toBe("Top task");
      expect(result.suggestion!.priority).toBe(8);
      expect(result.suggestion!.tags).toEqual(["urgent"]);
      expect(result.message).toContain("Top task");
      expect(result.totalActions).toBe(1);
    });

    it("returns null suggestion when no actions exist", async () => {
      const result = (await sdk.trigger("mem::next", {})) as {
        success: boolean;
        suggestion: null;
        message: string;
        totalActions: number;
      };

      expect(result.success).toBe(true);
      expect(result.suggestion).toBeNull();
      expect(result.message).toContain("No actionable work");
      expect(result.totalActions).toBe(0);
    });

    it("returns null when all actions are done", async () => {
      const doneAction = makeAction({
        id: "act_done",
        title: "Completed",
        status: "done",
      });
      await kv.set("mem:actions", doneAction.id, doneAction);

      const result = (await sdk.trigger("mem::next", {})) as {
        success: boolean;
        suggestion: null;
        message: string;
        totalActions: number;
      };

      expect(result.success).toBe(true);
      expect(result.suggestion).toBeNull();
      expect(result.totalActions).toBe(1);
    });

    it("propagates failure when frontier fails", async () => {
      const originalFunctions = new Map<string, Function>();

      const failSdk = {
        registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
          const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
          originalFunctions.set(id, handler);
        },
        registerTrigger: () => {},
        trigger: async (
          idOrInput: string | { function_id: string; payload: unknown },
          data?: unknown,
        ) => {
          const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
          const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
          if (id === "mem::frontier") {
            return { success: false, error: "internal failure" };
          }
          const fn = originalFunctions.get(id);
          if (!fn) throw new Error(`No function: ${id}`);
          return fn(payload);
        },
      };

      const failKv = mockKV();
      registerFrontierFunction(failSdk as never, failKv as never);

      const nextFn = originalFunctions.get("mem::next")!;
      const result = (await nextFn({})) as {
        success: boolean;
        suggestion: null;
        message: string;
        totalActions: number;
      };

      expect(result.success).toBe(false);
      expect(result.suggestion).toBeNull();
      expect(result.message).toContain("Failed to compute frontier");
      expect(result.totalActions).toBe(0);
    });

    it("respects project filter", async () => {
      const alphaAction = makeAction({
        id: "act_alpha",
        title: "Alpha task",
        project: "alpha",
        priority: 5,
      });
      const betaAction = makeAction({
        id: "act_beta",
        title: "Beta task",
        project: "beta",
        priority: 10,
      });

      await kv.set("mem:actions", alphaAction.id, alphaAction);
      await kv.set("mem:actions", betaAction.id, betaAction);

      const result = (await sdk.trigger("mem::next", {
        project: "alpha",
      })) as {
        success: boolean;
        suggestion: { actionId: string; title: string } | null;
      };

      expect(result.success).toBe(true);
      expect(result.suggestion).not.toBeNull();
      expect(result.suggestion!.actionId).toBe("act_alpha");
    });
  });
});
