import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Action, ActionEdge } from "../types.js";
import { recordAudit } from "./audit.js";

function normalizeActionTags(action: Action): string[] {
  const tags = (action as { tags?: unknown }).tags;
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function actionStatusRank(status: Action["status"] | undefined): number {
  switch (status) {
    case "active":
      return 0;
    case "pending":
      return 1;
    case "blocked":
      return 2;
    case "done":
      return 3;
    case "cancelled":
      return 4;
    default:
      return 2;
  }
}

function compareActions(a: Action, b: Action): number {
  const statusDelta = actionStatusRank(a.status) - actionStatusRank(b.status);
  if (statusDelta !== 0) return statusDelta;
  const priorityDelta = (b.priority || 0) - (a.priority || 0);
  if (priorityDelta !== 0) return priorityDelta;
  return (b.updatedAt || b.createdAt || "").localeCompare(
    a.updatedAt || a.createdAt || "",
  );
}

function normalizeLimit(limit: unknown): number {
  const parsed =
    typeof limit === "number"
      ? limit
      : typeof limit === "string" && limit.trim()
        ? Number(limit)
        : undefined;
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(500, Math.trunc(parsed as number)));
}

export function registerActionsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::action-create", 
    async (data: {
      title: string;
      description?: string;
      priority?: number;
      createdBy?: string;
      project?: string;
      tags?: string[];
      parentId?: string;
      sourceObservationIds?: string[];
      sourceMemoryIds?: string[];
      edges?: Array<{ type: string; targetActionId: string }>;
    }) => {
      if (!data.title || typeof data.title !== "string") {
        return { success: false, error: "title is required" };
      }

      return withKeyedLock("mem:actions", async () => {
        const now = new Date().toISOString();
        const action: Action = {
          id: generateId("act"),
          title: data.title.trim(),
          description: (data.description || "").trim(),
          status: "pending",
          priority: Math.max(1, Math.min(10, data.priority || 5)),
          createdAt: now,
          updatedAt: now,
          createdBy: data.createdBy || "unknown",
          project: data.project,
          tags: data.tags || [],
          sourceObservationIds: data.sourceObservationIds || [],
          sourceMemoryIds: data.sourceMemoryIds || [],
          parentId: data.parentId,
        };

        if (data.parentId) {
          const parent = await kv.get<Action>(KV.actions, data.parentId);
          if (!parent) {
            return { success: false, error: "parent action not found" };
          }
        }

        const validEdgeTypes = [
          "requires",
          "unlocks",
          "spawned_by",
          "gated_by",
          "conflicts_with",
        ];
        const pendingEdges: ActionEdge[] = [];
        let hasRequires = false;
        if (data.edges && Array.isArray(data.edges)) {
          for (const e of data.edges) {
            if (!validEdgeTypes.includes(e.type)) {
              return { success: false, error: `invalid edge type: ${e.type}` };
            }
            const targetAction = await kv.get<Action>(KV.actions, e.targetActionId);
            if (!targetAction) {
              return { success: false, error: `target action not found: ${e.targetActionId}` };
            }
            if (e.type === "requires") hasRequires = true;
            pendingEdges.push({
              id: generateId("ae"),
              type: e.type as ActionEdge["type"],
              sourceActionId: action.id,
              targetActionId: e.targetActionId,
              createdAt: now,
            });
          }
        }

        if (hasRequires) {
          action.status = "blocked";
        }

        await kv.set(KV.actions, action.id, action);
        await recordAudit(kv, "action_create", "mem::action-create", [action.id], {
          actor: data.createdBy || "unknown",
          action,
          edges: pendingEdges,
        });

        for (const edge of pendingEdges) {
          await kv.set(KV.actionEdges, edge.id, edge);
        }

        return { success: true, action, edges: pendingEdges };
      });
    },
  );

  sdk.registerFunction("mem::action-update", 
    async (data: {
      actionId: string;
      status?: Action["status"];
      title?: string;
      description?: string;
      priority?: number;
      assignedTo?: string;
      result?: string;
      tags?: string[];
    }) => {
      if (!data.actionId) {
        return { success: false, error: "actionId is required" };
      }

      return withKeyedLock(`mem:action:${data.actionId}`, async () => {
        const action = await kv.get<Action>(KV.actions, data.actionId);
        if (!action) {
          return { success: false, error: "action not found" };
        }
        const before = { ...action };

        if (data.status !== undefined) action.status = data.status;
        if (data.title !== undefined) action.title = data.title.trim();
        if (data.description !== undefined)
          action.description = data.description.trim();
        if (data.priority !== undefined)
          action.priority = Math.max(1, Math.min(10, data.priority));
        if (data.assignedTo !== undefined) action.assignedTo = data.assignedTo;
        if (data.result !== undefined) action.result = data.result;
        if (data.tags !== undefined) action.tags = data.tags;
        action.updatedAt = new Date().toISOString();

        await kv.set(KV.actions, action.id, action);
        await recordAudit(kv, "action_update", "mem::action-update", [action.id], {
          actor: data.assignedTo || "unknown",
          before,
          after: action,
        });

        if (data.status === "done") {
          await propagateCompletion(kv, action.id);
        }

        return { success: true, action };
      });
    },
  );

  sdk.registerFunction("mem::action-edge-create", 
    async (data: {
      sourceActionId: string;
      targetActionId: string;
      type: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!data.sourceActionId || !data.targetActionId || !data.type) {
        return {
          success: false,
          error: "sourceActionId, targetActionId, and type are required",
        };
      }

      const validTypes = [
        "requires",
        "unlocks",
        "spawned_by",
        "gated_by",
        "conflicts_with",
      ];
      if (!validTypes.includes(data.type)) {
        return {
          success: false,
          error: `type must be one of: ${validTypes.join(", ")}`,
        };
      }

      const sourceAction = await kv.get<Action>(KV.actions, data.sourceActionId);
      if (!sourceAction) {
        return { success: false, error: "source action not found" };
      }
      const targetAction = await kv.get<Action>(KV.actions, data.targetActionId);
      if (!targetAction) {
        return { success: false, error: "target action not found" };
      }

      const edge: ActionEdge = {
        id: generateId("ae"),
        type: data.type as ActionEdge["type"],
        sourceActionId: data.sourceActionId,
        targetActionId: data.targetActionId,
        createdAt: new Date().toISOString(),
        metadata: data.metadata,
      };

      await kv.set(KV.actionEdges, edge.id, edge);
      await recordAudit(kv, "action_create", "mem::action-edge-create", [edge.id], {
        actor: "unknown",
        edge,
      });
      return { success: true, edge };
    },
  );

  sdk.registerFunction("mem::action-list", 
    async (data: {
      status?: string;
      project?: string;
      parentId?: string;
      tags?: string[];
      limit?: number | string;
    }) => {
      let actions = await kv.list<Action>(KV.actions);

      if (data.status) {
        actions = actions.filter((a) => a.status === data.status);
      }
      if (data.project) {
        actions = actions.filter((a) => a.project === data.project);
      }
      if (data.parentId) {
        actions = actions.filter((a) => a.parentId === data.parentId);
      }
      if (data.tags && data.tags.length > 0) {
        actions = actions.filter((a) =>
          data.tags!.some((t) => normalizeActionTags(a).includes(t)),
        );
      }

      actions.sort(compareActions);

      const limit = normalizeLimit(data.limit);
      return { success: true, actions: actions.slice(0, limit) };
    },
  );

  sdk.registerFunction("mem::action-get", 
    async (data: { actionId: string }) => {
      if (!data.actionId) {
        return { success: false, error: "actionId is required" };
      }
      const action = await kv.get<Action>(KV.actions, data.actionId);
      if (!action) {
        return { success: false, error: "action not found" };
      }

      const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
      const edges = allEdges.filter(
        (e) =>
          e.sourceActionId === data.actionId ||
          e.targetActionId === data.actionId,
      );

      const children = (await kv.list<Action>(KV.actions)).filter(
        (a) => a.parentId === data.actionId,
      );

      return { success: true, action, edges, children };
    },
  );
}

async function propagateCompletion(
  kv: StateKV,
  completedActionId: string,
): Promise<void> {
  const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
  const unlockEdges = allEdges.filter(
    (e) =>
      e.targetActionId === completedActionId &&
      (e.type === "requires" || e.type === "unlocks"),
  );

  const allActions = await kv.list<Action>(KV.actions);
  const actionMap = new Map(allActions.map((a) => [a.id, a]));

  for (const edge of unlockEdges) {
    const candidateId = edge.sourceActionId;
    await withKeyedLock(`mem:action:${candidateId}`, async () => {
      const action = await kv.get<Action>(KV.actions, candidateId);
      if (action && action.status === "blocked") {
        const deps = allEdges.filter(
          (e) => e.sourceActionId === action.id && e.type === "requires",
        );
        const allDone = deps.every((d) => {
          const target = actionMap.get(d.targetActionId);
          return target && target.status === "done";
        });
        if (allDone) {
          action.status = "pending";
          action.updatedAt = new Date().toISOString();
          await kv.set(KV.actions, action.id, action);
        }
      }
    });
  }
}
