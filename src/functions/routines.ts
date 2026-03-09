import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Action, Routine, RoutineStep, RoutineRun } from "../types.js";

export function registerRoutinesFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    { id: "mem::routine-create" },
    async (data: {
      name: string;
      description?: string;
      steps: RoutineStep[];
      tags?: string[];
      frozen?: boolean;
      sourceProceduralIds?: string[];
    }) => {
      if (!data.name || !Array.isArray(data.steps) || data.steps.length === 0) {
        return { success: false, error: "name and steps are required" };
      }

      for (let i = 0; i < data.steps.length; i++) {
        if (!data.steps[i].title?.trim()) {
          return { success: false, error: `step ${i} must have a title` };
        }
      }

      const orders = data.steps.map((s, i) => s.order ?? i);
      const uniqueOrders = new Set(orders);
      if (uniqueOrders.size !== orders.length) {
        return { success: false, error: "duplicate step orders" };
      }
      for (const step of data.steps) {
        if (step.dependsOn) {
          for (const dep of step.dependsOn) {
            if (!uniqueOrders.has(dep)) {
              return { success: false, error: `step ${step.order ?? data.steps.indexOf(step)} depends on unknown order ${dep}` };
            }
          }
        }
      }

      const now = new Date().toISOString();
      const routine: Routine = {
        id: generateId("rtn"),
        name: data.name.trim(),
        description: (data.description || "").trim(),
        steps: data.steps.map((s, i) => ({
          order: s.order ?? i,
          title: s.title,
          description: s.description || "",
          actionTemplate: s.actionTemplate || {},
          dependsOn: s.dependsOn || [],
        })),
        createdAt: now,
        updatedAt: now,
        frozen: data.frozen ?? true,
        tags: data.tags || [],
        sourceProceduralIds: data.sourceProceduralIds || [],
      };

      await kv.set(KV.routines, routine.id, routine);
      return { success: true, routine };
    },
  );

  sdk.registerFunction(
    { id: "mem::routine-list" },
    async (data: { frozen?: boolean; tags?: string[] }) => {
      let routines = await kv.list<Routine>(KV.routines);
      if (data.frozen !== undefined) {
        routines = routines.filter((r) => r.frozen === data.frozen);
      }
      if (data.tags && data.tags.length > 0) {
        routines = routines.filter((r) =>
          data.tags!.some((t) => r.tags.includes(t)),
        );
      }
      routines.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      return { success: true, routines };
    },
  );

  sdk.registerFunction(
    { id: "mem::routine-run" },
    async (data: {
      routineId: string;
      initiatedBy?: string;
      project?: string;
      overrides?: Record<number, Partial<Action>>;
    }) => {
      if (!data.routineId) {
        return { success: false, error: "routineId is required" };
      }

      return withKeyedLock(`mem:routine:${data.routineId}`, async () => {
        const routine = await kv.get<Routine>(KV.routines, data.routineId);
        if (!routine) {
          return { success: false, error: "routine not found" };
        }

        const now = new Date().toISOString();
        const stepOrderToActionId = new Map<number, string>();
        const actionIds: string[] = [];
        const stepStatus: Record<number, "pending" | "active" | "done" | "failed"> = {};

        for (const step of routine.steps) {
          const template = step.actionTemplate || {};
          const override = data.overrides?.[step.order] || {};

          const hasDeps = (step.dependsOn || []).length > 0;
          const action: Action = {
            id: generateId("act"),
            title: override.title || template.title || step.title,
            description:
              override.description ||
              template.description ||
              step.description,
            status: hasDeps ? "blocked" : "pending",
            priority:
              override.priority ?? template.priority ?? 5,
            createdAt: now,
            updatedAt: now,
            createdBy: data.initiatedBy || "routine",
            project: data.project || template.project,
            tags: [
              ...(template.tags || []),
              ...(override.tags || []),
              `routine:${routine.id}`,
            ],
            sourceObservationIds: [],
            sourceMemoryIds: [],
            metadata: { routineId: routine.id, stepOrder: step.order },
          };

          await kv.set(KV.actions, action.id, action);
          stepOrderToActionId.set(step.order, action.id);
          actionIds.push(action.id);
          stepStatus[step.order] = "pending";
        }

        for (const step of routine.steps) {
          const actionId = stepOrderToActionId.get(step.order);
          if (!actionId) continue;

          for (const depOrder of step.dependsOn) {
            const depActionId = stepOrderToActionId.get(depOrder);
            if (!depActionId) continue;
            const edge = {
              id: generateId("ae"),
              type: "requires" as const,
              sourceActionId: actionId,
              targetActionId: depActionId,
              createdAt: now,
            };
            await kv.set(KV.actionEdges, edge.id, edge);
          }
        }

        const run: RoutineRun = {
          id: generateId("run"),
          routineId: routine.id,
          status: "running",
          startedAt: now,
          actionIds,
          stepStatus,
          initiatedBy: data.initiatedBy || "unknown",
        };

        await kv.set(KV.routineRuns, run.id, run);

        return {
          success: true,
          run,
          actionsCreated: actionIds.length,
        };
      });
    },
  );

  sdk.registerFunction(
    { id: "mem::routine-status" },
    async (data: { runId: string }) => {
      if (!data.runId) {
        return { success: false, error: "runId is required" };
      }

      const run = await kv.get<RoutineRun>(KV.routineRuns, data.runId);
      if (!run) {
        return { success: false, error: "run not found" };
      }

      const actionStates: Array<{
        actionId: string;
        status: string;
        title: string;
      }> = [];
      let allDone = true;
      let anyFailed = false;

      let statusChanged = false;
      for (const actionId of run.actionIds) {
        const action = await kv.get<Action>(KV.actions, actionId);
        if (action) {
          actionStates.push({
            actionId: action.id,
            status: action.status,
            title: action.title,
          });
          if (action.status !== "done") allDone = false;
          if (action.status === "cancelled") anyFailed = true;

          const stepOrder = (action.metadata as { stepOrder?: number })?.stepOrder;
          if (stepOrder !== undefined && stepOrder in run.stepStatus) {
            let mapped: "pending" | "active" | "done" | "failed";
            if (action.status === "cancelled") {
              mapped = "failed";
            } else if (action.status === "blocked") {
              mapped = "pending";
            } else {
              mapped = action.status as "pending" | "active" | "done";
            }
            if (run.stepStatus[stepOrder] !== mapped) {
              run.stepStatus[stepOrder] = mapped;
              statusChanged = true;
            }
          }
        } else {
          actionStates.push({
            actionId,
            status: "cancelled",
            title: "(missing)",
          });
          allDone = false;
          anyFailed = true;
        }
      }

      if (allDone && run.status === "running") {
        run.status = "completed";
        run.completedAt = new Date().toISOString();
        statusChanged = true;
      } else if (anyFailed && run.status === "running") {
        run.status = "failed";
        statusChanged = true;
      }

      if (statusChanged) {
        await kv.set(KV.routineRuns, run.id, run);
      }

      return {
        success: true,
        run,
        actions: actionStates,
        progress: {
          total: run.actionIds.length,
          done: actionStates.filter((a) => a.status === "done").length,
          active: actionStates.filter((a) => a.status === "active").length,
          pending: actionStates.filter((a) => a.status === "pending").length,
          blocked: actionStates.filter((a) => a.status === "blocked").length,
          cancelled: actionStates.filter((a) => a.status === "cancelled").length,
        },
      };
    },
  );

  sdk.registerFunction(
    { id: "mem::routine-freeze" },
    async (data: { routineId: string }) => {
      if (!data.routineId) {
        return { success: false, error: "routineId is required" };
      }
      return withKeyedLock(`mem:routine:${data.routineId}`, async () => {
        const routine = await kv.get<Routine>(KV.routines, data.routineId);
        if (!routine) {
          return { success: false, error: "routine not found" };
        }
        routine.frozen = true;
        routine.updatedAt = new Date().toISOString();
        await kv.set(KV.routines, routine.id, routine);
        return { success: true, routine };
      });
    },
  );
}
