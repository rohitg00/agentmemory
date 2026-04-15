import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerRoutinesFunction } from "../src/functions/routines.js";
import type { Action, Routine, RoutineRun } from "../src/types.js";

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

describe("Routines Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerRoutinesFunction(sdk as never, kv as never);
  });

  describe("mem::routine-create", () => {
    it("creates a routine with valid data", async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "Deploy Pipeline",
        description: "Standard deploy steps",
        steps: [
          { title: "Build", description: "Run build", actionTemplate: {}, dependsOn: [] },
          { title: "Test", description: "Run tests", actionTemplate: {}, dependsOn: [0] },
        ],
        tags: ["deploy", "ci"],
      })) as { success: boolean; routine: Routine };

      expect(result.success).toBe(true);
      expect(result.routine.id).toMatch(/^rtn_/);
      expect(result.routine.name).toBe("Deploy Pipeline");
      expect(result.routine.description).toBe("Standard deploy steps");
      expect(result.routine.steps.length).toBe(2);
      expect(result.routine.tags).toEqual(["deploy", "ci"]);
      expect(result.routine.createdAt).toBeDefined();
      expect(result.routine.updatedAt).toBeDefined();
      expect(result.routine.frozen).toBe(true);
    });

    it("returns error when name is missing", async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "",
        steps: [{ title: "Step 1", description: "", actionTemplate: {}, dependsOn: [] }],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("name and steps are required");
    });

    it("returns error when steps array is empty", async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "Empty Routine",
        steps: [],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("name and steps are required");
    });

    it("returns error when a step has no title", async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "Bad Steps",
        steps: [
          { title: "Good Step", description: "ok", actionTemplate: {}, dependsOn: [] },
          { title: "   ", description: "no title", actionTemplate: {}, dependsOn: [] },
        ],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("step 1 must have a title");
    });

    it("assigns correct order to steps", async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "Ordered Routine",
        steps: [
          { title: "First", description: "", actionTemplate: {}, dependsOn: [] },
          { title: "Second", description: "", actionTemplate: {}, dependsOn: [] },
          { title: "Third", description: "", actionTemplate: {}, dependsOn: [] },
        ],
      })) as { success: boolean; routine: Routine };

      expect(result.success).toBe(true);
      expect(result.routine.steps[0].order).toBe(0);
      expect(result.routine.steps[1].order).toBe(1);
      expect(result.routine.steps[2].order).toBe(2);
    });

    it("preserves explicit order values", async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "Custom Order",
        steps: [
          { order: 10, title: "First", description: "", actionTemplate: {}, dependsOn: [] },
          { order: 20, title: "Second", description: "", actionTemplate: {}, dependsOn: [] },
        ],
      })) as { success: boolean; routine: Routine };

      expect(result.success).toBe(true);
      expect(result.routine.steps[0].order).toBe(10);
      expect(result.routine.steps[1].order).toBe(20);
    });

    it("defaults frozen to true when not specified", async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "Default Frozen",
        steps: [{ title: "Step", description: "", actionTemplate: {}, dependsOn: [] }],
      })) as { success: boolean; routine: Routine };

      expect(result.success).toBe(true);
      expect(result.routine.frozen).toBe(true);
    });

    it("respects frozen=false when explicitly set", async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "Unfrozen",
        steps: [{ title: "Step", description: "", actionTemplate: {}, dependsOn: [] }],
        frozen: false,
      })) as { success: boolean; routine: Routine };

      expect(result.success).toBe(true);
      expect(result.routine.frozen).toBe(false);
    });
  });

  describe("mem::routine-list", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::routine-create", {
        name: "Routine A",
        steps: [{ title: "S1", description: "", actionTemplate: {}, dependsOn: [] }],
        tags: ["deploy"],
        frozen: true,
      });
      await sdk.trigger("mem::routine-create", {
        name: "Routine B",
        steps: [{ title: "S1", description: "", actionTemplate: {}, dependsOn: [] }],
        tags: ["test", "ci"],
        frozen: false,
      });
      await sdk.trigger("mem::routine-create", {
        name: "Routine C",
        steps: [{ title: "S1", description: "", actionTemplate: {}, dependsOn: [] }],
        tags: ["deploy", "ci"],
        frozen: true,
      });
    });

    it("lists all routines", async () => {
      const result = (await sdk.trigger("mem::routine-list", {})) as {
        success: boolean;
        routines: Routine[];
      };

      expect(result.success).toBe(true);
      expect(result.routines.length).toBe(3);
    });

    it("filters by frozen=true", async () => {
      const result = (await sdk.trigger("mem::routine-list", {
        frozen: true,
      })) as { success: boolean; routines: Routine[] };

      expect(result.success).toBe(true);
      expect(result.routines.length).toBe(2);
      expect(result.routines.every((r) => r.frozen === true)).toBe(true);
    });

    it("filters by frozen=false", async () => {
      const result = (await sdk.trigger("mem::routine-list", {
        frozen: false,
      })) as { success: boolean; routines: Routine[] };

      expect(result.success).toBe(true);
      expect(result.routines.length).toBe(1);
      expect(result.routines[0].name).toBe("Routine B");
    });

    it("filters by tags", async () => {
      const result = (await sdk.trigger("mem::routine-list", {
        tags: ["deploy"],
      })) as { success: boolean; routines: Routine[] };

      expect(result.success).toBe(true);
      expect(result.routines.length).toBe(2);
      const names = result.routines.map((r) => r.name);
      expect(names).toContain("Routine A");
      expect(names).toContain("Routine C");
    });

    it("filters by tags with multiple matches", async () => {
      const result = (await sdk.trigger("mem::routine-list", {
        tags: ["ci"],
      })) as { success: boolean; routines: Routine[] };

      expect(result.success).toBe(true);
      expect(result.routines.length).toBe(2);
      const names = result.routines.map((r) => r.name);
      expect(names).toContain("Routine B");
      expect(names).toContain("Routine C");
    });
  });

  describe("mem::routine-run", () => {
    let routineId: string;

    beforeEach(async () => {
      const result = (await sdk.trigger("mem::routine-create", {
        name: "Test Pipeline",
        steps: [
          { order: 0, title: "Build", description: "Build step", actionTemplate: { priority: 3 }, dependsOn: [] },
          { order: 1, title: "Test", description: "Test step", actionTemplate: { priority: 5 }, dependsOn: [0] },
          { order: 2, title: "Deploy", description: "Deploy step", actionTemplate: {}, dependsOn: [0, 1] },
        ],
      })) as { success: boolean; routine: Routine };
      routineId = result.routine.id;
    });

    it("creates actions for each step", async () => {
      const result = (await sdk.trigger("mem::routine-run", {
        routineId,
        initiatedBy: "user-1",
      })) as { success: boolean; run: RoutineRun; actionsCreated: number };

      expect(result.success).toBe(true);
      expect(result.actionsCreated).toBe(3);
      expect(result.run.actionIds.length).toBe(3);
      expect(result.run.status).toBe("running");
      expect(result.run.initiatedBy).toBe("user-1");

      const actions = await kv.list<Action>("mem:actions");
      expect(actions.length).toBe(3);
      const titles = actions.map((a) => a.title);
      expect(titles).toContain("Build");
      expect(titles).toContain("Test");
      expect(titles).toContain("Deploy");
    });

    it("creates dependency edges between steps", async () => {
      const result = (await sdk.trigger("mem::routine-run", {
        routineId,
      })) as { success: boolean; run: RoutineRun; actionsCreated: number };

      expect(result.success).toBe(true);

      const edges = await kv.list<{
        id: string;
        type: string;
        sourceActionId: string;
        targetActionId: string;
      }>("mem:action-edges");

      expect(edges.length).toBe(3);
      expect(edges.every((e) => e.type === "requires")).toBe(true);
    });

    it("creates routine run tracking object", async () => {
      const result = (await sdk.trigger("mem::routine-run", {
        routineId,
        initiatedBy: "agent-x",
      })) as { success: boolean; run: RoutineRun };

      expect(result.run.id).toMatch(/^run_/);
      expect(result.run.routineId).toBe(routineId);
      expect(result.run.status).toBe("running");
      expect(result.run.startedAt).toBeDefined();
      expect(result.run.actionIds.length).toBe(3);
      expect(result.run.initiatedBy).toBe("agent-x");

      const stored = await kv.get<RoutineRun>("mem:routine-runs", result.run.id);
      expect(stored).not.toBeNull();
      expect(stored!.routineId).toBe(routineId);
    });

    it("preserves priority 0 via nullish coalescing", async () => {
      const createResult = (await sdk.trigger("mem::routine-create", {
        name: "Zero Priority",
        steps: [
          { order: 0, title: "Step Zero", description: "", actionTemplate: { priority: 0 }, dependsOn: [] },
        ],
      })) as { success: boolean; routine: Routine };

      const runResult = (await sdk.trigger("mem::routine-run", {
        routineId: createResult.routine.id,
      })) as { success: boolean; run: RoutineRun };

      const actionId = runResult.run.actionIds[0];
      const action = await kv.get<Action>("mem:actions", actionId);
      expect(action!.priority).toBe(0);
    });

    it("tags actions with routine id", async () => {
      const result = (await sdk.trigger("mem::routine-run", {
        routineId,
      })) as { success: boolean; run: RoutineRun };

      for (const actionId of result.run.actionIds) {
        const action = await kv.get<Action>("mem:actions", actionId);
        expect(action!.tags).toContain(`routine:${routineId}`);
      }
    });

    it("returns error when routineId is missing", async () => {
      const result = (await sdk.trigger("mem::routine-run", {
        routineId: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("routineId is required");
    });

    it("returns error when routine is not found", async () => {
      const result = (await sdk.trigger("mem::routine-run", {
        routineId: "rtn_nonexistent",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("routine not found");
    });
  });

  describe("mem::routine-status", () => {
    let runId: string;
    let actionIds: string[];

    beforeEach(async () => {
      const createResult = (await sdk.trigger("mem::routine-create", {
        name: "Status Test",
        steps: [
          { order: 0, title: "Step A", description: "", actionTemplate: {}, dependsOn: [] },
          { order: 1, title: "Step B", description: "", actionTemplate: {}, dependsOn: [] },
          { order: 2, title: "Step C", description: "", actionTemplate: {}, dependsOn: [] },
        ],
      })) as { success: boolean; routine: Routine };

      const runResult = (await sdk.trigger("mem::routine-run", {
        routineId: createResult.routine.id,
      })) as { success: boolean; run: RoutineRun };

      runId = runResult.run.id;
      actionIds = runResult.run.actionIds;
    });

    it("reports running status when actions are in progress", async () => {
      const result = (await sdk.trigger("mem::routine-status", {
        runId,
      })) as { success: boolean; run: RoutineRun; progress: { total: number; pending: number } };

      expect(result.success).toBe(true);
      expect(result.run.status).toBe("running");
      expect(result.progress.total).toBe(3);
      expect(result.progress.pending).toBe(3);
    });

    it("marks run completed when all actions are done", async () => {
      for (const actionId of actionIds) {
        const action = await kv.get<Action>("mem:actions", actionId);
        action!.status = "done";
        await kv.set("mem:actions", actionId, action);
      }

      const result = (await sdk.trigger("mem::routine-status", {
        runId,
      })) as { success: boolean; run: RoutineRun; progress: { done: number; total: number } };

      expect(result.success).toBe(true);
      expect(result.run.status).toBe("completed");
      expect(result.run.completedAt).toBeDefined();
      expect(result.progress.done).toBe(3);
    });

    it("marks run failed when any action is cancelled", async () => {
      const action = await kv.get<Action>("mem:actions", actionIds[0]);
      action!.status = "cancelled";
      await kv.set("mem:actions", actionIds[0], action);

      const result = (await sdk.trigger("mem::routine-status", {
        runId,
      })) as { success: boolean; run: RoutineRun };

      expect(result.success).toBe(true);
      expect(result.run.status).toBe("failed");
    });

    it("marks run failed when any action is cancelled (mixed statuses)", async () => {
      const action = await kv.get<Action>("mem:actions", actionIds[1]);
      (action as Action).status = "done";
      await kv.set("mem:actions", actionIds[1], action);

      const action2 = await kv.get<Action>("mem:actions", actionIds[2]);
      (action2 as Action).status = "cancelled";
      await kv.set("mem:actions", actionIds[2], action2);

      const result = (await sdk.trigger("mem::routine-status", {
        runId,
      })) as { success: boolean; run: RoutineRun };

      expect(result.success).toBe(true);
      expect(result.run.status).toBe("failed");
    });

    it("returns error when runId is missing", async () => {
      const result = (await sdk.trigger("mem::routine-status", {
        runId: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("runId is required");
    });

    it("returns error when run is not found", async () => {
      const result = (await sdk.trigger("mem::routine-status", {
        runId: "run_nonexistent",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("run not found");
    });
  });

  describe("mem::routine-freeze", () => {
    it("freezes a routine", async () => {
      const createResult = (await sdk.trigger("mem::routine-create", {
        name: "Unfreeze Me",
        steps: [{ title: "Step", description: "", actionTemplate: {}, dependsOn: [] }],
        frozen: false,
      })) as { success: boolean; routine: Routine };

      expect(createResult.routine.frozen).toBe(false);

      const result = (await sdk.trigger("mem::routine-freeze", {
        routineId: createResult.routine.id,
      })) as { success: boolean; routine: Routine };

      expect(result.success).toBe(true);
      expect(result.routine.frozen).toBe(true);
      expect(result.routine.updatedAt).toBeDefined();
    });

    it("returns error when routineId is missing", async () => {
      const result = (await sdk.trigger("mem::routine-freeze", {
        routineId: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("routineId is required");
    });

    it("returns error when routine is not found", async () => {
      const result = (await sdk.trigger("mem::routine-freeze", {
        routineId: "rtn_nonexistent",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("routine not found");
    });
  });
});
