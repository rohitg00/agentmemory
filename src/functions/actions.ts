import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, generateId } from "../state/schema.js";
import type {
  Action,
  ActionApproval,
  ActionEdge,
  ActionLifecycle,
  ActionReadinessView,
  Checkpoint,
  Lease,
  Sentinel,
} from "../types.js";
import { recordAudit } from "./audit.js";
import {
  isActionApprovalState,
  isActionLifecycle,
  isActionReadinessView,
  isCanonicalProjectId,
  isValidActionTimestamp,
  normalizeActionTags,
} from "./action-model.js";
import {
  ActionNormalizationError,
  ActionRevisionConflictError,
  deleteAction,
  persistActionEdgeUnlocked,
  persistActionUnlocked,
  readActionStoreSnapshot,
  recoverActionStoreUnlocked,
  withActionStoreLock,
} from "./action-store.js";
import {
  ActionQueryError,
  selectActionPage,
  type ActionListOptions,
} from "./action-query.js";

const VALID_EDGE_TYPES: ActionEdge["type"][] = [
  "requires",
  "unlocks",
  "spawned_by",
  "gated_by",
  "conflicts_with",
];
const LEGACY_STATUSES = new Set<Action["status"]>([
  "pending",
  "active",
  "done",
  "blocked",
  "cancelled",
]);
const MAX_ACTION_GRAPH_ACTIONS = 5_000;

interface ActionCreateInput {
  title: string;
  description?: string;
  priority?: number;
  createdBy?: string;
  actor?: string;
  project?: string;
  projectId?: string;
  projectAliases?: string[];
  tags?: string[] | string;
  parentId?: string;
  sourceObservationIds?: string[];
  sourceMemoryIds?: string[];
  edges?: Array<{ type: string; targetActionId: string }>;
  lifecycle?: ActionLifecycle;
  owner?: string;
  notBefore?: string;
  dueAt?: string;
  awaitingHuman?: boolean;
  approval?: ActionApproval;
  blockedReason?: string;
  repoRoot?: string;
  worktree?: string;
  branch?: string;
  taskSlug?: string;
}

interface ActionUpdateInput {
  actionId: string;
  status?: Action["status"];
  lifecycle?: ActionLifecycle;
  title?: string;
  description?: string;
  priority?: number;
  assignedTo?: string;
  owner?: string;
  result?: string;
  tags?: string[] | string;
  project?: string;
  projectId?: string;
  projectAliases?: string[];
  notBefore?: string;
  dueAt?: string;
  awaitingHuman?: boolean;
  approval?: ActionApproval;
  blockedReason?: string;
  repoRoot?: string;
  worktree?: string;
  branch?: string;
  taskSlug?: string;
  actor?: string;
  correctionOf?: string;
  correctionReason?: string;
}

export function registerActionsFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::action-create", async (data: ActionCreateInput) => {
    const validationError = validateCreateInput(data);
    if (validationError) return { success: false, error: validationError };

    try {
      return await withActionStoreLock(async () => {
        await recoverActionStoreUnlocked(kv);
        if (data.parentId) {
          const parent = await kv.get<Action>(KV.actions, data.parentId);
          if (!parent) {
            return { success: false, error: "parent action not found" };
          }
        }

        const now = new Date().toISOString();
        const pendingEdges: ActionEdge[] = [];
        for (const requestedEdge of data.edges ?? []) {
          if (!isValidEdgeType(requestedEdge.type)) {
            return {
              success: false,
              error: `invalid edge type: ${requestedEdge.type}`,
            };
          }
          const targetExists =
            requestedEdge.type === "gated_by"
              ? await actionGateExists(kv, requestedEdge.targetActionId)
              : Boolean(
                  await kv.get<Action>(
                    KV.actions,
                    requestedEdge.targetActionId,
                  ),
                );
          if (!targetExists) {
            return {
              success: false,
              error:
                requestedEdge.type === "gated_by"
                  ? `gate not found: ${requestedEdge.targetActionId}`
                  : `target action not found: ${requestedEdge.targetActionId}`,
            };
          }
          pendingEdges.push({
            id: generateId("ae"),
            type: requestedEdge.type,
            sourceActionId: "",
            targetActionId: requestedEdge.targetActionId,
            createdAt: now,
          });
        }

        const actor = data.actor || data.createdBy || data.owner || "unknown";
        const actionId = generateId("act");
        for (const edge of pendingEdges) edge.sourceActionId = actionId;
        const hasDerivedBlockers = pendingEdges.some(
          (edge) => edge.type === "requires" || edge.type === "gated_by",
        );
        const action: Action = {
          id: actionId,
          title: data.title.trim(),
          description: (data.description || "").trim(),
          status: hasDerivedBlockers ? "blocked" : "pending",
          lifecycle: data.lifecycle ?? "pending",
          priority: normalizePriority(data.priority),
          createdAt: now,
          updatedAt: now,
          createdBy: data.createdBy || actor,
          project: data.project || data.projectId,
          projectId: data.projectId,
          projectAliases: data.projectAliases,
          tags: normalizeActionTags(data.tags),
          sourceObservationIds: data.sourceObservationIds || [],
          sourceMemoryIds: data.sourceMemoryIds || [],
          parentId: data.parentId,
          owner: data.owner,
          notBefore: data.notBefore,
          dueAt: data.dueAt,
          awaitingHuman: data.awaitingHuman,
          approval: data.approval,
          blockedReason: data.blockedReason,
          repoRoot: data.repoRoot,
          worktree: data.worktree,
          branch: data.branch,
          taskSlug: data.taskSlug,
        };
        const persisted = await persistActionUnlocked(kv, action, {
          actor,
          type: "created",
          hasDerivedBlockers,
          before: null,
        });
        let finalState = persisted.state;
        for (const edge of pendingEdges) {
          const persistedEdge = await persistActionEdgeUnlocked(kv, edge, {
            actor,
            reason: "inline action dependency",
            before: null,
          });
          finalState = persistedEdge.state;
        }
        await recordAudit(
          kv,
          "action_create",
          "mem::action-create",
          [persisted.action.id],
          { actor, action: persisted.action, edges: pendingEdges },
        );
        return {
          success: true,
          action: persisted.action,
          edges: pendingEdges,
          revision: finalState.revision,
          warnings: persisted.warnings,
        };
      });
    } catch (error) {
      return actionStoreError(error);
    }
  });

  sdk.registerFunction("mem::action-update", async (data: ActionUpdateInput) => {
    const validationError = validateUpdateInput(data);
    if (validationError) return { success: false, error: validationError };

    try {
      return await withActionStoreLock(async () => {
        await recoverActionStoreUnlocked(kv);
        const existing = await kv.get<Action>(KV.actions, data.actionId);
        if (!existing) return { success: false, error: "action not found" };
        const before = structuredClone(existing);
        const edges = await kv.list<ActionEdge>(KV.actionEdges);
        const hasDerivedBlockers = await hasUnsatisfiedDerivedBlockers(
          kv,
          existing.id,
          edges,
        );
        const action = applyActionUpdate(existing, data, hasDerivedBlockers);
        action.updatedAt = new Date().toISOString();
        const actor =
          data.actor || data.assignedTo || data.owner || existing.owner || "unknown";
        const persisted = await persistActionUnlocked(kv, action, {
          actor,
          reason: data.correctionReason,
          correctionOf: data.correctionOf,
          before,
          hasDerivedBlockers,
        });
        await recordAudit(
          kv,
          "action_update",
          "mem::action-update",
          [action.id],
          { actor, before, after: persisted.action },
        );
        if (persisted.action.lifecycle === "done") {
          await propagateCompletionUnlocked(kv, persisted.action.id, actor);
        }
        const finalState = await recoverActionStoreUnlocked(kv);
        return {
          success: true,
          action: persisted.action,
          event: persisted.event,
          revision: finalState.revision,
          warnings: persisted.warnings,
        };
      });
    } catch (error) {
      return actionStoreError(error);
    }
  });

  sdk.registerFunction(
    "mem::action-edge-create",
    async (data: {
      sourceActionId: string;
      targetActionId: string;
      type: string;
      metadata?: Record<string, unknown>;
      actor?: string;
    }) => {
      if (!data.sourceActionId || !data.targetActionId || !data.type) {
        return {
          success: false,
          error: "sourceActionId, targetActionId, and type are required",
        };
      }
      if (!isValidEdgeType(data.type)) {
        return {
          success: false,
          error: `type must be one of: ${VALID_EDGE_TYPES.join(", ")}`,
        };
      }

      try {
        return await withActionStoreLock(async () => {
          await recoverActionStoreUnlocked(kv);
          const sourceAction = await kv.get<Action>(
            KV.actions,
            data.sourceActionId,
          );
          if (!sourceAction) {
            return { success: false, error: "source action not found" };
          }
          const targetExists =
            data.type === "gated_by"
              ? await actionGateExists(kv, data.targetActionId)
              : Boolean(
                  await kv.get<Action>(KV.actions, data.targetActionId),
                );
          if (!targetExists) {
            return {
              success: false,
              error:
                data.type === "gated_by"
                  ? "gate not found"
                  : "target action not found",
            };
          }
          const edge: ActionEdge = {
            id: generateId("ae"),
            type: data.type,
            sourceActionId: data.sourceActionId,
            targetActionId: data.targetActionId,
            createdAt: new Date().toISOString(),
            metadata: data.metadata,
          };
          const actor = data.actor || "unknown";
          const persistedEdge = await persistActionEdgeUnlocked(kv, edge, {
            actor,
            before: null,
          });
          let finalState = persistedEdge.state;
          if (edge.type === "requires" || edge.type === "gated_by") {
            const before = structuredClone(sourceAction);
            sourceAction.status = "blocked";
            sourceAction.lifecycle = sourceAction.lifecycle ?? "pending";
            sourceAction.updatedAt = new Date().toISOString();
            const persistedSource = await persistActionUnlocked(kv, sourceAction, {
              actor,
              before,
              hasDerivedBlockers: true,
              reason: `${edge.type} edge added`,
            });
            finalState = persistedSource.state;
          }
          await recordAudit(
            kv,
            "action_create",
            "mem::action-edge-create",
            [edge.id],
            { actor, edge },
          );
          return {
            success: true,
            edge,
            event: persistedEdge.event,
            revision: finalState.revision,
          };
        });
      } catch (error) {
        return actionStoreError(error);
      }
    },
  );

  sdk.registerFunction("mem::action-list", async (data: ActionListOptions) => {
    if (data.view !== undefined && !isActionReadinessView(data.view)) {
      return {
        success: false,
        error: "view must be actionable, scheduled, waiting, blocked, completed, or cancelled",
      };
    }
    if (
      data.status !== undefined &&
      !LEGACY_STATUSES.has(data.status as Action["status"])
    ) {
      return {
        success: false,
        error: "status must be pending, active, done, blocked, or cancelled",
      };
    }
    try {
      const [snapshot, checkpoints, sentinels, leases] = await Promise.all([
        readActionStoreSnapshot(kv),
        kv.list<Checkpoint>(KV.checkpoints).catch(() => []),
        kv.list<Sentinel>(KV.sentinels).catch(() => []),
        kv.list<Lease>(KV.leases).catch(() => []),
      ]);
      return selectActionPage(snapshot, checkpoints, sentinels, leases, data);
    } catch (error) {
      if (error instanceof ActionQueryError) {
        return { success: false, error: error.code, message: error.message };
      }
      return actionStoreError(error);
    }
  });

  sdk.registerFunction(
    "mem::action-graph-snapshot",
    async (data: { limit?: number }) => {
      const requestedLimit = data.limit ?? MAX_ACTION_GRAPH_ACTIONS;
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
        return {
          success: false,
          error: "limit must be a positive integer",
        };
      }

      try {
        const limit = Math.min(requestedLimit, MAX_ACTION_GRAPH_ACTIONS);
        const snapshot = await readActionStoreSnapshot(kv);
        const rankedActions = [...snapshot.actions].sort(compareGraphActions);
        const selectedActions = rankedActions.slice(0, limit);
        const selectedIds = new Set(selectedActions.map((action) => action.id));
        const selectedEdges = snapshot.edges
          .filter(
            (edge) =>
              selectedIds.has(edge.sourceActionId) &&
              selectedIds.has(edge.targetActionId),
          )
          .sort(compareGraphEdges);

        return {
          success: true,
          revision: snapshot.state.revision,
          actions: selectedActions.map(projectActionForGraph),
          actionEdges: selectedEdges.map(projectActionEdgeForGraph),
          totalActions: snapshot.actions.length,
          totalEdges: snapshot.edges.length,
          limit,
          truncatedActions: snapshot.actions.length - selectedActions.length,
          truncatedEdges: snapshot.edges.length - selectedEdges.length,
          eventsIncluded: false,
        };
      } catch (error) {
        return actionStoreError(error);
      }
    },
  );

  sdk.registerFunction("mem::action-get", async (data: { actionId: string }) => {
    if (!data.actionId) {
      return { success: false, error: "actionId is required" };
    }
    const snapshot = await readActionStoreSnapshot(kv, { includeEvents: true });
    const action = snapshot.actions.find((candidate) => candidate.id === data.actionId);
    if (!action) return { success: false, error: "action not found" };
    const edges = snapshot.edges.filter(
      (edge) =>
        edge.sourceActionId === data.actionId ||
        edge.targetActionId === data.actionId,
    );
    const children = snapshot.actions.filter(
      (candidate) => candidate.parentId === data.actionId,
    );
    const events = snapshot.events
      .filter((event) => event.actionId === data.actionId)
      .sort(
        (left, right) =>
          left.revision - right.revision ||
          left.timestamp.localeCompare(right.timestamp) ||
          left.id.localeCompare(right.id),
      );
    return {
      success: true,
      action,
      edges,
      children,
      events,
      revision: snapshot.state.revision,
    };
  });

  sdk.registerFunction(
    "mem::action-gc",
    async (data: {
      maxAgeDays?: number;
      dryRun?: boolean;
      limit?: number;
      actor?: string;
    }) => {
      const maxAgeDays = data.maxAgeDays ?? 30;
      const dryRun = data.dryRun ?? true;
      const limit = data.limit ?? 500;
      if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
        return { success: false, error: "maxAgeDays must be a non-negative number" };
      }
      if (typeof dryRun !== "boolean") {
        return { success: false, error: "dryRun must be a boolean" };
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
        return { success: false, error: "limit must be an integer between 1 and 5000" };
      }
      try {
        const cutoff = Date.now() - maxAgeDays * 86_400_000;
        const snapshot = await readActionStoreSnapshot(kv);
        const edgeEndpoints = new Set(
          snapshot.edges.flatMap((edge) => [
            edge.sourceActionId,
            edge.targetActionId,
          ]),
        );
        const isCollectable = (action: Action): boolean =>
          (action.lifecycle === "done" || action.lifecycle === "cancelled") &&
          Date.parse(action.updatedAt) < cutoff &&
          !edgeEndpoints.has(action.id);
        const candidates = snapshot.actions
          .filter(isCollectable)
          .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
          .slice(0, limit);
        const actor = data.actor || "action-gc";
        const deleted: string[] = [];
        if (!dryRun) {
          for (const candidate of candidates) {
            const current = await kv.get<Action>(KV.actions, candidate.id);
            if (!current || !isCollectable(current)) continue;
            const result = await deleteAction(kv, candidate.id, {
              actor,
              reason: `terminal action older than ${maxAgeDays}d`,
            });
            if (result.deleted) deleted.push(candidate.id);
          }
          if (deleted.length > 0) {
            await recordAudit(
              kv,
              "action_delete",
              "mem::action-gc",
              deleted,
              { actor, maxAgeDays, dryRun: false, deleted: deleted.length },
            );
          }
        }
        return {
          success: true,
          dryRun,
          maxAgeDays,
          cutoff: new Date(cutoff).toISOString(),
          candidates: candidates.map((action) => action.id),
          deleted,
        };
      } catch (error) {
        return actionStoreError(error);
      }
    },
  );
}

async function propagateCompletionUnlocked(
  kv: StateKV,
  completedActionId: string,
  actor: string,
): Promise<void> {
  const allEdges = await kv.list<ActionEdge>(KV.actionEdges);
  const candidates = new Set(
    allEdges
      .filter(
        (edge) =>
          edge.targetActionId === completedActionId &&
          (edge.type === "requires" || edge.type === "unlocks"),
      )
      .map((edge) => edge.sourceActionId),
  );
  for (const candidateId of candidates) {
    const action = await kv.get<Action>(KV.actions, candidateId);
    if (!action || action.lifecycle === "done" || action.lifecycle === "cancelled") {
      continue;
    }
    const lifecycle =
      action.lifecycle ?? (action.status === "active" ? "active" : "pending");
    if (lifecycle !== "pending") continue;
    const stillBlocked = await hasUnsatisfiedDerivedBlockers(
      kv,
      action.id,
      allEdges,
    );
    if (stillBlocked || action.blockedReason || action.awaitingHuman) continue;
    const before = structuredClone(action);
    action.status = "pending";
    action.lifecycle = "pending";
    action.updatedAt = new Date().toISOString();
    await persistActionUnlocked(kv, action, {
      actor,
      before,
      hasDerivedBlockers: false,
      reason: `Dependency ${completedActionId} completed`,
    });
  }
}

export async function propagateActionCompletion(
  kv: StateKV,
  completedActionId: string,
  actor: string,
): Promise<void> {
  await withActionStoreLock(async () => {
    await recoverActionStoreUnlocked(kv);
    await propagateCompletionUnlocked(kv, completedActionId, actor);
  });
}

async function hasUnsatisfiedDerivedBlockers(
  kv: StateKV,
  actionId: string,
  edges: ActionEdge[],
): Promise<boolean> {
  const relevant = edges.filter(
    (edge) =>
      edge.sourceActionId === actionId &&
      (edge.type === "requires" || edge.type === "gated_by"),
  );
  for (const edge of relevant) {
    if (edge.type === "requires") {
      const dependency = await kv.get<Action>(KV.actions, edge.targetActionId);
      const lifecycle = dependency?.lifecycle ?? dependency?.status;
      if (lifecycle !== "done") return true;
    } else {
      const checkpoint = await kv.get<Checkpoint>(
        KV.checkpoints,
        edge.targetActionId,
      );
      if (checkpoint?.status === "passed") continue;
      const sentinel = await kv.get<Sentinel>(
        KV.sentinels,
        edge.targetActionId,
      );
      if (sentinel?.status !== "triggered") return true;
    }
  }
  return false;
}

async function actionGateExists(
  kv: StateKV,
  targetId: string,
): Promise<boolean> {
  const [checkpoint, sentinel] = await Promise.all([
    kv.get<Checkpoint>(KV.checkpoints, targetId),
    kv.get<Sentinel>(KV.sentinels, targetId),
  ]);
  return Boolean(checkpoint || sentinel);
}

function applyActionUpdate(
  action: Action,
  data: ActionUpdateInput,
  hasDerivedBlockers: boolean,
): Action {
  const updated = { ...action };
  if (data.title !== undefined) updated.title = data.title.trim();
  if (data.description !== undefined) {
    updated.description = data.description.trim();
  }
  if (data.priority !== undefined) updated.priority = normalizePriority(data.priority);
  if (data.assignedTo !== undefined) updated.assignedTo = data.assignedTo || undefined;
  if (data.owner !== undefined) updated.owner = data.owner || undefined;
  if (data.result !== undefined) updated.result = data.result;
  if (data.tags !== undefined) updated.tags = normalizeActionTags(data.tags);
  if (data.project !== undefined) {
    const previousProject = updated.projectId || updated.project;
    updated.project = data.project;
    if (data.projectId === undefined) {
      updated.projectId = undefined;
      updated.projectAliases = normalizeActionTags([
        ...(updated.projectAliases ?? []),
        ...(previousProject ? [previousProject] : []),
      ]);
    }
  }
  if (data.projectId !== undefined) updated.projectId = data.projectId;
  if (data.projectAliases !== undefined) {
    updated.projectAliases = normalizeActionTags(data.projectAliases);
  }
  if (data.notBefore !== undefined) updated.notBefore = data.notBefore || undefined;
  if (data.dueAt !== undefined) updated.dueAt = data.dueAt || undefined;
  if (data.awaitingHuman !== undefined) updated.awaitingHuman = data.awaitingHuman;
  if (data.approval !== undefined) updated.approval = data.approval;
  if (data.blockedReason !== undefined) {
    updated.blockedReason = data.blockedReason || undefined;
  }
  if (data.repoRoot !== undefined) updated.repoRoot = data.repoRoot || undefined;
  if (data.worktree !== undefined) updated.worktree = data.worktree || undefined;
  if (data.branch !== undefined) updated.branch = data.branch || undefined;
  if (data.taskSlug !== undefined) updated.taskSlug = data.taskSlug || undefined;

  if (data.status !== undefined) {
    updated.status = data.status;
    if (data.status === "blocked") {
      updated.lifecycle = "pending";
      updated.blockedReason =
        data.blockedReason ||
        data.result ||
        updated.blockedReason ||
        (hasDerivedBlockers ? undefined : "Blocked by legacy status update");
    } else {
      updated.lifecycle = data.status;
      if (data.status === "pending") updated.blockedReason = undefined;
    }
  }
  if (data.lifecycle !== undefined) {
    updated.lifecycle = data.lifecycle;
    if (data.lifecycle !== "pending") updated.status = data.lifecycle;
  }
  return updated;
}

function validateCreateInput(data: ActionCreateInput): string | undefined {
  if (!data?.title || typeof data.title !== "string" || !data.title.trim()) {
    return "title is required";
  }
  if (data.description !== undefined && typeof data.description !== "string") {
    return "description must be a string";
  }
  for (const [field, value] of [
    ["sourceObservationIds", data.sourceObservationIds],
    ["sourceMemoryIds", data.sourceMemoryIds],
  ] as const) {
    if (
      value !== undefined &&
      (!Array.isArray(value) ||
        value.some((item) => typeof item !== "string"))
    ) {
      return `${field} must be an array of strings`;
    }
  }
  if (
    data.edges !== undefined &&
    (!Array.isArray(data.edges) ||
      data.edges.some(
        (edge) =>
          !edge ||
          typeof edge !== "object" ||
          typeof edge.type !== "string" ||
          typeof edge.targetActionId !== "string",
      ))
  ) {
    return "edges must contain type and targetActionId strings";
  }
  return validateSharedInput(data);
}

function validateUpdateInput(data: ActionUpdateInput): string | undefined {
  if (!data?.actionId || typeof data.actionId !== "string") {
    return "actionId is required";
  }
  if (data.status !== undefined && !LEGACY_STATUSES.has(data.status)) {
    return "status must be pending, active, done, blocked, or cancelled";
  }
  if (
    data.title !== undefined &&
    (typeof data.title !== "string" || !data.title.trim())
  ) {
    return "title must be a non-empty string";
  }
  if (data.description !== undefined && typeof data.description !== "string") {
    return "description must be a string";
  }
  return validateSharedInput(data);
}

function validateSharedInput(
  data: Partial<ActionCreateInput & ActionUpdateInput>,
): string | undefined {
  if (
    data.priority !== undefined &&
    (typeof data.priority !== "number" || !Number.isFinite(data.priority))
  ) {
    return "priority must be a finite number";
  }
  if (data.lifecycle !== undefined && !isActionLifecycle(data.lifecycle)) {
    return "lifecycle must be pending, active, done, or cancelled";
  }
  if (data.projectId !== undefined && !isCanonicalProjectId(data.projectId)) {
    return "projectId must be a canonical non-path identifier";
  }
  if (
    data.project !== undefined &&
    (typeof data.project !== "string" || !data.project.trim())
  ) {
    return "project must be a non-empty string";
  }
  if (
    data.projectAliases !== undefined &&
    (!Array.isArray(data.projectAliases) ||
      data.projectAliases.some((alias) => typeof alias !== "string"))
  ) {
    return "projectAliases must be an array of strings";
  }
  if (
    data.tags !== undefined &&
    typeof data.tags !== "string" &&
    (!Array.isArray(data.tags) ||
      data.tags.some((tag) => typeof tag !== "string"))
  ) {
    return "tags must be a string or an array of strings";
  }
  if (
    data.awaitingHuman !== undefined &&
    typeof data.awaitingHuman !== "boolean"
  ) {
    return "awaitingHuman must be boolean";
  }
  for (const [field, value] of [
    ["createdBy", data.createdBy],
    ["actor", data.actor],
    ["parentId", data.parentId],
    ["owner", data.owner],
    ["assignedTo", data.assignedTo],
    ["result", data.result],
    ["blockedReason", data.blockedReason],
    ["repoRoot", data.repoRoot],
    ["worktree", data.worktree],
    ["branch", data.branch],
    ["taskSlug", data.taskSlug],
    ["correctionOf", data.correctionOf],
    ["correctionReason", data.correctionReason],
  ] as const) {
    if (value !== undefined && typeof value !== "string") {
      return `${field} must be a string`;
    }
  }
  if (data.notBefore && !isValidActionTimestamp(data.notBefore)) {
    return "notBefore must be a valid timestamp";
  }
  if (data.dueAt && !isValidActionTimestamp(data.dueAt)) {
    return "dueAt must be a valid timestamp";
  }
  if (
    data.approval !== undefined &&
    (!data.approval || !isActionApprovalState(data.approval.state))
  ) {
    return "approval.state is invalid";
  }
  if (data.approval) {
    for (const field of ["requestedAt", "decidedAt"] as const) {
      const timestamp = data.approval[field];
      if (timestamp !== undefined && !isValidActionTimestamp(timestamp)) {
        return `approval.${field} must be a valid timestamp`;
      }
    }
    for (const field of ["requestedBy", "decidedBy", "note"] as const) {
      const value = data.approval[field];
      if (value !== undefined && typeof value !== "string") {
        return `approval.${field} must be a string`;
      }
    }
  }
  return undefined;
}

function normalizePriority(value?: number): number {
  return Math.max(1, Math.min(10, value || 5));
}

function isValidEdgeType(value: string): value is ActionEdge["type"] {
  return VALID_EDGE_TYPES.includes(value as ActionEdge["type"]);
}

function compareGraphActions(left: Action, right: Action): number {
  const leftTerminal =
    left.lifecycle === "done" ||
    left.lifecycle === "cancelled" ||
    left.status === "done" ||
    left.status === "cancelled";
  const rightTerminal =
    right.lifecycle === "done" ||
    right.lifecycle === "cancelled" ||
    right.status === "done" ||
    right.status === "cancelled";
  return (
    Number(leftTerminal) - Number(rightTerminal) ||
    (right.priority ?? 0) - (left.priority ?? 0) ||
    timestampMs(right.updatedAt) - timestampMs(left.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareGraphEdges(left: ActionEdge, right: ActionEdge): number {
  return (
    left.sourceActionId.localeCompare(right.sourceActionId) ||
    left.targetActionId.localeCompare(right.targetActionId) ||
    left.type.localeCompare(right.type) ||
    left.id.localeCompare(right.id)
  );
}

function projectActionForGraph(action: Action) {
  return {
    id: action.id,
    title: action.title,
    status: action.status,
    lifecycle: action.lifecycle,
    project: action.project,
    projectId: action.projectId,
    parentId: action.parentId,
    owner: action.owner,
    assignedTo: action.assignedTo,
    priority: action.priority,
    tags: action.tags,
    blockedReason: action.blockedReason,
    repoRoot: action.repoRoot,
    worktree: action.worktree,
    branch: action.branch,
    taskSlug: action.taskSlug,
    updatedAt: action.updatedAt,
  };
}

function projectActionEdgeForGraph(edge: ActionEdge) {
  return {
    id: edge.id,
    type: edge.type,
    sourceActionId: edge.sourceActionId,
    targetActionId: edge.targetActionId,
    createdAt: edge.createdAt,
  };
}

function timestampMs(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionStoreError(error: unknown) {
  if (error instanceof ActionRevisionConflictError) {
    return {
      success: false,
      error: "action_revision_conflict",
      actionId: error.actionId,
      fields: error.fields,
      message: error.message,
    };
  }
  if (error instanceof ActionNormalizationError) {
    return {
      success: false,
      error: "action normalization failed",
      conflicts: error.conflicts,
    };
  }
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export type { ActionListOptions, ActionReadinessView };
